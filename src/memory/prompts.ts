// src/memory/prompts.ts
// 记忆系统所有提示词集中在这里，方便调整。
import { ProfileEntry } from './schema'

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

const LEVEL_LABELS: Record<string, string> = {
  day: '一天',
  week: '一周',
  month: '一个月',
  season: '一个季度',
  year: '一年',
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
export function buildTopicArchivePrompt(dialogues: string): { role: string; content: string }[] {
  return [{
    role: 'user',
    content: `请总结以下对话记录，形成一条可长期保存的记忆。

对话记录：
${dialogues}

要求：
· 综合考虑这段记忆未来被调用的场景和目的，无状态地存储信息。
· 把“今天”“明天”“最近”“刚才”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、地点、数字和用户的明确要求。
· user_state 描述此时段用户的处境、作息、情绪或正在做的事；没有相关信息时留空字符串。
· topic 用不超过 12 个字概括这段对话的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"topic": "...", "summary": "...", "user_state": "..."}`,
  }]
}

/** 把连续多个稀疏日的对话合并成一次调用，按日分别归档 */
export function buildTopicBatchPrompt(days: { date: string; dialogues: string }[]): { role: string; content: string }[] {
  const body = days.map(day => `【${day.date}】\n${day.dialogues}`).join('\n\n')
  return [{
    role: 'user',
    content: `下面按自然日分组给出了几段对话记录。请为每一天分别形成一条可长期保存的独立记忆，不要跨天合并。

对话记录：
${body}

要求：
· 输出条数必须与输入分组数一致，每一天各一条；date 原样照抄分组标题里的日期（YYYY/MM/DD）。
· 每一天只总结该日期分组内的对话，不要把其他日期的人物、事件混进来。
· 无状态地存储信息：把“今天”“明天”“最近”“刚才”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、地点、数字和用户的明确要求。
· user_state 描述该日用户的处境、作息、情绪或正在做的事；没有相关信息时留空字符串。
· topic 用不超过 12 个字概括该日对话的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"days":[{"date":"YYYY/MM/DD","topic":"...","summary":"...","user_state":"..."}]}`,
  }]
}

/** 把子级记忆汇总为父级记忆 */
export function buildSummaryPrompt(level: string, children: string): { role: string; content: string }[] {
  const label = LEVEL_LABELS[level] || level
  return [{
    role: 'user',
    content: `请把以下记忆汇总成对${label}的整体总结。

子级记忆：
${children}

要求：
· 无状态地存储信息：把相对时间替换成具体日期或时间范围。
· 优先保留对长期对话有价值的信息：用户的稳定特征、重要事件、明确要求、关系变化。
· 合并重复内容，删除琐碎细节；不要编造子级记忆中不存在的信息。
· user_state 描述这段时间用户整体处于什么状态；没有相关信息时留空字符串。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"summary": "...", "user_state": "..."}`,
  }]
}

const CATEGORY_HELP = `类别（category）只能是以下六种之一：
· identity：身份信息（性别、年龄、职业、生日、所在地等）
· preference：喜好
· aversion：厌恶或反感的事物
· requirement：用户对 AI 的长期要求
· habit：习惯（作息、口头禅、说话方式等）
· fact：其他值得长期记住的事实`

/** 增量更新用户画像 */
export function buildProfilePrompt(existing: ProfileEntry[], input: string): { role: string; content: string }[] {
  const existingText = existing.length
    ? existing.map(entry => `- [${entry.key}] (${entry.category}, 重要度${entry.importance}) ${entry.content}`).join('\n')
    : '（暂无）'

  return [{
    role: 'user',
    content: `你是一个用户画像整理助手。请根据新材料增量更新用户画像。

${CATEGORY_HELP}

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
· content 必须是关于用户的陈述性事实，不能是给助手的编辑说明（如“移除某表述”“该项以某条为准”“更新…”）。
· legacy_portrait 是迁移来的旧画像原文，仅用于提取信息：不要修改或缩短它的 content；把其中仍有效的信息拆成独立条目后，用 deleted 删除 "legacy_portrait"。
· 新材料中不确定的信息保留不确定性表述（如“可能”“用户自称”）。
· 用户一定是人类，角色扮演中的设定不要当作事实。
· 没有值得记录的变化时，三个数组都返回空数组。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"added":[{"key":"...","category":"...","content":"...","importance":20}],"modified":[{"key":"...","content":"...","importance":20}],"deleted":["key"]}`,
  }]
}
