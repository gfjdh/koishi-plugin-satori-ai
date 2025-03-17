// src/utils.ts
import { Logger, Session } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'

const logger = new Logger('satori-utils')

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

// 使用正则表达式分割文本为引号内外的部分
export function splitSentences(text: string): string[] {
  const parts = text.split(/(“[^”]*”|"[^"]*")/g);
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) { // 引号内的部分，直接加入结果
      result.push(part);
    } else { // 引号外的部分，使用原逻辑处理
      const outerSentences = splitOuterSentences(part);
      result.push(...outerSentences);
    }
  }
  // 过滤空字符串并返回
  return result.filter(s => s.trim() !== '');
}

// 处理引号外部分的分句逻辑
function splitOuterSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？!?])/g).filter(s => s.trim());
  const result: string[] = [];
  let temp = '';
  for (let i = 0; i < sentences.length; i++) {
    if (i === sentences.length - 2) {
      temp = sentences[i] + sentences[i + 1];
      result.push(temp);
      break;
    } else {
      temp += sentences[i];
      result.push(temp);
      temp = '';
    }
  }
  return result;
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

/**
 * 将包含 `<...name="[xxx]"...>` 格式的文本替换
 * @param prompt 包含待处理标签的原始字符串
 * @returns 处理后的字符串，所有匹配标签被替换为对应名称
 */
export function processPrompt(prompt: string): string {
  if (!prompt) return '';
  if (prompt.includes(':poke')) return '戳戳';
  return prompt.replace(/<[^>]*?name="([^\"]*)"[^>]*>/g, (_, name) => `@${name}`);
}

export function filterResponse(prompt: string, words: string[]): string {
  // 匹配中文括号及其内容，使用非贪婪模式
  const parts = prompt.split(/([（(][^）)]*[）)])/g);
  // 删除含有关键词的部分
  const filtered = parts.map(part => {
    if (part.startsWith('（') && part.endsWith('）') || part.startsWith('(') && part.endsWith(')')) {
      return words.some(word => part.includes(word)) ? '' : part;
    }
    return part;
  }).join('');
  // 清理首尾空白并处理空结果
  const trimmedResult = filtered.trim();
  return trimmedResult === '' ? '……' : trimmedResult;
}

// 添加输出屏蔽词
export function addOutputCensor(session: Session, word: string, baseURL: string): void {
  const blockWordsPath = path.resolve(baseURL, 'output_censor.txt');
  if (!fs.existsSync(blockWordsPath)) {
    fs.mkdirSync(blockWordsPath);
    fs.writeFileSync(blockWordsPath, word);
  }
  let blockWords = fs.readFileSync(blockWordsPath, 'utf-8').split(',')
  blockWords.push(word);
  fs.writeFileSync(blockWordsPath, blockWords.join(','));
  session.send(`添加"${word}"成功`);
}
