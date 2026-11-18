// 群聊「群日报」逻辑测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-daily-digest.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：只选话题记忆（不往粗粒度上找）、游标推进到最后一个话题末尾；
// 报纸栏目能从模型输出里拆出来；正文保留段落、超长时在句末截断；
// 模型改写的昵称仍能映射回群友；最喜欢的三档按词归一化。
import {
  DAILY_DIGEST_MAX_CHARS, DigestParticipant, buildQuoteCandidates, clampDailyDigest,
  formatQuoteCandidates, parseReportSections, quoteCandidateCount,
  resolveDigestFavorite, resolvePeriodOfKind, resolveReportPeriod, selectDigestNodes,
} from '../src/memory/group-digest'
import { GROUP_REPORT_SPECS, resolveFavoriteTier } from '../src/memory/report-specs'
import { buildGroupDailyDigestTask, buildGroupReportTask } from '../src/memory/prompts'
import { renderReportHtml } from '../src/report-card'
import { Granularity, SatDialogue, SatMemory } from '../src/memory/schema'

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
    assert(+weekly.from === +localAt(2026, 11, 9, 0), '周报从上周一 00:00 开始')
    assert(+weekly.to === +localAt(2026, 11, 16, 0), '周报到本周一 00:00 结束')

    const weeklyLater = period(2026, 11, 16, 4, 30)
    assert(weeklyLater.kind === 'weekly', '周一 04:00 后仍然是同一份周报')
    assert(+weeklyLater.from === +localAt(2026, 11, 9, 0), '周报范围不随执行时刻变化')

    const sundayLate = period(2026, 11, 15, 23, 59)
    assert(sundayLate.kind === 'daily', '周日 23:59 仍然是日报')

    // 日报固定取前一天 00:00 ~ 当天 00:00，和上次报告时间无关
    const daily = period(2026, 11, 17, 0, 30)
    assert(daily.kind === 'daily', '普通工作日生成日报')
    assert(+daily.from === +localAt(2026, 11, 16, 0), '日报从前一天 00:00 开始')
    assert(+daily.to === +localAt(2026, 11, 17, 0), '日报到当天 00:00 结束')

    const dailyLate = period(2026, 11, 17, 23, 59)
    assert(+dailyLate.from === +localAt(2026, 11, 16, 0) && +dailyLate.to === +localAt(2026, 11, 17, 0),
      '日报范围不随执行时刻变化')

    const monthly = period(2026, 12, 1, 0, 30)
    assert(monthly.kind === 'monthly', '每月 1 日零点后生成月报')
    assert(+monthly.from === +localAt(2026, 11, 1, 0), '月报从上一个自然月 1 日 00:00 开始')
    assert(+monthly.to === +localAt(2026, 12, 1, 0), '月报到本月 1 日 00:00 结束')

    const monthlyOverWeekly = period(2025, 12, 1, 0, 30)
    assert(monthlyOverWeekly.kind === 'monthly', '1 号正好是周一时，月报优先于周报')

    const yearly = period(2027, 1, 1, 0, 30)
    assert(yearly.kind === 'yearly', '1 月 1 日零点后生成年报')
    assert(+yearly.from === +localAt(2026, 1, 1, 0), '年报从去年 1 月 1 日 00:00 开始')
    assert(+yearly.to === +localAt(2027, 1, 1, 0), '年报到现在 1 月 1 日 00:00 结束')

    const yearlyOverAll = period(2024, 1, 1, 0, 30)
    assert(yearlyOverAll.kind === 'yearly', '1 月 1 日正好是周一时，年报优先于月报/周报')

    const lastYearEnd = period(2026, 12, 31, 23, 59)
    assert(lastYearEnd.kind === 'daily', '跨年前最后一刻仍是日报')

    assert(GROUP_REPORT_SPECS.daily.levels.join(',') === 'topic', '日报最高话题粒度')
    assert(GROUP_REPORT_SPECS.weekly.levels.join(',') === 'day,topic', '周报最高日粒度')
    assert(GROUP_REPORT_SPECS.monthly.levels.join(',') === 'week,day,topic', '月报最高周粒度')
    assert(GROUP_REPORT_SPECS.yearly.levels.join(',') === 'month,week,day,topic', '年报最高月粒度')

    // 预览用的强制周期：月/年取当前所在周期，周取最近一个已闭合的周一
    const forcedMonthly = resolvePeriodOfKind('monthly', localAt(2026, 11, 18, 12), 8)
    assert(+forcedMonthly.from === +localAt(2026, 11, 1, 0) && +forcedMonthly.to === +localAt(2026, 12, 1, 0),
      '强制月报取当前自然月')
    const forcedYearly = resolvePeriodOfKind('yearly', localAt(2026, 11, 18, 12), 8)
    assert(+forcedYearly.from === +localAt(2026, 1, 1, 0) && +forcedYearly.to === +localAt(2027, 1, 1, 0),
      '强制年报取当前自然年')
    const forcedWeekly = resolvePeriodOfKind('weekly', localAt(2026, 11, 18, 12), 8)
    assert(+forcedWeekly.from === +localAt(2026, 11, 9, 0) && +forcedWeekly.to === +localAt(2026, 11, 16, 0),
      '强制周报取最近一个已闭合的周一')
    const forcedDaily = resolvePeriodOfKind('daily', localAt(2026, 11, 18, 12), 8)
    assert(+forcedDaily.from === +localAt(2026, 11, 17, 0) && +forcedDaily.to === +localAt(2026, 11, 18, 0),
      '强制日报也取前一天 00:00 ~ 当天 00:00')
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

  // ---------- 场景 2：报纸分节 ----------
  {
    const full = parseReportSections(`【头条】昨夜群里下了一场猫
【导语】安静了两天，昨天忽然热闹起来。
【要闻】猫的政变｜第一段内容。
第二段内容。
【要闻】作业战争｜阿柴开始抄答案。
【金句】猫在键盘上睡着了 —— 小明｜这句最好笑
【金句】「作业写完了吗」 —— 小红
【活跃】小明｜今天最能聊
【点评】我的看法。
【热词】猫 / 作业 / 深夜
【今日最喜欢】小明｜非常喜欢｜因为那句猫睡键盘的话`)

    assert(full.structured, '完整栏目能被识别为结构化')
    assert(full.headline === '昨夜群里下了一场猫', '头条单独成栏')
    assert(full.lead === '安静了两天，昨天忽然热闹起来。', '导语单独成栏')
    assert(full.news.length === 2, `多条要闻按条拆开（实际 ${full.news.length}）`)
    assert(full.news[0].title === '猫的政变', '要闻拆出小标题')
    assert(full.news[0].body === '第一段内容。\n第二段内容。', '要闻保留段落换行')
    assert(full.news[1].title === '作业战争' && full.news[1].body === '阿柴开始抄答案。', '第二条要闻独立')
    assert(full.quotes.length === 2, `金句按条拆开（实际 ${full.quotes.length}）`)
    assert(full.quotes[0].text === '猫在键盘上睡着了' && full.quotes[0].speaker === '小明',
      '金句拆出原话与发言人')
    assert(full.quotes[0].comment === '这句最好笑', '金句拆出一句点评')
    assert(full.quotes[1].text === '作业写完了吗', '金句外层的「」会被剥掉')
    assert(full.quotes[1].comment === '', '没写点评时留空')
    assert(full.comment === '我的看法。', '点评单独成栏')
    assert(full.hotwords.join(',') === '猫,作业,深夜', '热词按分隔符拆成标签')
    assert(full.ranking[0]?.name === '小明' && full.ranking[0]?.comment === '今天最能聊',
      '活跃榜拆出昵称与点评')

    // 模型常把多条活跃榜写在同一个【活跃】下面，必须按行拆开
    const multiRank = parseReportSections(`【要闻】正文。
【活跃】小明｜点评一
小红｜点评二
3. 阿柴｜点评三`)
    assert(multiRank.ranking.length === 3, `同一栏目的多条活跃榜按行拆开（实际 ${multiRank.ranking.length}）`)
    assert(multiRank.ranking[1]?.name === '小红' && multiRank.ranking[1]?.comment === '点评二',
      '第二条活跃榜独立')
    assert(multiRank.ranking[2]?.name === '阿柴', '活跃榜行首序号会被剥掉')
    assert(full.favorite?.name === '小明', '最喜欢拆出昵称')
    assert(full.favorite?.tier === '非常喜欢' && full.favorite?.delta === 30,
      '最喜欢拆出档位')
    assert(full.favorite?.reason === '那句猫睡键盘的话', '最喜欢拆出理由并去掉「因为」')

    // 正文另起一行、栏目用冒号，都要能认
    const colon = parseReportSections('头条：标题\n要闻：正文内容。\n点评：点评内容。')
    assert(colon.structured && colon.headline === '标题', '「头条：」写法也能识别')
    assert(colon.news[0]?.body === '正文内容。' && colon.comment === '点评内容。', '冒号栏目的正文归位')
    assert(colon.news[0]?.title === '', '没有小标题的要闻整段当正文')

    // 模型也常写成「小标题独占一行，正文另起」
    const lineTitle = parseReportSections('【要闻】宿舍噪音成话题\n一？？芙兰室友大声打游戏。\n【点评】点评。')
    assert(lineTitle.news[0]?.title === '宿舍噪音成话题', '首行短句也能当小标题')
    assert(lineTitle.news[0]?.body === '一？？芙兰室友大声打游戏。', '小标题之后的行归正文')

    const quoteLead = parseReportSections('【要闻】“杨浦体育大学你赢了”\n后面还有正文。\n【点评】点评。')
    assert(quoteLead.news[0]?.title === '', '引语开头的首行不当小标题')

    // 模型会把提示词里的占位词原样抄进正文开头
    const placeholder = parseReportSections('【要闻】标题｜正文\n真正的正文。\n【点评】点评。')
    assert(placeholder.news[0]?.body === '真正的正文。', '正文占位词会被去掉')
    const placeholder2 = parseReportSections('【要闻】标题｜具体内容\n真正的正文。\n【点评】点评。')
    assert(placeholder2.news[0]?.body === '真正的正文。', '具体内容占位词会被去掉')
    const placeholder3 = parseReportSections('【要闻】标题\n正文\n真正的正文。\n【点评】点评。')
    assert(placeholder3.news[0]?.body === '真正的正文。', '另起一行的正文占位词会被去掉')

    // 模型漏了档位时按默认档处理，不能把理由当成档位
    const noTier = parseReportSections('【要闻】正文。\n【今日最喜欢】小明｜因为他说了句好笑的话')
    assert(noTier.favorite?.tier === '喜欢' && noTier.favorite?.delta === 20,
      '漏写档位时退回「喜欢 +20」')
    assert(noTier.favorite?.reason === '他说了句好笑的话', '漏写档位时第二段仍算理由')

    // 没有标记时整段原文作为回退
    const plain = parseReportSections('今天群里很热闹。\n\n没有栏目标记。')
    assert(!plain.structured, '没有栏目标记时不标为结构化')
    assert(plain.fallback.includes('今天群里很热闹'), '回退正文保留原文')

    // 缺头条时用要闻第一句顶上
    const noHeadline = parseReportSections('【要闻】昨夜群里下了一场猫。第二句。\n【点评】点评。')
    assert(noHeadline.structured && noHeadline.headline === '昨夜群里下了一场猫',
      '缺头条时用要闻第一句兜底')
  }

  // ---------- 场景 2.5：最喜欢档位 ----------
  {
    assert(resolveFavoriteTier('有点喜欢').delta === 10, '有点喜欢 +10')
    assert(resolveFavoriteTier('喜欢').delta === 20, '喜欢 +20')
    assert(resolveFavoriteTier('非常喜欢').delta === 30, '非常喜欢 +30')
    assert(resolveFavoriteTier('超级喜欢').delta === 30, '超级喜欢归到最高档')
    assert(resolveFavoriteTier('略有好感').delta === 10, '略带限定词归到最低档')
    assert(resolveFavoriteTier('').delta === 20, '没写档位时默认 +20')
    assert(resolveFavoriteTier('看心情').delta === 20, '无法识别时退回中间档')
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
    const daily = buildGroupDailyDigestTask('材料内容', '11-15 04:00 ~ 11-16 04:00', ['小明', '小红'], {
      ranking: [{ name: '小明', count: 132 }, { name: '小红', count: 87 }],
      quoteText: '11/18 10:00 小明：这句话真好笑啊（复读 3 次）',
    })[0].content
    assert(daily.includes('心眼报'), '提示词带上报纸刊名')
    assert(daily.includes('小明、小红'), '提示词列出候选群友')
    assert(daily.includes('1. 小明'), '提示词给出活跃榜候选顺序')
    assert(!daily.includes('132 条'), '提示词不再暴露发言条数')
    for (const section of ['【头条】', '【导语】', '【要闻】', '【金句】', '【活跃】', '【点评】', '【热词】']) {
      assert(daily.includes(section), `提示词要求 ${section} 栏目`)
    }
    assert(daily.includes('【今日最喜欢】'), '提示词要求输出今日最喜欢')
    assert(daily.includes('小标题｜具体内容'), '提示词要求要闻用小标题｜具体内容')
    assert(daily.includes('不要出现你自己的态度'), '标题要求只做客观概括')
    assert(daily.includes('｜一句点评'), '提示词要求金句带一句点评')
    assert(daily.includes('不要选你自己的话'), '提示词禁止金句选自己')
    assert(daily.includes('金句候选'), '提示词附带金句候选列表')
    assert(daily.includes('只能从上面的「金句候选」里选'), '金句只能从候选列表里选')
    assert(daily.includes('1200-1500 字'), '日报篇幅 1200-1500 字')
    assert(daily.includes('有点喜欢') && daily.includes('非常喜欢'), '提示词限定三档')
    assert(daily.includes('不要每期都给最高档'), '提示词要求档位不要总是最高')
    assert(daily.includes('不要因为某人发言多'), '选人只看质量和喜好，不看发言频率')
    assert(daily.includes('不要提条数、排行、话痨、活跃度'), '理由不能写发言频率')
    assert(!daily.includes('提问者'), '日报不再标注提问者')

    const weekly = buildGroupReportTask('材料内容', '11-09 04:00 ~ 11-16 04:00', ['小明'], GROUP_REPORT_SPECS.weekly)[0].content
    assert(weekly.includes('群周报'), '周报提示词使用周报标题')
    assert(weekly.includes('2000-2500 字'), '周报篇幅 2000-2500 字')
    assert(weekly.includes('【本期最喜欢】'), '周报使用本期最喜欢标记')
    assert(weekly.includes('过去一周'), '周报说明过去一周')

    const monthly = buildGroupReportTask('材料内容', '11-01 04:00 ~ 12-01 04:00', ['小明'], GROUP_REPORT_SPECS.monthly)[0].content
    assert(monthly.includes('群月报'), '月报提示词使用月报标题')
    assert(monthly.includes('3000-3600 字'), '月报篇幅 3000-3600 字')
    assert(monthly.includes('上个月'), '月报说明上个月')

    const yearly = buildGroupReportTask('材料内容', '2026-01-01 04:00 ~ 2027-01-01 04:00', ['小明'], GROUP_REPORT_SPECS.yearly)[0].content
    assert(yearly.includes('群年报'), '年报提示词使用年报标题')
    assert(yearly.includes('4000-4800 字'), '年报篇幅 4000-4800 字')
    assert(yearly.includes('过去一年'), '年报说明过去一年')

    const repeat = buildGroupReportTask(
      '材料内容', '11-09 04:00 ~ 11-16 04:00', ['小明', '小红'], GROUP_REPORT_SPECS.weekly,
      { previousFavoriteName: '小明' },
    )[0].content
    assert(repeat.includes('上一期最喜欢的是 小明'), '提示词提醒上一期最喜欢的人')
    assert(repeat.includes('本期不能重复选同一个人'), '提示词要求本期不能重复选')

    const empty = buildGroupReportTask(
      '材料内容', '11-15 04:00 ~ 11-16 04:00', [], GROUP_REPORT_SPECS.daily,
      { previousFavoriteName: '小明' },
    )[0].content
    assert(empty.includes('本期没有可选的群友'), '候选列表为空时明确提示')
    assert(empty.includes('不要输出最喜欢这一栏'), '候选列表为空时要求跳过最喜欢')
    assert(empty.includes('不要输出活跃这一栏'), '没有活跃榜候选时不输出活跃栏目')
  }

  // ---------- 场景 6：报纸卡片 ----------
  {
    const sections = parseReportSections(`【头条】键盘上睡了一夜的猫
【导语】群里忽然热闹起来。
【要闻】猫的政变｜${'群里聊了很多事。'.repeat(30)}
【要闻】作业战争｜${'作业也聊了很多。'.repeat(20)}
【金句】它现在是我的输入法测试工程师 —— 小明｜这句最好笑
【活跃】小明｜全场节奏担当
【点评】本觉觉得很有意思。
【热词】猫 / 作业`)
    const hourly = new Array(24).fill(0)
    hourly[21] = 12
    hourly[22] = 40
    hourly[23] = 8
    const html = renderReportHtml({
      masthead: '心眼报',
      kindTitle: '群日报',
      dateLabel: '2026.11.18',
      issue: 7,
      range: '2026/11/17 00:00 ~ 2026/11/18 00:00',
      stats: { messages: 1672, nodes: 13, participants: 42 },
      hourly,
      sections,
      ranking: [{ name: '<小明>', count: 132, comment: '全场节奏担当' }],
      rankingLabel: '活跃榜',
      footerName: '觉',
      footerTime: '2026/11/18 00:05',
    })
    assert(html.includes('心眼报') && html.includes('第 7 期'), '报头带刊名与期号')
    assert(html.includes('键盘上睡了一夜的猫'), '卡片包含头条')
    assert(html.includes('本期热词'), '热词在顶栏')
    assert(!html.includes('class="seal"'), '不再渲染红印章')
    assert(html.includes('24h 活跃轨迹'), '卡片包含 24h 活跃轨迹')
    assert(html.includes('峰值 22 时 · 40 条'), '活跃轨迹标出峰值')
    assert(html.includes('&lt;小明&gt;'), '昵称里的尖括号被转义')
    assert(html.includes('class="news-grid"'), '要闻使用卡片网格')
    assert(html.includes('猫的政变') && html.includes('作业战争'), '多条要闻都渲染')
    assert(html.includes('qcomment'), '金句带一句点评')
    assert(html.includes('—— 觉'), '点评落款使用昵称')
    assert(html.includes('rank-bar'), '活跃榜渲染成条形')

    const fallback = renderReportHtml({
      masthead: '心眼报',
      kindTitle: '群日报',
      dateLabel: '2026.11.18',
      issue: 1,
      range: '',
      stats: { messages: 1, nodes: 0, participants: 1 },
      hourly: new Array(24).fill(0),
      sections: parseReportSections('没有栏目的一段纯文本。'),
      ranking: [],
      rankingLabel: '活跃榜',
      footerName: '觉',
      footerTime: '2026/11/18 00:05',
    })
    assert(fallback.includes('class="fallback"'), '没有栏目标记时退回单块正文')
    assert(!fallback.includes('class="headline"'), '回退时不渲染头条')
  }

  // ---------- 场景 7：金句候选 ----------
  {
    assert(quoteCandidateCount(1500) === 150, '1500 条消息取 150 条候选')
    assert(quoteCandidateCount(100) < 150 && quoteCandidateCount(10000) > 150,
      '候选数随总数按对数增长')

    const row = (id: number, userId: string, username: string, content: string, minute: number): SatDialogue => ({
      id,
      scopeId: 'g:123',
      userId,
      username,
      kind: 'ambient',
      userContent: content,
      aiContent: '',
      createdAt: new Date(Date.UTC(2026, 10, 18, 2, minute)),
    })
    const rows = [
      row(1, 'u1', '小明', '这句话真好笑啊', 0),
      row(2, 'u2', '小红', '这句话真好笑啊', 1),
      row(3, 'u3', '阿柴', '这句话真好笑啊', 2),
      row(4, 'u2', '小红', '另一个句子也很不错', 30),
      row(5, 'u4', '群友', '[图片]', 40),
      { ...row(6, 'bot', '机器人', '你自己的话', 41), kind: 'ambient-bot' },
    ]
    const candidates = buildQuoteCandidates(
      rows, 100, new Date(Date.UTC(2026, 10, 18, 0)), new Date(Date.UTC(2026, 10, 19, 0)),
    )
    const repeated = candidates.find(item => item.text === '这句话真好笑啊')
    assert(repeated?.count === 3, '相同内容合并并记录复读次数')
    assert(repeated?.speaker === '小明', '发言人取第一个说这句话的群友')
    assert(!candidates.some(item => item.text === '[图片]'), '图片消息不进候选')
    assert(!candidates.some(item => item.text === '你自己的话'), '机器人消息不进候选')
    const text = formatQuoteCandidates(candidates, 8)
    assert(text.includes('（复读 3 次）'), '候选文本标注复读次数')
  }

  console.log('\n全部通过')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
