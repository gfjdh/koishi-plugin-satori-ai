// src/memory/schema.ts
// 分层记忆系统的数据表定义。
// 与 src/database.ts 的 p_system 表互不影响。
import { Context } from 'koishi'

// 原始对话
export interface SatDialogue {
  id: number
  scopeId: string      // userId（按人记忆）或 channelId（按群记忆）
  userId: string
  username: string
  kind: string         // 'turn' 用户↔bot；'legacy' 旧文件迁移；
                       // 'ambient' 群友发言 / 'ambient-bot' 机器人在群里的发言（群 scope，scopeId 前缀 g:）
  userContent: string
  aiContent: string
  createdAt: Date
}

// 分层记忆
export interface SatMemory {
  id: number
  scopeId: string
  granularity: string  // topic | day | week | month | season | year
  topic: string
  content: string
  userState: string
  periodStart: Date
  periodEnd: Date
  sourceCount: number
  createdAt: Date
}

// 常识 / 群常识
export interface SatKnowledge {
  id: number
  kind: string         // 'common' | 'group'
  targetId: string     // common -> '*'；group -> channelId
  content: string
  createdAt: Date
}

// 用户画像条目
export interface ProfileEntry {
  key: string
  category: string
  content: string
  importance: number
  updatedAt: string
}

export interface ProfileData {
  entries: ProfileEntry[]
  lastSummarizedAt?: string
  /** 历史回填完成时间；存在即表示已用高层汇总补过一次画像 */
  backfilledAt?: string
}

// 用户画像（每个 scope 一行）
export interface SatProfile {
  id: number
  scopeId: string
  data: ProfileData
  updatedAt: Date
}

// 往期报刊：图片存 dataDir/reports/，这里存路径与结构化内容
export interface SatReport {
  id: number
  scopeId: string
  /** 报刊号，按生成日期 YYYYMMDD */
  issueDate: string
  /** daily / weekly / monthly / yearly */
  kind: string
  title: string
  /** 相对 dataDir 的图片路径；没有渲染图片时为空字符串 */
  imagePath: string
  /** 重新渲染所需的完整 ReportCardInput + favorite */
  data: any
  createdAt: Date
}

// 主动回忆提示记录：同一条记忆 3 天内不重复提示
export interface SatRecallHint {
  id: number
  scopeId: string
  memoryId: number
  suggestedAt: Date
}

// 每个 scope 的游标与状态
export interface SatMeta {
  id: number
  scopeId: string
  topicStart: Date     // 当前话题起点
  lastActiveAt: Date
  migratedAt: Date     // epoch 0 表示尚未迁移
  /** 上一次报告的时间；只用于同一天不重复奖励，不参与选材 */
  dailyDigestAt?: Date
  /** 上一份报告选中的「最喜欢」群友，下一份报告不能重复选 */
  lastFavoriteId?: string
  lastFavoriteName?: string
  /** 已经发出的报告期数；报头显示「第 N 期」 */
  reportCount?: number
}

declare module 'koishi' {
  interface Tables {
    sat_dialogue: SatDialogue
    sat_memory: SatMemory
    sat_knowledge: SatKnowledge
    sat_profile: SatProfile
    sat_meta: SatMeta
    sat_report: SatReport
    sat_recall_hint: SatRecallHint
  }
}

export const MEMORY_GRANULARITIES = ['topic', 'day', 'week', 'month', 'season', 'year'] as const
export type Granularity = typeof MEMORY_GRANULARITIES[number]

export const GLOBAL_SCOPE = '__global__'

const extendedContexts = new WeakSet<Context>()

export function extendMemoryDatabase(ctx: Context) {
  // 同一个 ctx 上可能有多个插件实例，只扩展一次
  if (extendedContexts.has(ctx)) return
  extendedContexts.add(ctx)

  ctx.model.extend('sat_dialogue', {
    id: 'unsigned',
    scopeId: 'string',
    userId: 'string',
    username: 'string',
    kind: 'string',
    userContent: 'text',
    aiContent: 'text',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['scopeId', 'createdAt'], ['scopeId', 'kind'], ['scopeId', 'userId', 'createdAt'], ['kind', 'createdAt']],
  })

  ctx.model.extend('sat_memory', {
    id: 'unsigned',
    scopeId: 'string',
    granularity: 'string',
    topic: 'string',
    content: 'text',
    userState: 'text',
    periodStart: 'timestamp',
    periodEnd: 'timestamp',
    sourceCount: 'integer',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['scopeId', 'granularity', 'periodEnd']],
  })

  ctx.model.extend('sat_knowledge', {
    id: 'unsigned',
    kind: 'string',
    targetId: 'string',
    content: 'text',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['kind', 'targetId']],
  })

  ctx.model.extend('sat_profile', {
    id: 'unsigned',
    scopeId: 'string',
    data: 'json',
    updatedAt: 'timestamp',
  }, {
    autoInc: true,
    unique: [['scopeId']],
  })

  ctx.model.extend('sat_meta', {
    id: 'unsigned',
    scopeId: 'string',
    topicStart: 'timestamp',
    lastActiveAt: 'timestamp',
    migratedAt: 'timestamp',
    dailyDigestAt: 'timestamp',
    lastFavoriteId: 'string',
    lastFavoriteName: 'string',
    reportCount: 'unsigned',
  }, {
    autoInc: true,
    unique: [['scopeId']],
  })

  ctx.model.extend('sat_report', {
    id: 'unsigned',
    scopeId: 'string',
    issueDate: 'string',
    kind: 'string',
    title: 'string',
    imagePath: 'string',
    data: 'json',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: [['scopeId', 'issueDate']],
  })

  ctx.model.extend('sat_recall_hint', {
    id: 'unsigned',
    scopeId: 'string',
    memoryId: 'unsigned',
    suggestedAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['scopeId', 'suggestedAt'], ['memoryId']],
  })
}
