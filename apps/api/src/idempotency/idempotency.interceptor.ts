import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = (req.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const key = req.headers['idempotency-key'] as string | undefined;
    const userId = req.user?.id as string | undefined;
    if (!key || !userId) return next.handle();

    const endpoint = `${method}:${req.route?.path || req.path || req.url}`;
    const cached = await this.idempotency.getExistingResponse(userId, key, endpoint);
    if (cached) {
      this.logger.log(`[Idempotency] Replaying cached response for key ${key}`);
      const env = cached as Record<string, unknown>;
      res.status(env?.statusCode ? (env.statusCode as number) : 200);
      return new Observable((sub) => { sub.next(cached); sub.complete(); });
    }

    return next.handle().pipe(tap(async (response) => {
      try { await this.idempotency.storeResponse(userId, key, endpoint, response); }
      catch (err: any) { this.logger.warn(`[Idempotency] Store failed: ${err.message}`); }
    }));
  }
}