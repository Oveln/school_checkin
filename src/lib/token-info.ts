import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { fetchUUID, pollWxCode, fetchTokenByWxCode } from '@/lib/wechat-utils';
import { printAsciiQRCode, fetchQRCodeBuffer } from '@/lib/qrcode-utils';
import { sendEmailWithQRCode } from '@/lib/email-utils';
import {
  type TokenData,
  DEFAULT_TTL,
  AppError,
  RedisError,
  AuthenticationError,
} from '@/types';
import { getRedisUrl } from '@/utils/config';
import { log } from '@/utils/logger';

/**
 * 增强的令牌管理，支持Redis缓存和适当的错误处理
 */

let clientPromise: Promise<RedisClientType> | null = null;

/**
 * 获取Redis客户端实例，并进行适当的错误处理
 */
function getClient(): Promise<RedisClientType> {
  if (!clientPromise) {
    const redisUrl = getRedisUrl();

    log.debug('Creating Redis client', { url: redisUrl.replace(/:[^:]+@/, ':***@') }); // 在日志中隐藏密码

    clientPromise = (createClient({ url: redisUrl }) as RedisClientType)
      .on('error', (err) => {
        log.error('Redis client error', err instanceof Error ? err : new Error(String(err)));
        // 不要在此处抛出异常以防止未处理的Promise拒绝
      })
      .on('connect', () => {
        log.info('Redis client connected');
      })
      .on('ready', () => {
        log.info('Redis client ready');
      })
      .on('end', () => {
        log.info('Redis client connection ended');
      })
      .on('reconnecting', () => {
        log.info('Redis client reconnecting');
      })
      .connect();
  }

  return clientPromise;
}

/**
 * 支持Redis持久化的令牌信息类
 */
export class TokenInfo implements TokenData {
  constructor(
    public token: string | null = null,
    public expire: number | null = null
  ) {}

  /**
   * 检查令牌是否有效且未过期
   */
  isValid(): boolean {
    if (!this.token || !this.expire) {
      return false;
    }

    const currentTime = Date.now();
    const isValid = currentTime < this.expire;

    log.debug('Token validity check', {
      hasToken: !!this.token,
      expire: this.expire ? new Date(this.expire).toISOString() : null,
      currentTime: new Date(currentTime).toISOString(),
      isValid,
    });

    return isValid;
  }

