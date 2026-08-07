import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-api:prisma');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private opsAlerting: any = null;

  setOpsAlerting(alerting: any) {
    this.opsAlerting = alerting;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      logger.info('Database connected successfully');
    } catch (err: any) {
      logger.error('Database connection failed', {}, err);
      if (this.opsAlerting) {
        await this.opsAlerting.databaseConnectionError({
          error: err.message,
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
