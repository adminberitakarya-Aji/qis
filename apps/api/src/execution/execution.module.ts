import { Module } from '@nestjs/common';
import { ExecutionController, WorkerController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { CryptoService } from '../common/crypto.service';
import { StrategyModule } from '../strategy/strategy.module';

@Module({
  imports: [StrategyModule],
  controllers: [ExecutionController, WorkerController],
  providers: [ExecutionService, CryptoService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
