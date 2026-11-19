// 随机插话中间件顺序的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-random-middleware.ts
// 验证触发插话的消息会先进入群聊环境，再生成 bot 的发言。
import { createMiddleware } from '../src/middleware'

const calls: string[] = []

const sat: any = {
  broadcastManager: { seedBroadcast: async () => {} },
  coldRescue: { observe: () => null, arm: () => {} },
  isMuted: async () => false,
  handleChannelMemoryManager: async () => {
    calls.push('record-user')
  },
  handleRandomMiddleware: async () => {
    calls.push('random')
  },
}

const baseConfig: any = {
  enable_favorability: false,
  enable_warning: false,
  warning_group: '',
  private: true,
  nick_name: false,
  random_min_tokens: 5,
  max_tokens: 30,
  randnum: 1,
}

const session: any = {
  userId: 'u1',
  selfId: 'bot',
  channelId: 'c1',
  username: '群友',
  content: '今天在整理藏书',
  elements: [],
}

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

async function main() {
  // ---------- 场景 1：随机触发时先记录触发消息，再生成插话 ----------
  const middleware = createMiddleware({} as any, sat, baseConfig)
  await middleware(session, async () => {
    calls.push('next')
  })
  assert(
    calls.join(',') === 'record-user,random',
    '随机触发路径先写入触发消息的群聊记录，再生成插话，且不再继续后续中间件',
  )

  // ---------- 场景 2：未触发随机时行为保持不变 ----------
  calls.length = 0
  await createMiddleware({} as any, sat, { ...baseConfig, randnum: 0 })(session, async () => {
    calls.push('next')
  })
  assert(calls.join(',') === 'record-user,next', '未触发随机时只记录消息并放行')

  console.log('ALL PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
