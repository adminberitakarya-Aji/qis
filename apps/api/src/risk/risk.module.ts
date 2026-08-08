import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { OpsAlertingModule } from '../ops-alerting/ops-alerting.module';

@Module({
  imports: [OpsAlertingModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
