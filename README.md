# 学校自动签到系统

一个使用微信二维码认证自动进行学校签到的 TypeScript 应用程序。该项目通过微信登录自动化完成学校签到流程，具有强类型安全、完整的错误处理和全面的测试覆盖。

## 🚀 功能特性

- ✨ **TypeScript 支持**：完全用 TypeScript 编写，提供类型安全和更好的开发体验
- 🔐 **自动微信二维码登录**：安全的认证流程，支持令牌缓存
- 📍 **智能签到提交**：包含地理位置信息的自动签到
- 📧 **邮件通知系统**：二维码和签到结果的邮件提醒
- 💾 **Redis 缓存**：基于 Redis 的令牌缓存，实现无缝重新认证
- 🛡️ **强错误处理**：全面的错误处理和恢复机制
- 📊 **日志系统**：结构化日志记录和监控
- ✅ **测试覆盖**：完整的单元测试和集成测试
- ⚡ **高性能**：优化的代码结构和异步处理
- 🔄 **定时签到**：支持通过 cron 或任务调度器自动运行

## 🛠️ 环境要求

- [Bun](https://bun.sh/) (版本 1.2.x 或更高)
- [Node.js](https://nodejs.org/) (版本 18.x 或更高，可选)
- Redis 数据库实例
- SMTP 服务器用于邮件通知（可选）
- 微信账号用于认证

## 📦 安装

1. 克隆仓库：

```bash
git clone <repository-url>
cd school_checkin
```

2. 使用 Bun 安装依赖：

```bash
bun install
```

3. 构建项目（生产环境）：

```bash
bun run build
```

## ⚙️ 配置

在项目根目录创建 `.env` 文件，并添加以下环境变量：

```env
# 用户名设置
USER_NAME=your_name

# Redis 配置（必需）
REDIS_TOKEN=your_redis_password
REDIS_ADDR=your_redis_address:port

# SMTP 配置（可选，用于邮件通知）
EMAIL_HOST=smtp.your-email-provider.com
EMAIL_PORT=465
EMAIL_USER=your_smtp_username
EMAIL_PASS=your_smtp_password
EMAIL_TO=recipient@example.com

# 微信应用配置（可选）
APPID=wx4a23ae4b8f291087
```

### 配置说明

#### 必需配置
- `USER_NAME`: 您的姓名，用于签到签名
- `REDIS_TOKEN`: Redis 数据库密码
- `REDIS_ADDR`: Redis 实例地址，格式为 `host:port`

#### 可选配置
- `EMAIL_HOST`: SMTP 服务器地址，用于发送邮件通知
- `EMAIL_PORT`: SMTP 服务器端口（通常 SSL 为 465）
- `EMAIL_USER`: SMTP 用户名（邮箱地址）
- `EMAIL_PASS`: SMTP 密码或应用专用密码
- `EMAIL_TO`: 接收二维码和签到通知的邮箱地址
- `APPID`: 微信应用 ID（默认为 `wx4a23ae4b8f291087`）

## 🚀 使用方法

### 开发环境

```bash
# 直接运行 TypeScript 文件
bun run dev

# 或者
bun run src/main.ts
```

### 生产环境

```bash
# 构建并运行
bun run build
bun run start

# 或者直接运行构建后的文件
bun run dist/main.js
```

### 开发脚本

```bash
# 类型检查
bun run type-check

# 代码检查
bun run lint

# 自动修复代码格式
bun run lint:fix

# 代码格式化
bun run format

# 监视模式构建
bun run build:watch

# 运行测试
bun run test

# 测试覆盖率
bun run test:coverage

# 清理构建文件
bun run clean
```

### 自动执行

要自动运行签到（例如，每天运行），可以使用系统 cron 或任务调度器：

```bash
# 示例 cron 任务，每天早上 8:00 AM 运行
0 8 * * * cd /path/to/school_checkin && bun run start
```

或使用 GitHub Actions（参考 `.github/workflows/checkin.yml`）。

## 🔍 工作原理

1. **认证流程**:
   - 系统检查 Redis 中的缓存有效令牌
   - 如果没有有效令牌，生成微信二维码进行认证
   - 二维码显示在控制台并可选择通过邮件发送
   - 系统等待用户使用微信扫描二维码
   - 成功扫描后，令牌缓存在 Redis 中（1小时有效期）

2. **签到流程**:
   - 获取配置学校的签到信息
   - 提交包含位置信息的签到（默认使用配置的坐标）
   - 发送结果通知邮件（如果配置）
   - 完整的错误处理和重试机制

3. **位置服务**:
   - 默认位置：上饶师范学院（坐标：28.423147, 117.976543）
   - 支持自定义位置坐标
   - 地理位置验证

## 📁 项目结构

```
school_checkin/
├── src/
│   ├── main.ts                     # 主应用入口点
│   ├── types/                      # TypeScript 类型定义
│   │   ├── index.ts               # 核心类型
│   │   └── validation.ts          # Zod 验证模式
│   ├── lib/                        # 核心业务逻辑
│   │   ├── checkin-utils.ts       # 签到相关函数
│   │   ├── email-utils.ts         # 邮件通知工具
│   │   ├── qrcode-utils.ts        # 二维码生成工具
│   │   ├── request.ts             # HTTP 请求工具
│   │   ├── token-info.ts          # 令牌管理和认证
│   │   └── wechat-utils.ts        # 微信 API 工具
│   ├── utils/                      # 工具函数
│   │   ├── config.ts              # 配置管理
│   │   └── logger.ts              # 日志系统
│   └── test/                       # 测试配置
│       └── setup.ts               # 测试设置
├── lib/                            # 原始 JavaScript 文件（已弃用）
├── dist/                           # 构建输出目录
├── package.json                    # 项目依赖和脚本
├── tsconfig.json                   # TypeScript 配置
├── vitest.config.ts               # 测试配置
├── .eslintrc.json                 # ESLint 配置
├── .prettierrc                    # Prettier 配置
├── .gitignore                     # Git 忽略文件
├── bun.lockb                      # Bun 锁定文件
├── .env                           # 环境变量（未提交）
└── README.md                      # 此文件
```

## 🔧 自定义

### 更改签到位置

修改 `src/lib/checkin-utils.ts` 中的 `DEFAULT_LOCATION`：

```typescript
const DEFAULT_LOCATION: Location = {
  latitude: YOUR_LATITUDE,
  longitude: YOUR_LONGITUDE,
};
```

### 更改签到主题

修改 `src/lib/checkin-utils.ts` 中的 `THREAD_ID`：

```typescript
const THREAD_ID = YOUR_THREAD_ID;
```

### 自定义签名

在调用 `submitCheckIn` 时修改 `signature` 参数：

```typescript
const result = await submitCheckIn(tokenInfo.getToken(), '您的自定义签名');
```

### 自定义邮件配置

可以通过修改 `src/lib/email-utils.ts` 来自定义邮件模板和发送逻辑。

## 🧪 测试

项目包含全面的测试套件：

```bash
# 运行所有测试
bun run test

# 运行测试并生成覆盖率报告
bun run test:coverage

# 监视模式运行测试
bun run test:watch

# 运行测试 UI
bun run test:ui
```

测试覆盖：
- 单元测试：核心业务逻辑
- 集成测试：组件间交互
- 错误处理测试
- 配置验证测试

## 🔐 安全性

- ✅ **令牌安全**：令牌存储在 Redis 中并设置过期时间
- ✅ **环境变量**：使用环境变量存储敏感配置
- ✅ **HTTPS 连接**：HTTP 请求通过安全连接发出
- ✅ **Redis SSL**：Redis 连接使用 SSL (`rediss://`)
- ✅ **输入验证**：使用 Zod 进行运行时数据验证
- ✅ **错误过滤**：防止敏感信息泄露
- ✅ **类型安全**：TypeScript 编译时类型检查

## 🐛 故障排除

### 常见问题

1. **构建错误**:
   ```bash
   # 清理并重新构建
   bun run clean
   bun install
   bun run build
   ```

2. **类型检查错误**:
   ```bash
   # 运行类型检查
   bun run type-check
   ```

3. **Redis 连接问题**:
   - 确保 Redis 正在运行且配置的地址可访问
   - 验证 `.env` 文件中的 `REDIS_TOKEN` 和 `REDIS_ADDR`
   - 检查 Redis SSL 配置

4. **微信登录不工作**:
   - 确保可以访问 `open.weixin.qq.com` 和 `i-api.jielong.com`
   - 检查网络连接和防火墙设置
   - 查看日志输出的详细错误信息

5. **邮件通知不工作**:
   - 验证 `.env` 文件中的 SMTP 配置
   - 检查邮件提供商的 SMTP 设置
   - 确认使用应用专用密码（如果需要）

### 调试模式

设置环境变量启用详细日志：

```env
NODE_ENV=development
```

或查看日志输出：

```bash
# 应用会在控制台输出详细的调试信息
bun run dev
```

## 📊 监控和日志

应用包含结构化日志系统：

- **日志级别**：debug, info, warn, error
- **上下文信息**：每次日志都包含相关上下文
- **错误追踪**：完整的错误堆栈和上下文
- **性能监控**：请求时间和操作耗时

## 🤝 贡献

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/awesome-feature`)
3. 提交您的更改 (`git commit -m 'Add some awesome feature'`)
4. 推送到分支 (`git push origin feature/awesome-feature`)
5. 开启 Pull Request

### 开发规范

- 遵循 TypeScript 严格模式
- 使用 ESLint 和 Prettier 保持代码风格一致
- 编写测试用例覆盖新功能
- 更新相关文档

## 📝 许可证

本项目使用 ISC 许可证。

## 🆘 支持

如果您遇到任何问题或有疑问：

1. 查看 [故障排除](#-故障排除) 部分
2. 搜索现有 Issues
3. 创建新 Issue 并包含：
   - 详细的错误描述
   - 环境信息（Node.js 版本、操作系统等）
   - 相关日志输出
   - 重现步骤

## 🎯 更新日志

### v2.0.0 (TypeScript 重构)
- ✅ 完全迁移到 TypeScript
- ✅ 添加完整的类型定义和验证
- ✅ 增强错误处理和恢复机制
- ✅ 实现结构化日志系统
- ✅ 添加全面的测试套件
- ✅ 改进代码结构和组织
- ✅ 添加配置管理系统
- ✅ 优化性能和安全性

### v1.0.0 (原始版本)
- 基础微信登录和签到功能
- Redis 令牌缓存
- 邮件通知支持
- 基本错误处理