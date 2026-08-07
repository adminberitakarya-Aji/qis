import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationEngine } from '@qis/notification-engine';
import { OpsAlertingService } from './ops-alerting.service';

describe('OpsAlertingService', () => {
  let notifySpy: jest.SpyInstance;

  const buildConfigService = (env: Record<string, string>) => ({
    get: jest.fn((key: string) => env[key]),
  });

  const createService = async (env: Record<string, string>) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpsAlertingService,
        {
          provide: ConfigService,
          useValue: buildConfigService(env),
        },
      ],
    }).compile();

    const service = moduleRef.get(OpsAlertingService);
    // Test.createTestingModule().compile() does NOT run Nest lifecycle hooks
    // automatically, so invoke onModuleInit() explicitly to initialize config.
    service.onModuleInit();
    return service;
  };

  beforeEach(() => {
    // The service instantiates `new NotificationEngine()` at field-declaration
    // time, so spy on the prototype *before* the module is compiled.
    notifySpy = jest
      .spyOn(NotificationEngine.prototype, 'notify')
      .mockResolvedValue([{ channel: 'telegram', success: true }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when ops Telegram credentials are missing', () => {
    it('does not send any alerts (no-op)', async () => {
      const service = await createService({});

      await service.critical({
        event: 'worker_crashed',
        title: 'Worker Process Crashed',
        message: 'Worker terminated unexpectedly',
      });

      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  describe('when ops Telegram credentials are configured', () => {
    const env = {
      OPS_TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN',
      OPS_TELEGRAM_CHAT_ID: '-100123456789',
    };

    it('sends critical alerts with a [CRITICAL] title and custom event', async () => {
      const service = await createService(env);

      await service.critical({
        event: 'worker_crashed',
        title: 'Worker Process Crashed',
        message: 'Worker terminated unexpectedly: OOM',
        details: { reason: 'OOM' },
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [payload, config] = notifySpy.mock.calls[0];

      expect(payload.event).toBe('custom');
      expect(payload.title).toBe('[CRITICAL] Worker Process Crashed');
      expect(payload.message).toContain('OOM');
      expect(payload.details).toEqual({ reason: 'OOM' });
      expect(payload.timestamp).toEqual(expect.any(Number));
      expect(config.telegram).toEqual({
        botToken: env.OPS_TELEGRAM_BOT_TOKEN,
        chatId: env.OPS_TELEGRAM_CHAT_ID,
      });
    });

    it('sends warning alerts with a [WARNING] title', async () => {
      const service = await createService(env);

      await service.warning({
        event: 'exchange_retry_exhausted',
        title: 'Exchange Retry Exhausted',
        message: 'market_buy failed after 5 attempts',
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [payload] = notifySpy.mock.calls[0];
      expect(payload.title).toBe('[WARNING] Exchange Retry Exhausted');
    });

    it('workerCrashed sends a critical alert with the expected message', async () => {
      const service = await createService(env);

      await service.workerCrashed({ reason: 'uncaught exception', stack: 'at fn' });

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [payload] = notifySpy.mock.calls[0];
      expect(payload.title).toBe('[CRITICAL] Worker Process Crashed');
      expect(payload.message).toContain('terminated unexpectedly: uncaught exception');
      expect(payload.details).toMatchObject({ reason: 'uncaught exception', stack: 'at fn' });
    });

    it('exchangeRetryExhausted sends a critical alert with operation details', async () => {
      const service = await createService(env);

      await service.exchangeRetryExhausted({
        operation: 'market_buy',
        orderId: 'order-1',
        strategyId: 'strategy-1',
        exchange: 'binance',
        symbol: 'BTC/USDT',
        attempts: 5,
        lastError: 'rate limit',
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [payload] = notifySpy.mock.calls[0];
      expect(payload.title).toBe('[CRITICAL] Exchange Retry Exhausted');
      expect(payload.message).toContain('market_buy failed after 5 attempts');
      expect(payload.details).toMatchObject({ orderId: 'order-1', attempts: 5 });
    });

    it('databaseConnectionError sends a critical alert', async () => {
      const service = await createService(env);

      await service.databaseConnectionError({
        error: 'connection refused',
        poolSize: 10,
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [payload] = notifySpy.mock.calls[0];
      expect(payload.title).toBe('[CRITICAL] Database Connection Error');
      expect(payload.message).toContain('connection refused');
    });

    it('swallows notification failures instead of throwing', async () => {
      const service = await createService(env);
      notifySpy.mockRejectedValueOnce(new Error('telegram API down'));

      await expect(
        service.critical({
          event: 'stop_execution_error',
          title: 'stopExecution Unhandled Error',
          message: 'boom',
        }),
      ).resolves.toBeUndefined();

      expect(notifySpy).toHaveBeenCalledTimes(1);
    });
  });
});