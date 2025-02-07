// src/memory.ts
import { Session, Logger, User } from 'koishi'
import { MemoryEntry, MemoryConfig, ChannelMemory } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { escapeRegExp } from './utils'

const logger = new Logger('satori-ai')
export class MemoryManager {
  private channelMemories: Map<string, ChannelMemory> = new Map()

  constructor(
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
    if (filePath === "") filePath = this.getUserMemoryPath(session.userId)
    await this.ensureMemoryFile(filePath)

    const filtered = dialogues.filter(entry => !this.config.memory_block_words.some(word => entry.content.includes(word)))

    if (filtered.length === 0) return

    const existing = await this.loadMemoryFile(filePath)
    const updated = [...existing, ...filtered]

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2))
  }

  // 记忆检索
  public async searchMemories(session: Session, prompt: string, type: 'user' | 'common' = 'user'): Promise<string> {
    let filePath = ""
    switch (type) {
      case 'user':
        filePath = this.getUserMemoryPath(session.userId)
        break
      case 'common':
        filePath = path.join(this.config.dataDir, 'common_sense.txt')
        break
    }
    if (!fs.existsSync(filePath)) return ''//如果记忆文件不存在,返回空字符串

    const charactersToRemove: string[] = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const keywords = prompt.split('').filter(word => !charactersToRemove.includes(word));

    const entries = await this.loadMemoryFile(filePath)
    const matched = this.findBestMatches(entries, keywords)
    const result = this.formatMatches(matched, type)
    return result
  }

  // 记忆检索
  private findBestMatches(entries: MemoryEntry[], keywords: string[], topN = 10): MemoryEntry[] {
    return entries
      .map(entry => ({ entry, ...this.calculateMatchScore(entry.content, keywords) })) //计算匹配度
      .filter(({ count }) => count > 1)    // 过滤低权重匹配
      .sort((a, b) => b.score - a.score)  // 按匹配率降序排列
      .slice(0, topN)                     // 取前 N 个结果
      .map(({ entry }) => entry);         // 还原为原始条目
  }

  // 匹配度计算
  private calculateMatchScore(content: string, keywords: string[]): { score: number; count: number } {
    if (keywords.length === 0) return { score: 0, count: 0 };

    // 转义关键词并构建正则表达式
    const escapedKeywords = keywords.map(k => escapeRegExp(k));
    const regex = new RegExp(escapedKeywords.join('|'), 'gi');
    const chineseRegex = /[\u4e00-\u9fa5]/g; // 匹配中文字符的正则表达式

    const matches = content.match(regex) || [];
    // 计算匹配项的权重总和
    let count = 0;
    matches.forEach(match => {
      const chineseCount = (match.match(chineseRegex) || []).length;
      const englishCount = match.length - chineseCount;
      count += chineseCount * 2 + englishCount;
    });

    // 计算总字符权重
    const totalChinese = (content.match(chineseRegex) || []).length;
    const totalEnglish = content.length - totalChinese;
    const totalWeight = totalChinese * 2 + totalEnglish;

    // 计算匹配比例
    const ratio = totalWeight > 0 ? count / totalWeight : 0;
    return { score: ratio, count };
  }

  // 格式化匹配结果
  private formatMatches(matched: MemoryEntry[], type: 'user' | 'common'): string {
    const prefixMap = {
      'common': '这是你需要知道的信息：',
      'user': '以下是较久之前用户说过的话：'
    };
    // 添加时间信息
    const time = `\n当前日期和时间：${new Date().toLocaleString()}`
    if (matched.length > 0) {
      if (type === 'common') {
          const result = `${prefixMap[type]}{\n${matched.map(entry => entry.content).join('\n')}\n${time}`
          return result
      } else {
          const result = `${prefixMap[type]}{\n${matched.map(entry => entry.content).join('\n')}\n`
          return result
      }
    } else {
      if (type === 'common') {
        return time
      } else {
        return ""
      }
    }
  }

  // 获取用户记忆文件路径
  private getUserMemoryPath(userId: string): string {
    return path.join(this.config.dataDir, 'dialogues', `${userId}.txt`)
  }

  // 确保记忆文件存在
  private async ensureMemoryFile(filePath: string): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (!fs.existsSync(filePath)) { fs.writeFileSync(filePath, '[]') }
  }

  // 加载记忆文件
  private async loadMemoryFile(filePath: string): Promise<MemoryEntry[]> {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return []
    }
  }

  // 获取频道上下文
  public getChannelContext(channelId: string): MemoryEntry[] {
    return this.channelMemories.get(channelId)?.dialogues || []
  }
}
