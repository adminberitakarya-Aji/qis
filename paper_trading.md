# Paper Trading — Dokumentasi Implementasi

> **Status**: ✅ Implementasi Selesai
> **Tanggal**: 8 Agustus 2026
> **Tujuan**: Menjalankan strategi grid trading dengan saldo virtual ($100) menggunakan harga live, tanpa uang real.

---

## 1. Latar Belakang

Qis adalah platform **AI-Assisted Grid Trading** dengan filosofi:
```
AI analyzes. AI recommends. Trader decides. System executes.
```

Saat ini, Qis mendukung **real trading** (menggunakan API key exchange) dan **backtest** (simulasi historis). Namun, belum ada **paper trading** — menjalankan strategi secara real-time dengan harga live tetapi dengan saldo virtual.

### Mengapa Paper Trading?

1. **Validasi strategi tanpa risiko** — trader bisa melihat performa strategi di paper trading sebelum berani pakai uang real
2. **Data feedback realistis** — menghasilkan data win rate, drawdown, PnL dari harga live aktual (bukan asumsi historis)
3. **Menutup Loop Engineering** — hasil paper trading bisa diumpankan ke AI Engine untuk rekomendasi lebih baik
4. **Bisa dijalankan 24/7 di VPS** — worker sudah berjalan terus-menerus

### Modal Virtual

- **Saldo virtual awal**: $100 per paper account
- **Fee**: 0.1% buy, 0.1% sell (sama dengan Binance spot)
- **Slippage**: 0.05% (sama dengan default backtest)

---

## 2. Analisis Arsitektur Saat Ini

### Alur Real Trading (saat ini)

```
Worker (WebSocket harga live)
   │
   ├─ Harga turun ke grid level → POST /execution/trigger-order
   │
   ▼
Execution Service
   │
   ├─ ExecutionEngine.executeSingleMarketBuyEncrypted()
   │       │
   │       ▼
   │   ExchangeEngine (decrypt API key) → Binance/Bybit
   │       │
   │       └─ Market BUY + TP LIMIT SELL ditempatkan di exchange
   │
   └─ Exchange memantau TP (limit order) → tp_filled
```

### Insight Kunci

| Komponen | Real Trading | Paper Trading |
|----------|-------------|---------------|
| **Harga live** | ✅ Worker (WebSocket) | ✅ Sama (reuse) |
| **TP price ditentukan** | ✅ GridEngine (`calculateTpPrice`) | ✅ Sama (reuse) |
| **TP dipantau oleh** | Exchange (limit order) | **Worker** (perlu ditambahkan) |
| **API key** | ✅ Diperlukan | ❌ Tidak diperlukan |
| **Saldo** | Real (exchange) | Virtual (DB) |

**Kesimpulan**: Untuk paper trading, kita perlu:
1. **Paper Exchange Engine** — mensimulasikan fill order terhadap saldo virtual
2. **Monitoring TP di Worker** — karena tidak ada exchange yang memantau TP secara virtual
3. **Model Prisma baru** — `PaperAccount`, `PaperStrategy`, `PaperOrder`

---

## 3. Arsitektur Paper Trading

```
Worker (WebSocket harga live)  ← TETAP SAMA, harga real
   │
   ├─ Harga turun ke grid level → trigger BUY (paper)
   └─ Harga naik ke TP price → trigger TP SELL (paper)  ← BARU
   │
   ▼
Execution Service (mode: 'paper')
   │
   ├─ PaperExchangeEngine (simulasi fill, saldo virtual)
   └─ Prisma: PaperAccount, PaperStrategy, PaperOrder
```

---

## 4. Langkah Implementasi

### Langkah 1: Model Prisma Baru

**File: `apps/api/prisma/schema.prisma`**

Tambah 3 model baru:

