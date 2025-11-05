# 学校自动签到系统 - Server端文档

## 概述

这是一个基于Node.js/TypeScript的学校自动签到系统的Server端实现。系统提供了完整的网页端管理界面、定时签到调度、邮件通知和微信扫码登录功能。

## 🚀 主要特性

### 核心功能
- ✅ **微信扫码登录** - 支持网页端微信二维码扫码授权
- ✅ **自动签到** - 每天定时执行签到任务（默认19:05）
- ✅ **手动签到** - 支持网页端手动触发签到
- ✅ **实时状态** - 使用Socket.IO提供实时状态更新
- ✅ **Token管理** - 智能的Token生命周期管理
- ✅ **邮件通知** - Token过期提醒和签到结果通知

### 技术特性
- 🔒 **类型安全** - 完整的TypeScript类型定义
- 🛡️ **错误处理** - 完善的错误处理机制
- 📝 **日志系统** - 结构化日志记录
- 🔧 **配置管理** - 基于Zod的配置验证
- 💾 **Redis存储** - Token持久化存储
- ⏰ **定时任务** - 基于Cron的调度器

## 📋 系统要求

### 环境依赖
- **Node.js** >= 18.0.0
- **Redis** >= 6.0
- **TypeScript** >= 5.0
- **Bun** (推荐运行时)

### 必需环境变量

```bash
# Redis配置（必需）
REDIS_TOKEN=your-redis-password
REDIS_ADDR=your-redis-host:port

# 用户信息（必需）
USER_NAME=你的姓名

# 邮件配置（可选，用于邮件通知功能）
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_TO=recipient@example.com

# 高级配置（可选）
REAUTH_URL=http://your-domain.com:3000
EXPIRED_EMAIL_RECIPIENT=admin@example.com
PORT=3000
```

## 🏗️ 架构设计

### 项目结构

```
src/
├── server.ts              # 主服务器文件
├── main.ts                # CLI入口点
├── types/                 # 类型定义
│   ├── index.ts           # 核心类型
│   └── validation.ts      # Zod验证模式
├── lib/                   # 核心功能模块
│   ├── token-info.ts      # Token管理
│   ├── wechat-utils.ts    # 微信API工具
│   ├── checkin-utils.ts   # 签到功能
│   ├── email-utils.ts     # 邮件功能
│   ├── qrcode-utils.ts    # 二维码工具
│   └── scheduler.ts       # 定时任务调度
├── utils/                 # 工具类
│   ├── config.ts          # 配置管理
│   ├── logger.ts          # 日志系统
│   └── request.ts         # HTTP客户端
└── public/                # 静态网页资源
    └── index.html         # 主网页界面
```

### 核心组件

#### 1. Express服务器 (`src/server.ts`)
- **HTTP API服务器** - 提供RESTful API接口
- **Socket.IO服务** - 实时通信支持
- **会话管理** - 安全的二维码会话管理
- **静态文件服务** - 网页界面托管

#### 2. Token管理系统 (`src/lib/token-info.ts`)
- **Redis持久化** - Token安全存储
- **生命周期管理** - 自动过期检测
- **错误恢复** - Token失效自动处理

#### 3. 微信集成 (`src/lib/wechat-utils.ts`)
- **二维码生成** - 微信登录二维码
- **轮询机制** - 扫码状态检测
- **Token换取** - 授权码换取访问令牌

#### 4. 定时调度器 (`src/lib/scheduler.ts`)
- **Cron调度** - 精确的定时任务执行
- **任务管理** - 启动/停止/状态查询
- **邮件通知** - 失败时自动提醒

## 🔌 API接口文档

### Token管理

#### 获取Token状态
```http
GET /api/token-status
```

**响应示例:**
```json
{
  "hasToken": true,
  "isValid": true,
  "expire": 1704067200000,
  "timeUntilExpiry": 3600000,
  "willExpireWithin1Hour": false
}
```

#### 生成二维码
```http
POST /api/qrcode
Content-Type: application/json

{
  "sessionId": "optional_session_id"
}
```

**响应示例:**
```json
{
  "sessionId": "sess_123456",
  "uuid": "wx_qr_uuid",
  "qrUrl": "https://open.weixin.qq.com/connect/qrcode/uuid",
  "expiresIn": 300
}
```

### 签到功能

#### 手动签到
```http
POST /api/checkin
```

**响应示例:**
```json
{
  "success": true,
  "message": "签到完成",
  "result": {
    "status": "success",
    "timestamp": "2024-01-01T19:05:00Z"
  }
}
```

### 调度器管理

#### 获取调度器状态
```http
GET /api/scheduler-status
```

**响应示例:**
```json
{
  "isRunning": true,
  "nextExecution": "2024-01-01T19:05:00Z",
  "lastExecution": "2023-12-31T19:05:00Z",
  "executionCount": 15
}
```

#### 启动/停止调度器
```http
POST /api/start-scheduler
POST /api/stop-scheduler
```

#### 手动触发签到
```http
POST /api/trigger-checkin
```

### 邮件通知

#### 发送重新授权邮件
```http
POST /api/send-reauth-email
```

### 系统监控

#### 会话统计
```http
GET /api/session-stats
```

**响应示例:**
```json
{
  "totalSessions": 150,
  "activeSessions": 2,
  "currentActiveSessions": 2,
  "sessionDetails": [...],
  "serverUptime": 86400
}
```

## 🔌 Socket.IO事件

### 客户端事件
服务器向客户端推送以下实时事件：

