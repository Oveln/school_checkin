import { type LogEntry, type LogLevel } from '@/types';

/**
 * 学校签到系统的增强日志工具
 */
export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
    };

    if (context) {
      logEntry.context = context;
    }
    
    if (error) {
      logEntry.error = error;
    }

    return logEntry;
  }

  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const errorStr = entry.error ? ` ${entry.error.message}` : '';

    return `[${timestamp}] ${level} ${entry.message}${contextStr}${errorStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry = this.createLogEntry(level, message, context, error);

    // 添加到内存日志
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 格式化并输出到控制台
    const formattedMessage = this.formatLogEntry(entry);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        if (error && error.stack) {
          console.error(error.stack);
        }
        break;
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log('warn', message, context, error);
  }

  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  public getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public exportLogs(): string {
    return this.logs.map(log => this.formatLogEntry(log)).join('\n');
  }
}

// 导出单例实例
export const logger = Logger.getInstance();

// 导出便捷函数
export const log = {
  debug: (message: string, context?: Record<string, unknown>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, unknown>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, unknown>, error?: Error) => logger.warn(message, context, error),
  error: (message: string, error?: Error, context?: Record<string, unknown>) => logger.error(message, error, context),
  getLogs: (level?: LogLevel) => logger.getLogs(level),
  clearLogs: () => logger.clearLogs(),
  exportLogs: () => logger.exportLogs(),
};