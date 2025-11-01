#!/usr/bin/env node
import TokenInfo from './lib/token-info.js'
import { getCheckInInfo, submitCheckIn } from './lib/checkin-utils.js'
import { sendCheckinResult } from './lib/email-utils.js'

// 以常规方式读取环境变量，注意 Node ESM 下严格模式，必须声明变量
const USER_NAME = process.env.USER_NAME

if (!USER_NAME) {
  throw new Error('❌ 请设置环境变量 USER_NAME 为您的姓名')
}

try {
  const token_info = await TokenInfo.get_ensureLoggedIn()

  console.log('\n📋 开始签到...')
  const info = await getCheckInInfo(token_info.token)
  console.log('签到信息:', info)
  console.log(USER_NAME)
  const result = await submitCheckIn(token_info.token, USER_NAME)
  console.log('✅ 签到完成:', result)

  // 发送签到结果邮件（可选，失败不阻塞）
  await sendCheckinResult(result)
} catch (err) {
  console.error('❌ 运行出错:', err.message || err)
  process.exit(1)
}

process.exit(0)