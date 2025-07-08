// src/utils.ts
import { Context, Logger, Session } from 'koishi'
import { updateUserP } from './database'
import { User } from './types'
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

export function splitSentences(text: string, MIN_LENGTH: number, MAX_LENGTH:number): string[] {
  // 标点符号正则表达式（包括全角和半角句号、感叹号、问号，以及省略号）
  const PUNCTUATION_REGEX = /([。！？!?…]+)/g;

  // 第一步：按标点符号初步分割
  const rawSegments = text.split(PUNCTUATION_REGEX);
  const initialSentences: string[] = [];

  // 合并标点符号到前一个句子
  for (let i = 0; i < rawSegments.length; i += 2) {
    const sentence = rawSegments[i]?.trim() || '';
    const punctuation = rawSegments[i + 1]?.trim() || '';
    if (sentence) initialSentences.push(sentence + punctuation);
  }

  // 第二步：智能合并短句
  const finalSentences: string[] = [];
  let currentSentence = '';

  for (const sentence of initialSentences) {
    const potentialLength = currentSentence.length + sentence.length;

    // 如果当前句子过长，直接提交（保留超长原句）
    if (sentence.length > MAX_LENGTH) {
      if (currentSentence) finalSentences.push(currentSentence);
      finalSentences.push(sentence);
      currentSentence = '';
      continue;
    }

    // 合并策略
    if (potentialLength <= MAX_LENGTH) {
      currentSentence += sentence;
      // 达到最小长度时，如果接近上限则提前提交
      if (currentSentence.length >= MIN_LENGTH &&
          potentialLength >= MAX_LENGTH * 0.8) {
        finalSentences.push(currentSentence);
        currentSentence = '';
      }
    } else {
      finalSentences.push(currentSentence);
      currentSentence = sentence;
    }
  }

  // 处理剩余内容
  if (currentSentence) finalSentences.push(currentSentence);

  // 第三步：后处理短句合并
  return finalSentences.reduce((result, sentence) => {
    if (sentence.length < MIN_LENGTH && result.length > 0) {
      result[result.length - 1] += sentence;
    } else {
      result.push(sentence);
    }
    return result;
  }, [] as string[]);
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
 * @param prompt 包含待处理标签的原始字符串
 * @returns 处理后的字符串，所有匹配标签被替换为对应名称
 */
export function processPrompt(prompt: string): string {
  if (!prompt) return '';
  if (prompt.includes(':poke')) return '戳戳';
  prompt = prompt.replace(/<[^>]*?avatar[^>]*>/g, '。回复：');
  prompt = prompt.replace(/<[^>]*?img[^>]*>/g, '[图片]');
  prompt = prompt.replace(/<[^>]*?name="([^\"]*)"[^>]*>/g, (_, name) => `${name}`);
  // 处理输入的字符串，删除其中的‘**’
  prompt = prompt.replace(/\*\*/g, '');
  if (!prompt) return '**';
  return prompt.trim();
}

/**
 * @param prompt 包含待处理标签的原始字符串
 * @param words 需要过滤的关键词
 * @returns 处理后的字符串，删除含有关键词的部分
 */
export function filterResponse(prompt: string, words: string[]): {content: string, error: boolean} {
  const parts = prompt.split(/([（\[【《(][^）)]*[）\]】》)])/g);
  const filtered = parts.map(part => {
    if (part.startsWith('（') && part.endsWith('）') || part.startsWith('(') && part.endsWith(')') ||
        part.startsWith('[') && part.endsWith(']') || part.startsWith('【') && part.endsWith('】') || part.startsWith('《') && part.endsWith('》')) {
      return words.some(word => part.includes(word)) ? '' : part;
    }
    return part;
  }).join('');
  const cleaned = filtered.replace(/\s+/g, '');
  // 修改正则表达式，防止匹配嵌套标签并获取最后一组
  const answerRegex = /<p>((?!<\/?p>)[\s\S])*?<\/p/g;
  const answerRegex2 = /<doubaothinking>((?!<\/?doubaothinking>)[\s\S])*?<\/p/g;
  const answerRegex3 = /<doubaothinking>((?!<\/?doubaothinking>)[\s\S])*?<\/doubaothinking>/g;
  const answerRegex4 = /<answer>((?!<\/?answer>)[\s\S])*?<\/answer>/g;
  const answerRegex5 = /<doubaothinking>((?!<\/?doubaothinking>)[\s\S])*?<\/answer>/g;
  const answerMatches = cleaned.match(answerRegex);
  const answerMatches2 = cleaned.match(answerRegex2);
  const answerMatches3 = cleaned.match(answerRegex3);
  const answerMatches4 = cleaned.match(answerRegex4);
  const answerMatches5 = cleaned.match(answerRegex5);
  const lastAnswer = answerMatches ? answerMatches[answerMatches.length - 1] : null;
  const lastDoubao = answerMatches2 ? answerMatches2[answerMatches2.length - 1] : null;
  const lastAnswer3 = answerMatches3 ? answerMatches3[answerMatches3.length - 1] : null;
  const lastAnswer4 = answerMatches4 ? answerMatches4[answerMatches4.length - 1] : null;
  const lastAnswer5 = answerMatches5 ? answerMatches5[answerMatches5.length - 1] : null;
  const answerContent = lastAnswer || lastDoubao || lastAnswer3 || lastAnswer4 || lastAnswer5;
  if (!answerContent) {
    return {content: '有点问题，请重置对话', error: true};
  }
  const regex = /<p>|<\/p>|<doubaothinking>|<\/doubaothinking>|<\/p|<answer>|<\/answer>|<br>|<\/br>|<br\/>/g;
  const cleanedContent = answerContent.replace(regex, '');
  return cleanedContent ? {content: cleanedContent, error: false} : {content: '有点问题，请重置对话', error: true};
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

// 如果用户有通行证，更新用户p点数
export async function updateUserPWithTicket(ctx: Context, user: User, adjustment: number): Promise<void> {
  if (!user) return
  if (user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description === 'on') {
    await updateUserP(ctx, user, adjustment)
  }
}

// 寻找最长公共子串
export function findLongestCommonSubstring(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  let maxLength = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        maxLength = Math.max(maxLength, dp[i][j]);
      }
    }
  }

  return maxLength;
}

// 计算相同字符个数（中文字符）
export function countCommonChars(str1: string, str2: string): number {
  const chars1 = new Map<string, number>();
  const chars2 = new Map<string, number>();

  // 统计第一个字符串中的字符
  for (const char of str1) {
    if (/[\u4e00-\u9fff]/.test(char)) { // 中文字符
      chars1.set(char, (chars1.get(char) || 0) + 1);
    }
  }

  // 统计第二个字符串中的字符
  for (const char of str2) {
    if (/[\u4e00-\u9fff]/.test(char)) { // 中文字符
      chars2.set(char, (chars2.get(char) || 0) + 1);
    }
  }

  // 计算公共字符数量
  let commonCount = 0;
  for (const [char, count1] of chars1) {
    const count2 = chars2.get(char) || 0;
    commonCount += Math.min(count1, count2);
  }

  return commonCount;
}
