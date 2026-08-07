import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OpsAlertingService } from './ops-alerting.service';

@Controller('ops')
export class OpsAlertingController {
  constructor(private readonly opsAlerting: OpsAlertingService) {}

  /**
   * Receive operational alerts from Worker or other services.
   * This endpoint is called internally (protected by WORKER_SECRET).
   */
  @Post('alert')
  @HttpCode(HttpStatus.OK)
  async receiveAlert(@Body() body: {
    event: string;
    title: string;
    message: string;
    details?: Record<string, string | number>;
    severity?: 'critical' | 'warning';
  }) {
    await this.opsAlerting.alert({
      event: body.event,
      title: body.title,
      message: body.message,
      details: body.details,
      severity: body.severity ?? 'critical',
    });
    return { success: true };
  }
}