  /**
   * 从Redis加载令牌信息
   */
  static async fromRedis(key = 'token_info'): Promise<TokenInfo> {
    try {
      const client = await getClient();
      const json = await client.get(key);

      if (!json) {
        log.debug('No token found in Redis', { key });
        return new TokenInfo();
      }

      let parsed: { token: string; expire: number };
      try {
        parsed = JSON.parse(json);
      } catch (parseError) {
        log.error('Failed to parse token data from Redis', parseError instanceof Error ? parseError : new Error(String(parseError)), { key, json });
        // 删除损坏的数据
        await client.del(key);
        return new TokenInfo();
      }

      const tokenInfo = new TokenInfo(parsed.token, parsed.expire);

      log.debug('Token loaded from Redis', {
        key,
        hasToken: !!tokenInfo.token,
        expire: tokenInfo.expire ? new Date(tokenInfo.expire).toISOString() : null,
        isValid: tokenInfo.isValid(),
      });

      return tokenInfo;

    } catch (error) {
      log.error('Failed to load token from Redis', error instanceof Error ? error : new Error(String(error)), { key });
      throw new RedisError('Failed to load token from Redis', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 使用微信代码获取令牌
   */
  static async fetchTokenByWxCode(wxCode: string): Promise<TokenInfo> {
    try {
      const tokenData = await fetchTokenByWxCode(wxCode);
      return new TokenInfo(tokenData.token, tokenData.expire);
    } catch (error) {
      log.error('Failed to fetch token with WeChat code', error instanceof Error ? error : new Error(String(error)), { wxCode });
      throw error instanceof AppError ? error : new AuthenticationError('Failed to fetch token with WeChat code');
    }
  }

  /**
   * 将令牌信息保存到Redis
   */
  async save(key = 'token_info', ttl = DEFAULT_TTL): Promise<void> {
    try {
      const client = await getClient();

      if (!this.token || !this.expire) {
        throw new AppError('Cannot save invalid token', 'INVALID_TOKEN_SAVE');
      }

      const json = JSON.stringify({
        token: this.token,
        expire: this.expire,
      });

      await client.set(key, json, { EX: ttl });

      log.info('Token saved to Redis', {
        key,
        ttl,
        expire: new Date(this.expire).toISOString(),
        timeUntilExpiry: this.expire - Date.now(),
      });

    } catch (error) {
      log.error('Failed to save token to Redis', error instanceof Error ? error : new Error(String(error)), { key, ttl });
      throw new RedisError('Failed to save token to Redis', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 确保用户已登录，处理完整的二维码流程
   */
  static async get_ensureLoggedIn(): Promise<TokenInfo> {
    try {
      // 尝试从Redis加载现有令牌
      const tokenInfo = await TokenInfo.fromRedis();

      if (tokenInfo.isValid()) {
        log.info('Valid token found in Redis, no login required');
        console.log('✅ 检测到有效 Token，无需重新扫码。');
        return tokenInfo;
      }

      log.info('Token invalid or missing, starting QR code login flow');

      // 开始二维码登录流程
      while (true) {
        console.log('⚠️ Token 不存在或已过期，生成新的二维码并等待扫码...');

        let uuid: string;
        try {
          uuid = await fetchUUID();
          log.info('UUID generated successfully', { uuid });
        } catch (error) {
          log.error('Failed to generate UUID', error instanceof Error ? error : new Error(String(error)));
          console.error(`获取 UUID 失败，稍后重试：${error instanceof Error ? error.message : String(error)}`);
          await new Promise<void>((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        let qrBuffer: Buffer;
        try {
          qrBuffer = await fetchQRCodeBuffer(uuid);
        } catch (error) {
          log.error('Failed to fetch QR code', error instanceof Error ? error : new Error(String(error)), { uuid });
          // 即使二维码获取失败也要继续 - 用户可以使用URL
          qrBuffer = Buffer.alloc(0);
        }

        // 在控制台显示二维码（非阻塞）
        try {
          await printAsciiQRCode(uuid);
        } catch (displayError) {
          log.warn('Failed to display QR code in console', { uuid }, displayError instanceof Error ? displayError : new Error(String(displayError)));
          console.warn('打印到控制台失败，仍会继续。');
        }

        // 通过电子邮件发送二维码（非阻塞）
        try {
          await sendEmailWithQRCode(uuid, qrBuffer);
        } catch (emailError) {
          log.warn('Failed to send QR code email', { uuid }, emailError instanceof Error ? emailError : new Error(String(emailError)));
          // 邮件失败不会阻塞流程
        }

        // 等待二维码扫描
        const wxCode = await pollWxCode(uuid);

        if (!wxCode) {
          // 二维码已过期，重试
          log.info('QR code expired, regenerating...');
          console.log('二维码过期，准备重新生成新的二维码...');
          await new Promise<void>((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        // 尝试用wx代码换取令牌
        try {
          const newTokenInfo = await TokenInfo.fetchTokenByWxCode(wxCode);
          await newTokenInfo.save();

          log.info('Login successful, new token saved', {
            uuid,
            hasToken: !!newTokenInfo.token,
            expire: newTokenInfo.expire ? new Date(newTokenInfo.expire).toISOString() : null,
          });

          console.log('\n🎉 新 Token 已保存到 Redis');
          return newTokenInfo;

        } catch (tokenError) {
          log.error('Failed to exchange wx code for token', tokenError instanceof Error ? tokenError : new Error(String(tokenError)), { uuid, wxCode });
          console.error('用 wx_code 换取 Token 失败，稍后重试：', tokenError instanceof Error ? tokenError.message : String(tokenError));
          await new Promise<void>((resolve) => setTimeout(resolve, 2000));
          // 继续循环再次尝试
        }
      }

    } catch (error) {
      log.error('Login flow failed', error instanceof Error ? error : new Error(String(error)));
      throw error instanceof AppError ? error : new AuthenticationError('Login flow failed');
    }
  }

  /**
   * 获取令牌为字符串（为与现有代码兼容）
   */
  getToken(): string {
    if (!this.token) {
      throw new AuthenticationError('No valid token available');
    }
    return this.token;
  }

  /**
   * 获取过期时间
   */
  getExpire(): number | null {
    return this.expire;
  }

  /**
   * 获取到过期的剩余时间（以毫秒为单位）
   */
  getTimeUntilExpiration(): number | null {
    if (!this.expire) {
      return null;
    }
    return this.expire - Date.now();
  }

  /**
   * 检查令牌是否会在给定毫秒内过期
   */
  willExpireWithin(milliseconds: number): boolean | null {
    const timeUntilExpiry = this.getTimeUntilExpiration();
    if (timeUntilExpiry === null) {
      return null;
    }
    return timeUntilExpiry <= milliseconds;
  }
}

export default TokenInfo;