```prisma
// ============================================================
// Paper Trading (Virtual Balance, No Real Money)
// ============================================================

model PaperAccount {
  id             String   @id @default(cuid())
  userId         String
  exchange       String   // 'binance' | 'bybit'
  label          String
  virtualBalance Float    @default(100)  // $100 modal virtual
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  paperStrategies PaperStrategy[]

  @@index([userId])
  @@unique([userId, exchange, label])
}

model PaperStrategy {
  id             String   @id @default(cuid())
  userId         String
  paperAccountId String
  blueprintId    String
  exchange       String
  pair           String
  capital        Float    // $100
  status         String   @default("active") // 'active' | 'stopping' | 'stopped' | 'completed' | 'error'
  startedAt      DateTime @default(now())
  stoppedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  paperAccount PaperAccount @relation(fields: [paperAccountId], references: [id])
  blueprint    StrategyBlueprint @relation(fields: [blueprintId], references: [id])
  paperOrders  PaperOrder[]

  @@index([userId])
  @@index([status])
  @@index([userId, status])
}

model PaperOrder {
  id               String   @id @default(cuid())
  paperStrategyId  String
  sectionIndex     Int
  orderIndex       Int
  globalOrderIndex Int
  clientOrderId    String   @unique
  gridPrice        Float
  tpPrice          Float
  allocatedCapital Float
  estimatedQuantity Float
  status           String   @default("pending")
  // 'pending' | 'filled' | 'tp_placed' | 'tp_filled' | 'canceled' | 'error'
  buyFilledPrice   Float?
  buyFilledQuantity Float?
  buyFee           Float?
  tpFilledPrice    Float?
  tpFee            Float?
  realizedPnl      Float?
  filledAt         DateTime?
  tpFilledAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  paperStrategy PaperStrategy @relation(fields: [paperStrategyId], references: [id], onDelete: Cascade)

  @@index([paperStrategyId])
  @@index([status])
  @@index([clientOrderId])
  @@index([paperStrategyId, status])
}
```

**Perintah**: `npx prisma migrate dev --name add_paper_trading`

---

### Langkah 2: Paket Baru — `@qis/paper-exchange-engine`

**File: `packages/engines/paper-exchange-engine/package.json`**

```json
{
  "name": "@qis/paper-exchange-engine",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

**File: `packages/engines/paper-exchange-engine/tsconfig.json`** — mengikuti pola engine lain.

**File: `packages/engines/paper-exchange-engine/src/index.ts`**

```typescript
// Qis Paper Exchange Engine
// Simulates exchange order execution against a virtual balance.
// No real API calls, no API keys, no real money.
// Uses live market prices from the Worker for realistic fills.

export interface PaperFillResult {
  filledPrice: number;
  filledQuantity: number;
  fee: number;
  realizedPnl?: number;
}

export class PaperExchangeEngine {
  private readonly buyFeePercent = 0.1;   // 0.1% — matches real Binance spot
  private readonly sellFeePercent = 0.1;  // 0.1%
  private readonly slippagePercent = 0.05; // 0.05% — matches backtest default

  /**
   * Simulates a MARKET BUY fill.
   * - Buy executes at triggeredPrice + slippage
   * - Deducts allocated capital + fee from virtual balance
   */
  simulateMarketBuy(
    allocatedCapital: number,
    triggeredPrice: number
  ): PaperFillResult {
    const filledPrice = triggeredPrice * (1 + this.slippagePercent / 100);
    const filledQuantity = allocatedCapital / filledPrice;
    const fee = allocatedCapital * (this.buyFeePercent / 100);

    return {
      filledPrice: Number(filledPrice.toFixed(8)),
      filledQuantity: Number(filledQuantity.toFixed(8)),
      fee: Number(fee.toFixed(6)),
    };
  }

