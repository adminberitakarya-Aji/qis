import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-api:prisma');

export interface OpsAlertingNotifier {
  databaseConnectionError(details: { error: string }): Promise<void>;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private opsAlerting: OpsAlertingNotifier | null = null;

  setOpsAlerting(alerting: OpsAlertingNotifier) {
    this.opsAlerting = alerting;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      logger.info('Database connected successfully');
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      logger.error('Database connection failed', {}, errorObj);
      if (this.opsAlerting) {
        await this.opsAlerting.databaseConnectionError({
          error: errorObj.message,
        });
      }
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    logger.info('Database disconnected');
  }
}
