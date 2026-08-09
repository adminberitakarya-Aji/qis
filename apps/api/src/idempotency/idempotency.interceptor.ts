import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';
import type { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { id?: string };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = (req.method ?? '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const key = req.headers['idempotency-key'] as string | undefined;
    const userId = req.user?.id;
    if (!key || !userId) return next.handle();

    const routePath = (req.route as { path?: string } | undefined)?.path ?? req.path ?? req.url;
    const endpoint = `${method}:${routePath}`;
    const cached = await this.idempotency.getExistingResponse(userId, key, endpoint);
    if (cached) {
      this.logger.log(`[Idempotency] Replaying cached response for key ${key}`);
      const env = cached as Record<string, unknown>;
      res.status(typeof env?.statusCode === 'number' ? env.statusCode : 200);
      return new Observable((sub) => { sub.next(cached); sub.complete(); });
    }

    return next.handle().pipe(tap((response: unknown) => {
      void (async () => {
        try {
          await this.idempotency.storeResponse(userId, key, endpoint, response);
        } catch (err: unknown) {
          this.logger.warn(`[Idempotency] Store failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    }));
  }
}