// 群聊「省流」选材测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-digest.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：粗粒度优先、同一时段不重复、最早的粗节点可以起点早于
// 用户上次发言、没有节点时退回原文、概要截到 200 字。
import {
  DIGEST_MAX_CHARS, clampDigest, formatDigestMaterials, selectDigestNodes,
} from '../src/memory/group-digest'
import { Granularity, SatDialogue, SatMemory } from '../src/memory/schema'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

/** +08 时区的本地时间 -> UTC Date */
const local = (month: number, day: number, hour = 4, minute = 0) =>
  new Date(Date.UTC(2026, month - 1, day, hour - 8, minute))

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

/** 按 (after, to] 过滤，和 MemoryRepository.getMemoriesInRange 的语义一致 */
function fetcher(nodes: SatMemory[]) {
  return async (level: Granularity, after: Date, to: Date) =>
    nodes
      .filter(item => item.granularity === level)
      .filter(item => +item.periodEnd > +after && +item.periodEnd <= +to)
      .sort((a, b) => +a.periodEnd - +b.periodEnd)
}

async function main() {
  // ---------- 场景 1：粗粒度优先，细粒度只补空档 ----------
  {
    const from = local(10, 15, 12)
    const now = local(11, 14, 21)
    const nodes = [
      node('month', local(10, 1), local(11, 1), '十月总结'),
      // 十一月还没闭合，不该有月节点；即使有，periodEnd 也在 now 之后
      node('month', local(11, 1), local(12, 1), '十一月总结'),
      node('week', local(11, 2), local(11, 9), '第一周'),
      node('week', local(11, 9), local(11, 16), '第二周'),
      node('day', local(11, 9), local(11, 10), '周日'),
      node('day', local(11, 13), local(11, 14), '周五'),
      node('topic', local(11, 14, 10), local(11, 14, 12), '今天的话题'),
    ]
    const { nodes: picked, cursor } = await selectDigestNodes(from, now, fetcher(nodes))
    const kinds = picked.map(item => item.granularity)
    assert(
      kinds.join(',') === 'month,week,day,day,topic',
      `按 月→周→日→话题 的顺序选材（实际 ${kinds.join(',')}）`,
    )
    assert(!picked.some(item => item.content === '十一月总结'), '未闭合的周期不选')
    assert(!picked.some(item => item.content === '第二周'), '超出当前时间的周期不选')
    assert(
      picked.every((item, i) => i === 0 || +item.periodEnd > +picked[i - 1].periodEnd),
      '选出的节点按时间严格递增，不重复覆盖同一时段',
    )
    assert(+cursor === +local(11, 14, 12), '游标停在最后一个节点的末尾')
  }

  // ---------- 场景 2：最早的粗节点可以起点早于上次发言 ----------
  {
    const from = local(11, 13, 12)
    const now = local(11, 14, 21)
    const day = node('day', local(11, 13), local(11, 14), '昨天的总结')
    const { nodes: picked } = await selectDigestNodes(from, now, fetcher([day]))
    assert(picked.length === 1, '包含跨越发言时间的日节点')
    assert(+picked[0].periodStart < +from, '该节点的起点早于上次发言，仍然纳入')
  }

  // ---------- 场景 3：没有归档节点时游标不动，交给原文 ----------
  {
    const from = local(11, 14, 10)
    const now = local(11, 14, 21)
    const { nodes: picked, cursor } = await selectDigestNodes(from, now, fetcher([]))
    assert(picked.length === 0, '没有节点时不选材')
    assert(+cursor === +from, '游标停在起点，原始消息从上次发言开始取')
  }

  // ---------- 场景 4：材料格式 ----------
  {
    const day = node('day', local(11, 13), local(11, 14), '大家在聊新游戏')
    const raw: SatDialogue[] = [{
      id: 1,
      scopeId: 'g:123',
      userId: 'u1',
      username: '灵梦',
      kind: 'ambient',
      userContent: '有人玩过吗',
      aiContent: '',
      createdAt: local(11, 14, 20),
    }]
    const text = formatDigestMaterials([day], raw, 8)
    assert(text.includes('【日总结 2026/11/13 04:00 ~ 2026/11/14 04:00】'), '记忆节点带粒度与时间范围')
    assert(text.includes('【尚未归档的原始消息】'), '未归档部分单独标注')
    assert(text.includes('用户（灵梦）说「有人玩过吗」'), '原始消息沿用结构化发言人标签')
  }

  // ---------- 场景 5：概要截断 ----------
  {
    const long = '这是一段很长的概要。'.repeat(40)
    const clamped = clampDigest(long)
    assert(clamped.length === DIGEST_MAX_CHARS, `概要截到 ${DIGEST_MAX_CHARS} 字（实际 ${clamped.length}）`)

    const messy = '```text\n第一行\n第二行\n```'
    assert(clampDigest(messy) === '第一行 第二行', '去掉代码块并压平换行')

    const short = '就这些'
    assert(clampDigest(short) === short, '不超过上限时原样返回')
  }

  console.log('\n全部通过')
  // 显式退出：esbuild-register / koishi 可能留下活动句柄，不退出会让脚本挂住
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
