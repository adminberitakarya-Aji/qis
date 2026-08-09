import { Module } from '@nestjs/common';
import { ExecutionController, WorkerController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { StrategyModule } from '../strategy/strategy.module';
import { RiskModule } from '../risk/risk.module';
import { NotificationModule } from '../notification/notification.module';
import { OpsAlertingModule } from '../ops-alerting/ops-alerting.module';

@Module({
  imports: [StrategyModule, RiskModule, NotificationModule, OpsAlertingModule],
  controllers: [ExecutionController, WorkerController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}