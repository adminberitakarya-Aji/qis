import { Injectable } from '@nestjs/common';
import {
  NotificationEngine,
  type NotificationConfig,
  type NotificationEvent,
} from '@qis/notification-engine';

@Injectable()
export class NotificationService {
  private notificationEngine = new NotificationEngine();

  async sendEvent(
    event: NotificationEvent,
    details: Record<string, string | number>,
    config: NotificationConfig,
  ) {
    const payload = this.notificationEngine.buildEventPayload(event, details);
    return await this.notificationEngine.notify(payload, config);
  }
}
