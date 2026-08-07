import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Idempotency Module — provides IdempotencyService globally.
 * Per BUSINESS_RULES_ADDENDUM.md, every state-changing API request
 * must accept an Idempotency Key.
 *
 * The IdempotencyInterceptor is registered globally via APP_INTERCEPTOR,
 * so ALL POST/PUT/PATCH/DELETE endpoints automatically support
 * the `Idempotency-Key` header without per-controller injection.
 */
@Global()
@Module({
  providers: [
    IdempotencyService,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
