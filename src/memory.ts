// src/memory.ts
import { Session } from 'koishi'
import { Context } from 'koishi'
import { MemoryEntry, MemoryConfig, ChannelMemory } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { escapeRegExp } from './utils'

export class MemoryManager {
  private channelMemories: Map<string, ChannelMemory> = new Map()

  constructor(
    private ctx: Context,
    private config: MemoryConfig
  ) {}

  // 更新短期记忆
  public updateChannelMemory(session: Session, prompt: string, response?: string): void {
    const channelId = session.channelId
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, {
        dialogues: [],
        updatedAt: Date.now()
      })
    }

    const memory = this.channelMemories.get(channelId)
    memory.dialogues.push({ role: 'user', content: session.username + ':' + prompt })

    if (this.config.enable_self_memory && response) {
      memory.dialogues.push({ role: 'assistant', content: response })
    }

    // 保持记忆长度
    if (memory.dialogues.length > this.config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-this.config.message_max_length)
    }
  }
  // 清除频道记忆
  public clearChannelMemory(channelId: string): void {
    this.channelMemories.delete(channelId)
  }
  // 返回频道记忆
  public getChannelMemory(channelId: string): MemoryEntry[] {
    return this.channelMemories.get(channelId)?.dialogues || []
  }

  // 长期记忆存储
  public async saveLongTermMemory(session: Session, dialogues: MemoryEntry[], filePath: string = ""): Promise<void> {
    if (filePath === "")
      filePath = this.getUserMemoryPath(session.userId)
    await this.ensureMemoryFile(filePath)

    const filtered = dialogues.filter(entry => !this.config.memory_block_words.some(word => entry.content.includes(word)))

    if (filtered.length === 0) return

    const existing = await this.loadMemoryFile(filePath)
    const updated = [...existing, ...filtered]

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2))
  }

  // 记忆检索
  public async searchMemories(session: Session, keywords: string[], type: 'user' | 'common' = 'user'): Promise<string> {
    const filePath = type === 'user' ? this.getUserMemoryPath(session.userId) : path.join(this.config.dataDir, 'common_sense.txt')
    if (!fs.existsSync(filePath)) return ''
    const entries = await this.loadMemoryFile(filePath)
    const matched = this.findBestMatches(entries, keywords)
    return this.formatMatches(matched, type)
  }

  // 获取用户记忆文件路径
  private getUserMemoryPath(userId: string): string {
    return path.join(this.config.dataDir, 'dialogues', `${userId}.txt`)
  }

  // 确保记忆文件存在
  private async ensureMemoryFile(filePath: string): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]')
    }
  }

  // 加载记忆文件
  private async loadMemoryFile(filePath: string): Promise<MemoryEntry[]> {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return []
    }
  }

  // 记忆检索
  private findBestMatches(entries: MemoryEntry[], keywords: string[], topN = 10): MemoryEntry[] {
    const scored = entries.map((entry, index) => ({
      index,
      score: this.calculateMatchScore(entry.content, keywords)
    }))

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(item => entries[item.index])
  }

  // 匹配度计算
  private calculateMatchScore(content: string, keywords: string[]): number {
    const regex = new RegExp(keywords.map(escapeRegExp).join('|'), 'gi')
    const matches = content.match(regex) || []

    // 中文字符权重计算
    const chineseCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishCount = content.length - chineseCount
    const totalWeight = chineseCount * 2 + englishCount

    return totalWeight > 0
      ? (matches.length * 2 + matches.join('').length) / totalWeight
      : 0
  }

  // 格式化匹配结果
  private formatMatches(matches: MemoryEntry[], type: 'user' | 'common'): string {
    const prefix = type === 'user' ? '这是你和发言者较久之前的对话内容：' : '这是你需要知道的信息：'
    return matches.length > 0 ? `${prefix}\n${matches.map(e => `${e.role}: ${e.content}`).join('\n')}\n` : ''
  }

  // 获取频道上下文
  public getChannelContext(channelId: string): MemoryEntry[] {
    return this.channelMemories.get(channelId)?.dialogues || []
  }
}

// 实现自定义记忆策略
interface MemoryStrategy {
  shouldRemember(entry: MemoryEntry): boolean
  formatMemory(entry: MemoryEntry): string
}

// 实现记忆加权系统
interface MemoryWeight {
  content: string
  weight: number
  expireAt?: number
}

export class WeightedMemoryManager extends MemoryManager {
  private weights: MemoryWeight[] = []

  public addWeight(keyword: string, weight: number) {
    this.weights.push({ content: keyword, weight })
  }
}

//后续可以通过实现以下接口增强记忆管理：
export interface MemoryAugmentor {
  augment(context: MemoryContext): Promise<void>
}

interface MemoryContext {
  session: Session
  memories: MemoryEntry[]
  config: MemoryConfig
}