#### 扫码状态事件
- `scanned` - 已扫码，正在获取token
- `success` - 登录成功，token已保存
- `expired` - 二维码已过期
- `error` - 操作失败

#### 签到状态事件
- `checkin_complete` - 自动签到完成
- `checkin_error` - 自动签到失败

**事件数据格式:**
```json
{
  "type": "success",
  "message": "登录成功！",
  "tokenInfo": {
    "hasToken": true,
    "expire": 1704067200000,
    "timeUntilExpiry": 3600000
  }
}
```

## 🛡️ 安全特性

### 会话管理安全
- **安全会话ID** - 使用加密安全的随机数生成器
- **会话超时** - 5分钟自动过期机制
- **轮询限制** - 防止无限轮询攻击
- **客户端信息记录** - IP地址和User-Agent记录

### 数据保护
- **Token加密存储** - Redis安全存储
- **敏感信息隐藏** - 日志中隐藏密码
- **输入验证** - Zod模式验证所有输入
- **错误边界** - 防止敏感信息泄露

### 网络安全
- **CORS支持** - 跨域请求控制
- **速率限制** - API调用频率控制
- **输入清理** - 防止注入攻击

## 🔧 配置管理

### 环境变量验证
系统使用Zod进行严格的配置验证：

```typescript
const envSchema = z.object({
  REDIS_TOKEN: z.string().min(1, 'Redis token is required'),
  REDIS_ADDR: z.string().min(1, 'Redis address is required'),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  // ... 更多配置项
});
```

### 配置状态检查
```typescript
// 检查邮件配置
config.hasEmailConfig()
config.hasEmailRecipient()

// 获取Redis连接URL
config.getRedisUrl()
```

## 📝 日志系统

### 日志级别
- `debug` - 调试信息
- `info` - 一般信息
- `warn` - 警告信息
- `error` - 错误信息

### 日志格式
```typescript
{
  level: 'info',
  message: 'Server started successfully',
  timestamp: '2024-01-01T12:00:00Z',
  context: { port: 3000 },
  error?: Error
}
```

## 🚀 部署指南

### 开发环境
```bash
# 安装依赖
bun install

# 启动开发服务器
bun run server

# 或者指定端口
PORT=8080 bun run server
```

### 生产环境
```bash
# 构建项目
bun run build

# 启动生产服务器
bun run start

# 使用PM2管理进程
pm2 start dist/server.js --name "school-checkin"
```

### Docker部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json bun.lockb ./
RUN npm install -g bun
RUN bun install
COPY . .
RUN bun run build
EXPOSE 3000
CMD ["bun", "start"]
```

## 🔍 监控和调试

### 健康检查端点
- `GET /api/token-status` - Token状态
- `GET /api/scheduler-status` - 调度器状态
- `GET /api/session-stats` - 会话统计

### 调试技巧
1. **查看日志** - 所有操作都有详细日志
2. **监控Redis** - 检查Token存储状态
3. **检查邮件配置** - 确保SMTP设置正确
4. **定时任务状态** - 验证调度器运行状态

## 📊 性能优化

### 内存管理
- **会话清理** - 定期清理过期会话
- **Redis连接池** - 复用Redis连接
- **定时任务优化** - 避免重复执行

### 并发控制
- **轮询限制** - 防止过度轮询
- **超时处理** - 合理的请求超时设置
- **错误恢复** - 自动重试机制

## 🚨 故障排除

### 常见问题

#### 1. 服务器启动失败
```bash
# 检查端口占用
lsof -i :3000

# 检查环境变量
printenv | grep -E "(REDIS|EMAIL|USER)"
```

#### 2. Token失效问题
```bash
# 检查Redis连接
redis-cli -u your-redis-url ping

# 检查Token存储
redis-cli -u your-redis-url get token_info
```

#### 3. 邮件发送失败
```bash
# 测试SMTP配置
telnet smtp.gmail.com 587

# 检查邮件设置
curl -X POST http://localhost:3000/api/send-reauth-email
```

#### 4. 定时任务不执行
```bash
# 检查调度器状态
curl http://localhost:3000/api/scheduler-status

# 手动触发测试
curl -X POST http://localhost:3000/api/trigger-checkin
```

### 错误代码说明
- `CONFIG_ERROR` - 配置错误
- `AUTH_ERROR` - 认证失败
- `NETWORK_ERROR` - 网络连接问题
- `REDIS_ERROR` - Redis操作失败
- `VALIDATION_ERROR` - 输入验证失败

## 🔄 API版本控制

当前版本: **v1**

版本兼容性承诺:
- 修复性更新 - 补丁版本 (如 1.0.1)
- 新功能添加 - 次要版本 (如 1.1.0)
- 破坏性变更 - 主要版本 (如 2.0.0)

## 🤝 贡献指南

### 开发流程
1. Fork项目
2. 创建功能分支
3. 提交代码变更
4. 运行测试套件
5. 提交Pull Request

### 代码规范
- 使用TypeScript严格模式
- 遵循ESLint规则
- 添加适当的注释
- 更新相关文档

## 📄 许可证

本项目采用 **ISC** 许可证。详见 [LICENSE](LICENSE) 文件。

## 🆘 支持

如遇问题，请通过以下方式获取帮助：
1. 查看本文档的故障排除部分
2. 检查项目的Issues页面
3. 提交新的Issue描述问题

---

**注意:** 本系统仅用于合法的学校签到自动化目的。请确保遵守学校的相关规定和使用条款。