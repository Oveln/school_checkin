import dotenv from 'dotenv';
import { z } from 'zod';
import { type EnvConfig } from '@/types/validation';
import { AppError, ValidationError } from '@/types';
import { log } from '@/utils/logger';

/**
 * 带验证的配置管理器
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config!: EnvConfig;

  private constructor() {
    this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 重置单例实例（仅用于测试）
   */
  public static resetInstance(): void {
    ConfigManager.instance = null as any;
  }

  private loadConfig(): void {
    try {
      // 加载环境变量
      dotenv.config();

      // 验证必需的环境变量
      const envSchema = z.object({
        REDIS_TOKEN: z.string().min(1, 'Redis token is required'),
        REDIS_ADDR: z.string().min(1, 'Redis address is required'),
        EMAIL_HOST: z.string().optional(),
        EMAIL_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
        EMAIL_USER: z.string().optional(),
        EMAIL_PASS: z.string().optional(),
        EMAIL_TO: z.string().email().optional(),
        REAUTH_URL: z.string().url().optional(),
        EXPIRED_EMAIL_RECIPIENT: z.string().email().optional(),
      });

      const result = envSchema.safeParse(process.env);

      if (!result.success) {
        const errors = result.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new ValidationError(`Configuration validation failed: ${errors}`);
      }

      this.config = result.data;

      log.info('Configuration loaded successfully', {
        hasRedisConfig: !!(this.config.REDIS_TOKEN && this.config.REDIS_ADDR),
        hasEmailConfig: !!(this.config.EMAIL_HOST && this.config.EMAIL_USER && this.config.EMAIL_PASS),
        emailRecipient: this.config.EMAIL_TO ? 'configured' : 'not configured',
        reauthUrl: this.config.REAUTH_URL ? 'configured' : 'default',
        expiredEmailRecipient: this.config.EXPIRED_EMAIL_RECIPIENT ? 'configured' : 'default',
      });

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new AppError(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_ERROR'
      );
    }
  }

  public get<T extends keyof EnvConfig>(key: T): EnvConfig[T] {
    return this.config[key];
  }

  public getAll(): EnvConfig {
    return { ...this.config };
  }

  public getRedisUrl(): string {
    const { REDIS_TOKEN, REDIS_ADDR } = this.config;
    return `rediss://default:${REDIS_TOKEN}@${REDIS_ADDR}`;
  }

  public hasEmailConfig(): boolean {
    const { EMAIL_HOST, EMAIL_USER, EMAIL_PASS } = this.config;
    return !!(EMAIL_HOST && EMAIL_USER && EMAIL_PASS);
  }

  public hasEmailRecipient(): boolean {
    return !!this.config.EMAIL_TO;
  }

  public getEmailConfig() {
    if (!this.hasEmailConfig()) {
      throw new ValidationError('Email configuration is incomplete');
    }

    return {
      host: this.config.EMAIL_HOST!,
      port: this.config.EMAIL_PORT || 587,
      secure: this.config.EMAIL_PORT === 465, // 端口465的SSL
      auth: {
        user: this.config.EMAIL_USER!,
        pass: this.config.EMAIL_PASS!,
      },
    };
  }

  public validate(): void {
    // 验证Redis配置
    if (!this.config.REDIS_TOKEN || !this.config.REDIS_ADDR) {
      throw new ValidationError('Redis configuration is incomplete');
    }

    // 如果设置了邮件收件人，则验证邮件配置
    if (this.config.EMAIL_TO && !this.hasEmailConfig()) {
      throw new ValidationError('Email recipient is set but email configuration is incomplete');
    }

    log.debug('Configuration validation passed');
  }

  public reload(): void {
    log.info('Reloading configuration');
    this.loadConfig();
  }
}

// 导出单例实例
export const config = ConfigManager.getInstance();

// 导出便捷函数
export const getConfig = <T extends keyof EnvConfig>(key: T): EnvConfig[T] => config.get(key);
export const getAllConfig = (): EnvConfig => config.getAll();
export const getRedisUrl = (): string => config.getRedisUrl();
export const hasEmailConfig = (): boolean => config.hasEmailConfig();
export const hasEmailRecipient = (): boolean => config.hasEmailRecipient();
export const getEmailConfig = () => config.getEmailConfig();
export const validateConfig = (): void => config.validate();