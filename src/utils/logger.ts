import type { LoggerOptions, LogLevel } from '../types/index.ts';

type LogFormat = 'json' | 'text';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;
  private format: LogFormat;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.format = (Deno.env.get('LOG_FORMAT') as LogFormat) || 'text';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();

    if (this.format === 'json') {
      const logEntry = {
        level: level.toUpperCase(),
        timestamp,
        message,
        ...(context && { context }),
      };
      return JSON.stringify(logEntry);
    }

    // Text format
    if (context) {
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
    }

    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, errorOrContext?: Error | LogContext): void {
    if (this.shouldLog('error')) {
      if (errorOrContext instanceof Error) {
        // Legacy error handling
        const errorMessage = `${message} - ${errorOrContext.message}\n${errorOrContext.stack}`;
        console.error(this.formatMessage('error', errorMessage));
      } else {
        // Structured logging
        console.error(this.formatMessage('error', message, errorOrContext));
      }
    }
  }
}

export const logger = new Logger({
  level: (Deno.env.get('LOG_LEVEL') as LogLevel) || 'info',
});
