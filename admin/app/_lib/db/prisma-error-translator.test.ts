import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  translatePrismaError,
  upsertWithRaceRetry,
  withTranslatedErrors,
} from "./prisma-error-translator";
import {
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "../errors/service-errors";

function prismaErr(code: string, meta?: Record<string, unknown>) {
  // Construct a real PrismaClientKnownRequestError so instanceof check works.
  return new Prisma.PrismaClientKnownRequestError("test", {
    code,
    clientVersion: "6.x.test",
    meta,
  });
}

describe("translatePrismaError", () => {
  it("maps P2002 to ConflictError with UNIQUE_VIOLATION metadata", () => {
    const err = prismaErr("P2002", {
      target: ["tenantId", "externalId"],
      modelName: "Company",
    });
    const out = translatePrismaError(err);
    expect(out).toBeInstanceOf(ConflictError);
    expect(out).toMatchObject({
      code: "CONFLICT",
      context: {
        prismaCode: "UNIQUE_VIOLATION",
        target: "tenantId,externalId",
        modelName: "Company",
      },
    });
  });

  it("maps P2003 to ValidationError with FK_VIOLATION", () => {
    const err = prismaErr("P2003", {
      field_name: "Order_companyLocationId_fkey",
    });
    const out = translatePrismaError(err);
    expect(out).toBeInstanceOf(ValidationError);
    expect(out).toMatchObject({
      code: "VALIDATION",
      context: {
        prismaCode: "FK_VIOLATION",
        field: "Order_companyLocationId_fkey",
      },
    });
  });

  it("maps P2025 to NotFoundError", () => {
    const err = prismaErr("P2025", { cause: "Record to update not found." });
    const out = translatePrismaError(err);
    expect(out).toBeInstanceOf(NotFoundError);
    expect(out).toMatchObject({
      code: "NOT_FOUND",
      context: { prismaCode: "RECORD_NOT_FOUND" },
    });
  });

  it("returns null for unknown Prisma codes so caller rethrows", () => {
    expect(translatePrismaError(prismaErr("P2010"))).toBeNull();
    expect(translatePrismaError(prismaErr("P9999"))).toBeNull();
  });

  it("returns null for non-Prisma errors", () => {
    expect(translatePrismaError(new Error("plain"))).toBeNull();
    expect(translatePrismaError("string-error")).toBeNull();
    expect(translatePrismaError(null)).toBeNull();
  });
});

describe("withTranslatedErrors", () => {
  it("returns the function's value on success", async () => {
    const out = await withTranslatedErrors(async () => 42);
    expect(out).toBe(42);
  });

  it("throws translated ServiceError when the inner function throws P2002", async () => {
    await expect(
      withTranslatedErrors(async () => {
        throw prismaErr("P2002", { target: "email" });
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("passes through non-Prisma errors unchanged (same reference)", async () => {
    const original = new Error("business rule violation");
    await expect(
      withTranslatedErrors(async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it("passes through ServiceError thrown by caller", async () => {
    const svc = new ValidationError("domain rule");
    await expect(
      withTranslatedErrors(async () => {
        throw svc;
      }),
    ).rejects.toBe(svc);
  });

  it("passes through unknown Prisma errors unchanged", async () => {
    const unknown = prismaErr("P9999");
    await expect(
      withTranslatedErrors(async () => {
        throw unknown;
      }),
    ).rejects.toBe(unknown);
  });

  it("translated errors still satisfy instanceof ServiceError", async () => {
    try {
      await withTranslatedErrors(async () => {
        throw prismaErr("P2025");
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect(e).toBeInstanceOf(NotFoundError);
    }
  });
});

describe("upsertWithRaceRetry", () => {
  it("happy path: calls write once and returns its value", async () => {
    const write = vi.fn().mockResolvedValue("ok");
    const out = await upsertWithRaceRetry(write);
    expect(out).toBe("ok");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("on P2002 race: calls write twice and returns the second value", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(prismaErr("P2002", { target: ["catalogId"] }))
      .mockResolvedValueOnce("second");
    const out = await upsertWithRaceRetry(write);
    expect(out).toBe("second");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not retry a P2025 NotFound — surfaces translated NotFoundError", async () => {
    const write = vi.fn().mockRejectedValue(prismaErr("P2025"));
    await expect(upsertWithRaceRetry(write)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2003 FK violation — surfaces translated ValidationError", async () => {
    const write = vi.fn().mockRejectedValue(prismaErr("P2003"));
    await expect(upsertWithRaceRetry(write)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("retries once at most — second P2002 surfaces (no infinite loop)", async () => {
    const first = prismaErr("P2002", { target: ["catalogId"] });
    const second = prismaErr("P2002", { target: ["catalogId"] });
    const write = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second);
    await expect(upsertWithRaceRetry(write)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("passes through plain (non-Prisma) errors unchanged, no retry", async () => {
    const original = new Error("business rule");
    const write = vi.fn().mockRejectedValue(original);
    await expect(upsertWithRaceRetry(write)).rejects.toBe(original);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("passes through ServiceError thrown directly by caller, no retry", async () => {
    const svc = new ValidationError("domain rule");
    const write = vi.fn().mockRejectedValue(svc);
    await expect(upsertWithRaceRetry(write)).rejects.toBe(svc);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("passes through unknown Prisma codes (not P2002/3/25) unchanged", async () => {
    const weird = prismaErr("P9999");
    const write = vi.fn().mockRejectedValue(weird);
    await expect(upsertWithRaceRetry(write)).rejects.toBe(weird);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
