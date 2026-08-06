import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ExchangeAccountModule } from './exchange-account/exchange-account.module';
import { MarketModule } from './market/market.module';
import { AiModule } from './ai/ai.module';
import { StrategyModule } from './strategy/strategy.module';
import { SimulationModule } from './simulation/simulation.module';
import { ExecutionModule } from './execution/execution.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { EnginesModule } from './engines/engines.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    EnginesModule,
    AuthModule,
    ExchangeAccountModule,
    MarketModule,
    AiModule,
    StrategyModule,
    SimulationModule,
    ExecutionModule,
    PortfolioModule,
    AnalyticsModule,
    NotificationModule,
  ],
})
export class AppModule {}