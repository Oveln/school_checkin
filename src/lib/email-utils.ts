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
 * 发送token过期提醒邮件
 */
export async function sendTokenExpiredEmail(reauthUrl?: string, isExpiringSoon?: boolean): Promise<void> {
  if (!EMAIL_ENABLED) {
    log.debug('Email disabled - skipping token expired email');
    return;
  }

  const subject = isExpiringSoon ? '⚠️ Token即将过期提醒' : '⚠️ Token已过期，需要重新授权';
  log.info(`Sending token ${isExpiringSoon ? 'expiring soon' : 'expired'} notification email`);

  try {
    const transporter = createMailSender();
    const config = getEmailConfig();

    const title = isExpiringSoon ? 'Token即将过期提醒' : 'Token已过期提醒';
    const titleColor = isExpiringSoon ? '#ffc107' : '#ff6b6b';
    const statusMessage = isExpiringSoon
      ? '您的微信登录Token将在1小时内过期，请及时更新以避免影响自动签到功能。'
      : '您的微信登录Token已过期，自动签到功能暂时无法使用。';
    const actionMessage = isExpiringSoon
      ? '为了避免影响自动签到功能，请提前重新授权：'
      : '为了继续使用自动签到功能，请重新进行授权：';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${titleColor};">⚠️ ${title}</h2>
        <p>您好！</p>
        <p>${statusMessage}</p>
        <p>${actionMessage}</p>
        ${reauthUrl ? `
          <div style="text-align: center; margin: 20px 0;">
            <a href="${reauthUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              📱 访问网页重新授权
            </a>
          </div>
          <p style="text-align: center; color: #666; font-size: 14px;">或者复制链接到浏览器：${reauthUrl}</p>
        ` : `
          <p><strong>请运行程序重新生成二维码进行扫码授权。</strong></p>
        `}
        ${isExpiringSoon ? `
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              💡 <strong>提示：</strong>建议在Token过期前完成重新授权，这样可以确保自动签到功能不中断。
            </p>
          </div>
        ` : ''}
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">
          此邮件由自动签到系统发送<br>
          如有问题，请检查系统配置或联系管理员
        </p>
      </div>
    `;

    const textContent = `
      ${title}

      您好！

      ${statusMessage}

      ${actionMessage}
      ${reauthUrl ? `请访问以下链接重新授权：${reauthUrl}` : '请运行程序重新生成二维码进行扫码授权。'}

      ${isExpiringSoon ? `
      提示：建议在Token过期前完成重新授权，这样可以确保自动签到功能不中断。
      ` : ''}

      ---
      此邮件由自动签到系统发送
    `;

    const mailOptions: EmailOptions = {
      from: `"自动签到系统" <${config.auth.user}>`,
      to: config.auth.user,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);

    log.info('Token expired email sent successfully', {
      messageId: info.messageId,
      hasReauthUrl: !!reauthUrl,
      recipient: mailOptions.to,
    });
    console.log('✅ Token过期提醒邮件已发送:', info.messageId);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.warn('Failed to send token expired email', {}, error instanceof Error ? error : new Error(errorMessage));

    console.warn('⚠️ 发送Token过期提醒邮件失败:', errorMessage);

    // 不要抛出错误 - 邮件失败不应阻塞主要流程
  }
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