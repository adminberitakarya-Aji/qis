// Qis Notification Engine
// Responsible for:
// - Telegram Bot notifications
// - Discord Webhook notifications
// - Email notifications (via HTTP relay / external SMTP)
// Does NOT contain trading logic.

export type NotificationChannel = 'telegram' | 'discord' | 'email';

export type NotificationEvent =
  | 'order_placed'     // Buy Limit placed on exchange
  | 'order_filled'     // Buy order filled
  | 'tp_placed'        // TP sell order placed
  | 'tp_filled'        // TP sell order filled (round complete)
  | 'order_error'      // Order placement/polling error
  | 'strategy_started' // Grid strategy execution started
  | 'strategy_stopped' // Grid strategy stopped by user
  | 'blueprint_expiry' // Blueprint 15-min window approaching
  | 'capital_floor'    // Price hit capital protection floor
  | 'custom';          // Custom message

export interface NotificationPayload {
  event: NotificationEvent;
  title: string;
  message: string;
  details?: Record<string, string | number>;
  timestamp?: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface DiscordConfig {
  webhookUrl: string;
}

export interface EmailConfig {
  webhookUrl: string; // HTTP endpoint to POST email (e.g. SendGrid, Mailgun webhooks)
  fromAddress: string;
  toAddress: string;
}

export interface NotificationConfig {
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  email?: EmailConfig;
}

export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

export class NotificationEngine {
  /**
   * Sends a notification across all configured channels.
   */
  async notify(
    payload: NotificationPayload,
    config: NotificationConfig
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const ts = payload.timestamp ?? Date.now();
    const fullPayload = { ...payload, timestamp: ts };

    const tasks: Promise<NotificationResult>[] = [];

    if (config.telegram) {
      tasks.push(this.sendTelegram(fullPayload, config.telegram));
    }
    if (config.discord) {
      tasks.push(this.sendDiscord(fullPayload, config.discord));
    }
    if (config.email) {
      tasks.push(this.sendEmail(fullPayload, config.email));
    }

    const settled = await Promise.allSettled(tasks);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ channel: 'telegram', success: false, error: String(result.reason) });
      }
    }

    return results;
  }

  /**
   * Sends a Telegram message via Bot API.
   */
  private async sendTelegram(
    payload: NotificationPayload,
    config: TelegramConfig
  ): Promise<NotificationResult> {
    try {
      const text = this.formatTelegramMessage(payload);
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { channel: 'telegram', success: false, error: errBody };
      }

      return { channel: 'telegram', success: true };
    } catch (err: any) {
      return { channel: 'telegram', success: false, error: err.message };
    }
  }

  /**
   * Sends a Discord embed via Webhook.
   */
  private async sendDiscord(
    payload: NotificationPayload,
    config: DiscordConfig
  ): Promise<NotificationResult> {
    try {
      const color = this.getDiscordColor(payload.event);
      const fields = payload.details
        ? Object.entries(payload.details).map(([name, value]) => ({
            name,
            value: String(value),
            inline: true,
          }))
        : [];

      const body = {
        embeds: [
          {
            title: `🤖 Qis | ${payload.title}`,
            description: payload.message,
            color,
            fields,
            timestamp: new Date(payload.timestamp!).toISOString(),
            footer: { text: 'Qis AI-Assisted Grid Trading' },
          },
        ],
      };

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { channel: 'discord', success: false, error: errBody };
      }

      return { channel: 'discord', success: true };
    } catch (err: any) {
      return { channel: 'discord', success: false, error: err.message };
    }
  }

  /**
   * Sends email via HTTP relay webhook.
   */
  private async sendEmail(
    payload: NotificationPayload,
    config: EmailConfig
  ): Promise<NotificationResult> {
    try {
      const body = {
        from: config.fromAddress,
        to: config.toAddress,
        subject: `[Qis] ${payload.title}`,
        text: `${payload.message}\n\nDetails:\n${JSON.stringify(payload.details ?? {}, null, 2)}`,
      };

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { channel: 'email', success: false, error: errBody };
      }

      return { channel: 'email', success: true };
    } catch (err: any) {
      return { channel: 'email', success: false, error: err.message };
    }
  }

  /**
   * Builds event notification payload for common trading events.
   */
  buildEventPayload(
    event: NotificationEvent,
    data: Record<string, string | number>
  ): NotificationPayload {
    const eventMessages: Record<NotificationEvent, { title: string; message: string }> = {
      order_placed: {
        title: '📋 Buy Limit Order Placed',
        message: `Buy limit order placed at grid price level.`,
      },
      order_filled: {
        title: '✅ Buy Order Filled',
        message: `Buy order filled. Take Profit order will be placed.`,
      },
      tp_placed: {
        title: '🎯 Take Profit Order Placed',
        message: `Take Profit sell order placed on exchange.`,
      },
      tp_filled: {
        title: '💰 Take Profit Hit! Round Complete',
        message: `Take Profit order filled. Grid round completed with profit.`,
      },
      order_error: {
        title: '⚠️ Order Error',
        message: `An error occurred with an order. Please check your strategy.`,
      },
      strategy_started: {
        title: '🚀 Grid Strategy Started',
        message: `Grid trading strategy started. Orders are being placed on exchange.`,
      },
      strategy_stopped: {
        title: '⏹️ Grid Strategy Stopped',
        message: `Grid trading strategy stopped. All open orders have been canceled.`,
      },
      blueprint_expiry: {
        title: '⏰ Blueprint Expiring Soon',
        message: `Strategy Blueprint will expire in 5 minutes. Please approve or regenerate.`,
      },
      capital_floor: {
        title: '🔴 Capital Protection Floor Hit',
        message: `Market price has hit the Capital Protection Floor. Action required.`,
      },
      custom: {
        title: 'Qis Notification',
        message: '',
      },
    };

    const { title, message } = eventMessages[event];
    return {
      event,
      title,
      message,
      details: data,
      timestamp: Date.now(),
    };
  }

  private formatTelegramMessage(payload: NotificationPayload): string {
    let text = `<b>${payload.title}</b>\n\n${payload.message}`;
    if (payload.details && Object.keys(payload.details).length > 0) {
      text += '\n\n<b>Details:</b>';
      for (const [key, value] of Object.entries(payload.details)) {
        text += `\n• <b>${key}:</b> ${value}`;
      }
    }
    text += `\n\n<i>🕐 ${new Date(payload.timestamp!).toISOString()}</i>`;
    return text;
  }

  private getDiscordColor(event: NotificationEvent): number {
    const colorMap: Record<NotificationEvent, number> = {
      order_placed: 0x5865f2,    // Blurple
      order_filled: 0x57f287,    // Green
      tp_placed: 0xfee75c,       // Yellow
      tp_filled: 0x57f287,       // Green
      order_error: 0xed4245,     // Red
      strategy_started: 0x57f287, // Green
      strategy_stopped: 0x99aab5, // Grey
      blueprint_expiry: 0xfee75c, // Yellow
      capital_floor: 0xed4245,   // Red
      custom: 0x5865f2,           // Blurple
    };
    return colorMap[event] ?? 0x5865f2;
  }
}
