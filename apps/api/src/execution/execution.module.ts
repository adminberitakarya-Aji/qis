import { Module } from '@nestjs/common';
import { ExecutionController, WorkerController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { StrategyModule } from '../strategy/strategy.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [StrategyModule, RiskModule],
  controllers: [ExecutionController, WorkerController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
