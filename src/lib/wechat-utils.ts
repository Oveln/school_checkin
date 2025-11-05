import { request } from '@/lib/request';
import {
  type WeChatTokenResponse,
  type TokenData,
  NetworkError,
  AppError,
  CHECKIN_ENDPOINTS,
} from '@/types';
import { log } from '@/utils/logger';

/**
 * 微信API工具，具有适当的错误处理和验证
 */

const APPID = process.env['APPID'] || 'wx4a23ae4b8f291087';
const REDIRECT_URI = 'https%3A%2F%2Fi.jielong.com%2Flogin-callback';

export async function fetchUUID(): Promise<string> {
  try {
    if (!APPID) {
      throw new AppError('APPID is required for fetching UUID', 'MISSING_APPID');
    }
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${APPID}&scope=snsapi_login&redirect_uri=${REDIRECT_URI}`;

    log.debug('Fetching UUID from WeChat', { appid: APPID });

    const html = await request<string>(url, { method: 'GET' });
    const match = html.match(/uuid=([a-zA-Z0-9_-]+)/);

    if (!match) {
      throw new AppError('Failed to extract UUID from WeChat response', 'UUID_EXTRACTION_ERROR');
    }

    if (!match || !match[1]) {
      throw new AppError('Failed to extract UUID from WeChat response', 'UUID_EXTRACTION_ERROR');
    }
    const uuid = match[1];
    log.info('UUID fetched successfully', { uuid });

    return uuid;
  } catch (error) {
    log.error('Failed to fetch UUID', error instanceof Error ? error : new Error(String(error)));
    throw error instanceof AppError ? error : new NetworkError('Failed to fetch UUID', error instanceof Error ? error : undefined);
  }
}

export async function pollWxCode(uuid: string): Promise<string | null> {
  if (!uuid) {
    throw new AppError('UUID is required for polling', 'MISSING_UUID');
  }

  const pollUrl = `https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&last=404`;
  const maxPolls = 300; // 最多5分钟
  let polls = 0;

  log.info('Starting to poll for WeChat code', { uuid });

  try {
    while (polls < maxPolls) {
      polls++;
      process.stdout.write('⌛ 等待扫码');

      try {
        const text = await request<string>(pollUrl, { method: 'GET' });

        const errMatch = text.match(/wx_errcode=(\d+)/);
        const codeMatch = text.match(/wx_code='([^']+)'/);
        let errcode: number | null = null;
        if (errMatch && errMatch[1] !== undefined) {
          const parsed = parseInt(errMatch[1], 10);
          errcode = isNaN(parsed) ? null : parsed;
        }

        log.debug('Poll result', {
          uuid,
          errcode,
          hasCode: !!codeMatch,
          pollCount: polls
        });

        if (errcode === 405 && codeMatch && codeMatch[1] !== undefined) {
          const code = codeMatch[1];
          log.info('QR code scanned successfully', { uuid, code });
          console.log(`\n✅ 扫码成功，wx_code: ${code}`);
          return code;
        } else if (errcode === 404) {
          process.stdout.write('.');
        } else if (errcode === 403) {
          log.warn('QR code expired', { uuid });
          console.log('\n⚠️ 二维码过期，请重试');
          return null;
        } else if (errcode) {
          log.warn('Unexpected error code', { uuid, errcode });
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        log.warn('Poll attempt failed', { uuid, pollCount: polls }, error instanceof Error ? error : new Error(String(error)));
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
    }

    log.warn('Polling timeout reached', { uuid, maxPolls });
    console.log('\n⏰ 扫码等待超时，请重试');
    return null;

  } catch (error) {
    log.error('Failed to poll for WeChat code', error instanceof Error ? error : new Error(String(error)), { uuid });
    throw error instanceof AppError ? error : new NetworkError('Failed to poll for WeChat code', error instanceof Error ? error : undefined);
  }
}

export async function fetchTokenByWxCode(wxCode: string): Promise<TokenData> {
  if (!wxCode) {
    throw new AppError('WeChat code is required', 'MISSING_WX_CODE');
  }

  try {
    const url = CHECKIN_ENDPOINTS.AUTH(wxCode);
    const headers = {
      'content-type': 'application/x-www-form-urlencoded',
    };

    log.debug('Exchanging WeChat code for token', { wxCode });

    const response = await request<WeChatTokenResponse>(url, {
      method: 'POST',
      headers,
      body: '',
    });

    const tokenData = response?.Data?.Token;
    const expire = response?.Data?.Expire;

    if (!tokenData || !expire) {
      throw new AppError('Invalid token response from WeChat API', 'INVALID_TOKEN_RESPONSE');
    }

    const result: TokenData = {
      token: `Bearer ${tokenData as string}`,
      expire: expire as number,
    };

    log.info('Token obtained successfully', {
      hasToken: !!result.token,
      expire: result.expire ? new Date(result.expire).toISOString() : null
    });
    console.log('✅ 登录成功，Token 获取完毕');

    return result;

  } catch (error) {
    log.error('Failed to fetch token with WeChat code', error instanceof Error ? error : new Error(String(error)), { wxCode });
    throw error instanceof AppError ? error : new NetworkError('Failed to fetch token with WeChat code', error instanceof Error ? error : undefined);
  }
}