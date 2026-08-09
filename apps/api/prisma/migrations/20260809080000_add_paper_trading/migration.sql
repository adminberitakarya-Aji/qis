-- CreateTable
CREATE TABLE "PaperAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "virtualBalance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperAccountId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" TEXT NOT NULL,
    "paperStrategyId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "globalOrderIndex" INTEGER NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "gridPrice" DOUBLE PRECISION NOT NULL,
    "tpPrice" DOUBLE PRECISION NOT NULL,
    "allocatedCapital" DOUBLE PRECISION NOT NULL,
    "estimatedQuantity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "buyFilledPrice" DOUBLE PRECISION,
    "buyFilledQuantity" DOUBLE PRECISION,
    "buyFee" DOUBLE PRECISION,
    "tpFilledPrice" DOUBLE PRECISION,
    "tpFee" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "filledAt" TIMESTAMP(3),
    "tpFilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperAccount_userId_idx" ON "PaperAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperAccount_userId_exchange_label_key" ON "PaperAccount"("userId", "exchange", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategy_blueprintId_key" ON "PaperStrategy"("blueprintId");
-- NOTE: this unique constraint is the fix for the "duplicate active
-- PaperStrategy per Blueprint" issue — mirrors GridStrategy_blueprintId_key
-- below. It's the atomic, race-proof backstop behind the app-level
-- pre-check in ExecutionService.startPaperExecution(): even if two
-- concurrent requests both pass the pre-check, only one INSERT can win;
-- the other fails with a Postgres unique_violation (P2002 in Prisma),
-- which the service catches and turns into a clean 400 response.

-- CreateIndex
CREATE INDEX "PaperStrategy_userId_idx" ON "PaperStrategy"("userId");

-- CreateIndex
CREATE INDEX "PaperStrategy_status_idx" ON "PaperStrategy"("status");

-- CreateIndex
CREATE INDEX "PaperStrategy_userId_status_idx" ON "PaperStrategy"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_clientOrderId_key" ON "PaperOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX "PaperOrder_paperStrategyId_idx" ON "PaperOrder"("paperStrategyId");

-- CreateIndex
CREATE INDEX "PaperOrder_status_idx" ON "PaperOrder"("status");

-- CreateIndex
CREATE INDEX "PaperOrder_clientOrderId_idx" ON "PaperOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX "PaperOrder_paperStrategyId_status_idx" ON "PaperOrder"("paperStrategyId", "status");

-- AddForeignKey
ALTER TABLE "PaperAccount" ADD CONSTRAINT "PaperAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperStrategy" ADD CONSTRAINT "PaperStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperStrategy" ADD CONSTRAINT "PaperStrategy_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperStrategy" ADD CONSTRAINT "PaperStrategy_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StrategyBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_paperStrategyId_fkey" FOREIGN KEY ("paperStrategyId") REFERENCES "PaperStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;