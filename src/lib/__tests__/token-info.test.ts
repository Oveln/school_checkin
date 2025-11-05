import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenInfo } from '@/lib/token-info';
import { AuthenticationError } from '@/types';

// 模拟依赖
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
}));

vi.mock('../../utils/logger.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/config.js', () => ({
  getRedisUrl: vi.fn(() => 'redis://localhost:6379'),
}));

describe('TokenInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create token info with provided values', () => {
      const token = 'Bearer test-token';
      const expire = Date.now() + 3600000;

      const tokenInfo = new TokenInfo(token, expire);

      expect(tokenInfo.token).toBe(token);
      expect(tokenInfo.expire).toBe(expire);
    });

    it('should create empty token info with default values', () => {
      const tokenInfo = new TokenInfo();

      expect(tokenInfo.token).toBe(null);
      expect(tokenInfo.expire).toBe(null);
    });
  });

  describe('isValid', () => {
    it('should return true for valid token', () => {
      const futureExpire = Date.now() + 3600000;
      const tokenInfo = new TokenInfo('Bearer valid-token', futureExpire);

      expect(tokenInfo.isValid()).toBe(true);
    });

    it('should return false for expired token', () => {
      const pastExpire = Date.now() - 3600000;
      const tokenInfo = new TokenInfo('Bearer expired-token', pastExpire);

      expect(tokenInfo.isValid()).toBe(false);
    });

    it('should return false for missing token', () => {
      const futureExpire = Date.now() + 3600000;
      const tokenInfo = new TokenInfo(null, futureExpire);

      expect(tokenInfo.isValid()).toBe(false);
    });

    it('should return false for missing expire time', () => {
      const tokenInfo = new TokenInfo('Bearer token', null);

      expect(tokenInfo.isValid()).toBe(false);
    });
  });

  describe('getToken', () => {
    it('should return token when valid', () => {
      const token = 'Bearer test-token';
      const tokenInfo = new TokenInfo(token, Date.now() + 3600000);

      expect(tokenInfo.getToken()).toBe(token);
    });

    it('should throw AuthenticationError when no token', () => {
      const tokenInfo = new TokenInfo(null, null);

      expect(() => tokenInfo.getToken()).toThrow(AuthenticationError);
    });
  });

  describe('getTimeUntilExpiration', () => {
    it('should return time until expiration', () => {
      const futureExpire = Date.now() + 3600000;
      const tokenInfo = new TokenInfo('token', futureExpire);

      const timeUntil = tokenInfo.getTimeUntilExpiration();
      expect(timeUntil).toBeGreaterThan(0);
      expect(timeUntil).toBeLessThanOrEqual(3600000);
    });

    it('should return null when no expire time', () => {
      const tokenInfo = new TokenInfo('token', null);

      expect(tokenInfo.getTimeUntilExpiration()).toBe(null);
    });
  });

  describe('willExpireWithin', () => {
    it('should return true when token expires within given time', () => {
      const soonExpire = Date.now() + 30000; // 30秒
      const tokenInfo = new TokenInfo('token', soonExpire);

      expect(tokenInfo.willExpireWithin(60000)).toBe(true); // 1分钟
    });

    it('should return false when token expires after given time', () => {
      const farExpire = Date.now() + 3600000; // 1小时
      const tokenInfo = new TokenInfo('token', farExpire);

      expect(tokenInfo.willExpireWithin(60000)).toBe(false); // 1分钟
    });

    it('should return null when no expire time', () => {
      const tokenInfo = new TokenInfo('token', null);

      expect(tokenInfo.willExpireWithin(60000)).toBe(null);
    });
  });
});