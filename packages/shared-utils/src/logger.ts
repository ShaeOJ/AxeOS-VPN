/**
 * Simple logging utility
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

export class Logger {
  private level: number;
  private prefix: string;
  private timestamps: boolean;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.level = LOG_LEVELS[options.level ?? 'info'];
    this.prefix = options.prefix ?? '';
    this.timestamps = options.timestamps ?? true;
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(new Date().toISOString());
    }

    parts.push(`[${level.toUpperCase()}]`);

    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    parts.push(message);

    if (args.length > 0) {
      parts.push(
        args
          .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ')
      );
    }

    return parts.join(' ');
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.debug) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.info) {
      console.info(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.warn) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.error) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({
      level: Object.keys(LOG_LEVELS).find(
        (k) => LOG_LEVELS[k as LogLevel] === this.level
      ) as LogLevel,
      prefix: childPrefix,
      timestamps: this.timestamps,
    });
  }
}

// Default logger instance
export const logger = new Logger();

// Create a logger with specific prefix
export function createLogger(prefix: string, options: Partial<LoggerOptions> = {}): Logger {
  return new Logger({ ...options, prefix });
}
