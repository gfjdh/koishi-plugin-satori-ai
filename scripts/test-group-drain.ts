// 群聊归档游标推进的集成测试（假仓库，不连数据库）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-drain.ts
//
// 要保证的事：一个自然日里的多个时间块会各归档一次、游标严格前进、
// 还在沉默阈值内的尾巴不会被提前归档。
import { Summarizer } from '../src/memory/summarizer'
import { SatDialogue, SatMemory } from '../src/memory/schema'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

/** +08 时区的本地时间 -> UTC Date */
const local = (month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, month - 1, day, hour - 8, minute))

let nextId = 0
const msg = (at: Date, text: string, name = '灵梦', kind = 'ambient'): SatDialogue => ({
  id: ++nextId,
  scopeId: 'g:123',
  userId: kind === 'ambient-bot' ? 'self' : `u:${name}`,
  username: name,
  kind,
  userContent: text,
  aiContent: '',
  createdAt: at,
})

interface FakeRepo {
  rows: SatDialogue[]
  memories: Omit<SatMemory, 'id'>[]
  meta: { scopeId: string, topicStart: Date, lastActiveAt: Date, migratedAt: Date }
}

function createRepo(rows: SatDialogue[], start: Date): FakeRepo {
  const state: FakeRepo = {
    rows,
    memories: [],
    meta: { scopeId: 'g:123', topicStart: start, lastActiveAt: start, migratedAt: new Date(0) },
  }
  const inRange = (row: SatDialogue, after: Date, before?: Date, kinds?: string[]) =>
    +row.createdAt > +after
    && (!before || +row.createdAt < +before)
    && (!kinds?.length || kinds.includes(row.kind))

  return Object.assign(state, {
    ensureMeta: async () => state.meta,
    touchMeta: async () => {},
    setTopicStart: async (_scopeId: string, at: Date) => { state.meta.topicStart = at },
    getDialoguesAfter: async (_scopeId: string, after: Date, options: any = {}) =>
      state.rows
        .filter(row => inRange(row, after, options.before, options.kinds))
        .sort((a, b) => +a.createdAt - +b.createdAt)
        .slice(0, options.limit ?? undefined),
    countDialoguesInRange: async (_scopeId: string, after: Date, before: Date, kinds?: string[]) =>
      state.rows.filter(row => inRange(row, after, before, kinds)).length,
    commitTopicArchive: async (memory: Omit<SatMemory, 'id'>, _scopeId: string, cursor: Date) => {
      state.memories.push(memory)
      state.meta.topicStart = cursor
    },
    getLatestMemory: async () => null,
    getMemoriesInRange: async () => [],
    getLatestMemoryBefore: async () => null,
    createMemory: async (memory: Omit<SatMemory, 'id'>) => { state.memories.push(memory) },
  })
}

function createApi() {
  const calls: string[] = []
  return {
    calls,
    auxiliaryChat: async (messages: { content: string }[]) => {
      calls.push(messages[0]?.content || '')
      return { content: JSON.stringify({ topic: '群聊', summary: '大家聊了会儿天', group_state: '气氛轻松' }), error: false }
    },
  }
}

const profile = {
  isEnabled: () => false,
  shouldUpdate: () => false,
  summarize: async () => 'skipped',
  isBackfilled: async () => true,
  isCoolingDown: () => false,
  windowStart: () => null,
}

function createSummarizer(repo: any, api: any) {
  return new Summarizer({} as any, repo, api as any, profile as any, {
    dryRun: false,
    topicSwitchCheck: false,
    timezoneOffset: 8,
    dayBoundaryHour: 4,
    maxCallsPerTick: 20,
  })
}

async function main() {
  // ---------- 场景 1：同一天的两个时间块各归档一次 ----------
  {
    const dayStart = local(11, 10, 4)
    const rows = [
      msg(local(11, 10, 10, 0), '第一句话'),
      msg(local(11, 10, 10, 1), '第二句话'),
      msg(local(11, 10, 10, 2), '第三句话'),
      // 间隔 58 分钟，属于下一块
      msg(local(11, 10, 11, 0), '第四句话'),
      msg(local(11, 10, 11, 1), '第五句话'),
    ]
    const repo = createRepo(rows, dayStart)
    const api = createApi()

    await createSummarizer(repo, api).summarizeScope('g:123')

    assert(api.calls.length === 2, `两个时间块各一次模型调用（实际 ${api.calls.length}）`)
    assert(repo.memories.length === 2, `写入两条 topic 记忆（实际 ${repo.memories.length}）`)
    assert(
      +repo.memories[0].periodStart === +local(11, 10, 10, 0)
      && +repo.memories[0].periodEnd === +local(11, 10, 10, 2),
      '第一条记忆的时间范围是第一个块',
    )
    assert(
      +repo.memories[1].periodStart === +local(11, 10, 11, 0)
      && +repo.memories[1].periodEnd === +local(11, 10, 11, 1),
      '第二条记忆的时间范围是第二个块',
    )
    assert(
      +repo.meta.topicStart > +local(11, 10, 4) && +repo.meta.topicStart <= Date.now(),
      '游标推进到今天（没有剩余消息时直接到日界线）',
    )
    assert(
      api.calls[0].includes('用户（灵梦）说「第一句话'),
      '归档输入使用结构化发言人标签',
    )
  }

  // ---------- 场景 2：还在沉默阈值内的尾巴不归档 ----------
  {
    const now = new Date()
    const rows = [msg(new Date(now.getTime() - 5 * 60_000), '刚刚说的话')]
    const repo = createRepo(rows, new Date(now.getTime() - 60 * 60_000))
    const api = createApi()

    await createSummarizer(repo, api).summarizeScope('g:123')

    assert(api.calls.length === 0, '沉默未满 20 分钟，不发起模型调用')
    assert(repo.memories.length === 0, '不写入记忆')
    assert(+repo.meta.topicStart < +now, '游标停在原处，等下一轮')
  }

  // ---------- 场景 3：全是无信息量的短句时跳过，不花调用 ----------
  {
    const dayStart = local(11, 10, 4)
    const rows = [
      msg(local(11, 10, 10, 0), '草'),
      msg(local(11, 10, 10, 1), '哈哈哈'),
      msg(local(11, 10, 10, 2), '?'),
    ]
    const repo = createRepo(rows, dayStart)
    const api = createApi()

    await createSummarizer(repo, api).summarizeScope('g:123')

    assert(api.calls.length === 0, '过滤后没有内容时不调用模型')
    assert(repo.memories.length === 0, '不写入空记忆')
    assert(+repo.meta.topicStart > +dayStart, '游标仍然越过这一块，不会反复重试')
  }

  console.log('\n全部通过')
  // 显式退出：esbuild-register / koishi 可能留下活动句柄，不退出会让脚本挂住
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