  /**
   * Simulates a TP SELL LIMIT fill.
   * - Sell executes at tpPrice - slippage
   * - Adds proceeds - fee back to virtual balance
   * - Calculates realized PnL
   */
  simulateTpSell(
    filledQuantity: number,
    buyFilledPrice: number,
    buyFee: number,
    tpPrice: number
  ): PaperFillResult {
    const sellPrice = tpPrice * (1 - this.slippagePercent / 100);
    const sellProceeds = filledQuantity * sellPrice;
    const sellFee = sellProceeds * (this.sellFeePercent / 100);
    const buyCost = filledQuantity * buyFilledPrice + buyFee;
    const realizedPnl = sellProceeds - sellFee - buyCost;

    return {
      filledPrice: Number(sellPrice.toFixed(8)),
      filledQuantity,
      fee: Number(sellFee.toFixed(6)),
      realizedPnl: Number(realizedPnl.toFixed(6)),
    };
  }
}
```

---

### Langkah 3: Modifikasi Worker — Tambah Monitoring TP

**File: `apps/worker/src/index.ts`**

#### 3a. Tambah interface untuk order yang sudah filled (menunggu TP)

```typescript
interface TpLevel {
  orderId: string;
  symbol: string;
  tpPrice: number;
  sectionIndex: number;
  orderIndex: number;
}

interface ActiveStrategy {
  strategyId: string;
  symbol: string;
  exchange: string;
  pendingOrders: GridLevel[];      // BUY trigger levels
  tpOrders: TpLevel[];             // ← BARU: TP sell levels
}
```

#### 3b. Tambah fungsi `checkAndTriggerTp()`

```typescript
function checkAndTriggerTp(strategies: ActiveStrategy[], currentPrice: number): void {
  for (const strategy of strategies) {
    const crossedTp = strategy.tpOrders.filter(
      (order) => currentPrice >= order.tpPrice
    );

    if (crossedTp.length === 0) continue;

    // Remove crossed TP orders to prevent double-trigger
    const crossedIds = new Set(crossedTp.map((o) => o.orderId));
    strategy.tpOrders = strategy.tpOrders.filter(
      (o) => !crossedIds.has(o.orderId)
    );

    for (const tp of crossedTp) {
      triggerTpFill(tp.orderId, currentPrice);
    }
  }
}
```

#### 3c. Tambah fungsi `triggerTpFill()`

```typescript
async function triggerTpFill(orderId: string, currentPrice: number): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/execution/trigger-tp`, {
      method: 'POST',
      headers: WORKER_HEADERS,
      body: JSON.stringify({ orderId, currentPrice }),
    });
    if (res.ok) {
      logger.info('TP triggered successfully', { orderId });
    } else {
      logger.warn('TP trigger failed', { orderId, status: res.status });
    }
  } catch (err: any) {
    logger.error('Failed to trigger TP', { orderId }, err);
  }
}
```

#### 3d. Panggil `checkAndTriggerTp()` di setiap message handler

```typescript
ws.on('message', (data: Buffer) => {
  // ... existing parse ...
  checkAndTrigger(strategies, currentPrice);   // BUY trigger
  checkAndTriggerTp(strategies, currentPrice); // ← BARU: TP trigger
});
```

---

### Langkah 4: Modifikasi Execution Service — Mode Paper

**File: `apps/api/src/execution/execution.service.ts`**

#### 4a. Tambah import

```typescript
import { PaperExchangeEngine } from '@qis/paper-exchange-engine';
```

#### 4b. Tambah field

```typescript
private paperExchangeEngine = new PaperExchangeEngine();
```

#### 4c. Tambah method `startPaperExecution()`

```typescript
async startPaperExecution(userId: string, dto: StartPaperExecutionDto) {
  // 1. Validate blueprint
  const blueprint = await this.strategyService.getBlueprint(userId, dto.blueprintId);

  // 2. Get or create paper account (default $100)
  let paperAccount = await this.prisma.paperAccount.findFirst({
    where: { userId, exchange: blueprint.exchange },
  });
  if (!paperAccount) {
    paperAccount = await this.prisma.paperAccount.create({
      data: { userId, exchange: blueprint.exchange, label: 'Paper Trading', virtualBalance: 100 },
    });
  }

  // 3. Check virtual balance sufficient
  if (paperAccount.virtualBalance < blueprint.tradingCapital) {
    throw new BadRequestException('Virtual balance insufficient for this strategy');
  }

  // 4. Create PaperStrategy
  const paperStrategy = await this.prisma.paperStrategy.create({
    data: {
      userId,
      paperAccountId: paperAccount.id,
      blueprintId: blueprint.id,
      exchange: blueprint.exchange,
      pair: blueprint.pair,
      capital: blueprint.tradingCapital,
      status: 'active',
    },
  });

  // 5. Build grid & create PaperOrders (reuse gridEngine.buildGrid)
  // ... (sama seperti real trading, tapi tanpa exchange account)

  // 6. Deduct capital from virtual balance
  await this.prisma.paperAccount.update({
    where: { id: paperAccount.id },
    data: { virtualBalance: paperAccount.virtualBalance - blueprint.tradingCapital },
  });

  return { strategyId: paperStrategy.id, ... };
}
```

