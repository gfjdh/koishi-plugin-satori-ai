// src/utils.ts

// 正则表达式特殊字符转义
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 时间处理工具
export function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

// 时间戳转分钟数
export function parseTime(timestamp: number): number {
  const date = new Date(timestamp)
  return date.getHours() * 60 + date.getMinutes()
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
  const sentences = text.split(/(?<=[。！？!?])/g).filter(s => s.trim())
  const result: string[] = []
  let temp = ''

  for (let i = 0; i < sentences.length; i++) {
    if (i === sentences.length - 2) {
      temp = temp + sentences[i] + sentences[i + 1]
      result.push(temp)
      break
    } else {
      temp += sentences[i]
      result.push(temp)
      temp = ''
    }
  }

  return result
}

// 敏感词过滤
export function shouldFilterContent(
  content: string,
  blockWords: string[]
): boolean {
  return blockWords.some(word => content.includes(word))
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
