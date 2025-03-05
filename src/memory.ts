// src/memory.ts
import { Session, Logger } from 'koishi'
import { MemoryEntry, MemoryConfig, ChannelMemory } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { escapeRegExp, getTimeOfDay } from './utils'

const logger = new Logger('satori-memory')
export class MemoryManager {
  private channelMemories: Map<string, ChannelMemory> = new Map()
  private channelDialogues: Map<string, string[]> = new Map()

  constructor(
    private config: MemoryConfig
  ) {}

  // 更新记忆
  public async updateMemories(session: Session, prompt: string, config: MemoryConfig, response: {content:string, error: boolean}) {
    if (response.error) return
    // 更新短期记忆
    this.updateChannelMemory(session, prompt, config, response.content)
    // 将prompt中的第一个“我”替换为用户名
    prompt = prompt.replace('我', session.username)
    // 添加当前时间
    const date = ` (对话日期和时间：${new Date().toLocaleString()})`
    // 保存长期记忆
    if (this.shouldRemember(prompt)) {
      await this.saveLongTermMemory(session, [{
        role: date,
        content: prompt
      }])
    }
  }

  // 是否应当记忆
  private shouldRemember(content: string): boolean {
    return content.length >= this.config.remember_min_length && !this.config.memory_block_words.some(word => content.includes(word))
  }

  // 更新频道对话
  public async updateChannelDialogue(session: Session, prompt: string, name: string) {
    if (!this.config.channel_dialogues) return ''
    if (!this.channelDialogues[session.channelId]) this.channelDialogues[session.channelId] = []
    this.channelDialogues[session.channelId].push('"' + name + '" 说: ' + prompt)
    if (this.channelDialogues[session.channelId]?.length > this.config.channel_dialogues_max_length) {
      this.channelDialogues = this.channelDialogues[session.channelId].slice(-this.config.channel_dialogues_max_length)
    }
  }

  public async getChannelDialogue(session: Session) {
    if (!this.config.channel_dialogues) return ''
    const Dialogue = this.channelDialogues[session.channelId]?.join('\n') || ''
    const result = '以下是群聊内群友最近的发言：{\n' + Dialogue + '\n}\n'
    return result
  }

  // 括号引号过滤
  private bracketFilter(content: string, config: MemoryConfig): string {
    if (!config.bracket_filter) return content
    let filtered = content.replace(/["'‘“]|[’”'"]/g, '')
    let previous: string
    do {
      previous = filtered
      filtered = filtered.replace(/[（({\[][^（）\]})]*[）)\]\}]/g, '')
    } while (filtered !== previous)
    return filtered.trim() || content.replace(/[（({\[]|[）)\]\}]/g, '') // 保留仅去除括号的内容如果过滤后为空
  }

  // 内容过滤
  private memoryFilter(content: string, config: MemoryConfig): string {
    if (!config.memory_filter) return content
    const filterWords = config.memory_filter.split('-').map(word => word.trim()).filter(word => word.length > 0)
    if (!filterWords.length) return content

    // 增强版句子分割（支持中英文标点）
    const sentenceSplitRegex = /([。！？；!?;…]|\.{3})/g
    const sentences = content.split(sentenceSplitRegex)
      .reduce((acc: string[], cur, i, arr) => {
        if (i % 2 === 0) acc.push(cur + (arr[i+1] || ''))
        return acc
      }, [])

    // 过滤包含关键词的句子
    const filtered = sentences.filter(sentence => !filterWords.some(word => sentence.includes(word))).join('')

    // 处理标点残留和空内容情况
    const result = filtered
      .replace(/([，、])\1+/g, '$1') // 去除重复标点
      .replace(/^[，。！？;,.!?]+/, '') // 去除开头标点
      .trim()

    return result || content // 保留原内容如果过滤后为空
  }

  // 更新短期记忆
  private updateChannelMemory(session: Session, prompt: string, config: MemoryConfig, response?: string): void {
    // 应用过滤
    if (response) {
      response = this.bracketFilter(response, config)
      response = this.memoryFilter(response, config)
    }

    let channelId = session.channelId
    if (config.personal_memory) channelId = session.userId
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, {
        dialogues: [],
        updatedAt: Date.now()
      })
    }

    const memory = this.channelMemories.get(channelId)
    memory.dialogues.push({ role: 'user', content: prompt })
    this.updateChannelDialogue(session, prompt, session.username)

    if (this.config.enable_self_memory && response) {
      memory.dialogues.push({ role: 'assistant', content: response })
    } else{
      memory.dialogues.push({ role: 'assistant', content: ' ' })
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
  // 清除频道对话
  public clearChannelDialogue(channelId: string): void {
    this.channelDialogues[channelId] = []
  }
  // 清除全部记忆
  public clearAllMemories(): void {
    this.channelMemories.clear()
    this.channelDialogues = new Map()
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
    const filePathMap = {
      'user': this.getUserMemoryPath(session.userId),
      'common': path.join(this.config.dataDir, 'common_sense.txt')
    }
    const topNMap = {
      'user': this.config.dailogues_topN,
      'common': this.config.common_topN
    }
    if (!fs.existsSync(filePathMap[type])) {
      logger.warn(`记忆文件不存在：${filePathMap[type]}`)
      return ''//如果记忆文件不存在,返回空字符串
    }
    const charactersToRemove: string[] = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const keywords = prompt.split('').filter(word => !charactersToRemove.includes(word));
    const entries = await this.loadMemoryFile(filePathMap[type])
    const matched = this.findBestMatches(entries, keywords, topNMap[type])
    const result = this.formatMatches(matched, type)
    return result
  }

  // 记忆检索
  private findBestMatches(entries: MemoryEntry[], keywords: string[], topN = 5): MemoryEntry[] {
    return entries
      .map(entry => ({ entry, ...this.calculateMatchScore(entry.content, keywords) })) //计算匹配度
      .filter(({ count }) => count > 1)    // 过滤低权重匹配
      .sort((a, b) => b.score - a.score)  // 按匹配率降序排列
      .slice(0, topN < entries.length ? topN : entries.length)  // 取前 N 个结果
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
      'common': '这是你可能用到的信息：',
      'user': '以下是较久之前用户说过的话和对话时间：'
    };
    // 添加时间信息
    const time = `\n时段：${getTimeOfDay(new Date().getHours())}`
    const date = `\n当前日期和时间：${new Date().toLocaleString()} ${time}`
    if (matched.length > 0) {
      if (type === 'common') {
          const result = `${prefixMap[type]}{\n${matched.map(entry => entry.content).join('\n')} ${date}\n`
          return result
      } else {
          // 这里因为远古屎山代码的原因，所以要判断role是否为user，现在的role是用来存储时间的
          matched.forEach(entry => entry.content = entry.content + (entry.role === 'user' ? '' : entry.role))
          const result = `${prefixMap[type]}{\n${matched.map(entry => entry.content).join('\n')}\n}\n`
          return result
      }
    } else {
      if (type === 'common') {
        return date
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
    if (!fs.existsSync(filePath)) { fs.writeFileSync(filePath, '[]', 'utf-8') }
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
