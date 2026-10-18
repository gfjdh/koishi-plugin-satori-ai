// src/memory/migrate.ts
// 旧文件 → 数据库的一次性迁移。
//
// 旧格式（已用 1131 个真实文件验证）：
//   dataDir/dialogues/<userId>.txt       JSON 数组 [{role, content}]
//                                        content 是用户说过的话（旧系统不保存 AI 回复）；
//                                        role 保存时间，且存在两种写法：
//                                          " (对话日期和时间：2026/9/20 00:56:55)"
//                                          " (对话日期和时间：10/18/2026, 10:04:24 AM)"
//                                        少数条目的 role 是字面量 "user"（历史上没有记时间）
//   dataDir/UserPortrait/<userId>.txt    纯文本画像
//   dataDir/common_sense.txt             JSON 数组 [{role:'user', content}]
//   dataDir/group_sense/<id>.txt         JSON 数组 [{role:'user', content}]
//
// 旧时间没有时区，是在服务器 locale 时区（实测 Asia/Shanghai）下由
// `new Date().toLocaleString()` 写出的，因此按 timezoneOffset 转成真实 UTC。
// role 为 "user" 的条目没有可信时间，不做假日期，跳过并在结果里单独计数
//（旧文件保持原样，数据不会丢失）。
//
// 设计原则：旧文件不修改、不删除；迁移可重复执行且结果幂等——重跑只重写
// legacy 对话和缺失的画像，「归档游标」不会往回拨（否则已经归档过的区间会被
// 重新归档成重复的 topic 记忆），lastActiveAt 也只在更晚时才更新。
import { Context, Logger } from 'koishi'
import { promises as fs } from 'fs'
import * as path from 'path'
import { MemoryRepository } from './repository'
import { GLOBAL_SCOPE, SatDialogue } from './schema'

const logger = new Logger('satori-migrate')

