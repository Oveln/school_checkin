import { request } from '@/lib/request';
import {
  type CheckInInfoResponse,
  type CheckInSubmitResponse,
  type Location,
  type CheckInPayload,
  THREAD_ID,
  DEFAULT_LOCATION,
  CHECKIN_ENDPOINTS,
  NetworkError,
  AppError,
  ValidationError,
} from '@/types';
import { log } from '@/utils/logger';

/**
 * 增强的签到工具，具有适当的错误处理和验证
 */

/**
 * 验证位置坐标
 */
function validateLocation(location: Location): void {
  if (location.latitude < -90 || location.latitude > 90) {
    throw new ValidationError('Latitude must be between -90 and 90', 'latitude');
  }
  if (location.longitude < -180 || location.longitude > 180) {
    throw new ValidationError('Longitude must be between -180 and 180', 'longitude');
  }
}

/**
 * 获取指定主题的签到信息
 */
export async function getCheckInInfo(token: string): Promise<CheckInInfoResponse> {
  if (!token) {
    throw new ValidationError('Token is required for getting check-in info');
  }

  if (!THREAD_ID || THREAD_ID <= 0) {
    throw new ValidationError('Invalid thread ID', 'threadId');
  }

  try {
    const url = CHECKIN_ENDPOINTS.INFO(THREAD_ID);

    log.info('Fetching check-in information', { threadId: THREAD_ID });

    const response = await request<CheckInInfoResponse>(url, { method: 'GET' }, token);

    log.info('Check-in information retrieved successfully', {
      threadId: THREAD_ID,
      responseType: typeof response
    });

    return response;

  } catch (error) {
    log.error('Failed to get check-in info', error instanceof Error ? error : new Error(String(error)), {
      threadId: THREAD_ID,
    });

    throw error instanceof AppError ? error : new NetworkError('Failed to get check-in info', error instanceof Error ? error : undefined);
  }
}

/**
 * 使用签名和位置提交签到
 */
export async function submitCheckIn(
  token: string,
  signature: string,
  location?: Location | null
): Promise<CheckInSubmitResponse> {
  if (!token) {
    throw new ValidationError('Token is required for check-in submission');
  }

  if (!signature || signature.trim().length === 0) {
    throw new ValidationError('Signature is required for check-in submission', 'signature');
  }

  // 验证并使用提供的位置或默认位置
  const finalLocation = location || DEFAULT_LOCATION;
  validateLocation(finalLocation);

  try {
    const payload: CheckInPayload = {
      Id: 0,
      ThreadId: THREAD_ID,
      Signature: signature.trim(),
      RecordValues: [
        {
          FieldId: 1,
          Values: [],
          Texts: [],
          HasValue: false,
        },
        {
          FieldId: 2,
          Values: [JSON.stringify(finalLocation)],
          Texts: ['上饶市信州区•上饶师范学院'],
          HasValue: true,
        },
      ],
    };

    log.info('Submitting check-in', {
      threadId: THREAD_ID,
      signature: signature.trim(),
      location: finalLocation,
    });

    const response = await request<CheckInSubmitResponse>(
      CHECKIN_ENDPOINTS.SUBMIT,
      { method: 'POST', body: payload },
      token
    );

    log.info('Check-in submitted successfully', {
      threadId: THREAD_ID,
      signature: signature.trim(),
      responseType: typeof response
    });

    return response;

  } catch (error) {
    log.error('Failed to submit check-in', error instanceof Error ? error : new Error(String(error)), {
      threadId: THREAD_ID,
      signature: signature.trim(),
      location: finalLocation,
    });

    throw error instanceof AppError ? error : new NetworkError('Failed to submit check-in', error instanceof Error ? error : undefined);
  }
}