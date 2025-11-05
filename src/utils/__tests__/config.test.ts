import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '@/utils/config';
import { ValidationError } from '@/types';

// 模拟dotenv
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置ConfigManager单例实例
    ConfigManager.resetInstance();
    // 重置环境变量
    process.env = {
      ...process.env,
      REDIS_TOKEN: 'test-redis-token',
      REDIS_ADDR: 'test-redis-addr:6379',
      EMAIL_HOST: 'smtp.test.com',
      EMAIL_PORT: '587',
      EMAIL_USER: 'test@test.com',
      EMAIL_PASS: 'test-password',
      EMAIL_TO: 'recipient@test.com',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should load configuration successfully', () => {
      expect(() => ConfigManager.getInstance()).not.toThrow();
    });

    it('should throw ValidationError when Redis config missing', () => {
      ConfigManager.resetInstance();
      delete process.env['REDIS_TOKEN'];
      expect(() => ConfigManager.getInstance()).toThrow(ValidationError);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should return configuration value', () => {
      const redisToken = configManager.get('REDIS_TOKEN');
      expect(redisToken).toBe('test-redis-token');
    });

    it('should return optional value', () => {
      const emailHost = configManager.get('EMAIL_HOST');
      expect(emailHost).toBe('smtp.test.com');
    });
  });

  describe('getRedisUrl', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should return properly formatted Redis URL', () => {
      const url = configManager.getRedisUrl();
      expect(url).toBe('rediss://default:test-redis-token@test-redis-addr:6379');
    });
  });

  describe('hasEmailConfig', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should return true when email config is complete', () => {
      expect(configManager.hasEmailConfig()).toBe(true);
    });

    it('should return false when email config is incomplete', () => {
      ConfigManager.resetInstance();
      delete process.env['EMAIL_USER'];
      const newConfigManager = ConfigManager.getInstance();
      expect(newConfigManager.hasEmailConfig()).toBe(false);
    });
  });

  describe('hasEmailRecipient', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should return true when email recipient is set', () => {
      expect(configManager.hasEmailRecipient()).toBe(true);
    });

    it('should return false when email recipient is not set', () => {
      ConfigManager.resetInstance();
      delete process.env['EMAIL_TO'];
      const newConfigManager = ConfigManager.getInstance();
      expect(newConfigManager.hasEmailRecipient()).toBe(false);
    });
  });

  describe('getEmailConfig', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should return email configuration', () => {
      const emailConfig = configManager.getEmailConfig();

      expect(emailConfig).toEqual({
        host: 'smtp.test.com',
        port: 587,
        secure: false, // 端口587不应是安全的
        auth: {
          user: 'test@test.com',
          pass: 'test-password',
        },
      });
    });

    it('should set secure=true for port 465', () => {
      ConfigManager.resetInstance();
      process.env['EMAIL_PORT'] = '465';
      const newConfigManager = ConfigManager.getInstance();
      const emailConfig = newConfigManager.getEmailConfig();

      expect(emailConfig.secure).toBe(true);
    });

    it('should throw ValidationError when email config is incomplete', () => {
      ConfigManager.resetInstance();
      delete process.env['EMAIL_HOST'];
      const newConfigManager = ConfigManager.getInstance();

      expect(() => newConfigManager.getEmailConfig()).toThrow(ValidationError);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      configManager = ConfigManager.getInstance();
    });

    it('should pass validation with complete config', () => {
      expect(() => configManager.validate()).not.toThrow();
    });

    it('should throw ValidationError for incomplete Redis config', () => {
      ConfigManager.resetInstance();
      delete process.env['REDIS_TOKEN'];

      expect(() => ConfigManager.getInstance()).toThrow(ValidationError);
    });

    it('should throw ValidationError when email recipient set but config incomplete', () => {
      ConfigManager.resetInstance();
      delete process.env['EMAIL_HOST'];
      // 保持 EMAIL_TO 设置
      process.env['EMAIL_TO'] = 'recipient@test.com';

      expect(() => ConfigManager.getInstance().validate()).toThrow(ValidationError);
    });
  });


});