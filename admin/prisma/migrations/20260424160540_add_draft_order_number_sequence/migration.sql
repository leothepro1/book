-- CreateTable
CREATE TABLE "DraftOrderNumberSequence" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftOrderNumberSequence_pkey" PRIMARY KEY ("tenantId")
);
