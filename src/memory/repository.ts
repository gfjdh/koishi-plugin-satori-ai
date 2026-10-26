// src/memory/repository.ts
// 数据访问层：所有对 sat_* 表的读写都集中在这里。
import { Context, $ } from 'koishi'
import {
  GLOBAL_SCOPE, Granularity, ProfileData, SatDialogue, SatKnowledge, SatMemory, SatMeta, SatProfile,
} from './schema'

export class MemoryRepository {
  constructor(private ctx: Context) {}

  // ---------- 原始对话 ----------

  async createDialogue(row: Omit<SatDialogue, 'id'>): Promise<void> {
    await this.ctx.database.create('sat_dialogue', row)
  }

  /**
   * 批量写入对话。minato 的 create 只接受单行，这里包在一个事务里，
   * 避免 10 万级迁移数据每行一个隐式事务。
   */
  async createDialogueBatch(rows: Omit<SatDialogue, 'id'>[]): Promise<void> {
    if (!rows.length) return
    await this.ctx.database.transact(async (db) => {
      for (const row of rows) await db.create('sat_dialogue', row)
    })
  }

  async getDialoguesAfter(
    scopeId: string,
    after: Date,
    options?: { kinds?: string[]; limit?: number; before?: Date },
  ): Promise<SatDialogue[]> {
    const createdAt: any = { $gt: after }
    // 归档时用 before 把结果限制在一个自然日内，topic 记忆不得跨日
    if (options?.before) createdAt.$lt = options.before
    const query: any = { scopeId, createdAt }
    if (options?.kinds?.length) query.kind = { $in: options.kinds }
    return this.ctx.database.get('sat_dialogue', query, {
      sort: { createdAt: 'asc' },
      limit: options?.limit,
    })
  }

  /** after < createdAt < before 的最后一条对话时间，用于跳过当天剩余部分 */
  async getLastDialogueInRange(
    scopeId: string,
    after: Date,
    before: Date,
    kinds?: string[],
  ): Promise<Date | null> {
    const query: any = { scopeId, createdAt: { $gt: after, $lt: before } }
    if (kinds?.length) query.kind = { $in: kinds }
    const [row] = await this.ctx.database.get('sat_dialogue', query, {
      sort: { createdAt: 'desc' },
      limit: 1,
      fields: ['createdAt'],
    })
    return row ? new Date(row.createdAt) : null
  }

  async countDialoguesAfter(scopeId: string, after: Date, kinds?: string[]): Promise<number> {
    const query: any = { scopeId, createdAt: { $gt: after } }
    if (kinds?.length) query.kind = { $in: kinds }
    const rows = await this.ctx.database.get('sat_dialogue', query, { fields: ['id'] })
    return rows.length
  }

  /** after < createdAt < before 的对话数，用于判断一个已关闭的日块是否归档干净 */
  async countDialoguesInRange(
    scopeId: string,
    after: Date,
    before: Date,
    kinds?: string[],
  ): Promise<number> {
    const query: any = { scopeId, createdAt: { $gt: after, $lt: before } }
    if (kinds?.length) query.kind = { $in: kinds }
    const rows = await this.ctx.database.get('sat_dialogue', query, { fields: ['id'] })
    return rows.length
  }

  /** since 之后的对话数。用数据库 COUNT，避免把整段历史拉进内存。 */
  async countDialoguesSince(scopeId: string, since: Date, kinds?: string[]): Promise<number> {
    const query: any = { scopeId, createdAt: { $gte: since } }
    if (kinds?.length) query.kind = { $in: kinds }
    return this.ctx.database.eval('sat_dialogue', row => $.count(row.id), query)
  }

  /** 该 scope 最早/最晚一条对话的时间（走 scopeId+createdAt 索引） */
  async getDialogueTimeRange(scopeId: string, kinds?: string[]): Promise<{ first: Date | null, last: Date | null }> {
    const query: any = { scopeId }
    if (kinds?.length) query.kind = { $in: kinds }
    const [firstRow] = await this.ctx.database.get('sat_dialogue', query, {
      sort: { createdAt: 'asc' },
      limit: 1,
      fields: ['createdAt'],
    })
    if (!firstRow) return { first: null, last: null }
    const [lastRow] = await this.ctx.database.get('sat_dialogue', query, {
      sort: { createdAt: 'desc' },
      limit: 1,
      fields: ['createdAt'],
    })
    return {
      first: new Date(firstRow.createdAt),
      last: lastRow ? new Date(lastRow.createdAt) : null,
    }
  }

