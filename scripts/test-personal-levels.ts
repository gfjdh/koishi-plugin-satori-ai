// 个人记忆层级晋升测试（假仓库，不连数据库）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-personal-levels.ts
//
// 要保证的事：子记忆正文总和 ≤ 300 字时直接晋升、不调用模型；
// 超过时走一次汇总；各级提示词带按时间跨度设定的字数上限。
import { Summarizer, dayStart } from '../src/memory/summarizer'
import { buildSummaryPrompt, buildTopicArchivePrompt, buildTopicBatchPrompt } from '../src/memory/prompts'
import { SatMemory } from '../src/memory/schema'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const TZ = 8
const todayStart = dayStart(new Date(), TZ, 4)
const yesterdayStart = new Date(+todayStart - 86_400_000)

const topic = (content: string, userState: string, hour: number): Omit<SatMemory, 'id'> => ({
  scopeId: 'u1',
  granularity: 'topic',
  topic: '话题',
  content,
  userState,
  periodStart: new Date(+yesterdayStart + hour * 3_600_000),
  periodEnd: new Date(+yesterdayStart + (hour + 1) * 3_600_000),
  sourceCount: 1,
  createdAt: new Date(),
})

function createRepo(children: Omit<SatMemory, 'id'>[]) {
  const state = {
    memories: [] as Omit<SatMemory, 'id'>[],
    meta: { scopeId: 'u1', topicStart: todayStart, lastActiveAt: todayStart, migratedAt: new Date(0) },
  }
  return Object.assign(state, {
    ensureMeta: async () => state.meta,
    touchMeta: async () => {},
    setTopicStart: async (_scopeId: string, at: Date) => { state.meta.topicStart = at },
    getDialoguesAfter: async () => [],
    getLastDialogueInRange: async () => null,
    countDialoguesInRange: async () => 0,
    getLatestMemory: async (_scopeId: string, level: string) =>
      state.memories
        .filter(m => m.granularity === level)
        .sort((a, b) => +new Date(b.periodEnd) - +new Date(a.periodEnd))[0] || null,
    getMemoriesInRange: async (_scopeId: string, gran: string, from: Date | null, to: Date, limit?: number) => {
      const rows = (gran === 'topic' ? children : state.memories)
        .filter(m => m.granularity === gran)
        .filter(m => (!from || +new Date(m.periodEnd) > +from) && +new Date(m.periodEnd) <= +to)
        .sort((a, b) => +new Date(a.periodEnd) - +new Date(b.periodEnd))
      return limit ? rows.slice(0, limit) : rows
    },
    getLatestMemoryBefore: async () => null,
    createMemory: async (memory: Omit<SatMemory, 'id'>) => { state.memories.push(memory) },
  })
}

const profile = {
  isEnabled: () => false,
  shouldUpdate: () => false,
  summarize: async () => 'skipped',
  isBackfilled: async () => true,
  isCoolingDown: () => false,
  windowStart: () => null,
}

function createApi() {
  const calls: string[] = []
  return {
    calls,
    auxiliaryChat: async (messages: { content: string }[]) => {
      calls.push(messages[0]?.content || '')
      return { content: JSON.stringify({ summary: '这是汇总', user_state: '状态' }), error: false }
    },
  }
}

function createSummarizer(repo: any, api: any) {
  return new Summarizer({} as any, repo, api as any, profile as any, {
    dryRun: false,
    topicSwitchCheck: false,
    timezoneOffset: TZ,
    dayBoundaryHour: 4,
    maxCallsPerTick: 20,
  })
}

async function main() {
  // ---------- 场景 1：多条子记忆总正文 ≤ 300 字，直接晋升 ----------
  {
    const a = '甲'.repeat(100)
    const b = '乙'.repeat(100)
    const repo = createRepo([topic(a, '状态甲', 6), topic(b, '状态乙', 8)])
    const api = createApi()

    await createSummarizer(repo, api).summarizeScope('u1')

    const day = repo.memories.find(m => m.granularity === 'day')
    assert(api.calls.length === 0, '总正文 200 字时不调用模型')
    assert(day?.content === `${a}\n${b}`, '多条子记忆按换行拼接后晋升')
    assert(day?.userState === '状态乙', '用户状态取最近一条非空的')
    assert(day?.sourceCount === 2, 'sourceCount 记录子记忆条数')
  }

  // ---------- 场景 2：总正文超过 300 字，走一次汇总 ----------
  {
    const repo = createRepo([topic('丙'.repeat(200), '状态甲', 6), topic('丁'.repeat(200), '状态乙', 8)])
    const api = createApi()

    await createSummarizer(repo, api).summarizeScope('u1')

    const day = repo.memories.find(m => m.granularity === 'day')
    assert(api.calls.length === 1, '总正文 400 字时调用一次模型')
    assert(day?.content === '这是汇总', '父节点写入模型汇总')
    assert(day?.sourceCount === 2, 'sourceCount 仍是子记忆条数')
    assert(api.calls[0].includes('不得超过 300 字'), 'day 汇总提示词带 300 字上限')
  }

  // ---------- 场景 3：各级提示词的字数上限 ----------
  {
    assert(buildSummaryPrompt('day', 'x')[0].content.includes('不得超过 300 字'), 'day 上限 300 字')
    assert(buildSummaryPrompt('week', 'x')[0].content.includes('不得超过 600 字'), 'week 上限 600 字')
    assert(buildSummaryPrompt('month', 'x')[0].content.includes('不得超过 1000 字'), 'month 上限 1000 字')
    assert(buildSummaryPrompt('season', 'x')[0].content.includes('不得超过 1500 字'), 'season 上限 1500 字')
    assert(buildSummaryPrompt('year', 'x')[0].content.includes('不得超过 2000 字'), 'year 上限 2000 字')
    assert(buildTopicArchivePrompt('x')[0].content.includes('不得超过 300 字'), 'topic 归档上限 300 字')
    assert(
      buildTopicBatchPrompt([{ date: '2026/11/17', dialogues: 'x' }])[0].content.includes('不得超过 300 字'),
      'topic 批量归档上限 300 字',
    )
  }

  console.log('\n全部通过')
}

main()
