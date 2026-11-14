// src/memory/short-term.ts
// 短期记忆（内存 ring）。行为与重构前的 MemoryManager 保持一致：
// - channelMemories 保存用户↔bot 的最近 N 轮，空闲超过 TTL 后整段清空；
// - channelDialogues 保存频道内所有发言（含不对 bot 说的），按 N 条截断，不参与 TTL。
import { Context, Session } from 'koishi'
import { ChannelMemory, MemoryConfig, MemoryEntry } from '../types'

export interface ShortTermOptions {
  /** 对话记忆空闲多久后清空（毫秒）；<= 0 表示关闭 */
  ttlMs: number
  /** 可注入时钟，便于验证过期逻辑；生产环境不传 */
  now?: () => Date
}

export class ShortTermMemory {
  private channelMemories = new Map<string, ChannelMemory>()
  private channelDialogues = new Map<string, string[]>()

  constructor(private ctx: Context, private options: ShortTermOptions = { ttlMs: 0 }) {}

  // ---------- 生命周期 ----------

  private nowMs(): number {
    return this.options.now ? this.options.now().getTime() : Date.now()
  }

  /** 过期判断以「最后一次真实用户对话」为准；主动消息不续期 */
  private isExpired(memory: ChannelMemory): boolean {
    if (this.options.ttlMs <= 0) return false
    return this.nowMs() >= memory.lastActivityAt + this.options.ttlMs
  }

  /** 清理所有过期作用域，返回清掉的数量。读取路径也会懒清理，这里兜住再也没人读的键 */
  sweep(): number {
    if (this.options.ttlMs <= 0) return 0
    const now = this.nowMs()
    let removed = 0
    for (const [scopeId, memory] of this.channelMemories) {
      if (now >= memory.lastActivityAt + this.options.ttlMs) {
        this.channelMemories.delete(scopeId)
        removed++
      }
    }
    return removed
  }

  /** 当前作用域数量，供启动/运维日志使用 */
  getScopeCount(): number {
    return this.channelMemories.size
  }

  // ---------- 过滤 ----------

