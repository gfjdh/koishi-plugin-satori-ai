// 群聊「群日报」逻辑测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-daily-digest.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：只选话题记忆（不往粗粒度上找）、游标推进到最后一个话题末尾；
// 「今日最喜欢」标记能从正文里拆出来；正文保留段落、超长时在句末截断；
// 模型改写的昵称仍能映射回群友。
import {
  DAILY_DIGEST_MAX_CHARS, DigestParticipant, clampDailyDigest, parseDailyDigest,
  resolveDigestFavorite, resolveReportPeriod, selectDigestNodes,
} from '../src/memory/group-digest'
import { GROUP_REPORT_SPECS } from '../src/memory/report-specs'
import { buildGroupDailyDigestTask, buildGroupReportTask } from '../src/memory/prompts'
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

  // ---------- 场景 1.5：报告类型与自然周期 ----------
  {
    const period = (y: number, m: number, d: number, hour: number, minute = 0) =>
      resolveReportPeriod(localAt(y, m, d, hour, minute), 8)

    // 2026-11-16 是周一；零点之后就算周一，不再等 04:00
    const weekly = period(2026, 11, 16, 0, 30)
    assert(weekly.kind === 'weekly', '周一 00:00 后生成周报')
    assert(+weekly.from! === +localAt(2026, 11, 9, 0), '周报从上周一 00:00 开始')
    assert(+weekly.to === +localAt(2026, 11, 16, 0), '周报到本周一 00:00 结束')

    const weeklyLater = period(2026, 11, 16, 4, 30)
    assert(weeklyLater.kind === 'weekly', '周一 04:00 后仍然是同一份周报')
    assert(+weeklyLater.from! === +localAt(2026, 11, 9, 0), '周报范围不随执行时刻变化')

    const sundayLate = period(2026, 11, 15, 23, 59)
    assert(sundayLate.kind === 'daily', '周日 23:59 仍然是日报')

    const daily = period(2026, 11, 17, 0, 30)
    assert(daily.kind === 'daily' && daily.from === null, '普通工作日生成日报，起点交给游标')

    const monthly = period(2026, 12, 1, 0, 30)
    assert(monthly.kind === 'monthly', '每月 1 日零点后生成月报')
    assert(+monthly.from! === +localAt(2026, 11, 1, 0), '月报从上一个自然月 1 日 00:00 开始')
    assert(+monthly.to === +localAt(2026, 12, 1, 0), '月报到本月 1 日 00:00 结束')

    const monthlyOverWeekly = period(2025, 12, 1, 0, 30)
    assert(monthlyOverWeekly.kind === 'monthly', '1 号正好是周一时，月报优先于周报')

    const yearly = period(2027, 1, 1, 0, 30)
    assert(yearly.kind === 'yearly', '1 月 1 日零点后生成年报')
    assert(+yearly.from! === +localAt(2026, 1, 1, 0), '年报从去年 1 月 1 日 00:00 开始')
    assert(+yearly.to === +localAt(2027, 1, 1, 0), '年报到现在 1 月 1 日 00:00 结束')

    const yearlyOverAll = period(2024, 1, 1, 0, 30)
    assert(yearlyOverAll.kind === 'yearly', '1 月 1 日正好是周一时，年报优先于月报/周报')

    const lastYearEnd = period(2026, 12, 31, 23, 59)
    assert(lastYearEnd.kind === 'daily', '跨年前最后一刻仍是日报')

    assert(GROUP_REPORT_SPECS.daily.levels.join(',') === 'topic', '日报最高话题粒度')
    assert(GROUP_REPORT_SPECS.weekly.levels.join(',') === 'day,topic', '周报最高日粒度')
    assert(GROUP_REPORT_SPECS.monthly.levels.join(',') === 'week,day,topic', '月报最高周粒度')
    assert(GROUP_REPORT_SPECS.yearly.levels.join(',') === 'month,week,day,topic', '年报最高月粒度')
  }

  // ---------- 场景 1.6：周报选材只到日粒度 ----------
  {
    const from = localAt(2026, 11, 9, 0)
    const to = localAt(2026, 11, 16, 0)
    const nodes = [
      node('month', localAt(2026, 11, 1, 4), localAt(2026, 12, 1, 4), '月总结'),
      node('week', localAt(2026, 11, 9, 4), localAt(2026, 11, 16, 4), '周总结'),
      node('day', localAt(2026, 11, 14, 4), localAt(2026, 11, 15, 4), '日总结'),
      node('topic', localAt(2026, 11, 15, 20), localAt(2026, 11, 15, 23), '话题'),
    ]
    const { nodes: picked } = await selectDigestNodes(
      from, to, fetcher(nodes), GROUP_REPORT_SPECS.weekly.levels,
    )
    assert(picked.every(item => item.granularity === 'day' || item.granularity === 'topic'),
      '周报不会选月/周节点')
    assert(picked.map(item => item.content).join(',') === '日总结,话题',
      '周报先取日节点，再用话题补空档')
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

    const periodic = parseDailyDigest('一周回顾。\n【本期最喜欢】安定')
    assert(periodic.favorite === '安定', '「【本期最喜欢】」也能解析')
    assert(periodic.body === '一周回顾。', '本期标记行从正文里去掉')

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

    const weekly = buildGroupReportTask('材料内容', '11-09 04:00 ~ 11-16 04:00', ['小明'], GROUP_REPORT_SPECS.weekly)[0].content
    assert(weekly.includes('群周报'), '周报提示词使用周报标题')
    assert(weekly.includes('1800-2200 字'), '周报篇幅 1800-2200 字')
    assert(weekly.includes('【本期最喜欢】'), '周报使用本期最喜欢标记')
    assert(weekly.includes('过去一周'), '周报说明过去一周')

    const monthly = buildGroupReportTask('材料内容', '11-01 04:00 ~ 12-01 04:00', ['小明'], GROUP_REPORT_SPECS.monthly)[0].content
    assert(monthly.includes('群月报'), '月报提示词使用月报标题')
    assert(monthly.includes('2700-3300 字'), '月报篇幅 2700-3300 字')
    assert(monthly.includes('上个月'), '月报说明上个月')

    const yearly = buildGroupReportTask('材料内容', '2026-01-01 04:00 ~ 2027-01-01 04:00', ['小明'], GROUP_REPORT_SPECS.yearly)[0].content
    assert(yearly.includes('群年报'), '年报提示词使用年报标题')
    assert(yearly.includes('3600-4400 字'), '年报篇幅 3600-4400 字')
    assert(yearly.includes('过去一年'), '年报说明过去一年')

    const repeat = buildGroupReportTask(
      '材料内容', '11-09 04:00 ~ 11-16 04:00', ['小明', '小红'], GROUP_REPORT_SPECS.weekly, '小明',
    )[0].content
    assert(repeat.includes('上一期最喜欢的是 小明'), '提示词提醒上一期最喜欢的人')
    assert(repeat.includes('本期不能重复选同一个人'), '提示词要求本期不能重复选')

    const empty = buildGroupReportTask(
      '材料内容', '11-15 04:00 ~ 11-16 04:00', [], GROUP_REPORT_SPECS.daily, '小明',
    )[0].content
    assert(empty.includes('本期没有可选的群友'), '候选列表为空时明确提示')
    assert(empty.includes('跳过最喜欢标记'), '候选列表为空时要求跳过标记')
  }

  console.log('\n全部通过')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