  /** 只清理普通对话，legacy 迁移数据保留（一次性数据，量有界） */
  async pruneDialogues(before: Date): Promise<number> {
    const rows = await this.ctx.database.get('sat_dialogue', {
      kind: { $in: ['turn', 'ambient'] },
      createdAt: { $lt: before },
    })
    if (!rows.length) return 0
    await this.ctx.database.remove('sat_dialogue', { id: { $in: rows.map(row => row.id) } })
    return rows.length
  }

  // ---------- meta ----------

  async getMeta(scopeId: string): Promise<SatMeta | null> {
    const rows = await this.ctx.database.get('sat_meta', { scopeId }, { limit: 1 })
    return rows[0] || null
  }

  async ensureMeta(scopeId: string, at: Date = new Date()): Promise<SatMeta> {
    const existing = await this.getMeta(scopeId)
    if (existing) return existing
    try {
      await this.ctx.database.create('sat_meta', {
        scopeId,
        topicStart: at,
        lastActiveAt: at,
        migratedAt: new Date(0),
      })
    } catch {
      // 并发创建时可能触发唯一约束，忽略后重新读取
    }
    return (await this.getMeta(scopeId)) || {
      id: 0,
      scopeId,
      topicStart: at,
      lastActiveAt: at,
      migratedAt: new Date(0),
    }
  }

  async touchMeta(scopeId: string, at: Date = new Date()): Promise<void> {
    await this.ensureMeta(scopeId, at)
    await this.ctx.database.set('sat_meta', { scopeId }, { lastActiveAt: at })
  }

  /**
   * 只在更晚时才更新 lastActiveAt。迁移会拿旧对话的时间回填这个字段，
   * 不能让历史时间把「最近活跃」往回拨、把 scope 挤出活跃窗口。
   */
  async touchMetaIfNewer(scopeId: string, at: Date): Promise<void> {
    const meta = await this.ensureMeta(scopeId, at)
    if (new Date(meta.lastActiveAt).getTime() >= at.getTime()) return
    await this.ctx.database.set('sat_meta', { scopeId }, { lastActiveAt: at })
  }

  /**
   * 只推进归档游标，不动 lastActiveAt。
   * 游标是历史时间（本批对话的末尾），写进 lastActiveAt 会让 scope 归档完
   * 立刻掉出活跃窗口，只能等用户再开口才会被心跳重新选中——历史积压就永远
   * 只能一条消息推一批。
   */
  async setTopicStart(scopeId: string, at: Date): Promise<void> {
    await this.ensureMeta(scopeId, at)
    await this.ctx.database.set('sat_meta', { scopeId }, { topicStart: at })
  }

  async setMigratedAt(scopeId: string, at: Date): Promise<void> {
    await this.ensureMeta(scopeId, at)
    await this.ctx.database.set('sat_meta', { scopeId }, { migratedAt: at })
  }

  /**
   * 活跃 scope：最近活跃时间不早于 since。
   * `__global__` 只用来记迁移时间，不是对话作用域——它有 meta 但没有对话，
   * 会被心跳当成候选白占一个处理名额（它的 lastActiveAt 每次都被刷新，永远排在前面）。
   */
  async getActiveMetas(since: Date, limit: number): Promise<SatMeta[]> {
    return this.ctx.database.get('sat_meta', {
      lastActiveAt: { $gte: since },
      scopeId: { $ne: GLOBAL_SCOPE },
    }, {
      sort: { lastActiveAt: 'desc' },
      limit,
    })
  }

  // ---------- 分层记忆 ----------

  /** 某粒度的最新一条（按 periodEnd 排序，服务端 LIMIT 1，等价于 MAX(periodEnd)） */
  async getLatestMemory(scopeId: string, granularity: Granularity): Promise<SatMemory | null> {
    const rows = await this.ctx.database.get('sat_memory', { scopeId, granularity }, {
      sort: { periodEnd: 'desc' },
      limit: 1,
    })
    return rows[0] || null
  }

  /** 区间查询：from < periodEnd <= to，走真正的 SQL 条件而不是 JS 侧过滤 */
  async getMemoriesInRange(
    scopeId: string,
    granularity: Granularity,
    from: Date | null,
    to: Date,
    limit?: number,
  ): Promise<SatMemory[]> {
    const periodEnd: any = { $lte: to }
    if (from) periodEnd.$gt = from
    return this.ctx.database.get('sat_memory', { scopeId, granularity, periodEnd }, {
      sort: { periodEnd: 'asc' },
      limit,
    })
  }

