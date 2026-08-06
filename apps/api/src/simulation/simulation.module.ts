import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module';
import { SimulationController } from './simulation.controller';

@Module({
  imports: [StrategyModule],
  controllers: [SimulationController],
})
export class SimulationModule {}
