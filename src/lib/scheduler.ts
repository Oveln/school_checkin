import { CronJob } from 'cron';
import TokenInfo from '@/lib/token-info';
import { getCheckInInfo, submitCheckIn } from '@/lib/checkin-utils';
import { sendTokenExpiredEmail, isEmailEnabled } from '@/lib/email-utils';
import { log } from '@/utils/logger';
import { AppError, AuthenticationError } from '@/types';

/**
 * 定时任务调度器
 * 负责每天晚上7:05执行自动签到任务
 */

// 定时任务实例
let checkinJob: CronJob | null = null;

// 配置常量
const SCHEDULE_CONFIG = {
  DAILY_CHECKIN_TIME: '0 5 19 * * *', // 每天晚上7:05 (分 时 日 月 周)
  TIMEZONE: 'Asia/Shanghai'
};

/**
 * 执行自动签到任务
 */
async function performDailyCheckin(): Promise<void> {
  try {
    log.info('Starting daily scheduled check-in');
    console.log('🕖 开始执行每日定时签到任务...');

    // 获取用户名
    const userName = process.env['USER_NAME'];
    if (!userName) {
      throw new AppError('USER_NAME not configured', 'MISSING_USER_NAME');
    }

    // 获取最新的token
    const tokenInfo = await TokenInfo.fromRedis();

    // 检查token有效性
    if (!tokenInfo.isValid()) {
      log.warn('Token is invalid for scheduled check-in');
      console.log('❌ Token无效，无法执行定时签到');

      // 发送提醒邮件
      if (isEmailEnabled()) {
        try {
          const reauthUrl = process.env['REAUTH_URL'] || `http://localhost:${process.env['PORT'] || 3000}`;
          const customRecipient = process.env['EXPIRED_EMAIL_RECIPIENT'];
          const emailOptions: { reauthUrl: string; customRecipient?: string } = {
            reauthUrl
          };
          if (customRecipient) {
            emailOptions.customRecipient = customRecipient;
          }
          await sendTokenExpiredEmail(emailOptions);
          console.log('📧 已发送Token过期提醒邮件');
        } catch (emailError) {
          log.warn('Failed to send token expired email', {}, emailError instanceof Error ? emailError : new Error(String(emailError)));
        }
      }

      return;
    }

    // 获取签到信息
    await getCheckInInfo(tokenInfo.getToken());

    // 提交签到
    const checkInResult = await submitCheckIn(tokenInfo.getToken(), userName.trim());

    log.info('Daily scheduled check-in completed successfully', {
      userName: userName.trim(),
      result: checkInResult
    });

    console.log('✅ 每日定时签到完成');
    console.log('签到结果:', checkInResult);

  } catch (error) {
    log.error('Daily scheduled check-in failed', error instanceof Error ? error : new Error(String(error)));
    console.error('❌ 每日定时签到失败:', error instanceof Error ? error.message : String(error));

    // 如果是认证错误，发送邮件提醒
    if (error instanceof AuthenticationError && isEmailEnabled()) {
      try {
        const reauthUrl = process.env['REAUTH_URL'] || `http://localhost:${process.env['PORT'] || 3000}`;
        const customRecipient = process.env['EXPIRED_EMAIL_RECIPIENT'];
        const emailOptions: { reauthUrl: string; customRecipient?: string } = {
          reauthUrl
        };
        if (customRecipient) {
          emailOptions.customRecipient = customRecipient;
        }
        await sendTokenExpiredEmail(emailOptions);
        console.log('📧 已发送认证失败提醒邮件');
      } catch (emailError) {
        log.warn('Failed to send auth failure email', {}, emailError instanceof Error ? emailError : new Error(String(emailError)));
      }
    }
  }
}


/**
 * 启动定时任务调度器
 */
export function startScheduler(): void {
  try {
    // 检查是否已经启动
    if (checkinJob) {
      log.warn('Scheduler is already running');
      console.log('⚠️ 定时任务调度器已经在运行中');
      return;
    }

    // 创建每日签到任务
    checkinJob = new CronJob(
      SCHEDULE_CONFIG.DAILY_CHECKIN_TIME,
      performDailyCheckin,
      null,
      false,
      SCHEDULE_CONFIG.TIMEZONE
    );

    // 启动任务
    checkinJob.start();

    log.info('Scheduler started successfully', {
      checkinTime: SCHEDULE_CONFIG.DAILY_CHECKIN_TIME,
      timezone: SCHEDULE_CONFIG.TIMEZONE
    });

    console.log('✅ 定时任务调度器已启动');
    console.log(`📅 每日签到时间: ${SCHEDULE_CONFIG.DAILY_CHECKIN_TIME} (${SCHEDULE_CONFIG.TIMEZONE})`);

  } catch (error) {
    log.error('Failed to start scheduler', error instanceof Error ? error : new Error(String(error)));
    console.error('❌ 启动定时任务调度器失败:', error instanceof Error ? error.message : String(error));
    throw new AppError('Failed to start scheduler', 'SCHEDULER_START_ERROR');
  }
}

/**
 * 停止定时任务调度器
 */
export function stopScheduler(): void {
  try {
    if (checkinJob) {
      checkinJob.stop();
      checkinJob = null; // 清空引用，确保状态同步
      log.info('Daily check-in job stopped');
    }

    log.info('Scheduler stopped successfully');
    console.log('⏹️ 定时任务调度器已停止');

  } catch (error) {
    log.error('Failed to stop scheduler', error instanceof Error ? error : new Error(String(error)));
    console.error('❌ 停止定时任务调度器失败:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  checkinJobStatus: boolean;
  nextCheckinDate?: Date;
} {
  // 检查job是否存在且正在运行
  let isRunning = false;
  let nextCheckinDate: Date | undefined;

  if (checkinJob) {
    // 尝试检查job的实际状态
    try {
      // 如果job存在，检查是否已设置下次执行时间
      const nextDate = checkinJob.nextDate()?.toJSDate();
      if (nextDate) {
        isRunning = true;
        nextCheckinDate = nextDate;
      } else {
        // 如果没有下次执行时间，说明job已停止，清空引用
        checkinJob = null;
      }
    } catch (error) {
      // 如果检查状态出错，认为job已停止
      const err = error instanceof Error ? error : new Error(String(error));
      log.warn('Failed to check job status', { error: err.message });
      checkinJob = null;
    }
  }

  const result: {
    isRunning: boolean;
    checkinJobStatus: boolean;
    nextCheckinDate?: Date;
  } = {
    isRunning,
    checkinJobStatus: isRunning
  };

  if (nextCheckinDate) {
    result.nextCheckinDate = nextCheckinDate;
  }

  return result;
}

/**
 * 手动触发每日签到任务（用于测试）
 */
export async function triggerManualCheckin(): Promise<void> {
  log.info('Manual check-in triggered');
  console.log('🔧 手动触发签到任务...');
  await performDailyCheckin();
}


// 优雅关闭处理
process.on('SIGINT', () => {
  log.info('SIGINT received, stopping scheduler');
  console.log('📡 接收到中断信号，正在停止定时任务调度器...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('SIGTERM received, stopping scheduler');
  console.log('📡 接收到终止信号，正在停止定时任务调度器...');
  stopScheduler();
  process.exit(0);
});

export default {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerManualCheckin
};