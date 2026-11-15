// 群聊「群日报」逻辑测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-daily-digest.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：只选话题记忆（不往粗粒度上找）、游标推进到最后一个话题末尾；
// 「今日最喜欢」标记能从正文里拆出来；正文保留段落、超长时在句末截断；
// 模型改写的昵称仍能映射回群友。
import {
  DAILY_DIGEST_MAX_CHARS, DigestParticipant, clampDailyDigest, parseDailyDigest,
  resolveDigestFavorite, selectDigestNodes,
} from '../src/memory/group-digest'
import { buildGroupDailyDigestTask } from '../src/memory/prompts'
import { Granularity, SatMemory } from '../src/memory/schema'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

/** +08 时区的本地时间 -> UTC Date */
const localAt = (year: number, month: number, day: number, hour = 4, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
const local = (month: number, day: number, hour = 4, minute = 0) =>
  localAt(2026, month, day, hour, minute)

let nextId = 0
const node = (
  granularity: Granularity,
  start: Date,
  end: Date,
  content = `${granularity} 内容`,
): SatMemory => ({
  id: ++nextId,
  scopeId: 'g:123',
  granularity,
  topic: '',
  content,
  userState: '',
  periodStart: start,
  periodEnd: end,
  sourceCount: 1,
  createdAt: end,
})

/** 按 (after, to] 过滤，与 MemoryRepository.getMemoriesInRange 语义一致 */
function fetcher(nodes: SatMemory[]) {
  return async (level: Granularity, after: Date, to: Date) =>
    nodes
      .filter(item => item.granularity === level)
      .filter(item => +item.periodEnd > +after && +item.periodEnd <= +to)
      .sort((a, b) => +a.periodEnd - +b.periodEnd)
}

const participants: DigestParticipant[] = [
  { userId: 'u1', username: '小明', count: 12 },
  { userId: 'u2', username: '小红', count: 30 },
  { userId: 'u3', username: '小明明', count: 5 },
]

async function main() {
  // ---------- 场景 1：群日报只选话题记忆 ----------
  {
    const from = local(11, 15, 4)
    const now = local(11, 16, 4)
    const nodes = [
      node('day', local(11, 15, 4), local(11, 16, 4), '日总结'),
      node('topic', local(11, 15, 6), local(11, 15, 9), '早上的话题'),
      node('topic', local(11, 15, 20), local(11, 15, 23), '晚上的话题'),
      // 起点早于 from、但结束在区间内的话题仍要纳入
      node('topic', local(11, 15, 2), local(11, 15, 5), '跨过起点的话题'),
    ]
    const { nodes: picked, cursor } = await selectDigestNodes(
      from, now, fetcher(nodes), ['topic'],
    )
    assert(picked.every(item => item.granularity === 'topic'), '只选话题记忆，不选日/周/月节点')
    assert(picked.length === 3, `区间内的话题全部纳入（实际 ${picked.length}）`)
    assert(+cursor === +local(11, 15, 23), '游标推进到最后一个话题的末尾')
  }

  // ---------- 场景 2：拆出「今日最喜欢」 ----------
  {
    const plain = parseDailyDigest('今天群里很热闹。\n\n【今日最喜欢】小明')
    assert(plain.favorite === '小明', '「【今日最喜欢】昵称」能解析出昵称')
    assert(plain.body === '今天群里很热闹。', '标记行从正文里去掉')

    const bracketed = parseDailyDigest('正文。\n【今日最喜欢：小红】')
    assert(bracketed.favorite === '小红', '「【今日最喜欢：昵称】」也能解析')
    assert(bracketed.body === '正文。', '第二种写法的标记同样从正文里去掉')

    // 括号过滤会把标记包上省略号、把空白换成点，解析仍要能用
    const dotted = parseDailyDigest('正文。\n…【今日最喜欢】…安定')
    assert(dotted.favorite === '安定', '标记前后的省略号会被剥掉')
    assert(dotted.body === '正文。', '带省略号的标记行从正文里去掉')

    const inline = parseDailyDigest('最后一段。…【今日最喜欢】…小红')
    assert(inline.favorite === '小红', '标记跟在句尾也能解析')
    assert(inline.body === '最后一段。', '句尾标记不会把正文一起删掉')

    const none = parseDailyDigest('没有标记的日报。')
    assert(none.favorite === '' && none.body === '没有标记的日报。', '没有标记时正文原样保留')
  }

  // ---------- 场景 3：正文清洗与截断 ----------
  {
    const short = clampDailyDigest('第一段。\n\n第二段。')
    assert(short === '第一段。\n\n第二段。', '未超长时保留段落换行')

    const collapsed = clampDailyDigest('第一段。\n\n\n\n第二段。')
    assert(collapsed === '第一段。\n\n第二段。', '多余空行压缩成一段间隔')

    const long = '啊'.repeat(DAILY_DIGEST_MAX_CHARS + 200) + '。后面还有。'
    const clamped = clampDailyDigest(long)
    assert(clamped.length <= DAILY_DIGEST_MAX_CHARS, '超长正文被截到上限以内')

    const sentences = `${'今天群里聊了很多事情。'.repeat(300)}`
    const cut = clampDailyDigest(sentences)
    assert(cut.endsWith('。'), '截断落在句末，不会劈开一句话')
    assert(cut.length <= DAILY_DIGEST_MAX_CHARS, '句末截断同样不超上限')
  }

  // ---------- 场景 4：昵称映射 ----------
  {
    assert(resolveDigestFavorite('小红', participants)?.userId === 'u2', '精确昵称直接命中')
    assert(resolveDigestFavorite('【小红】', participants)?.userId === 'u2', '带括号的昵称能命中')
    assert(resolveDigestFavorite('小红。', participants)?.userId === 'u2', '带句号的昵称能命中')
    assert(resolveDigestFavorite('小明明', participants)?.userId === 'u3', '精确匹配优先于包含匹配')
    assert(resolveDigestFavorite('明', participants) === null, '单字昵称不做模糊匹配')
    assert(resolveDigestFavorite('不存在的人', participants) === null, '匹配不到时返回 null')

    const duplicated: DigestParticipant[] = [
      { userId: 'a', username: '同名', count: 3 },
      { userId: 'b', username: '同名', count: 9 },
    ]
    assert(resolveDigestFavorite('同名', duplicated)?.userId === 'b', '同名时取发言最多的那个')
  }

  // ---------- 场景 5：提示词 ----------
  {
    const task = buildGroupDailyDigestTask('材料内容', '11-15 04:00 ~ 11-16 04:00', ['小明', '小红'])[0].content
    assert(task.includes('小明、小红'), '提示词列出候选群友')
    assert(task.includes('【今日最喜欢】'), '提示词要求输出今日最喜欢标记')
    assert(task.includes('900-1100 字'), '提示词要求约 1000 字（900-1100）')
    assert(task.includes('点评'), '提示词要求附角色点评')
    assert(!task.includes('提问者'), '日报不再标注提问者')
  }

  console.log('\n全部通过')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