#### 4d. Tambah method `triggerPaperGridOrder()`

```typescript
async triggerPaperGridOrder(orderId: string, triggeredPrice: number) {
  // 1. Atomically claim order (same pattern as real)
  const claim = await this.prisma.paperOrder.updateMany({
    where: { id: orderId, status: 'pending' },
    data: { status: 'filled', filledAt: new Date() },
  });
  if (claim.count === 0) return { skipped: true };

  // 2. Fetch order + strategy
  const order = await this.prisma.paperOrder.findUnique({
    where: { id: orderId },
    include: { paperStrategy: true },
  });

  // 3. Simulate market buy
  const fill = this.paperExchangeEngine.simulateMarketBuy(
    order.allocatedCapital,
    triggeredPrice
  );

  // 4. Update order with fill data
  await this.prisma.paperOrder.update({
    where: { id: orderId },
    data: {
      status: 'tp_placed',  // TP is "placed" (virtual)
      buyFilledPrice: fill.filledPrice,
      buyFilledQuantity: fill.filledQuantity,
      buyFee: fill.fee,
    },
  });

  return { orderId, status: 'tp_placed', filledPrice: fill.filledPrice };
}
```

#### 4e. Tambah method `triggerPaperTpFill()`

```typescript
async triggerPaperTpFill(orderId: string, currentPrice: number) {
  // 1. Atomically claim TP fill
  const claim = await this.prisma.paperOrder.updateMany({
    where: { id: orderId, status: 'tp_placed' },
    data: { status: 'tp_filled', tpFilledAt: new Date() },
  });
  if (claim.count === 0) return { skipped: true };

  // 2. Fetch order + strategy + account
  const order = await this.prisma.paperOrder.findUnique({
    where: { id: orderId },
    include: { paperStrategy: { include: { paperAccount: true } } },
  });

  // 3. Simulate TP sell
  const fill = this.paperExchangeEngine.simulateTpSell(
    order.buyFilledQuantity!,
    order.buyFilledPrice!,
    order.buyFee!,
    order.tpPrice
  );

  // 4. Update order with TP fill data
  await this.prisma.paperOrder.update({
    where: { id: orderId },
    data: {
      status: 'tp_filled',
      tpFilledPrice: fill.filledPrice,
      tpFee: fill.fee,
      realizedPnl: fill.realizedPnl,
    },
  });

  // 5. Add proceeds back to virtual balance
  const proceeds = order.buyFilledQuantity! * fill.filledPrice - fill.fee;
  await this.prisma.paperAccount.update({
    where: { id: order.paperStrategy.paperAccountId },
    data: { virtualBalance: { increment: proceeds } },
  });

  return { orderId, status: 'tp_filled', realizedPnl: fill.realizedPnl };
}
```

#### 4f. Tambah method `getAllActivePaperStrategiesForWorker()`

```typescript
async getAllActivePaperStrategiesForWorker() {
  const strategies = await this.prisma.paperStrategy.findMany({
    where: { status: 'active' },
    include: {
      paperOrders: {
        where: { status: { in: ['pending', 'tp_placed'] } },
        orderBy: { globalOrderIndex: 'asc' },
      },
    },
  });

  return strategies.map((s) => ({
    strategyId: s.id,
    symbol: s.pair,
    exchange: s.exchange,
    pendingOrders: s.paperOrders
      .filter((o) => o.status === 'pending')
      .map((o) => ({
        orderId: o.id,
        symbol: s.pair,
        gridPrice: o.gridPrice,
        tpPrice: o.tpPrice,
        sectionIndex: o.sectionIndex,
        orderIndex: o.orderIndex,
        allocatedCapital: o.allocatedCapital,
      })),
    tpOrders: s.paperOrders
      .filter((o) => o.status === 'tp_placed')
      .map((o) => ({
        orderId: o.id,
        symbol: s.pair,
        tpPrice: o.tpPrice,
        sectionIndex: o.sectionIndex,
        orderIndex: o.orderIndex,
      })),
  }));
}
```

