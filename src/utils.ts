// src/utils.ts
import { Session } from 'koishi'
import { MemoryConfig } from './types'

// 正则表达式特殊字符转义
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 时间处理工具
export function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

// 获取时间段描述
export function getTimeOfDay(hours: number): string {
  if (hours >= 5 && hours < 9) return '清晨'
  if (hours < 12) return '上午'
  if (hours < 14) return '中午'
  if (hours < 17) return '下午'
  if (hours < 19) return '傍晚'
  if (hours < 22) return '晚上'
  return '深夜'
}

// 内容处理工具
export function detectEnglishLetters(text: string): number {
  return (text.match(/[a-zA-Z]/g) || []).length
}

// URL格式化
export function trimSlash(url: string): string {
  return url.replace(/\/$/, '')
}

// 分句处理
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?])/g).filter(s => s.trim())
}

// 敏感词过滤
export function shouldFilterContent(
  content: string,
  blockWords: string[]
): boolean {
  return blockWords.some(word => content.includes(word))
}

// 会话哈希生成
export function generateSessionHash(session: Session): string {
  return `${session.platform}:${session.channelId}:${session.userId}`
}

// 记忆权重计算
export function calculateMemoryWeight(
  content: string,
  config: MemoryConfig
): number {
  const chineseCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishCount = content.length - chineseCount
  const total = chineseCount * 2 + englishCount
  return total > config.remember_min_length ? 1 : 0
}

// 随机数生成
export function probabilisticCheck(probability: number): boolean {
  return Math.random() < probability
}

// 类型守卫
export function isErrorWithMessage(
  error: unknown
): error is {
  response: any
  message: string
} {
  return typeof error === 'object' && error !== null && 'message' in error
}

// 扩展：添加表情符号检测
export function detectEmojis(text: string): number {
  const emojiRegex = /\p{Emoji}/gu
  return (text.match(emojiRegex) || []).length
}

//后续可通过实现以下接口增强工具模块：
export interface TextProcessor {
  process(content: string): string
}

export class TextProcessingPipeline {
  private processors: TextProcessor[] = []

  addProcessor(processor: TextProcessor): void {
    this.processors.push(processor)
  }

  run(content: string): string {
    return this.processors.reduce((acc, processor) =>
      processor.process(acc), content)
  }
}
