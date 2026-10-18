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
  kind: string         // 'turn' 用户↔bot；'ambient' 群聊环境消息；'legacy' 旧文件迁移
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
}

// 用户画像（每个 scope 一行）
export interface SatProfile {
  id: number
  scopeId: string
  data: ProfileData
  updatedAt: Date
}

// 每个 scope 的游标与状态
export interface SatMeta {
  id: number
  scopeId: string
  topicStart: Date     // 当前话题起点
  lastActiveAt: Date
  migratedAt: Date     // epoch 0 表示尚未迁移
}

declare module 'koishi' {
  interface Tables {
    sat_dialogue: SatDialogue
    sat_memory: SatMemory
    sat_knowledge: SatKnowledge
    sat_profile: SatProfile
    sat_meta: SatMeta
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
    indexes: [['scopeId', 'createdAt'], ['scopeId', 'kind']],
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
  }, {
    autoInc: true,
    unique: [['scopeId']],
  })
}