const CN_TIME = /对话日期和时间：\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/
const US_TIME = /对话日期和时间：\s*(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i

export interface MigrateResult {
  dialogues: number
  skippedDialogues: number
  /** role 为 "user"、没有可信时间的条目 */
  skippedUndated: number
  /** 同文件内 role+content 完全相同的重复条目 */
  duplicates: number
  portraits: number
  knowledge: number
}

interface LegacyEntry {
  role?: string
  content?: string
}

export class Migrator {
  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private dataDir: string,
    private personalMemory: boolean,
    private timezoneOffset = 8,
  ) {}

  async migrate(force = false): Promise<MigrateResult> {
    const result: MigrateResult = {
      dialogues: 0,
      skippedDialogues: 0,
      skippedUndated: 0,
      duplicates: 0,
      portraits: 0,
      knowledge: 0,
    }

    const migratedAt = await this.getMigratedAt()
    if (!force && migratedAt.getTime() > 0) {
      logger.info(`记忆迁移已于 ${migratedAt.toLocaleString()} 完成，跳过（可用 force 重跑）`)
      return result
    }

    // legacy 对话是迁移专属标记，重跑时整批替换，不会影响新数据
    await this.ctx.database.remove('sat_dialogue', { kind: 'legacy' })

    await this.migrateDialogues(result)
    await this.migratePortraits(result)
    await this.migrateKnowledge(result)

    await this.repo.setMigratedAt(GLOBAL_SCOPE, new Date())
    logger.info(`记忆迁移完成：对话 ${result.dialogues} 条，`
      + `跳过 ${result.skippedDialogues} 条（其中无时间 ${result.skippedUndated} 条），`
      + `重复 ${result.duplicates} 条，画像 ${result.portraits} 份，知识 ${result.knowledge} 条`)
    if (result.skippedUndated) {
      logger.warn(`有 ${result.skippedUndated} 条历史对话的 role 是 "user"、没有记录时间，`
        + '无法归入任何日期，已跳过（原文件未改动）')
    }
    return result
  }

  private async getMigratedAt(): Promise<Date> {
    const meta = await this.repo.getMeta(GLOBAL_SCOPE)
    return meta?.migratedAt ? new Date(meta.migratedAt) : new Date(0)
  }

  // ---------- 对话 ----------

  private async migrateDialogues(result: MigrateResult): Promise<void> {
    const dir = path.join(this.dataDir, 'dialogues')
    const files = await this.listFiles(dir, '.txt')
    if (!files.length) return

    if (!this.personalMemory) {
      logger.warn('检测到 personal_memory=false：历史对话无法反推 channelId，将统一按 userId 导入')
    }

    for (const file of files) {
      const userId = path.basename(file, '.txt')
      const entries = await this.readJsonArray(file)
      const range = await this.insertLegacyDialogues(userId, entries, result)
      if (range) {
        const meta = await this.repo.ensureMeta(userId, range.earliest)
        // 只有从没归档过的 scope 才把游标往回拨到最早的旧对话，让第一批心跳
        // 从历史开头开始；已经有分层记忆说明这个区间归档过了，-f 重跑时再拨回去
        // 会把同一批对话重新归档，产出区间完全相同的重复 topic 记忆。
        if (!await this.repo.hasAnyMemory(userId)) {
          const current = new Date(meta.topicStart)
          if (range.earliest < current) await this.repo.setTopicStart(userId, range.earliest)
        }
        // lastActiveAt 的语义是「最近一次真实活动」，取最后一条旧对话：
        // 最近 7 天内聊过的 scope 迁移后就能靠心跳自己把积压补上，
        // 而休眠 scope 仍然留在活跃窗口外（成本兜底不变）。
        await this.repo.touchMetaIfNewer(userId, range.latest)
      }
    }
  }

  private async insertLegacyDialogues(
    userId: string,
    entries: LegacyEntry[],
    result: MigrateResult,
  ): Promise<{ earliest: Date; latest: Date } | null> {
    let earliest: Date | null = null
    let latest: Date | null = null
    const rows: Omit<SatDialogue, 'id'>[] = []
    const seen = new Set<string>()

    for (const entry of entries) {
      if (!entry?.content || typeof entry.content !== 'string') {
        result.skippedDialogues++
        continue
      }
      const createdAt = this.parseLegacyTime(entry.role)
      if (!createdAt) {
        if (entry.role === 'user') result.skippedUndated++
        else result.skippedDialogues++
        continue
      }

      // 旧文件里有少量完全相同的重复条目（检索时重新排序造成）
      const key = `${entry.role}\u0000${entry.content}`
      if (seen.has(key)) {
        result.duplicates++
        continue
      }
      seen.add(key)

      rows.push({
        scopeId: userId,
        userId,
        username: '',
        kind: 'legacy',
        userContent: entry.content,
        aiContent: '',
        createdAt,
      })
      if (!earliest || createdAt < earliest) earliest = createdAt
      if (!latest || createdAt > latest) latest = createdAt
    }

    await this.repo.createDialogueBatch(rows)
    result.dialogues += rows.length
    return earliest && latest ? { earliest, latest } : null
  }

  /**
   * 旧时间由 `new Date().toLocaleString()` 在服务器的 locale 时区写出，
   * 实测服务器为 Asia/Shanghai。这里把“墙上时间”换算成真实 UTC。
   */
  private parseLegacyTime(role: unknown): Date | null {
    if (typeof role !== 'string') return null

    let match = CN_TIME.exec(role)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      return this.toUtc(year, month, day, hour, minute, second)
    }

    match = US_TIME.exec(role)
    if (match) {
      const [, month, day, year, hour, minute, second, meridiem] = match
      let hours = Number(hour)
      const pm = meridiem.toUpperCase() === 'PM'
      if (pm && hours !== 12) hours += 12
      if (!pm && hours === 12) hours = 0
      return this.toUtc(year, month, day, String(hours), minute, second)
    }

    return null
  }

  private toUtc(year: string, month: string, day: string, hour: string, minute: string, second: string): Date | null {
    const wallClock = Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second),
    )
    const date = new Date(wallClock - this.timezoneOffset * 3_600_000)
    return Number.isNaN(date.getTime()) ? null : date
  }

  // ---------- 画像 ----------

  private async migratePortraits(result: MigrateResult): Promise<void> {
    const dir = path.join(this.dataDir, 'UserPortrait')
    const files = await this.listFiles(dir, '.txt')

    for (const file of files) {
      const userId = path.basename(file, '.txt')
      const content = await this.readText(file)
      if (!content.trim()) continue

      // 不覆盖迁移后已经由新系统写出的画像
      if (await this.repo.getProfile(userId)) continue

      await this.repo.saveProfile(userId, {
        entries: [{
          key: 'legacy_portrait',
          category: 'fact',
          content: content.trim(),
          importance: 30,
          updatedAt: new Date().toISOString(),
        }],
        lastSummarizedAt: new Date().toISOString(),
      })
      result.portraits++
    }
  }

  // ---------- 知识 ----------

  private async migrateKnowledge(result: MigrateResult): Promise<void> {
    const commonFile = path.join(this.dataDir, 'common_sense.txt')
    const common = await this.readJsonArray(commonFile)
    for (const entry of common) {
      if (!entry?.content) continue
      if (await this.repo.addKnowledgeIfAbsent('common', '*', entry.content)) result.knowledge++
    }

    const groupDir = path.join(this.dataDir, 'group_sense')
    for (const file of await this.listFiles(groupDir, '.txt')) {
      const channelId = path.basename(file, '.txt')
      const entries = await this.readJsonArray(file)
      for (const entry of entries) {
        if (!entry?.content) continue
        if (await this.repo.addKnowledgeIfAbsent('group', channelId, entry.content)) result.knowledge++
      }
    }
  }

  // ---------- IO ----------

  private async listFiles(dir: string, suffix: string): Promise<string[]> {
    try {
      const names = await fs.readdir(dir)
      return names.filter(name => name.endsWith(suffix)).map(name => path.join(dir, name))
    } catch {
      return []
    }
  }

  private async readText(file: string): Promise<string> {
    try {
      return await fs.readFile(file, 'utf-8')
    } catch {
      return ''
    }
  }

  private async readJsonArray(file: string): Promise<LegacyEntry[]> {
    try {
      const raw = await fs.readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}
