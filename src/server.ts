#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomBytes, createHash } from 'crypto';
import TokenInfo from '@/lib/token-info';
import { fetchUUID, pollWxCode } from '@/lib/wechat-utils';
import { sendTokenExpiredEmail } from '@/lib/email-utils';
import { getCheckInInfo, submitCheckIn } from '@/lib/checkin-utils';
import { startScheduler, stopScheduler, getSchedulerStatus, triggerManualCheckin } from '@/lib/scheduler';
import { log } from '@/utils/logger';
import { validateConfig } from '@/utils/config';
import { AppError, AuthenticationError } from '@/types';

const app = express();
const server = createServer(app);
const io = new Server(server);

// 增强的轮询会话管理
const pollingSessions = new Map<string, {
  uuid: string;
  timeout: NodeJS.Timeout;
  startTime: number;
  ip?: string;
  userAgent?: string;
  lastActivity: number;
  pollCount: number;
}>();

// 会话统计
const sessionStats = {
  totalSessions: 0,
  activeSessions: 0
};

// 会话配置常量
const SESSION_CONFIG = {
  TIMEOUT: 5 * 60 * 1000,        // 5分钟过期
  POLL_INTERVAL: 2000,           // 2秒轮询间隔
  CLEANUP_INTERVAL: 60 * 1000,   // 1分钟清理间隔
  MAX_POLLS_PER_SESSION: 150     // 每个会话最大轮询次数
};

/**
 * 生成安全的会话ID
 * 使用加密安全的随机数生成器，确保不可预测性和唯一性
 */
function generateSecureSessionId(): string {
  // 生成32字节的随机数据
  const randomData = randomBytes(32);
  // 使用SHA-256哈希确保固定长度和一致性
  const hash = createHash('sha256').update(randomData).digest('hex');
  // 添加时间戳前缀便于调试，但不影响安全性
  return `sess_${Date.now()}_${hash.substring(0, 16)}`;
}

/**
 * 从请求中提取客户端信息
 */
function extractClientInfo(req: express.Request): { ip?: string; userAgent?: string } {
  const ip = req.ip ||
             req.connection.remoteAddress ||
             req.socket.remoteAddress ||
             (req.connection as any)?.socket?.remoteAddress;

  const userAgent = req.get('User-Agent');
  const cleanIp = ip ? ip.replace('::ffff:', '') : undefined;

  const result: { ip?: string; userAgent?: string } = {
    ip: cleanIp
  };

  if (userAgent) {
    result.userAgent = userAgent;
  }

  return result;
}

// 静态文件服务
app.use(express.static('public'));
app.use(express.json());

/**
 * 启动Express服务器
 */
