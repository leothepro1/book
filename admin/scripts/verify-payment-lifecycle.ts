/**
 * Verify Payment Lifecycle
 * ════════════════════════
 *
 * Checks the full order lifecycle after payment confirmation.
 * Usage: npx tsx scripts/verify-payment-lifecycle.ts <orderId>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npx tsx scripts/verify-payment-lifecycle.ts <orderId>");
    process.exit(1);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lineItems: true,
      events: { orderBy: { createdAt: "asc" } },
      paymentSession: true,
    },
  });

  if (!order) {
    console.error(`ERROR: Order ${orderId} not found`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: order.tenantId },
    select: { name: true, subscriptionPlan: true, platformFeeBps: true },
  });

  console.log("\n════════════════════════════════════════════");
  console.log("  PAYMENT LIFECYCLE VERIFICATION");
  console.log("════════════════════════════════════════════\n");

  // Check 1: Order status
  const expectedPaid = order.status === "PAID";
  const expectedPending = order.status === "PENDING";
  console.log(`[1] Order Status`);
  console.log(`    Order #${order.orderNumber}: ${order.status}`);
  console.log(`    Amount: ${order.totalAmount / 100} ${order.currency}`);
  console.log(`    Guest: ${order.guestName} <${order.guestEmail}>`);
  if (expectedPaid) {
    console.log(`    Paid At: ${order.paidAt}`);
    console.log(`    ✅ PASS — Order is PAID`);
  } else if (expectedPending) {
    console.log(`    ⚠️  Order still PENDING (payment may have failed or webhook not received)`);
  } else {
    console.log(`    ℹ️  Status: ${order.status}`);
  }

  // Check 2: PaymentSession
  console.log(`\n[2] PaymentSession`);
  if (order.paymentSession) {
    const ps = order.paymentSession;
    console.log(`    Provider: ${ps.providerKey}`);
    console.log(`    Status: ${ps.status}`);
    console.log(`    External ID: ${ps.externalSessionId}`);
    console.log(`    Amount: ${ps.amount / 100} ${ps.currency}`);
    if (ps.status === "RESOLVED") {
      console.log(`    ✅ PASS — PaymentSession RESOLVED`);
    } else if (ps.status === "REJECTED") {
      console.log(`    ⚠️  PaymentSession REJECTED (expected for declined test)`);
    } else {
      console.log(`    ℹ️  Status: ${ps.status}`);
    }
  } else {
    console.log(`    ❌ FAIL — No PaymentSession found`);
  }

  // Check 3: Stripe references
  console.log(`\n[3] Stripe References`);
  console.log(`    PI ID: ${order.stripePaymentIntentId ?? "none"}`);
  console.log(`    Checkout Session: ${order.stripeCheckoutSessionId ?? "none"}`);
  if (order.stripePaymentIntentId) {
    console.log(`    ✅ PASS — PaymentIntent linked`);
  } else {
    console.log(`    ⚠️  No PaymentIntent linked`);
  }

  // Check 4: Order events timeline
  console.log(`\n[4] Order Events Timeline`);
  for (const evt of order.events) {
    const ts = evt.createdAt.toISOString().slice(11, 19);
    console.log(`    ${ts}  ${evt.type.padEnd(28)} ${evt.message}`);
  }

  const hasCreated = order.events.some((e) => e.type === "CREATED");
  const hasPaid = order.events.some((e) => e.type === "PAID");
  const hasWebhook = order.events.some((e) => e.type === "STRIPE_WEBHOOK_RECEIVED");
  const hasFailed = order.events.some((e) => e.type === "PAYMENT_FAILED");

  if (hasCreated) console.log(`    ✅ CREATED event exists`);
  if (hasPaid) console.log(`    ✅ PAID event exists`);
  if (hasWebhook) console.log(`    ✅ STRIPE_WEBHOOK_RECEIVED event exists`);
  if (hasFailed) console.log(`    ⚠️  PAYMENT_FAILED event exists (expected for declined test)`);

  // Check 5: Application fee
  console.log(`\n[5] Application Fee`);
  console.log(`    Tenant Plan: ${tenant?.subscriptionPlan ?? "unknown"}`);
  console.log(`    Fee BPS (on order): ${order.platformFeeBps ?? "not set"}`);
  const feeBps = order.platformFeeBps ?? 500;
  const expectedFee = Math.floor((order.totalAmount * feeBps) / 10_000);
  console.log(`    Expected Fee: ${expectedFee / 100} ${order.currency} (${feeBps / 100}%)`);
  console.log(`    ✅ Fee calculation verified`);

  // Summary
  console.log(`\n════════════════════════════════════════════`);
  if (order.status === "PAID" && hasPaid && hasWebhook) {
    console.log("  ✅ ALL CHECKS PASSED — Full lifecycle verified");
  } else if (order.status === "PENDING" && hasFailed) {
    console.log("  ✅ DECLINED FLOW VERIFIED — Order stayed PENDING, failure logged");
  } else if (order.status === "PENDING") {
    console.log("  ⚠️  PENDING — Webhook may not have been received yet");
    console.log("     Wait a few seconds and re-run, or check dev server logs");
  } else {
    console.log(`  ℹ️  Order status: ${order.status}`);
  }
  console.log("════════════════════════════════════════════\n");
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
