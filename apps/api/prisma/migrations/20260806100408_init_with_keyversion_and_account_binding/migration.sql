-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyBlueprint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "tradingCapital" DOUBLE PRECISION NOT NULL,
    "sectionCount" INTEGER NOT NULL,
    "sectionsJson" TEXT NOT NULL,
    "capitalProtectionFloor" DOUBLE PRECISION NOT NULL,
    "floorAction" TEXT NOT NULL DEFAULT 'notify',
    "maxCapitalPerMovementPercent" DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    "maxDrawdownAlertPercent" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "aiReasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GridStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "exchangeAccountId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GridStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GridOrder" (
    "id" TEXT NOT NULL,
    "gridStrategyId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "globalOrderIndex" INTEGER NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "tpExchangeOrderId" TEXT,
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
    "placedAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "tpFilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GridOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiKeyKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "apiSecretEncrypted" TEXT NOT NULL,
    "apiSecretKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "StrategyBlueprint_userId_idx" ON "StrategyBlueprint"("userId");

-- CreateIndex
CREATE INDEX "StrategyBlueprint_expiresAt_idx" ON "StrategyBlueprint"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GridStrategy_blueprintId_key" ON "GridStrategy"("blueprintId");

-- CreateIndex
CREATE INDEX "GridStrategy_userId_idx" ON "GridStrategy"("userId");

-- CreateIndex
CREATE INDEX "GridStrategy_status_idx" ON "GridStrategy"("status");

-- CreateIndex
CREATE INDEX "GridStrategy_exchangeAccountId_idx" ON "GridStrategy"("exchangeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GridOrder_clientOrderId_key" ON "GridOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX "GridOrder_gridStrategyId_idx" ON "GridOrder"("gridStrategyId");

-- CreateIndex
CREATE INDEX "GridOrder_status_idx" ON "GridOrder"("status");

-- CreateIndex
CREATE INDEX "GridOrder_clientOrderId_idx" ON "GridOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX "ExchangeAccount_userId_idx" ON "ExchangeAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeAccount_userId_exchange_label_key" ON "ExchangeAccount"("userId", "exchange", "label");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "StrategyBlueprint" ADD CONSTRAINT "StrategyBlueprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridStrategy" ADD CONSTRAINT "GridStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridStrategy" ADD CONSTRAINT "GridStrategy_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StrategyBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridStrategy" ADD CONSTRAINT "GridStrategy_exchangeAccountId_fkey" FOREIGN KEY ("exchangeAccountId") REFERENCES "ExchangeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridOrder" ADD CONSTRAINT "GridOrder_gridStrategyId_fkey" FOREIGN KEY ("gridStrategyId") REFERENCES "GridStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeAccount" ADD CONSTRAINT "ExchangeAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
