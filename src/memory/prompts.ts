// src/memory/prompts.ts
// 记忆系统所有提示词集中在这里，方便调整。
import { ProfileEntry } from './schema'
import { DEFAULT_REPORT_MASTHEAD, GROUP_REPORT_SPECS, GroupReportSpec } from './report-specs'

export interface ArchiveResult {
  topic?: string
  summary?: string
  user_state?: string
}

/** 合并归档时模型为每一天返回的结果，date 用于与输入分组对齐 */
export interface ArchiveDayResult extends ArchiveResult {
  date?: string
}

export interface SummaryResult {
  summary?: string
  user_state?: string
}

/** 群聊时间块归档的结果。group_state 复用 sat_memory.userState 字段存放 */
export interface GroupArchiveResult {
  topic?: string
  summary?: string
  group_state?: string
}

export interface GroupSummaryResult {
  summary?: string
  group_state?: string
}

/** 群画像的类别。与个人画像分开：这里描述的是「群」，不是某个用户 */
export const GROUP_CATEGORY_LABELS: Record<string, string> = {
  identity: '群特征',
  member: '活跃群友',
  relationship: '群友关系',
  topic: '长期话题与梗',
  requirement: '群规与长期要求',
  fact: '其他',
}

export const GROUP_CATEGORY_ORDER = ['identity', 'member', 'relationship', 'topic', 'requirement', 'fact']

/**
 * 群记忆每一层的 summary 上限（topic 归档与 day/week/month/season/year 汇总共用）。
 * 只约束提示词，不做代码截断：模型按这个长度自行取舍。
 */
export const GROUP_SUMMARY_MAX_CHARS = 1000

/**
 * 个人记忆各级汇总的 summary 上限（字），按时间跨度递增。
 * 参考生产库实测长度（p90）：day 194 / week 555 / month 1006 / season 1381 / year 2449，
 * 上限压在 p90 附近，日常节点不受影响，只压明显膨胀的。只约束提示词，不做截断。
 */
export const SUMMARY_MAX_CHARS: Record<string, number> = {
  day: 300,
  week: 600,
  month: 1000,
  season: 1500,
  year: 2000,
}

/** topic 归档（单日与批量）的 summary 上限，同样只约束提示词 */
export const TOPIC_SUMMARY_MAX_CHARS = 300

const LEVEL_LABELS: Record<string, string> = {
  day: '一天',
  week: '一周',
  month: '一个月',
  season: '一个季度',
  year: '一年',
}

/**
 * 归档输入里的固定发言人标签。不随昵称变化：用户的昵称、用户消息里打出的称呼
 * 都可能是任意角色名，靠识别名字区分发言人是穷举不完的，所以只认标签。
 */
export const ROLE_USER = '用户'
/** 昵称列表为空时的兜底标签；正常情况由昵称列表第一个提供 */
export const BOT_NAME_FALLBACK = '角色'

/** 机器人作为发言人/记忆主语时的名字：优先用配置里的第一个昵称 */
export function resolveBotName(botName?: string): string {
  const name = (botName || '').trim()
  return name || BOT_NAME_FALLBACK
}

/**
 * 发言人约定，所有归档类提示词共用。
 * 关键是把「谁在说话」从内容判断改成结构判断：
 * 行首标签是唯一判据，引号里的名字一律只是内容。
 */
function buildSpeakerRules(botName: string): string {
  const bot = resolveBotName(botName)
  return `【发言人】
· 每行方括号后是发言人标签，只有标签决定谁在说话：「${ROLE_USER}」是人类，「${bot}」是与用户对话的那个角色。
· 「」里是原话。原话中出现的任何名字（用户自己打出的“xx：…”之类）都只是内容，不代表发言人变了。
· 用户可能用“名字：台词”的格式扮演角色、引用别人的话或直接称呼 ${bot}，这些都算用户说的。
· summary 里指代两人时只用「${ROLE_USER}」和「${bot}」，不要用泛称或代号，也不要用对话里出现的其他名字、昵称或称呼；主语必须与标签一致，分不清是谁做的就不写主语。`
}