  private bracketFilter(content: string, config: MemoryConfig): string {
    if (!config.bracket_filter) return content
    let filtered = content.replace(/["'‘“]|[’”'"]/g, '')
    let previous: string
    do {
      previous = filtered
      filtered = filtered.replace(/[（({\[][^（）\]})]*[）)\]\}]/g, '')
    } while (filtered !== previous)
    return filtered.trim() || content.replace(/[（({\[]|[）)\]\}]/g, '')
  }

  private memoryFilter(content: string, config: MemoryConfig): string {
    if (!config.memory_filter) return content
    const filterWords = config.memory_filter.split('-').map(word => word.trim()).filter(word => word.length > 0)
    if (!filterWords.length) return content

    const sentenceSplitRegex = /([。！？；!?;…]|\.{3})/g
    const sentences = content.split(sentenceSplitRegex)
      .reduce((acc: string[], cur, i, arr) => {
        if (i % 2 === 0) acc.push(cur + (arr[i + 1] || ''))
        return acc
      }, [])

    const filtered = sentences.filter(sentence => !filterWords.some(word => sentence.includes(word))).join('')

    const result = filtered
      .replace(/([，、…])\1+/g, '$1')
      .replace(/^[，。！？;,.!?]+/, '')
      .trim()

    return result || content
  }

  // ---------- 写入 ----------

  /** 记录一轮用户↔bot 对话到短期记忆 */
  updateChannelMemory(
    session: Session,
    prompt: string,
    config: MemoryConfig,
    response?: string,
    scopeId?: string,
  ): void {
    if (response) {
      response = this.bracketFilter(response, config)
      response = this.memoryFilter(response, config)
    }
    if (!response) response = '…'

    const channelId = scopeId || (config.personal_memory ? session.userId : session.channelId)
    // 过期桶直接丢弃：沉默超过 TTL 后回来，不该看到旧的上下文
    const stale = this.channelMemories.get(channelId)
    if (stale && this.isExpired(stale)) this.channelMemories.delete(channelId)
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, { dialogues: [], lastActivityAt: this.nowMs() })
    }

    const memory = this.channelMemories.get(channelId)
    // 真实用户发言才续期：TTL 衡量的是「用户沉默了多久」
    memory.lastActivityAt = this.nowMs()
    memory.dialogues.push({ role: 'user', content: prompt })
    this.updateChannelDialogue(session, prompt, session.username, config)

    if (config.enhanceReasoningProtection) {
      memory.dialogues.push({
        role: 'assistant',
        content: '<p>' + (config.enable_self_memory ? response : '…') + '</p>',
      })
    } else {
      memory.dialogues.push({
        role: 'assistant',
        content: config.enable_self_memory ? response : '…',
      })
    }

    if (memory.dialogues.length > config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-config.message_max_length)
    }
  }

  /** 记录一条仅由机器人发出的主动消息（不伪造用户发言） */
  recordAssistant(session: Session, content: string, config: MemoryConfig, scopeId?: string): void {
    if (!content) return
    let text = this.bracketFilter(content, config)
    text = this.memoryFilter(text, config)

    const channelId = scopeId || (config.personal_memory ? session.userId : session.channelId)
    // 已过期的桶视为不存在：读路径同样会懒删，写进去只会立刻被清掉。
    // 新建的桶从写入时刻计时，代表「一条消息都没留下的沉默用户不会被主动消息无限续命」。
    const existing = this.channelMemories.get(channelId)
    if (existing && this.isExpired(existing)) this.channelMemories.delete(channelId)
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, { dialogues: [], lastActivityAt: this.nowMs() })
    }

    const memory = this.channelMemories.get(channelId)
    memory.dialogues.push({
      role: 'assistant',
      content: config.enhanceReasoningProtection
        ? '<p>' + (config.enable_self_memory ? text : '…') + '</p>'
        : (config.enable_self_memory ? text : '…'),
    })
    // 主动消息只写内容、不续期：日记或主动消息不能把沉默用户的记忆永久留住

    if (memory.dialogues.length > config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-config.message_max_length)
    }
  }

  /** 记录一条群聊环境发言（含不对 bot 说的） */
  updateChannelDialogue(session: Session, prompt: string, name: string, config: MemoryConfig): void {
    if (!config.channel_dialogues) return
    const list = this.channelDialogues.get(session.channelId) || []
    list.push('"' + name + '" 说: ' + prompt)
    this.channelDialogues.set(
      session.channelId,
      list.length > config.channel_dialogues_max_length
        ? list.slice(-config.channel_dialogues_max_length)
        : list,
    )
  }

  // ---------- 读取 ----------

  getChannelDialogue(session: Session, config: MemoryConfig): string {
    if (!config.channel_dialogues) return ''
    const dialogue = this.channelDialogues.get(session.channelId)?.join('\n') || ''
    return '以下是群聊内最近的包括所有人的聊天记录，当当前对话涉及其中内容时你可以参考这些信息，但是要注意分辨发言人是谁：{\n'
      + dialogue + '\n}\n'
  }

  getChannelMemory(channelId: string): MemoryEntry[] {
    const memory = this.channelMemories.get(channelId)
    if (!memory) return []
    // 懒过期：sweep 有间隔，读的时候必须自己判断一次
    if (this.isExpired(memory)) {
      this.channelMemories.delete(channelId)
      return []
    }
    return memory.dialogues
  }

  getChannelContext(channelId: string): MemoryEntry[] {
    return this.getChannelMemory(channelId)
  }

  // ---------- 清理 ----------

  clearChannelMemory(channelId: string): void {
    this.channelMemories.delete(channelId)
  }

  clearChannelDialogue(channelId: string): void {
    this.channelDialogues.delete(channelId)
  }

  clearAll(): void {
    this.channelMemories.clear()
    this.channelDialogues.clear()
  }
}
