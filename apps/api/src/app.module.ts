import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ExchangeAccountModule } from './exchange-account/exchange-account.module';
import { MarketModule } from './market/market.module';
import { AiModule } from './ai/ai.module';
import { StrategyModule } from './strategy/strategy.module';
import { SimulationModule } from './simulation/simulation.module';
import { ExecutionModule } from './execution/execution.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BacktestModule } from './backtest/backtest.module';
import { NotificationModule } from './notification/notification.module';
import { OpsAlertingModule } from './ops-alerting/ops-alerting.module';
import { PrismaModule } from './prisma/prisma.module';
import { EnginesModule } from './engines/engines.module';
import { RealtimeModule } from './realtime/realtime.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { PrismaService } from './prisma/prisma.service';
import { OpsAlertingService } from './ops-alerting/ops-alerting.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Global rate limiting — protects all API endpoints from abuse.
    // Default: 100 requests per 60 seconds per IP.
    // Auth endpoints have a tighter throttle (5/min) applied via @Throttle.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    EnginesModule,
    RealtimeModule,
    IdempotencyModule,
    AuthModule,
    ExchangeAccountModule,
    MarketModule,
    AiModule,
    StrategyModule,
    SimulationModule,
    ExecutionModule,
    PortfolioModule,
    AnalyticsModule,
    BacktestModule,
    NotificationModule,
    OpsAlertingModule,
  ],
  providers: [
    {
      provide: 'PRISMA_ALERTING_SETUP',
      useFactory: (prisma: PrismaService, opsAlerting: OpsAlertingService) => {
        prisma.setOpsAlerting(opsAlerting);
      },
      inject: [PrismaService, OpsAlertingService],
    },
  ],
})
export class AppModule {}
