import sharp from 'sharp';
import terminalImage from 'terminal-image';
import fetch from 'node-fetch';
import { AppError, ValidationError } from '@/types';
import { log } from '@/utils/logger';

/**
 * 增强的二维码工具，具有适当的错误处理和验证
 */

/**
 * 验证UUID格式
 */
function validateUUID(uuid: string): void {
  if (!uuid || typeof uuid !== 'string' || uuid.trim().length === 0) {
    throw new ValidationError('UUID is required and must be a non-empty string');
  }

  // 基本UUID格式验证（微信UUID可能有所不同，但让我们检查基本模式）
  const uuidPattern = /^[a-zA-Z0-9_-]+$/;
  if (!uuidPattern.test(uuid.trim())) {
    throw new ValidationError('UUID contains invalid characters');
  }
}

/**
 * 在终端中获取并显示二维码
 */
export async function printAsciiQRCode(uuid: string): Promise<void> {
  if (!uuid) {
    throw new ValidationError('UUID is required for QR code generation');
  }

  validateUUID(uuid);

  try {
    const qrUrl = `https://open.weixin.qq.com/connect/qrcode/${uuid.trim()}`;

    log.info('Fetching QR code', { uuid: uuid.trim(), url: qrUrl });
    console.log(`🔗 二维码链接：${qrUrl}`);

    // 获取二维码图像
    const response = await fetch(qrUrl);

    if (!response.ok) {
      throw new AppError(`Failed to fetch QR code: ${response.status} ${response.statusText}`, 'QR_FETCH_ERROR');
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new AppError('Received empty QR code image', 'QR_EMPTY_ERROR');
    }

    log.debug('QR code fetched successfully', {
      uuid: uuid.trim(),
      size: buffer.length,
      contentType: response.headers.get('content-type')
    });

    // 调整图像大小以更好地在终端中显示
    const resized = await sharp(buffer)
      .resize({ width: 200 })
      .toBuffer();

    log.debug('QR code resized for terminal display', {
      originalSize: buffer.length,
      resizedSize: resized.length
    });

    // 在终端中显示
    console.log('\n请使用微信扫描下方二维码：\n');
    const terminalOutput = await terminalImage.buffer(resized, { width: 200 });
    console.log(terminalOutput);
    console.log('\n（提示：此二维码为登录二维码）');

    log.info('QR code displayed in terminal', { uuid: uuid.trim() });

  } catch (error) {
    log.error('Failed to display QR code', error instanceof Error ? error : new Error(String(error)), { uuid });

    // 提供回退URL以供手动扫描
    console.log(`\n📱 请手动访问以下链接扫描二维码：`);
    console.log(`https://open.weixin.qq.com/connect/qrcode/${uuid.trim()}`);

    throw error instanceof AppError ? error : new AppError('Failed to display QR code', 'QR_DISPLAY_ERROR');
  }
}

/**
 * 将二维码获取为缓冲区（用于电子邮件附件）
 */
export async function fetchQRCodeBuffer(uuid: string): Promise<Buffer> {
  if (!uuid) {
    throw new ValidationError('UUID is required for QR code fetching');
  }

  validateUUID(uuid);

  try {
    const qrUrl = `https://open.weixin.qq.com/connect/qrcode/${uuid.trim()}`;

    log.debug('Fetching QR code buffer', { uuid: uuid.trim() });

    const response = await fetch(qrUrl);

    if (!response.ok) {
      throw new AppError(`Failed to fetch QR code: ${response.status} ${response.statusText}`, 'QR_FETCH_ERROR');
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new AppError('Received empty QR code image', 'QR_EMPTY_ERROR');
    }

    log.debug('QR code buffer fetched successfully', {
      uuid: uuid.trim(),
      size: buffer.length,
      contentType: response.headers.get('content-type')
    });

    return buffer;

  } catch (error) {
    log.error('Failed to fetch QR code buffer', error instanceof Error ? error : new Error(String(error)), { uuid });
    throw error instanceof AppError ? error : new AppError('Failed to fetch QR code buffer', 'QR_FETCH_ERROR');
  }
}

/**
 * 为网页显示生成二维码数据URL
 */
export async function generateQRCodeDataURL(uuid: string): Promise<string> {
  const buffer = await fetchQRCodeBuffer(uuid);

  try {
    // 将PNG转换为数据URL
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    log.debug('QR code data URL generated', { uuid, size: dataUrl.length });

    return dataUrl;

  } catch (error) {
    log.error('Failed to generate QR code data URL', error instanceof Error ? error : new Error(String(error)), { uuid });
    throw new AppError('Failed to generate QR code data URL', 'QR_DATA_URL_ERROR');
  }
}