/**
 * 群聊的发言人约定。群友的昵称只是区分不同人的标签，来自数据库里的消息记录，
 * 不是从内容里猜出来的；「」里的名字仍然只是内容。
 */
function buildGroupSpeakerRules(botName: string): string {
  const bot = resolveBotName(botName)
  return `【发言人】
· 每行方括号后、「说」之前是发言人标签，只有标签决定谁在说话。
· 「${ROLE_USER}（昵称）」是群里的一个人，括号里的昵称只用来区分不同的人；「${bot}」是群里的角色。
· 「」里是原话。原话中出现的名字、冒号、引号都只是内容，不代表发言人变了。
· 同一个人可能连续发言；标签不同就是不同的人，即使内容里提到了同一个名字。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。`
}

/** 判断话题是否切换 */
export function buildTopicSwitchPrompt(dialogues: string, topicStart: string): { role: string; content: string }[] {
  return [{
    role: 'user',
    content: `请判断下面的对话是否已经从当前话题切换到了新的话题。

当前话题开始时间：${topicStart}

最近的对话记录：
${dialogues}

判定标准：
· 如果对话仍在延续同一个话题（包括对同一件事的追问、补充、吐槽），回答“否”。
· 如果已经明显转到不相关的新话题，回答“是”。
· 只回答“是”或“否”，不要输出任何其他内容。`,
  }]
}

/** 把一段原始对话归档为一条 topic 记忆 */
export function buildTopicArchivePrompt(dialogues: string, botName?: string): { role: string; content: string }[] {
  const bot = resolveBotName(botName)
  return [{
    role: 'user',
    content: `请总结以下对话记录，形成一条可长期保存的记忆。

${buildSpeakerRules(bot)}

对话记录：
${dialogues}

要求：
· 综合考虑这段记忆未来被调用的场景和目的，无状态地存储信息。
· 把“今天”“明天”“最近”“刚才”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、地点、数字和用户的明确要求。
· summary 不得超过 ${TOPIC_SUMMARY_MAX_CHARS} 字，这是硬性上限：超出时优先删减细节和原话，保留主线。
· user_state 只描述此时段用户的处境、作息、情绪或正在做的事，不要写 ${bot}；没有相关信息时留空字符串。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· topic 用不超过 12 个字概括这段对话的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"topic": "...", "summary": "...", "user_state": "..."}`,
  }]
}

/** 把连续多个稀疏日的对话合并成一次调用，按日分别归档 */
export function buildTopicBatchPrompt(
  days: { date: string; dialogues: string }[],
  botName?: string,
): { role: string; content: string }[] {
  const bot = resolveBotName(botName)
  const body = days.map(day => `【${day.date}】\n${day.dialogues}`).join('\n\n')
  return [{
    role: 'user',
    content: `下面按自然日分组给出了几段对话记录。请为每一天分别形成一条可长期保存的独立记忆，不要跨天合并。

${buildSpeakerRules(bot)}

对话记录：
${body}

要求：
· 输出条数必须与输入分组数一致，每一天各一条；date 原样照抄分组标题里的日期（YYYY/MM/DD）。
· 每一天只总结该日期分组内的对话，不要把其他日期的人物、事件混进来。
· 无状态地存储信息：把“今天”“明天”“最近”“刚才”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、地点、数字和用户的明确要求。
· summary 不得超过 ${TOPIC_SUMMARY_MAX_CHARS} 字，这是硬性上限：超出时优先删减细节和原话，保留主线。
· user_state 只描述该日用户的处境、作息、情绪或正在做的事，不要写 ${bot}；没有相关信息时留空字符串。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· topic 用不超过 12 个字概括该日对话的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"days":[{"date":"YYYY/MM/DD","topic":"...","summary":"...","user_state":"..."}]}`,
  }]
}