async function startServer(port: number = 3000): Promise<void> {
  try {
    // 验证配置
    validateConfig();

    server.listen(port, () => {
      log.info(`QR Code server started on port ${port}`);
      console.log(`🌐 服务器运行在: http://localhost:${port}`);

      // 启动定时任务调度器
      try {
        startScheduler();
      } catch (schedulerError) {
        const error = schedulerError instanceof Error ? schedulerError : new Error(String(schedulerError));
        log.warn('Failed to start scheduler', { error: error.message });
        console.warn('⚠️ 定时任务调度器启动失败，但服务器仍可正常使用');
      }
    });

  } catch (error) {
    log.error('Failed to start server', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * 检查token状态API
 */
app.get('/api/token-status', async (_req, res) => {
  try {
    const tokenInfo = await TokenInfo.fromRedis();

    res.json({
      hasToken: !!tokenInfo.token,
      isValid: tokenInfo.isValid(),
      expire: tokenInfo.expire,
      timeUntilExpiry: tokenInfo.getTimeUntilExpiration(),
      willExpireWithin1Hour: tokenInfo.willExpireWithin(60 * 60 * 1000), // 1小时
    });
  } catch (error) {
    log.error('Failed to check token status', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: 'Failed to check token status' });
  }
});

/**
 * 获取二维码API
 */
app.post('/api/qrcode', async (req, res) => {
  try {
    // 使用安全的会话ID生成方式
    const sessionId = req.body.sessionId || generateSecureSessionId();

    // 提取客户端信息
    const clientInfo = extractClientInfo(req);

    log.info('Generating QR code', { sessionId, ip: clientInfo.ip });

    // 生成UUID
    const uuid = await fetchUUID();

    // 存储增强的会话信息
    pollingSessions.set(sessionId, {
      uuid,
      timeout: setTimeout(() => {
        pollingSessions.delete(sessionId);
        io.emit(sessionId, { type: 'expired', message: '二维码已过期' });
        sessionStats.activeSessions--;
        log.info('Session expired', { sessionId });
      }, SESSION_CONFIG.TIMEOUT),
      startTime: Date.now(),
      ...clientInfo,
      lastActivity: Date.now(),
      pollCount: 0
    });

    // 更新统计
    sessionStats.totalSessions++;
    sessionStats.activeSessions++;

    // 返回二维码信息
    res.json({
      sessionId,
      uuid,
      qrUrl: `https://open.weixin.qq.com/connect/qrcode/${uuid}`,
      expiresIn: 300 // 5分钟
    });

    // 开始轮询wx_code
    startPollingWxCode(sessionId, uuid);

  } catch (error) {
    log.error('Failed to generate QR code', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * 开始轮询wx_code
 */
async function startPollingWxCode(sessionId: string, uuid: string): Promise<void> {
  log.info('Start polling WeChat code', { sessionId, uuid });

  const pollInterval = setInterval(async () => {
    try {
      const session = pollingSessions.get(sessionId);
      if (!session) {
        clearInterval(pollInterval);
        return;
      }

      // 更新活动时间和轮询次数
      session.lastActivity = Date.now();
      session.pollCount++;

      // 检查是否超时
      if (Date.now() - session.startTime > SESSION_CONFIG.TIMEOUT) {
        clearInterval(pollInterval);
        pollingSessions.delete(sessionId);
        sessionStats.activeSessions--;
        io.emit(sessionId, { type: 'expired', message: '二维码已过期' });
        log.info('Session timeout during polling', { sessionId, pollCount: session.pollCount });
        return;
      }

      // 检查轮询次数限制
      if (session.pollCount > SESSION_CONFIG.MAX_POLLS_PER_SESSION) {
        clearInterval(pollInterval);
        pollingSessions.delete(sessionId);
        sessionStats.activeSessions--;
        io.emit(sessionId, { type: 'expired', message: '轮询次数过多，请重新生成二维码' });
        log.warn('Session exceeded max polls', { sessionId, pollCount: session.pollCount });
        return;
      }

      // 轮询wx_code
      const wxCode = await pollWxCode(uuid);

      if (wxCode) {
        log.info('WeChat code received', { sessionId, uuid, wxCode, pollCount: session.pollCount });
        clearInterval(pollInterval);
        pollingSessions.delete(sessionId);
        sessionStats.activeSessions--;

        // 通知客户端已扫码
        io.emit(sessionId, { type: 'scanned', message: '已扫码，正在获取token...' });

        try {
          // 获取token
          const tokenInfo = await TokenInfo.fetchTokenByWxCode(wxCode);
          await tokenInfo.save();

          log.info('Token saved successfully', { sessionId, uuid });

          // 通知客户端成功
          io.emit(sessionId, {
            type: 'success',
            message: '登录成功！',
            tokenInfo: {
              hasToken: !!tokenInfo.token,
              expire: tokenInfo.expire,
              timeUntilExpiry: tokenInfo.getTimeUntilExpiration()
            }
          });

          // 触发一次checkin
          await triggerCheckin(sessionId);

        } catch (tokenError) {
          log.error('Failed to get token', tokenError instanceof Error ? tokenError : new Error(String(tokenError)), { sessionId, uuid });
          io.emit(sessionId, {
            type: 'error',
            message: '获取token失败，请重试'
          });
        }
      }

    } catch (error) {
      log.error('Polling error', error instanceof Error ? error : new Error(String(error)), { sessionId, uuid });
    }
  }, SESSION_CONFIG.POLL_INTERVAL); // 使用配置的轮询间隔
}

/**
 * 触发签到
 */
async function triggerCheckin(sessionId: string): Promise<void> {
  try {
    const userName = process.env['USER_NAME'];
    if (!userName) {
      throw new AppError('USER_NAME not configured', 'MISSING_USER_NAME');
    }

    log.info('Triggering check-in after login', { sessionId, userName });

    // 获取最新的token
    const tokenInfo = await TokenInfo.fromRedis();
    if (!tokenInfo.isValid()) {
      throw new AuthenticationError('Token is not valid after login');
    }

    // 获取签到信息
    await getCheckInInfo(tokenInfo.getToken());

    // 提交签到
    const checkInResult = await submitCheckIn(tokenInfo.getToken(), userName.trim());

    log.info('Auto check-in completed successfully', {
      sessionId,
      userName: userName.trim(),
      result: checkInResult
    });

    // 通知客户端签到结果
    io.emit(sessionId, {
      type: 'checkin_complete',
      message: '自动签到完成！',
      result: checkInResult
    });

  } catch (error) {
    log.error('Auto check-in failed', error instanceof Error ? error : new Error(String(error)), { sessionId });
    io.emit(sessionId, {
      type: 'checkin_error',
      message: '自动签到失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 手动触发签到API
 */
app.post('/api/checkin', async (_req, res): Promise<void> => {
  try {
    const userName = process.env['USER_NAME'];
    if (!userName) {
      res.status(400).json({ error: 'USER_NAME not configured' });
      return;
    }

    // 检查token有效性
    const tokenInfo = await TokenInfo.fromRedis();
    if (!tokenInfo.isValid()) {
      res.status(401).json({
        error: 'Token expired or invalid',
        needReauth: true
      });
      return;
    }

    // 执行签到
    await getCheckInInfo(tokenInfo.getToken());
    const checkInResult = await submitCheckIn(tokenInfo.getToken(), userName.trim());

    log.info('Manual check-in completed', { userName: userName.trim() });

    res.json({
      success: true,
      message: '签到完成',
      result: checkInResult
    });

  } catch (error) {
    log.error('Manual check-in failed', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      error: 'Check-in failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 发送重新授权邮件API
 */
app.post('/api/send-reauth-email', async (_req, res) => {
  try {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 3000;
    const reauthUrl = `http://localhost:${port}`;

    await sendTokenExpiredEmail(reauthUrl);

    res.json({
      success: true,
      message: '重新授权邮件已发送'
    });

  } catch (error) {
    log.error('Failed to send reauth email', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      error: 'Failed to send email',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Socket.IO连接处理
io.on('connection', (socket) => {
  log.debug('Client connected', { socketId: socket.id });

  socket.on('disconnect', () => {
    log.debug('Client disconnected', { socketId: socket.id });
  });
});

// 增强的会话清理机制
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionId, session] of pollingSessions.entries()) {
    if (now - session.startTime > SESSION_CONFIG.TIMEOUT) {
      clearTimeout(session.timeout);
      pollingSessions.delete(sessionId);
      cleanedCount++;
      sessionStats.activeSessions--;
      log.debug('Cleaned up expired session', {
        sessionId,
        age: now - session.startTime,
        pollCount: session.pollCount
      });
    }
  }

  if (cleanedCount > 0) {
    log.info('Session cleanup completed', {
      cleanedCount,
      remainingSessions: pollingSessions.size,
      activeSessions: sessionStats.activeSessions
    });
  }
}, SESSION_CONFIG.CLEANUP_INTERVAL); // 使用配置的清理间隔

/**
 * 获取调度器状态API
 */
app.get('/api/scheduler-status', (_req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (error) {
    log.error('Failed to get scheduler status', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

/**
 * 手动触发签到API
 */
app.post('/api/trigger-checkin', async (_req, res) => {
  try {
    await triggerManualCheckin();
    res.json({
      success: true,
      message: '手动签到任务已触发'
    });
  } catch (error) {
    log.error('Failed to trigger manual check-in', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      error: 'Failed to trigger check-in',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});


/**
 * 启动调度器API
 */
app.post('/api/start-scheduler', (_req, res) => {
  try {
    startScheduler();
    res.json({
      success: true,
      message: '调度器已启动'
    });
  } catch (error) {
    log.error('Failed to start scheduler via API', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      error: 'Failed to start scheduler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 停止调度器API
 */
app.post('/api/stop-scheduler', (_req, res) => {
  try {
    stopScheduler();
    res.json({
      success: true,
      message: '调度器已停止'
    });
  } catch (error) {
    log.error('Failed to stop scheduler via API', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      error: 'Failed to stop scheduler',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// 增强的优雅关闭机制
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully', {
    activeSessions: pollingSessions.size,
    totalCreatedSessions: sessionStats.totalSessions
  });

  // 停止调度器
  stopScheduler();

  server.close(() => {
    // 清理所有会话和定时器
    for (const [sessionId, session] of pollingSessions.entries()) {
      clearTimeout(session.timeout);
      log.debug('Cleaning up session on shutdown', { sessionId });
    }
    pollingSessions.clear();
    sessionStats.activeSessions = 0;

    log.info('Server shutdown complete');
    process.exit(0);
  });
});

// 添加会话统计API
app.get('/api/session-stats', (_req, res) => {
  try {
    const activeSessions = Array.from(pollingSessions.values()).map(session => ({
      age: Date.now() - session.startTime,
      pollCount: session.pollCount,
      hasClientInfo: !!(session.ip && session.userAgent),
      lastActivity: Date.now() - session.lastActivity
    }));

    res.json({
      ...sessionStats,
      currentActiveSessions: pollingSessions.size,
      sessionDetails: activeSessions.slice(0, 10), // 只返回前10个会话详情
      serverUptime: process.uptime()
    });
  } catch (error) {
    log.error('Failed to get session stats', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ error: 'Failed to get session stats' });
  }
});

// 启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  
  startServer();
}

export { app, server, startServer };