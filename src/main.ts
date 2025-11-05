#!/usr/bin/env node

import TokenInfo from '@/lib/token-info';
import { getCheckInInfo, submitCheckIn } from '@/lib/checkin-utils';
import { sendCheckinResult } from '@/lib/email-utils';
import { validateConfig } from '@/utils/config';
import { AppError, ValidationError } from '@/types';
import { log } from '@/utils/logger';

/**
 * 增强的主入口点，具有适当的错误处理和日志记录
 */

// 获取并验证必需的环境变量
const USER_NAME = process.env['USER_NAME'];

/**
 * 初始化应用程序
 */
function initialize(): void {
  try {
    // 验证配置
    validateConfig();

    // 记录启动信息
    log.info('School Check-in System starting', {
      hasUserName: !!USER_NAME,
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Application initialization failed', error instanceof Error ? error : new Error(errorMessage));
    console.error('❌ 应用初始化失败:', errorMessage);
    process.exit(1);
  }
}

/**
 * 主应用程序逻辑
 */
async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    // 验证必需的输入
    if (!USER_NAME || USER_NAME.trim().length === 0) {
      throw new ValidationError('USER_NAME environment variable is required and must not be empty', 'USER_NAME');
    }

    const trimmedUserName = USER_NAME.trim();

    log.info('Starting check-in process', { userName: trimmedUserName });

    // 步骤 1: 确保用户已登录并获取有效令牌
    log.info('Step 1: Ensuring user authentication');
    console.log('\n🔐 正在验证登录状态...');

    const tokenInfo = await TokenInfo.get_ensureLoggedIn();

    log.info('Authentication successful', {
      hasToken: !!tokenInfo.token,
      expire: tokenInfo.expire ? new Date(tokenInfo.expire).toISOString() : null,
      timeUntilExpiry: tokenInfo.getTimeUntilExpiration(),
    });

    // 步骤 2: 获取签到信息
    log.info('Step 2: Fetching check-in information');
    console.log('\n📋 获取签到信息...');

    const checkInInfo = await getCheckInInfo(tokenInfo.getToken());

    log.info('Check-in information retrieved', {
      infoType: typeof checkInInfo,
      hasData: !!checkInInfo,
    });
    console.log('签到信息:', JSON.stringify(checkInInfo, null, 2));

    // 步骤 3: 提交签到
    log.info('Step 3: Submitting check-in');
    console.log(`\n📝 正在为 ${trimmedUserName} 提交签到...`);
    console.log(trimmedUserName);

    const checkInResult = await submitCheckIn(
      tokenInfo.getToken(),
      trimmedUserName
    );

    log.info('Check-in submitted successfully', {
      resultType: typeof checkInResult,
      hasData: !!checkInResult,
    });
    console.log('✅ 签到完成:', JSON.stringify(checkInResult, null, 2));

    // 步骤 4: 发送结果邮件（可选，非阻塞）
    log.info('Step 4: Sending result notification');
    await sendCheckinResult(checkInResult);

    const duration = Date.now() - startTime;

    log.info('Check-in process completed successfully', {
      userName: trimmedUserName,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    console.log(`\n🎉 签到流程完成！耗时: ${duration}ms`);

    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error('Check-in process failed', error instanceof Error ? error : new Error(errorMessage), {
      userName: USER_NAME?.trim(),
      duration: `${duration}ms`,
    });

    console.error('\n❌ 运行出错:', errorMessage);

    // 处理特定错误类型
    if (error instanceof ValidationError) {
      console.error('\n💡 提示: 请检查环境变量配置是否正确');
    } else if (error instanceof AppError) {
      console.error(`\n💡 错误代码: ${error.code}`);
      if (error.isOperational) {
        console.error('💡 这是一个可预期的操作错误，请稍后重试');
      }
    }

    process.exit(1);
  }
}

/**
 * 处理进程终止
 */
function setupProcessHandlers(): void {
  const gracefulShutdown = (signal: string): void => {
    log.info(`Received ${signal}, shutting down gracefully`);

    // 关闭前导出日志
    try {
      const logs = log.exportLogs();
      console.log('\n📋 应用日志:');
      console.log(logs);
    } catch (error) {
      console.error('Failed to export logs:', error);
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 处理未处理的Promise拒绝
  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Promise Rejection', new Error(String(reason)), {
      promise: promise.toString(),
    });
    console.error('❌ 未处理的 Promise 拒绝:', reason);
    process.exit(1);
  });

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception', error);
    console.error('❌ 未捕获的异常:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

/**
 * 应用程序入口点
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // 初始化应用程序
  initialize();

  // 设置进程处理器
  setupProcessHandlers();

  // 运行主逻辑
  main().catch((error) => {
    log.error('Fatal error in main', error instanceof Error ? error : new Error(String(error)));
    console.error('❌ 致命错误:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}