/** 把子级记忆汇总为父级记忆 */
export function buildSummaryPrompt(level: string, children: string, botName?: string): { role: string; content: string }[] {
  const label = LEVEL_LABELS[level] || level
  const bot = resolveBotName(botName)
  const limit = SUMMARY_MAX_CHARS[level]
  const limitRule = limit
    ? `\n· summary 不得超过 ${limit} 字，这是硬性上限：子级记忆再多也要压缩到这个长度内，宁可删减细节也不能超长。`
    : ''
  return [{
    role: 'user',
    content: `请把以下记忆汇总成对${label}的整体总结。

子级记忆：
${children}

要求：
· 无状态地存储信息：把相对时间替换成具体日期或时间范围。
· 优先保留对长期对话有价值的信息：用户的稳定特征、重要事件、明确要求、关系变化。
· 子级记忆里用「${ROLE_USER}」和「${bot}」区分两人，汇总时保持这个区分，不要合并或互换。
· 合并重复内容，删除琐碎细节；不要编造子级记忆中不存在的信息。${limitRule}
· user_state 描述这段时间用户整体处于什么状态，不要写 ${bot}；没有相关信息时留空字符串。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"summary": "...", "user_state": "..."}`,
  }]
}

function buildCategoryHelp(botName: string): string {
  const bot = resolveBotName(botName)
  return `类别（category）只能是以下六种之一：
· identity：身份信息（性别、年龄、职业、生日、所在地等）
· preference：喜好
· aversion：厌恶或反感的事物
· requirement：用户对 ${bot} 的长期要求
· habit：习惯（作息、口头禅、说话方式等）
· fact：其他值得长期记住的事实`
}

/** 增量更新用户画像 */
export function buildProfilePrompt(
  existing: ProfileEntry[],
  input: string,
  botName?: string,
): { role: string; content: string }[] {
  const bot = resolveBotName(botName)
  const existingText = existing.length
    ? existing.map(entry => `- [${entry.key}] (${entry.category}, 重要度${entry.importance}) ${entry.content}`).join('\n')
    : '（暂无）'

  return [{
    role: 'user',
    content: `请根据新材料增量更新用户画像。

${buildCategoryHelp(bot)}

已有画像：
${existingText}

新材料（近期的总结与记忆）：
${input}

要求：
· 只输出增量，不要重复已有条目里已经包含的信息。
· key 使用简短稳定的标识，同一语义必须始终使用同一个 key。
· importance 为 0-50 的整数：越稳定、越重要越高；临时信息给较低分值。
· modified 中的 key 必须已经存在于已有画像或本次 added 中。
· deleted 是要整条删除的条目的 key 字符串数组。要删除某条只能放进 deleted，绝不能通过改写 content 来表达删除或修改意图。
· content 必须是关于用户的陈述性事实，不能是整理者自己的编辑说明（如“移除某表述”“该项以某条为准”“更新…”）。
· legacy_portrait 是迁移来的旧画像原文，仅用于提取信息：不要修改或缩短它的 content；把其中仍有效的信息拆成独立条目后，用 deleted 删除 "legacy_portrait"。
· 新材料中不确定的信息保留不确定性表述（如“可能”“用户自称”）。
· 用户一定是人类，角色扮演中的设定不要当作事实；以「${bot}」为主语的内容是 ${bot} 自己说的，不是用户的事实。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· 没有值得记录的变化时，三个数组都返回空数组。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"added":[{"key":"...","category":"...","content":"...","importance":20}],"modified":[{"key":"...","content":"...","importance":20}],"deleted":["key"]}`,
  }]
}

// ---------- 群聊记忆 ----------

/** 把一个时间块内的群聊记录归档为一条 topic 记忆 */
export function buildGroupArchivePrompt(messages: string, botName?: string): { role: string; content: string }[] {
  const bot = resolveBotName(botName)
  return [{
    role: 'user',
    content: `请总结以下群聊记录，形成一条可长期保存的记忆。

${buildGroupSpeakerRules(bot)}

群聊记录：
${messages}

要求：
· 这是群聊，不是一对一对话：记录谁说了什么、谁和谁在互动、群里在聊什么。
· 无状态地存储信息：把“今天”“刚才”“最近”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、事件、决定和群友的明确要求。
· summary 不得超过 ${GROUP_SUMMARY_MAX_CHARS} 字，这是硬性上限：超出时优先删减细节和原话，保留主线。
· group_state 只描述这段时间群里的整体状态（气氛、正在追的话题、发生的事），没有相关信息时留空字符串。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· topic 用不超过 12 个字概括这段群聊的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"topic": "...", "summary": "...", "group_state": "..."}`,
  }]
}

