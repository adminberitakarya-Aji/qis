/**
 * Qis Structured Logger
 * Provides consistent, structured logging across all Qis applications.
 * 
 * Features:
 * - Structured JSON output for production
 * - Human-readable output for development
 * - Log levels: debug, info, warn, error
 * - Context support for tracing
 * - Timestamps in ISO 8601 format
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  service: string;
  level?: LogLevel;
  json?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private service: string;
  private minLevel: number;
  private useJson: boolean;

  constructor(config: LoggerConfig) {
    this.service = config.service;
    this.minLevel = LOG_LEVELS[config.level ?? 'info'];
    this.useJson = config.json ?? (process.env.NODE_ENV === 'production');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (this.useJson) {
      console.log(JSON.stringify(entry));
    } else {
      const contextStr = entry.context ? ` | ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? ` | ${entry.error.message}` : '';
      const color = this.getLevelColor(entry.level);
      console.log(`${color}[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}]${contextStr}${errorStr}`);
    }
  }

  private getLevelColor(level: LogLevel): string {
    const colors = {
      debug: '\x1b[90m',   // Gray
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
    };
    const reset = '\x1b[0m';
    return colors[level] + reset;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    const entry = this.formatEntry('debug', message, context);
    this.output(entry);
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    const entry = this.formatEntry('info', message, context);
    this.output(entry);
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    const entry = this.formatEntry('warn', message, context);
    this.output(entry);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog('error')) return;
    const entry = this.formatEntry('error', message, context, error);
    this.output(entry);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new ChildLogger(this, context);
  }
}

class ChildLogger extends Logger {
  private parent: Logger;
  private childContext: LogContext;

  constructor(parent: Logger, context: LogContext) {
    // @ts-ignore - We're bypassing the normal constructor
    super({ service: '', level: 'info', json: false });
    this.parent = parent;
    this.childContext = context;
  }

  private mergeContext(context?: LogContext): LogContext {
    return {
      ...this.childContext,
      ...context,
    };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error);
  }

  child(context: LogContext): Logger {
    return new ChildLogger(this, this.mergeContext(context));
  }
}

// Default logger instances for common services
const loggers = new Map<string, Logger>();

export function createLogger(config: LoggerConfig): Logger {
  const key = config.service;
  if (loggers.has(key)) {
    return loggers.get(key)!;
  }
  const logger = new Logger(config);
  loggers.set(key, logger);
  return logger;
}

export function getLogger(service: string): Logger | undefined {
  return loggers.get(service);
}

// Convenience function for creating a logger with common defaults
export function createServiceLogger(
  service: string,
  options: { level?: LogLevel; json?: boolean } = {}
): Logger {
  return createLogger({
    service,
    level: options.level ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info',
    json: options.json ?? (process.env.NODE_ENV === 'production'),
  });
}

// Export common logger instances
export const apiLogger = createServiceLogger('qis-api');
export const workerLogger = createServiceLogger('qis-worker');
export const aiLogger = createServiceLogger('qis-ai-service');