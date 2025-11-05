import fetch from 'node-fetch';
import { type RequestOptions, NetworkError } from '@/types';
import { log } from '@/utils/logger';

/**
 * 增强的HTTP请求包装器，具有适当的错误处理和日志记录
 */
export async function request<T = unknown>(
  url: string,
  options: Partial<RequestOptions> = {},
  token?: string | null
): Promise<T> {
  const startTime = Date.now();

  try {
    log.debug('Making HTTP request', { url, method: options.method || 'GET', hasToken: !!token });

    const defaultHeaders: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*',
      origin: 'https://i.jielong.com',
      referer: 'https://i.jielong.com/',
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'sec-fetch-dest': 'empty',
    };

    if (token) {
      defaultHeaders['Authorization'] = token;
    }

    const requestOptions: RequestInit = {
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    } as RequestInit;

    // 处理请求体序列化
    if (options.body) {
      if (typeof options.body === 'string') {
        requestOptions.body = options.body as BodyInit;
      } else {
        requestOptions.body = JSON.stringify(options.body) as BodyInit;
      }
    }

    const response = await fetch(url, requestOptions as any);
    const duration = Date.now() - startTime;

    log.debug('HTTP request completed', {
      url,
      status: response.status,
      duration: `${duration}ms`,
      statusText: response.statusText,
    });

    if (!response.ok) {
      throw new NetworkError(
        `HTTP request failed: ${response.status} ${response.statusText}`,
        new Error(`Status: ${response.status}`)
      );
    }

    const text = await response.text();

    // 尝试解析为JSON，失败则回退到文本
    try {
      const parsed = JSON.parse(text);
      return parsed as T;
    } catch {
      return text as unknown as T;
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error('HTTP request failed', error instanceof Error ? error : new Error(errorMessage), {
      url,
      method: options.method || 'GET',
      duration: `${duration}ms`,
    });

    if (error instanceof NetworkError) {
      throw error;
    }

    throw new NetworkError(`Request failed: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}