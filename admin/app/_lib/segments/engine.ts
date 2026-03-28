/**
 * Segment Query Engine — Shopify-grade.
 *
 * parseSegmentQuery()  → tokenize + parse to AST
 * compileSegmentQuery() → AST to Prisma WHERE
 * executeSegmentQuery() → parse + compile + run against DB
 *
 * Query syntax (ShopifyQL-inspired):
 *   number_of_orders >= 1
 *   amount_spent > 1000
 *   last_order_date < -90d
 *   customer_tags CONTAINS 'VIP'
 *   number_of_orders >= 1 AND marketing_consent = true
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";

// ── Error ───────────────────────────────────────────────────────

export class SegmentQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SegmentQueryError";
  }
}

// ── Attribute registry ──────────────────────────────────────────

const ATTRIBUTES = {
  number_of_orders: "aggregate",
  amount_spent: "aggregate",
  last_order_date: "aggregate",
  first_order_date: "aggregate",
  marketing_consent: "field",
  customer_tags: "list",
  customer_added_date: "field",
  has_booking: "aggregate",
} as const;

type AttributeName = keyof typeof ATTRIBUTES;

// ── Token types ─────────────────────────────────────────────────

type TokenType =
  | "ATTRIBUTE"
  | "OPERATOR"
  | "VALUE"
  | "CONNECTOR"
  | "BETWEEN"
  | "AND_BETWEEN"
  | "CONTAINS"
  | "LPAREN"
  | "RPAREN";

interface Token {
  type: TokenType;
  value: string;
}

// ── AST ─────────────────────────────────────────────────────────

interface ComparisonNode {
  kind: "comparison";
  attribute: AttributeName;
  operator: "=" | "!=" | ">" | ">=" | "<" | "<=" | "CONTAINS" | "BETWEEN";
  value: string;
  valueTo?: string; // for BETWEEN
}

interface ConnectorNode {
  kind: "connector";
  type: "AND" | "OR";
  left: ASTNode;
  right: ASTNode;
}

type ASTNode = ComparisonNode | ConnectorNode;

export type SegmentAST = ASTNode;

// ── Tokenizer ───────────────────────────────────────────────────

function tokenize(query: string): Token[] {
  const trimmed = query.trim();
  if (!trimmed) throw new SegmentQueryError("Segment query cannot be empty");

  const tokens: Token[] = [];
  let i = 0;

  while (i < trimmed.length) {
    // Skip whitespace
    if (/\s/.test(trimmed[i])) { i++; continue; }

    // Parentheses
    if (trimmed[i] === "(") { tokens.push({ type: "LPAREN", value: "(" }); i++; continue; }
    if (trimmed[i] === ")") { tokens.push({ type: "RPAREN", value: ")" }); i++; continue; }

    // Operators: >=, <=, !=, >, <, =
    if (trimmed[i] === ">" && trimmed[i + 1] === "=") { tokens.push({ type: "OPERATOR", value: ">=" }); i += 2; continue; }
    if (trimmed[i] === "<" && trimmed[i + 1] === "=") { tokens.push({ type: "OPERATOR", value: "<=" }); i += 2; continue; }
    if (trimmed[i] === "!" && trimmed[i + 1] === "=") { tokens.push({ type: "OPERATOR", value: "!=" }); i += 2; continue; }
    if (trimmed[i] === ">") { tokens.push({ type: "OPERATOR", value: ">" }); i++; continue; }
    if (trimmed[i] === "<") { tokens.push({ type: "OPERATOR", value: "<" }); i++; continue; }
    if (trimmed[i] === "=") { tokens.push({ type: "OPERATOR", value: "=" }); i++; continue; }

    // Quoted strings
    if (trimmed[i] === "'") {
      let val = "";
      i++; // skip opening quote
      while (i < trimmed.length && trimmed[i] !== "'") { val += trimmed[i]; i++; }
      if (i >= trimmed.length) throw new SegmentQueryError("Unterminated string literal");
      i++; // skip closing quote
      tokens.push({ type: "VALUE", value: val });
      continue;
    }

    // Words: keywords, attributes, values
    let word = "";
    while (i < trimmed.length && /[a-zA-Z0-9_\-.]/.test(trimmed[i])) { word += trimmed[i]; i++; }

    if (!word) throw new SegmentQueryError(`Unexpected character: ${trimmed[i]}`);

    const upper = word.toUpperCase();

    if (upper === "AND") {
      // Check if this is "AND" in "BETWEEN x AND y"
      const lastToken = tokens[tokens.length - 1];
      if (lastToken?.type === "VALUE" && tokens.length >= 2) {
        const tokenBefore = tokens[tokens.length - 2];
        if (tokenBefore?.type === "BETWEEN") {
          tokens.push({ type: "AND_BETWEEN", value: "AND" });
          continue;
        }
      }
      tokens.push({ type: "CONNECTOR", value: "AND" });
    } else if (upper === "OR") {
      tokens.push({ type: "CONNECTOR", value: "OR" });
    } else if (upper === "BETWEEN") {
      tokens.push({ type: "BETWEEN", value: "BETWEEN" });
    } else if (upper === "CONTAINS") {
      tokens.push({ type: "CONTAINS", value: "CONTAINS" });
    } else if (word in ATTRIBUTES) {
      tokens.push({ type: "ATTRIBUTE", value: word });
    } else {
      // Numeric, date, or boolean value
      tokens.push({ type: "VALUE", value: word });
    }
  }

  return tokens;
}

// ── Parser ──────────────────────────────────────────────────────

function parse(tokens: Token[]): SegmentAST {
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function advance(): Token {
    if (pos >= tokens.length) throw new SegmentQueryError("Unexpected end of query");
    return tokens[pos++];
  }

  function parseComparison(): ComparisonNode {
    const attrToken = advance();
    if (attrToken.type !== "ATTRIBUTE") {
      throw new SegmentQueryError(`Expected attribute, got: ${attrToken.value}`);
    }
    const attribute = attrToken.value as AttributeName;
    if (!(attribute in ATTRIBUTES)) {
      throw new SegmentQueryError(`Unknown attribute: ${attribute}`);
    }

    const opToken = advance();

    // CONTAINS operator
    if (opToken.type === "CONTAINS") {
      const valueToken = advance();
      if (valueToken.type !== "VALUE") {
        throw new SegmentQueryError(`Expected value after CONTAINS, got: ${valueToken.value}`);
      }
      return { kind: "comparison", attribute, operator: "CONTAINS", value: valueToken.value };
    }

    // BETWEEN operator
    if (opToken.type === "BETWEEN") {
      const fromToken = advance();
      if (fromToken.type !== "VALUE") {
        throw new SegmentQueryError(`Expected value after BETWEEN, got: ${fromToken.value}`);
      }
      const andToken = advance();
      if (andToken.type !== "AND_BETWEEN") {
        throw new SegmentQueryError(`Expected AND after BETWEEN value, got: ${andToken.value}`);
      }
      const toToken = advance();
      if (toToken.type !== "VALUE") {
        throw new SegmentQueryError(`Expected value after AND, got: ${toToken.value}`);
      }
      return { kind: "comparison", attribute, operator: "BETWEEN", value: fromToken.value, valueTo: toToken.value };
    }

    // Standard operators
    if (opToken.type !== "OPERATOR") {
      throw new SegmentQueryError(`Expected operator, got: ${opToken.value}`);
    }

    const valueToken = advance();
    if (valueToken.type !== "VALUE") {
      throw new SegmentQueryError(`Expected value, got: ${valueToken.value}`);
    }

    return {
      kind: "comparison",
      attribute,
      operator: opToken.value as ComparisonNode["operator"],
      value: valueToken.value,
    };
  }

  function parsePrimary(): ASTNode {
    if (peek()?.type === "LPAREN") {
      advance(); // skip (
      const node = parseExpression();
      const closing = advance();
      if (closing.type !== "RPAREN") throw new SegmentQueryError("Expected closing parenthesis");
      return node;
    }
    return parseComparison();
  }

  function parseExpression(): ASTNode {
    let left = parsePrimary();

    while (peek()?.type === "CONNECTOR") {
      const connectorToken = advance();
      const right = parsePrimary();
      left = {
        kind: "connector",
        type: connectorToken.value as "AND" | "OR",
        left,
        right,
      };
    }

    return left;
  }

  const ast = parseExpression();

  if (pos < tokens.length) {
    throw new SegmentQueryError(`Unexpected token: ${tokens[pos].value}`);
  }

  return ast;
}

export function parseSegmentQuery(query: string): SegmentAST {
  const tokens = tokenize(query);
  return parse(tokens);
}

// ── Date resolution ──────────────────────────────────────���──────

function resolveDate(value: string): Date {
  // Offset format: -90d, -30d, -12m, -1y
  const offsetMatch = value.match(/^-(\d+)(d|m|y)$/);
  if (offsetMatch) {
    const amount = parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    const now = new Date();
    if (unit === "d") now.setDate(now.getDate() - amount);
    else if (unit === "m") now.setMonth(now.getMonth() - amount);
    else if (unit === "y") now.setFullYear(now.getFullYear() - amount);
    return now;
  }

  // Absolute format: 2024-01-01
  const abs = new Date(value);
  if (isNaN(abs.getTime())) {
    throw new SegmentQueryError(`Invalid date: ${value}`);
  }
  return abs;
}

// ── Compiler ────────────────────────────────────────────────────

function compileComparison(
  node: ComparisonNode,
  tenantId: string,
): Prisma.GuestAccountWhereInput {
  const { attribute, operator, value, valueTo } = node;

  // ── Direct field attributes ────────────────────────────────

  if (attribute === "marketing_consent") {
    const bool = value === "true";
    if (operator === "=") {
      return bool
        ? { emailMarketingState: "SUBSCRIBED" }
        : { emailMarketingState: { not: "SUBSCRIBED" } };
    }
    if (operator === "!=") {
      return bool
        ? { emailMarketingState: { not: "SUBSCRIBED" } }
        : { emailMarketingState: "SUBSCRIBED" };
    }
    throw new SegmentQueryError(`Invalid operator for marketing_consent: ${operator}`);
  }

  if (attribute === "customer_added_date") {
    if (operator === "BETWEEN") {
      return { createdAt: { gte: resolveDate(value), lte: resolveDate(valueTo!) } };
    }
    const date = resolveDate(value);
    const dateOps: Record<string, Prisma.DateTimeFilter> = {
      "=": { equals: date },
      ">": { gt: date },
      ">=": { gte: date },
      "<": { lt: date },
      "<=": { lte: date },
    };
    if (!dateOps[operator]) throw new SegmentQueryError(`Invalid operator for customer_added_date: ${operator}`);
    return { createdAt: dateOps[operator] };
  }

  if (attribute === "customer_tags") {
    if (operator !== "CONTAINS") {
      throw new SegmentQueryError(`customer_tags only supports CONTAINS operator`);
    }
    return {
      tags: { some: { tag: value.toLowerCase() } },
    };
  }

  // ── Aggregate attributes (require subquery on orders) ──────

  if (attribute === "has_booking") {
    const wantBooking = value === "true";
    const orderFilter: Prisma.OrderWhereInput = {
      tenantId,
      financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      orderType: "ACCOMMODATION",
    };
    if (operator !== "=") throw new SegmentQueryError(`has_booking only supports = operator`);
    return wantBooking
      ? { orders: { some: orderFilter } }
      : { orders: { none: orderFilter } };
  }

  // number_of_orders, amount_spent, last_order_date, first_order_date
  // These require a subquery approach — Prisma doesn't support HAVING directly
  // so we use _count and relation filters for what we can

  if (attribute === "number_of_orders") {
    const num = parseInt(value, 10);
    if (isNaN(num)) throw new SegmentQueryError(`Invalid number: ${value}`);

    const paidFilter: Prisma.OrderWhereInput = {
      tenantId,
      financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    };

    // Prisma _count filters via relation — use some/none for boundary cases
    if (operator === ">=" && num === 0) return {}; // all guests
    if (operator === ">=" && num === 1) return { orders: { some: paidFilter } };
    if (operator === "=" && num === 0) return { orders: { none: paidFilter } };

    // For complex count comparisons, we need raw SQL subquery
    const ops: Record<string, string> = { "=": "=", "!=": "!=", ">": ">", ">=": ">=", "<": "<", "<=": "<=" };
    if (!ops[operator]) throw new SegmentQueryError(`Invalid operator for number_of_orders: ${operator}`);

    return {
      id: {
        in: prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT ga.id FROM "GuestAccount" ga
           LEFT JOIN "Order" o ON o."guestAccountId" = ga.id
             AND o."tenantId" = $1
             AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
           WHERE ga."tenantId" = $1
           GROUP BY ga.id
           HAVING COUNT(o.id) ${ops[operator]} $2`,
          tenantId,
          num,
        ).then((rows) => rows.map((r) => r.id)),
      } as unknown as Prisma.StringFilter,
    };
  }

  if (attribute === "amount_spent") {
    const amount = Math.round(parseFloat(value) * 100); // convert to ören
    if (isNaN(amount)) throw new SegmentQueryError(`Invalid amount: ${value}`);

    const ops: Record<string, string> = { "=": "=", "!=": "!=", ">": ">", ">=": ">=", "<": "<", "<=": "<=" };
    if (!ops[operator]) throw new SegmentQueryError(`Invalid operator for amount_spent: ${operator}`);

    return {
      id: {
        in: prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT ga.id FROM "GuestAccount" ga
           LEFT JOIN "Order" o ON o."guestAccountId" = ga.id
             AND o."tenantId" = $1
             AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
           WHERE ga."tenantId" = $1
           GROUP BY ga.id
           HAVING COALESCE(SUM(o."totalAmount"), 0) ${ops[operator]} $2`,
          tenantId,
          amount,
        ).then((rows) => rows.map((r) => r.id)),
      } as unknown as Prisma.StringFilter,
    };
  }

  if (attribute === "last_order_date" || attribute === "first_order_date") {
    const aggFn = attribute === "last_order_date" ? "MAX" : "MIN";

    if (operator === "BETWEEN") {
      const from = resolveDate(value);
      const to = resolveDate(valueTo!);
      return {
        id: {
          in: prisma.$queryRawUnsafe<{ id: string }[]>(
            `SELECT ga.id FROM "GuestAccount" ga
             INNER JOIN "Order" o ON o."guestAccountId" = ga.id
               AND o."tenantId" = $1
               AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
             WHERE ga."tenantId" = $1
             GROUP BY ga.id
             HAVING ${aggFn}(o."createdAt") >= $2 AND ${aggFn}(o."createdAt") <= $3`,
            tenantId,
            from,
            to,
          ).then((rows) => rows.map((r) => r.id)),
        } as unknown as Prisma.StringFilter,
      };
    }

    const date = resolveDate(value);
    const ops: Record<string, string> = { "=": "=", ">": ">", ">=": ">=", "<": "<", "<=": "<=" };
    if (!ops[operator]) throw new SegmentQueryError(`Invalid operator for ${attribute}: ${operator}`);

    return {
      id: {
        in: prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT ga.id FROM "GuestAccount" ga
           INNER JOIN "Order" o ON o."guestAccountId" = ga.id
             AND o."tenantId" = $1
             AND o."financialStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
           WHERE ga."tenantId" = $1
           GROUP BY ga.id
           HAVING ${aggFn}(o."createdAt") ${ops[operator]} $2`,
          tenantId,
          date,
        ).then((rows) => rows.map((r) => r.id)),
      } as unknown as Prisma.StringFilter,
    };
  }

  throw new SegmentQueryError(`Unknown attribute: ${attribute}`);
}

function compileNode(
  node: ASTNode,
  tenantId: string,
): Prisma.GuestAccountWhereInput {
  if (node.kind === "comparison") {
    return compileComparison(node, tenantId);
  }

  const left = compileNode(node.left, tenantId);
  const right = compileNode(node.right, tenantId);

  if (node.type === "AND") return { AND: [left, right] };
  if (node.type === "OR") return { OR: [left, right] };

  throw new SegmentQueryError(`Unknown connector: ${node.type}`);
}

export function compileSegmentQuery(
  ast: SegmentAST,
  tenantId: string,
): Prisma.GuestAccountWhereInput {
  return {
    tenantId,
    ...compileNode(ast, tenantId),
  };
}

// ── Executor ────────────────────────────────────────────────────

export async function executeSegmentQuery(
  query: string,
  tenantId: string,
): Promise<string[]> {
  const ast = parseSegmentQuery(query);
  const where = compileSegmentQuery(ast, tenantId);

  // Resolve any pending raw query promises in the where clause
  const resolvedWhere = await resolveWherePromises(where);

  const guests = await prisma.guestAccount.findMany({
    where: resolvedWhere,
    select: { id: true },
  });

  return guests.map((g) => g.id);
}

/**
 * Recursively resolves any Promise values in nested `id.in` filters.
 * Raw SQL subqueries return Promise<string[]> — Prisma needs resolved arrays.
 */
async function resolveWherePromises(
  where: Record<string, unknown>,
): Promise<Prisma.GuestAccountWhereInput> {
  const resolved: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(where)) {
    if (key === "id" && val && typeof val === "object" && "in" in val) {
      const inner = (val as { in: unknown }).in;
      if (inner && typeof (inner as { then?: unknown }).then === "function") {
        resolved[key] = { in: await inner };
      } else {
        resolved[key] = val;
      }
    } else if (key === "AND" && Array.isArray(val)) {
      resolved[key] = await Promise.all(val.map((v) => resolveWherePromises(v as Record<string, unknown>)));
    } else if (key === "OR" && Array.isArray(val)) {
      resolved[key] = await Promise.all(val.map((v) => resolveWherePromises(v as Record<string, unknown>)));
    } else {
      resolved[key] = val;
    }
  }

  return resolved as Prisma.GuestAccountWhereInput;
}