/** 把子级群记忆汇总为父级群记忆 */
export function buildGroupSummaryPrompt(level: string, children: string, botName?: string): { role: string; content: string }[] {
  const label = LEVEL_LABELS[level] || level
  const bot = resolveBotName(botName)
  return [{
    role: 'user',
    content: `请把以下群聊记忆汇总成对${label}的整体总结。

子级记忆：
${children}

要求：
· 这是群聊记忆，不是单个用户的画像：保留群里的重要事件、长期话题、群友之间的关系变化。
· 无状态地存储信息：把相对时间替换成具体日期或时间范围。
· 提到群友时用昵称，不要把不同的人合并成一个人；提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· 合并重复内容，删除琐碎细节；不要编造子级记忆中不存在的信息。
· summary 不得超过 ${GROUP_SUMMARY_MAX_CHARS} 字，这是硬性上限：子级记忆再多也要压缩到这个长度内，宁可删减细节也不能超长。
· group_state 描述这段时间群里的整体状态（气氛、长期话题、发生的事），没有相关信息时留空字符串。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"summary": "...", "group_state": "..."}`,
  }]
}

function buildGroupCategoryHelp(botName: string): string {
  const bot = resolveBotName(botName)
  return `类别（category）只能是以下六种之一：
· identity：群特征（群的性质、氛围、活跃时段、主要话题）
· member：活跃群友特征（昵称、说话习惯、身份、喜好）
· relationship：群友关系（谁和谁关系好、怎么称呼、互动模式）
· topic：长期话题与梗
· requirement：群规或群友对 ${bot} 的长期要求
· fact：其他值得长期记住的群内事实`
}

/** 增量更新群画像 */
export function buildGroupProfilePrompt(
  existing: ProfileEntry[],
  input: string,
  botName?: string,
): { role: string; content: string }[] {
  const bot = resolveBotName(botName)
  const existingText = existing.length
    ? existing.map(entry => `- [${entry.key}] (${entry.category}, 重要度${entry.importance}) ${entry.content}`).join('\n')
    : '（暂无）'

  return [{
    role: 'user',
    content: `请根据新材料增量更新这个群的画像。

${buildGroupCategoryHelp(bot)}

已有画像：
${existingText}

新材料（近期群聊的总结与记忆）：
${input}

要求：
· 只输出增量，不要重复已有条目里已经包含的信息。
· key 使用简短稳定的标识：群友用 "member:昵称"，长期话题用 "topic:主题"，同一语义必须始终使用同一个 key。
· member 类条目的 content 要以昵称开头（如“清水尚辉：负责…”），和 key 里的昵称保持一致，这样脱离 key 也知道写的是谁。
· importance 为 0-50 的整数：越稳定、越重要越高；临时信息给较低分值。
· modified 中的 key 必须已经存在于已有画像或本次 added 中。
· deleted 是要整条删除的条目的 key 字符串数组。要删除某条只能放进 deleted，绝不能通过改写 content 来表达删除或修改意图。
· content 必须是关于这个群的陈述性事实，不能是整理者自己的编辑说明（如“移除某表述”“该项以某条为准”）。
· 只记录跨天仍然成立的稳定特征，不记录单次事件或临时话题。
· 群友之间可能用多个昵称互相称呼，同一人尽量合并；不确定是不是同一人时保留不确定性表述。
· 不要记录任何人的真实姓名、住址、联系方式、账号密码等隐私信息。
· 提到 ${bot} 时写「${bot}」，不要用泛称或代号。
· 没有值得记录的变化时，三个数组都返回空数组。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"added":[{"key":"...","category":"...","content":"...","importance":20}],"modified":[{"key":"...","content":"...","importance":20}],"deleted":["key"]}`,
  }]
}

