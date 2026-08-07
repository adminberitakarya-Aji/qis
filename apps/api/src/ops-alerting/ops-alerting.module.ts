import { Module } from '@nestjs/common';
import { OpsAlertingService } from './ops-alerting.service';
import { OpsAlertingController } from './ops-alerting.controller';

@Module({
  controllers: [OpsAlertingController],
  providers: [OpsAlertingService],
  exports: [OpsAlertingService],
})
export class OpsAlertingModule {}
