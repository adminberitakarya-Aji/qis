-- CreateTable
CREATE TABLE "HistoricalCandle" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalCandle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalCandle_exchange_pair_timeframe_timestamp_key" ON "HistoricalCandle"("exchange", "pair", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "HistoricalCandle_exchange_pair_timeframe_idx" ON "HistoricalCandle"("exchange", "pair", "timeframe");

-- CreateIndex
CREATE INDEX "HistoricalCandle_exchange_pair_timeframe_timestamp_idx" ON "HistoricalCandle"("exchange", "pair", "timeframe", "timestamp");