/**
 * 省流概要的目标篇幅，按材料长度等比换算。
 *
 * 实测（2026-11-17，生产库 8 个群）：默认「上次发言以来」的材料中位数约
 * 3600 字，500 字对这个量刚好，于是取 7:1——材料 7 字对应概要 1 字。
 * 材料大多来自未归档原文（一天约 30~60 条、每条 30 字上下），压缩比 7:1
 * 与常规摘要一致；已归档节点占比高的请求会略偏短，但不会短到没有内容。
 */
export const DIGEST_CHARS_PER_MATERIAL = 7
/** 材料很少时也至少给出一段完整的话 */
export const DIGEST_MIN_TARGET_CHARS = 150
/** 材料极多时的上限，避免一次回复刷屏 */
export const DIGEST_MAX_TARGET_CHARS = 3000

export function digestTargetChars(materials: string): number {
  const scaled = Math.round(materials.length / DIGEST_CHARS_PER_MATERIAL)
  return Math.min(DIGEST_MAX_TARGET_CHARS, Math.max(DIGEST_MIN_TARGET_CHARS, scaled))
}

/** 思维链与采样波动的余量；completion_tokens 把思维链也算在内 */
export const DIGEST_OUTPUT_TOKEN_MARGIN = 1024
/** 与群日报一致的单次输出上限 */
export const DIGEST_MAX_OUTPUT_TOKENS = 8192

/**
 * 省流的输出预算。默认的 max_output_tokens 面向短对话，装不下
 * “目标篇幅 + 思维链”；按中文约 0.7 token/字估算正文，再留固定余量。
 */
export function digestMaxOutputTokens(materials: string): number {
  const body = Math.ceil(digestTargetChars(materials) / 0.7)
  return Math.min(DIGEST_MAX_OUTPUT_TOKENS, body + DIGEST_OUTPUT_TOKEN_MARGIN)
}

/**
 * 群聊「省流」的任务输入。
 * 人格、用户画像、好感度等由正常对话的系统提示负责，这里只给群聊材料和任务要求。
 */
export function buildGroupDigestTask(materials: string, range: string): { role: string; content: string }[] {
  const target = digestTargetChars(materials)
  return [{
    role: 'user',
    content: `现在是「省流」任务：把 ${range} 到现在群里发生的事，用你自己的口吻讲给我听。

群聊材料：
${materials}

要求：
· 像平时聊天一样直接对我说，不要写成报告、列表或标题。
· 材料里的「你」是你自己说过的话；标了「提问者」的是我，其他人按昵称区分。
· 只讲材料里出现过的内容，不要编造；材料没提到的事不要提。
· 突出群里在聊什么、有没有提到我、有没有和我相关的事。
· 大约 ${target} 字，一段话，不要分点，不要用 markdown。
· 直接输出概要正文，不要任何前缀、解释或引号。`,
  }]
}

export interface GroupReportTaskOptions {
  /** 上一份报告选中的群友，本期不能重复选 */
  previousFavoriteName?: string
  /** 活跃榜候选（按发言条数降序）；为空时不输出活跃榜 */
  ranking?: { name: string, count: number }[]
  /** 报纸刊名 */
  masthead?: string
  /** 金句候选（已去重、带复读次数）；为空时不输出金句栏目 */
  quoteText?: string
}

/**
 * 群聊日报/周报/月报/年报的任务输入。
 *
 * 输出被要求拆成报纸栏目（头条/导语/要闻/金句/活跃/点评/热词/最喜欢），
 * 由 report-card 分块渲染；解析不到标记时渲染器会退回整块正文。
 */
