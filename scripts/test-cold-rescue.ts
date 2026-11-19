// 冷场救场逻辑的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-cold-rescue.ts
// 覆盖：十分钟沉默判定、一分钟无人回复后救场、期间有人说话取消、
// bot 自己的消息/纯图片/私聊不武装、随机触发时不武装。
import { ColdRescueManager } from '../src/cold-rescue'
import { createMiddleware } from '../src/middleware'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

// 可控时钟
const realNow = Date.now
let now = 1_700_000_000_000
Date.now = () => now

// 可控定时器
interface FakeTimer { cb: () => void, cleared: boolean }
let timers: FakeTimer[] = []
const ctx: any = {
  setTimeout: (cb: () => void) => {
    const timer: FakeTimer = { cb, cleared: false }
    timers.push(timer)
    return () => { timer.cleared = true }
  },
}
const runTimers = () => {
  const due = timers.filter(timer => !timer.cleared)
  timers = []
  for (const timer of due) timer.cb()
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const makeSession = (over: any = {}) => ({
  channelId: 'g1',
  userId: 'u1',
  selfId: 'bot',
  username: '群友',
  content: '有人在吗',
  elements: [],
  subtype: undefined,
  isDirect: false,
  ...over,
})

async function main() {
  const rescued: any[] = []
  const sat: any = { handleColdRescue: async (session: any) => { rescued.push(session) } }
  const config: any = { enable_cold_rescue: true }
  const newManager = () => {
    now = 1_700_000_000_000
    timers = []
    rescued.length = 0
    return new ColdRescueManager(ctx, sat, config)
  }

  // ---------- 场景 1：十分钟沉默后开口，一分钟无人回复则救场 ----------
  let manager = newManager()
  assert(manager.observe(makeSession()) === null, '启动后第一条消息没有「之前」可比较，不武装')
  now += 10 * 60_000
  const since = manager.observe(makeSession())
  assert(since !== null, '沉默十分钟后有人开口，返回可武装的序号')
  manager.arm(makeSession(), since!)
  assert(timers.length === 1, '写入群聊环境后武装一分钟后的救场')
  now += 60_000
  runTimers()
  await flush()
  assert(rescued.length === 1, '一分钟无人回复，bot 救场一次')

  // ---------- 场景 2：一分钟内有人说话，救场取消 ----------
  manager = newManager()
  manager.observe(makeSession())
  now += 10 * 60_000
  const since2 = manager.observe(makeSession())
  manager.arm(makeSession(), since2!)
  now += 30_000
  manager.observe(makeSession({ userId: 'u2', username: '另一个群友' }))
  now += 60_000
  runTimers()
  await flush()
  assert(rescued.length === 0, '一分钟内有人回复，不救场')

  // ---------- 场景 3：写入群聊环境期间已有人说话，不再武装 ----------
  manager = newManager()
  manager.observe(makeSession())
  now += 10 * 60_000
  const since3 = manager.observe(makeSession())
  manager.observe(makeSession({ userId: 'u2', username: '另一个群友' }))
  manager.arm(makeSession(), since3!)
  now += 60_000
  runTimers()
  await flush()
  assert(timers.length === 0 && rescued.length === 0, 'observe 与 arm 之间有人说话，不武装')

  // ---------- 场景 4：bot 自己的消息与纯图片不算「有人开口」 ----------
  manager = newManager()
  manager.observe(makeSession())
  now += 10 * 60_000
  assert(manager.observe(makeSession({ userId: 'bot' })) === null, 'bot 自己的消息不武装')
  now += 10 * 60_000
  assert(manager.observe(makeSession({ content: '<img src="a.png"/>' })) === null, '纯图片不武装')
  assert(timers.length === 0, '上述消息都不会产生待触发的救场')

  // ---------- 场景 5：私聊与开关关闭时完全不参与 ----------
  manager = newManager()
  assert(manager.observe(makeSession({ subtype: 'private' })) === null, '私聊不参与冷场判定')
  manager.observe(makeSession())
  now += 10 * 60_000
  const disabled = new ColdRescueManager(ctx, sat, { enable_cold_rescue: false })
  assert(disabled.observe(makeSession()) === null, '开关关闭时不参与冷场判定')

  // ---------- 场景 6：中间件里随机触发优先，不再武装救场 ----------
  const calls: string[] = []
  const mwSat: any = {
    broadcastManager: { seedBroadcast: async () => {} },
    coldRescue: {
      observe: () => 111,
      arm: (_session: any, since: number) => calls.push(`arm:${since}`),
    },
    isMuted: async () => false,
    handleChannelMemoryManager: async () => { calls.push('record'); return true },
    handleRandomMiddleware: async () => { calls.push('random') },
  }
  const baseConfig: any = {
    enable_favorability: false,
    enable_warning: false,
    warning_group: '',
    private: false,
    nick_name: false,
    random_min_tokens: 2,
    max_tokens: 30,
  }
  const session = makeSession()

  await createMiddleware({} as any, mwSat, { ...baseConfig, randnum: 1 })(session, async () => {})
  assert(calls.join(',') === 'record,random', '触发随机回复的消息不救场')
  calls.length = 0

  await createMiddleware({} as any, mwSat, { ...baseConfig, randnum: 0 })(session, async () => {})
  assert(calls.join(',') === 'record,arm:111', '未触发随机回复时，写入群聊环境后武装救场')

  Date.now = realNow
  console.log('ALL PASS')
}

main().catch((e) => {
  Date.now = realNow
  console.error(e)
  process.exit(1)
})
