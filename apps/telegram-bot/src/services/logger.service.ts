import { injectable } from "inversify";
import { BaseService } from "./base.service";
import { Telegraf } from "telegraf";

export enum LogLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
  DEBUG = "DEBUG",
  TRACE = "TRACE",
}

@injectable()
export class LoggerService extends BaseService {
  private static instance: LoggerService;
  private currentLevel: LogLevel = LogLevel.INFO;
  private isTestEnvironment: boolean = false;

  public constructor() {
    super(new Telegraf(""));
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  async initialize(): Promise<void> {
    // No initialization needed for logger service
    return Promise.resolve();
  }

  public setLogLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  public setTestEnvironment(isTest: boolean): void {
    this.isTestEnvironment = isTest;
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`❌ ${message}`, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`⚠️ ${message}`, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`ℹ️ ${message}`, ...args);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(`🔍 ${message}`, ...args);
    }
  }

  public trace(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.log(`🔎 ${message}`, ...args);
    }
  }

  public success(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`✅ ${message}`, ...args);
    }
  }

  public loading(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`🔄 ${message}`, ...args);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    // In test environment, only log errors by default
    if (this.isTestEnvironment && level !== LogLevel.ERROR) {
      return false;
    }

    // Check if the current log level allows this message
    const levels = Object.values(LogLevel);
    const currentLevelIndex = levels.indexOf(this.currentLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex <= currentLevelIndex;
  }
}