export function buildGroupReportTask(
  materials: string,
  range: string,
  participants: string[],
  spec: GroupReportSpec,
  options: GroupReportTaskOptions = {},
): { role: string; content: string }[] {
  const { previousFavoriteName, ranking = [], masthead = DEFAULT_REPORT_MASTHEAD, quoteText = '' } = options
  const names = participants.length ? participants.join('、') : '（本期没有可选的群友）'
  const noRepeat = previousFavoriteName
    ? `· 上一期最喜欢的是 ${previousFavoriteName}，本期不能重复选同一个人。\n`
    : ''
  const favoriteHint = participants.length
    ? `【${spec.favoriteLabel}】昵称｜档位｜理由
（昵称只能从候选列表里选。档位只能是「有点喜欢」「喜欢」「非常喜欢」三选一，按你自己的喜好来定，不要每期都给最高档。理由 15-40 字，必须说清是因为哪件具体的事；不要提发言条数、排行、话痨、活跃度，也不要写「很活跃」这种空话。提到时间时按报告周期说：今天 / 这一周 / 这个月 / 这一年。）`
    : '（本期没有候选群友，不要输出最喜欢这一栏。）'
  const rankingBlock = ranking.length
    ? `\n活跃榜候选（只用于【活跃】栏目，按活跃度排序）：\n${ranking
      .map((item, index) => `${index + 1}. ${item.name}`)
      .join('\n')}\n`
    : ''
  const rankingHint = ranking.length
    ? `【活跃】昵称｜一句人物点评
（写 ${spec.rankingCount} 条，昵称只能从上面的活跃榜候选里选，点评要结合他本期聊过的内容。）`
    : '（没有活跃榜候选，不要输出活跃这一栏。）'
  const quoteBlock = quoteText
    ? `\n金句候选（只能从这里选，括号里是这句话被复读的次数）：\n${quoteText}\n`
    : ''
  const quoteHint = quoteText
    ? `【金句】原话 —— 发言人昵称｜一句点评
（写 ${spec.quoteMin}-${spec.quoteMax} 条，数量由你根据候选质量决定；每条单独一行。只能从上面的「金句候选」里选，原话不要改写；括号里的「复读 N 次」说明这句话被多人重复过，可以写进点评。不要选你自己的话。找不到合适的就少写几条。）`
    : '（本期没有可用的金句候选，不要输出金句栏目。）'

  return [{
    role: 'user',
    content: `现在是「群${spec.title}」任务：为 ${range} 这段时间（${spec.periodLabel}）写一份群${spec.title}，作为《${masthead}》的一版。

群聊材料：
${materials}
${quoteBlock}${rankingBlock}
可以选作${spec.favoriteLabel}的群友（只从这个列表里选）：${names}

要求：
· 用你自己的口吻写，可以吐槽、可以有主观判断，但事实必须来自材料。
· 严格按下面的栏目和顺序输出，每个栏目以【栏目名】开头。不要输出别的标题、markdown、分隔线、字数统计或自我检查。
· 各栏目不要互相重复同样的内容。全文 ${spec.targetMin}-${spec.targetMax} 字（不含栏目名）。
· 头条和各条要闻的小标题只客观概括群里发生了什么，不要写你自己的反应、评价或吐槽；你的看法只写在【点评】里。
· 选「${spec.favoriteLabel}」只看对方发言的质量和你自己的喜好。活跃榜只用于【活跃】栏目，和最喜欢完全无关；不要因为某人发言多、排行高就选他，理由里也不要提条数、排行、话痨、活跃度这类词。
· 材料里的「你」是你自己说过的话，其他人按昵称区分。

【头条】8-16 字，只概括本期群里最值得说的事，不要出现你自己的态度，不要用书名号，结尾不加句号。
【导语】30-60 字，一句话交代这段时间群里的整体气氛。
【要闻】小标题｜具体内容
（写 ${spec.newsItemCount} 条左右，每条单独一个【要闻】栏目；小标题 6-14 字，只概括这一条讲的事，不要带评论；正文约 ${spec.newsItemChars} 字，可以分多段。按事情的重要性排序，条数由你根据材料决定。多写具体的人、具体的事和群里的原话细节，不要只写笼统印象。）
${quoteHint}
${rankingHint}
【点评】你自己的点评，约 ${spec.commentChars} 字，说说你的看法、吐槽或感受。
【热词】词1 / 词2 / 词3
（${spec.hotwordCount} 个左右，每个 2-6 字，从本期材料里提炼。）
${favoriteHint}
${noRepeat}· 最后一个栏目之后不要再写任何内容。`,
  }]
}

export function buildGroupDailyDigestTask(
  materials: string,
  range: string,
  participants: string[],
  options: GroupReportTaskOptions = {},
): { role: string; content: string }[] {
  return buildGroupReportTask(materials, range, participants, GROUP_REPORT_SPECS.daily, options)
}
