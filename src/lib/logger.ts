type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogPayload = Record<string, unknown>;

interface LoggerOptions {
  level?: LogLevel;
  environment?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private readonly level: LogLevel;

  private readonly environment: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  }

  debug(message: string, payload?: LogPayload): void {
    this.log('debug', message, payload);
  }

  info(message: string, payload?: LogPayload): void {
    this.log('info', message, payload);
  }

  warn(message: string, payload?: LogPayload): void {
    this.log('warn', message, payload);
  }

  error(message: string, payload?: LogPayload): void {
    this.log('error', message, payload);
  }

  private log(level: LogLevel, message: string, payload?: LogPayload): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    if (this.environment === 'development') {
      const meta = payload ? ` ${JSON.stringify(payload)}` : '';
      // eslint-disable-next-line no-console
      console.log(`[${level.toUpperCase()}] ${message}${meta}`);
      return;
    }

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(payload ?? {}),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

export const logger = new Logger({ level: (process.env.LOG_LEVEL as LogLevel) ?? 'info' });
