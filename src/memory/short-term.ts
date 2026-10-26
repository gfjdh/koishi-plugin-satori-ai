// src/memory/short-term.ts
// 短期记忆（内存 ring）。行为与重构前的 MemoryManager 保持一致：
// - channelMemories 保存用户↔bot 的最近 N 轮；
// - channelDialogues 保存频道内所有发言（含不对 bot 说的）。
import { Context, Session } from 'koishi'
import { ChannelMemory, MemoryConfig, MemoryEntry } from '../types'

export class ShortTermMemory {
  private channelMemories = new Map<string, ChannelMemory>()
  private channelDialogues = new Map<string, string[]>()

  constructor(private ctx: Context) {}

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
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, { dialogues: [], updatedAt: Date.now() })
    }

    const memory = this.channelMemories.get(channelId)
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
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, { dialogues: [], updatedAt: Date.now() })
    }

    const memory = this.channelMemories.get(channelId)
    memory.dialogues.push({
      role: 'assistant',
      content: config.enhanceReasoningProtection
        ? '<p>' + (config.enable_self_memory ? text : '…') + '</p>'
        : (config.enable_self_memory ? text : '…'),
    })
    memory.updatedAt = Date.now()

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
    return this.channelMemories.get(channelId)?.dialogues || []
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
