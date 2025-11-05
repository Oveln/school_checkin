import path from 'node:path';
import { promises as fs } from 'node:fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  type EmailOptions,
  type CheckInSubmitResponse,
  AppError,
  ValidationError,
} from '@/types';
import { hasEmailConfig, hasEmailRecipient, getEmailConfig } from '@/utils/config';
import { log } from '@/utils/logger';

/**
 * 增强的电子邮件工具，具有适当的错误处理和配置
 */

export let EMAIL_ENABLED = true;

// 初始化邮箱配置
if (!hasEmailConfig()) {
  log.warn('Email configuration incomplete - email functionality disabled');
  EMAIL_ENABLED = false;
}

if (!hasEmailRecipient()) {
  log.warn('Email recipient not configured - email functionality disabled');
  EMAIL_ENABLED = false;
}

/**
 * 使用验证后的配置创建邮件传输器
 */
function createMailSender(): Transporter {
  if (!EMAIL_ENABLED) {
    throw new AppError('Email functionality is disabled due to incomplete configuration', 'EMAIL_DISABLED');
  }

  try {
    const emailConfig = getEmailConfig();
    const transporter = nodemailer.createTransport(emailConfig);

    log.debug('Email transporter created successfully', {
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      hasAuth: !!emailConfig.auth,
    });

    return transporter;
  } catch (error) {
    log.error('Failed to create email transporter', error instanceof Error ? error : new Error(String(error)));
    throw new AppError('Failed to create email transporter', 'EMAIL_TRANSPORT_ERROR');
  }
}

/**
 * 通过电子邮件发送二维码，并进行适当的错误处理和清理
 */
export async function sendEmailWithQRCode(uuid: string, qrBuffer: Buffer): Promise<void> {
  if (!EMAIL_ENABLED) {
    log.debug('Email disabled - skipping QR code email');
    return;
  }

  if (!uuid || uuid.trim().length === 0) {
    throw new ValidationError('UUID is required for QR code email');
  }

  if (!Buffer.isBuffer(qrBuffer) || qrBuffer.length === 0) {
    throw new ValidationError('QR code buffer is required and must not be empty');
  }

  log.info('Sending QR code email', { uuid });

  try {
    const transporter = createMailSender();
    const config = getEmailConfig();

    // 为二维码创建临时文件
    const qrPath = path.resolve(process.cwd(), `qrcode_${uuid}.png`);
    await fs.writeFile(qrPath, qrBuffer);

    const mailOptions: EmailOptions = {
      from: `"WeChat Login" <${config.auth.user}>`,
      to: config.auth.user, // 发送给已验证的用户
      subject: '请扫码登录微信（自动签到机器人）',
      text: '请使用微信扫描附件二维码进行登录授权。',
      attachments: [
        {
          filename: `wechat_login_${uuid}.png`,
          content: qrBuffer,
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);

    // 清理临时文件
    try {
      await fs.unlink(qrPath);
    } catch (cleanupError) {
      log.warn('Failed to cleanup temporary QR code file', { qrPath: qrPath }, cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
    }

    log.info('QR code email sent successfully', {
      messageId: info.messageId,
      uuid,
      recipient: mailOptions.to,
    });
    console.log('✅ 邮件已发送:', info.messageId);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.warn('Failed to send QR code email', { uuid }, error instanceof Error ? error : new Error(errorMessage));

    console.log(
      `⚠️ 发送邮件失败：请前往网址扫描二维码：https://open.weixin.qq.com/connect/qrcode/${uuid}`
    );

    // 不要抛出错误 - 邮件失败不应阻塞主要流程
  }
}

/**
 * 通过电子邮件发送签到结果
 */
export async function sendCheckinResult(result: CheckInSubmitResponse): Promise<void> {
  if (!EMAIL_ENABLED) {
    log.debug('Email disabled - skipping check-in result email');
    return;
  }

  log.info('Sending check-in result email', { hasResult: !!result });

  try {
    const transporter = createMailSender();
    const config = getEmailConfig();

    const resultText = result?.['Description'] ? String(result['Description']) : JSON.stringify(result, null, 2);
    const resultDataRaw = result?.['Data'];
    const resultData: string = typeof resultDataRaw === 'string' ? resultDataRaw : JSON.stringify(resultDataRaw || '未知');

    const mailOptions: EmailOptions = {
      from: `"WeChat Login" <${config.auth.user}>`,
      to: config.auth.user,
      subject: `签到结果 - ${resultData || '未知'}`,
      text: resultText,
    };

    const info = await transporter.sendMail(mailOptions);

    log.info('Check-in result email sent successfully', {
      messageId: info.messageId,
      resultData,
      recipient: mailOptions.to,
    });
    console.log('✅ 邮件已发送:', info.messageId);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.warn('Failed to send check-in result email', { result }, error instanceof Error ? error : new Error(errorMessage));

    console.warn('⚠️ 发送签到结果邮件失败:', errorMessage);

    // 不要抛出错误 - 邮件失败不应阻塞主要流程
  }
}

/**
 * 检查邮件功能是否已启用
 */
export function isEmailEnabled(): boolean {
  return EMAIL_ENABLED;
}

/**
 * 重新验证邮件配置（对运行时重新配置有用）
 */
export function revalidateEmailConfig(): void {
  const wasEnabled = EMAIL_ENABLED;

  EMAIL_ENABLED = hasEmailConfig() && hasEmailRecipient();

  if (wasEnabled !== EMAIL_ENABLED) {
    log.info('Email configuration status changed', {
      wasEnabled,
      isEnabled: EMAIL_ENABLED,
      hasConfig: hasEmailConfig(),
      hasRecipient: hasEmailRecipient()
    });
  }
}