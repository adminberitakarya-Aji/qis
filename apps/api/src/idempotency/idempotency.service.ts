import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

/**
 * Idempotency Service
 *
 * Per BUSINESS_RULES_ADDENDUM.md (Idempotency Rules):
 * - Every state-changing API request must accept an Idempotency Key
 * - Backend stores the key with the resulting state change
 * - Returns the original result if the same key is received again
 * - Never executes the same state change twice for the same key
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if an idempotency key has already been processed.
   * Returns the stored response if found, or null if not.
   */
  async getExistingResponse(
    userId: string,
    key: string,
    endpoint: string
  ): Promise<unknown> {
    try {
      const record = await this.prisma.idempotencyKey.findUnique({
        where: { key },
      });

      if (!record) return null;
      if (record.userId !== userId) return null;
      if (record.endpoint !== endpoint) return null;
      if (record.expiresAt < new Date()) return null;

      this.logger.log(`[Idempotency] Key ${key} already processed. Returning cached response.`);
      return record.response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Idempotency] Failed to check key ${key}:`, msg);
      return null;
    }
  }

  /**
   * Stores the result of a state-changing operation with its idempotency key.
   */
  async storeResponse(
    userId: string,
    key: string,
    endpoint: string,
    response: unknown
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.DEFAULT_TTL_MS);

      await this.prisma.idempotencyKey.upsert({
        where: { key },
        create: {
          key,
          userId,
          endpoint,
          response: response as Prisma.InputJsonValue,
          expiresAt,
        },
        update: {
          response: response as Prisma.InputJsonValue,
          expiresAt,
        },
      });

      this.logger.log(`[Idempotency] Stored response for key ${key} (${endpoint})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Idempotency] Failed to store key ${key}:`, msg);
    }
  }
}