---

### Langkah 5: API Controller — Paper Trading Endpoints

**File: `apps/api/src/execution/execution.controller.ts`**

#### Endpoint User (JWT protected)

```typescript
// POST /api/v1/execution/paper/start
@Post('paper/start')
async startPaperExecution(
  @CurrentUser() user: { id: string },
  @Body() dto: StartPaperExecutionDto,
) {
  const data = await this.executionService.startPaperExecution(user.id, dto);
  return { success: true, message: 'Paper trading started', data };
}

// POST /api/v1/execution/paper/stop/:id
@Post('paper/stop/:id')
async stopPaperExecution(
  @CurrentUser() user: { id: string },
  @Param('id') strategyId: string,
) {
  const data = await this.executionService.stopPaperExecution(user.id, strategyId);
  return { success: true, message: 'Paper trading stopped', data };
}

// GET /api/v1/execution/paper/status
@Get('paper/status')
async getPaperStatus(@CurrentUser() user: { id: string }) {
  const data = await this.executionService.getPaperStatus(user.id);
  return { success: true, message: 'Paper trading status', data };
}
```

#### Endpoint Worker (WORKER_SECRET protected)

```typescript
// POST /api/v1/execution/trigger-tp
@Post('trigger-tp')
async triggerTpFill(
  @Headers('x-worker-secret') secret: string,
  @Body() body: { orderId: string; currentPrice: number },
) {
  this.verifyWorkerSecret(secret);
  const data = await this.executionService.triggerPaperTpFill(body.orderId, body.currentPrice);
  return { success: true, data };
}
```

---

### Langkah 6: DTO Baru

**File: `apps/api/src/execution/dto/start-paper-execution.dto.ts`**

```typescript
import { IsString, IsIn } from 'class-validator';

export class StartPaperExecutionDto {
  @IsString()
  blueprintId!: string;

  @IsString()
  @IsIn(['binance', 'bybit'])
  exchange!: 'binance' | 'bybit';
}
```

---

## 5. Ringkasan File yang Diubah/Dibuat

| # | File | Aksi |
|---|------|------|
| 1 | `apps/api/prisma/schema.prisma` | ✅ Tambah 3 model: `PaperAccount`, `PaperStrategy`, `PaperOrder` + relasi `paperStrategies` di `StrategyBlueprint` |
| 2 | `packages/engines/paper-exchange-engine/package.json` | ✅ BUAT BARU |
| 3 | `packages/engines/paper-exchange-engine/tsconfig.json` | ✅ BUAT BARU |
| 4 | `packages/engines/paper-exchange-engine/src/index.ts` | ✅ BUAT BARU |
| 5 | `apps/worker/src/index.ts` | ✅ Tambah monitoring TP, trigger TP, load paper strategies |
| 6 | `apps/api/src/execution/execution.service.ts` | ✅ Tambah 6 method paper trading (start, stop, status, getActive, triggerBuy, triggerTp) |
| 7 | `apps/api/src/execution/execution.controller.ts` | ✅ Tambah 3 endpoint user paper + 3 endpoint worker paper |
| 8 | `apps/api/src/execution/dto/start-paper-execution.dto.ts` | ✅ BUAT BARU |
| 9 | `apps/api/package.json` | ✅ Tambah dependency `@qis/paper-exchange-engine` |

### Verifikasi

- ✅ `pnpm install` — semua workspace project terdeteksi (21 projects)
- ✅ `prisma generate` (v5.22.0) — Prisma Client berhasil di-generate
- ✅ `prisma db push` — database supabase tersinkron dengan schema baru
- ✅ `pnpm --filter @qis/api typecheck` — API typecheck lulus
- ✅ `pnpm --filter @qis/worker build` — Worker build lulus
- ✅ `pnpm --filter @qis/worker test` — 10 test files, 101 tests passed