  /** 某个时间点之前结束的最新节点（用于历史回填选材） */
  async getLatestMemoryBefore(
    scopeId: string,
    granularity: Granularity,
    before: Date,
  ): Promise<SatMemory | null> {
    const rows = await this.ctx.database.get('sat_memory', {
      scopeId, granularity, periodEnd: { $lte: before },
    }, {
      sort: { periodEnd: 'desc' },
      limit: 1,
    })
    return rows[0] || null
  }

  async createMemory(row: Omit<SatMemory, 'id'>): Promise<void> {
    await this.ctx.database.create('sat_memory', row)
  }

  /** 该 scope 是否已经产过分层记忆（用于判断迁移是否第一次跑） */
  async hasAnyMemory(scopeId: string): Promise<boolean> {
    const rows = await this.ctx.database.get('sat_memory', { scopeId }, { fields: ['id'], limit: 1 })
    return !!rows.length
  }

  /**
   * 归档结果与游标推进必须一起生效。分成两次写的话，进程在中间被中断
   * （重启 / 崩溃）会留下没推进的游标，下一轮把同一批对话再归档一次。
   */
  async commitTopicArchive(
    memory: Omit<SatMemory, 'id'>,
    scopeId: string,
    topicStart: Date,
  ): Promise<void> {
    await this.ctx.database.transact(async (db) => {
      await db.create('sat_memory', memory)
      await db.set('sat_meta', { scopeId }, { topicStart })
    })
  }

  /**
   * 合并归档：多条 topic 记忆与游标推进一起提交。
   * 中间失败不会留下「写了一半天节点、游标却没动」的半截状态。
   */
  async commitTopicArchives(
    memories: Omit<SatMemory, 'id'>[],
    scopeId: string,
    topicStart: Date,
  ): Promise<void> {
    await this.ctx.database.transact(async (db) => {
      for (const memory of memories) await db.create('sat_memory', memory)
      await db.set('sat_meta', { scopeId }, { topicStart })
    })
  }

  async getRecallCandidates(
    scopeId: string,
    granularities: Granularity[],
    since: Date,
  ): Promise<SatMemory[]> {
    return this.ctx.database.get('sat_memory', {
      scopeId,
      granularity: { $in: granularities },
      periodEnd: { $gte: since },
    }, {
      sort: { periodEnd: 'desc' },
    })
  }

  async clearScope(scopeId: string): Promise<void> {
    await this.ctx.database.remove('sat_dialogue', { scopeId })
    await this.ctx.database.remove('sat_memory', { scopeId })
    await this.ctx.database.remove('sat_profile', { scopeId })
    await this.ctx.database.remove('sat_meta', { scopeId })
  }

  async clearAll(): Promise<void> {
    await this.ctx.database.remove('sat_dialogue', {})
    await this.ctx.database.remove('sat_memory', {})
    await this.ctx.database.remove('sat_profile', {})
    await this.ctx.database.remove('sat_meta', {})
  }

  // ---------- 知识 ----------

  async getKnowledge(kind: string, targetId: string): Promise<SatKnowledge[]> {
    return this.ctx.database.get('sat_knowledge', { kind, targetId }, {
      sort: { createdAt: 'asc' },
    })
  }

  async addKnowledge(kind: string, targetId: string, content: string): Promise<void> {
    await this.ctx.database.create('sat_knowledge', {
      kind,
      targetId,
      content,
      createdAt: new Date(),
    })
  }

  /** 幂等添加：内容完全相同则跳过 */
  async addKnowledgeIfAbsent(kind: string, targetId: string, content: string): Promise<boolean> {
    const existing = await this.getKnowledge(kind, targetId)
    if (existing.some(row => row.content === content)) return false
    await this.addKnowledge(kind, targetId, content)
    return true
  }

  // ---------- 画像 ----------

  async getProfile(scopeId: string): Promise<SatProfile | null> {
    const rows = await this.ctx.database.get('sat_profile', { scopeId }, { limit: 1 })
    return rows[0] || null
  }

  async saveProfile(scopeId: string, data: ProfileData): Promise<void> {
    const now = new Date()
    const existing = await this.getProfile(scopeId)
    if (existing) {
      await this.ctx.database.set('sat_profile', { scopeId }, { data, updatedAt: now })
    } else {
      await this.ctx.database.create('sat_profile', { scopeId, data, updatedAt: now })
    }
  }
}
