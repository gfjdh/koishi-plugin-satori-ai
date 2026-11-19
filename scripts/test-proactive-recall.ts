// 主动回忆逻辑的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-proactive-recall.ts
// 覆盖：召回提示词增强、3 天内不重复提示、私聊主动消息的随机 day 记忆。
import { ContextBuilder } from '../src/memory/context'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const NOW = new Date('2026-11-19T12:00:00+08:00')
const DAY = 86_400_000

const memory = (id: number, content: string, periodStart: string) => ({
  id,
  scopeId: 'u1',
  granularity: 'day',
  topic: '',
  content,
  userState: '',
  periodStart: new Date(periodStart),
  periodEnd: new Date(new Date(periodStart).getTime() + DAY - 1),
  sourceCount: 3,
  createdAt: new Date(periodStart),
})

const MEMORIES = [
  memory(1, '用户说上周和朋友去爬山，天气很好', '2025-10-01T00:00:00+08:00'),
  memory(2, '用户最近在学做菜，做得不太顺利', '2025-10-05T00:00:00+08:00'),
  memory(3, '用户爬山的时候遇到下雨，淋湿了', '2025-10-09T00:00:00+08:00'),
]

interface Call { scopeId: string, ids?: number[], now?: Date, cutoff?: Date, excludeIds?: Set<number> }
const calls: Call[] = []
let recentIds = new Set<number>()
let randomDayMemory: any = MEMORIES[0]

const repo: any = {
  async getRecallCandidates() { return MEMORIES },
  async getRecentRecallIds(scopeId: string) {
    calls.push({ scopeId })
    return recentIds
  },
  async recordRecallHints(scopeId: string, ids: number[], now: Date, cutoff: Date) {
    calls.push({ scopeId, ids, now, cutoff })
  },
  async getRandomDayMemory(scopeId: string, _since: Date, excludeIds: Set<number>) {
    calls.push({ scopeId, excludeIds })
    return randomDayMemory && !excludeIds.has(randomDayMemory.id) ? randomDayMemory : null
  },
}

const baseConfig: any = {
  enabled: true,
  commonTopN: 5,
  dialogueTopN: 5,
  recallTopN: 5,
  retentionDays: 0,
  timezoneOffset: 8,
  dialogueStatsEnabled: false,
  memoryConfig: { personal_memory: true },
  groupEnabled: true,
  now: () => NOW,
}

const builder = (over: any = {}) => new ContextBuilder(repo, {} as any, {} as any, { ...baseConfig, ...over })

const privateSession: any = { userId: 'u1', channelId: 'private:u1', subtype: 'private' }
const groupSession: any = { userId: 'u2', channelId: '123456', subtype: undefined, isDirect: false }

async function main() {
  // ---------- 场景 1：召回提示词增强 + 3 天去重 ----------
  {
    calls.length = 0
    recentIds = new Set([3])
    const { text } = await (builder() as any).buildRecall('u1', '爬山', new Set())
    assert(text.includes('可以主动提起'), '召回段落提示模型可以主动提起旧事')
    assert(text.includes('上周和朋友去爬山'), '命中查询的记忆被注入')
    assert(!text.includes('淋湿了'), '3 天内提示过的记忆不再重复')
    const hint = calls.find(call => call.ids)
    assert(hint && hint.ids!.join(',') === '1', `只记录本次真正提示的记忆（实际 ${hint?.ids}`)
    const recent = calls.find(call => !call.ids)
    assert(recent?.scopeId === 'u1', '按 scope 查询最近提示记录')
    assert(hint!.cutoff!.getTime() === NOW.getTime() - DAY * 3, '去重窗口为 3 天')
  }

  // ---------- 场景 2：候选都在 3 天内提示过时返回空 ----------
  {
    calls.length = 0
    recentIds = new Set([1, 2, 3])
    const { text } = await (builder() as any).buildRecall('u1', '爬山', new Set())
    assert(text === '', '所有候选都在 3 天内提示过时不再召回')
    assert(!calls.some(call => call.ids), '没有注入时不写提示记录')
  }

  // ---------- 场景 3：私聊主动对话随机取 day 记忆 ----------
  {
    calls.length = 0
    recentIds = new Set()
    randomDayMemory = MEMORIES[1]
    const text = await (builder() as any).buildRandomDayRecall(privateSession, new Set())
    assert(text.includes('可以自然地以它为话题'), '随机 day 记忆建议模型以其为话题')
    assert(text.includes('最近在学做菜'), '注入被选中的 day 记忆内容')
    const dayCall = calls.find(call => call.excludeIds)
    assert(dayCall?.scopeId === 'u1', '私聊使用个人 scope')
    const hint = calls.find(call => call.ids)
    assert(hint?.ids?.join(',') === '2', '随机选中的记忆也记录 3 天提示')
  }

  // ---------- 场景 4：群聊主动对话不做随机 day 召回 ----------
  {
    calls.length = 0
    randomDayMemory = MEMORIES[0]
    const text = await (builder() as any).buildRandomDayRecall(groupSession, new Set())
    assert(text === '', '群聊主动对话不注入随机 day 记忆')
    assert(calls.length === 0, '直接返回，不查询任何 scope')
  }

  // ---------- 场景 5：没有可用的 day 记忆时返回空 ----------
  {
    calls.length = 0
    recentIds = new Set([1])
    randomDayMemory = MEMORIES[0]
    const text = await (builder() as any).buildRandomDayRecall(privateSession, new Set())
    assert(text === '', '唯一候选在 3 天内提示过时不做随机召回')
  }

  console.log('ALL PASS')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