---

## 6. Prinsip yang Dipertahankan

1. **Modal $100** — saldo virtual awal per paper account
2. **Harga real** — Worker tetap memonitor harga live Binance/Bybit
3. **Fee & slippage realistis** — 0.1% fee, 0.05% slippage (sama dengan backtest)
4. **Tidak butuh API key** — paper trading tidak menyentuh exchange API
5. **Terpisah dari real trading** — tabel terpisah, tidak mengganggu strategi real
6. **Bisa dijalankan di VPS 24/7** — worker sudah berjalan terus-menerus

---

## 7. Setelah Paper Trading Berjalan

Setelah paper trading menghasilkan data (win rate, drawdown, PnL), kita bisa:

1. **Umpan balik ke AI** — hasil paper trading diumpankan ke AI Engine untuk rekomendasi lebih baik (menutup Loop Engineering)
2. **Validasi strategi** — user bisa melihat performa paper trading sebelum berani pakai uang real
3. **Perbandingan** — user bisa membandingkan paper vs real untuk mengukur akurasi

---

## 9. Fase 1: Bot Telegram (Notifikasi Real-Time)

### Status: ✅ Implementasi Selesai

### Perubahan yang Dilakukan

| # | File | Perubahan |
|---|------|-----------|
| 1 | `apps/api/src/execution/execution.module.ts` | Tambah `NotificationModule` ke imports |
| 2 | `apps/api/src/execution/execution.service.ts` | Inject `NotificationService` + `ConfigService`, tambah helper `getTelegramConfig()`, tambah 7 titik notifikasi |
| 3 | `apps/api/.env.example` | Tambah `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| 4 | `apps/api/src/execution/execution.service.spec.ts` | Update mock untuk 9 argumen constructor |

### Titik Notifikasi yang Ditambahkan

| Event | Mode | Keterangan |
|-------|------|------------|
| `strategy_started` | real | Strategi real dimulai |
| `strategy_started` | paper | Paper strategy dimulai |
| `order_filled` | real | Order BUY real terisi |
| `order_filled` | paper | Order BUY paper terisi |
| `tp_filled` | paper | TP hit (round selesai) |
| `strategy_stopped` | real | Strategi real dihentikan |
| `strategy_stopped` | paper | Paper strategy dihentikan |

### Cara Konfigurasi

1. Buat bot via **@BotFather** di Telegram
2. Dapatkan **Bot Token** (format: `123456789:ABCdef...`)
3. Dapatkan **Chat ID** — chat dengan bot, buka `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Isi di `apps/api/.env`:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789
```
5. Restart API — notifikasi akan terkirim otomatis

### Verifikasi

- ✅ `pnpm --filter @qis/api typecheck` — API typecheck lulus
- ✅ `pnpm --filter @qis/api test` — **3 test suites passed, 20 tests passed** (1 skipped, integration)
- ✅ `pnpm --filter @qis/paper-exchange-engine build` — Paket baru berhasil di-build
- ✅ `jest.config.cjs` — Tambah mapping `@qis/paper-exchange-engine` untuk jest resolver
- ✅ `execution.service.spec.ts` — Mock di-update untuk 9 argumen constructor

---

## 8. Catatan Penting

### TP Price vs Monitoring TP

- **TP price** sudah ditentukan di codebase oleh `GridEngine.buildGrid()` menggunakan `calculateTpPrice()` dari `@qis/core`
- **Monitoring TP** (kapan harga mencapai TP) untuk real trading dilakukan oleh exchange (limit order)
- **Untuk paper trading**, monitoring TP harus dilakukan oleh Worker karena tidak ada exchange yang memantau order virtual

### Keamanan

- Paper trading **tidak memerlukan API key** — tidak ada risiko keamanan kredensial
- Semua data paper trading tersimpan di database terpisah dari real trading
- Tidak ada interaksi dengan exchange API untuk eksekusi order