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
export function filterResponse(
  prompt: string,
  words: string[],
  options?: { applyBracketFilter?: boolean; applyTagFilter?: boolean }
): { content: string; error: boolean } {
  const applyBracketFilter = options?.applyBracketFilter ?? true;
  const applyTagFilter = options?.applyTagFilter ?? true;

  let working = prompt;
  // 只有在显式要求时才进行括号/方括号段落的过滤
  if (applyBracketFilter) {
    // 修复灾难性回溯：限制括号内容最大长度，避免正则引擎陷入指数级回溯
    // 原正则 [^）)]* 在遇到大量不匹配括号时会导致灾难性回溯
    const parts = working.split(/([（\[【《(][^）)]{0,500}[）\]】》)])/g);
    const filtered = parts
      .map(part => {
        if (
          (part.startsWith('（') && part.endsWith('）')) ||
          (part.startsWith('(') && part.endsWith(')')) ||
          (part.startsWith('[') && part.endsWith(']')) ||
          (part.startsWith('【') && part.endsWith('】')) ||
          (part.startsWith('《') && part.endsWith('》'))
        ) {
          return words.some(word => part.includes(word)) ? '' : part;
        }
        return part;
      })
      .join('…');
    working = filtered.replace(/\s+/g, '…');
    if (!working) {
      working = prompt;
    }
  }

  // 如果不需要标签过滤，直接返回原始文本（或经过括号过滤后的文本）作为成功内容
  if (!applyTagFilter) {
    return working ? { content: working, error: false } : { content: '有点问题，请重置对话', error: true };
  }

  // 标签过滤/抽取逻辑：优先收集所有 <p>...</p> 的内容并拼接；若没有则尝试其它标签（doubaothinking/answer）
  const pTagRegex = /<p>[\s\S]*?<\/p>/g;
  const doubaoRegex = /<doubaothinking>[\s\S]*?<\/doubaothinking>/g;
  const answerTagRegex = /<answer>[\s\S]*?<\/answer>/g;

  const pMatches = working.match(pTagRegex) || [];
  const doubaoMatches = working.match(doubaoRegex) || [];
  const answerTagMatches = working.match(answerTagRegex) || [];

  let combined: string | null = null;

  if (pMatches.length > 0) {
    // 去掉每一项的 <p> 标签并拼接
    combined = pMatches.map(s => s.replace(/^<p>/i, '').replace(/<\/p>$/i, '')).join('，');
  } else if (doubaoMatches.length > 0) {
    combined = doubaoMatches.map(s => s.replace(/<doubaothinking>/i, '').replace(/<\/doubaothinking>/i, '')).join('，');
  } else if (answerTagMatches.length > 0) {
    combined = answerTagMatches.map(s => s.replace(/<answer>/i, '').replace(/<\/answer>/i, '')).join('，');
  }

  if (!combined) {
    return { content: '有点问题，请重置对话', error: true };
  }

  // 清理残留的常见标签和换行标记
  const cleanupRegex = /<p>|<\/p>|<doubaothinking>|<\/doubaothinking>|<answer>|<\/answer>|<br>|<\/br>|<br\/>/gi;
  const cleanedContent = combined.replace(cleanupRegex, '').trim();
  return cleanedContent ? { content: cleanedContent, error: false } : { content: '有点问题，请重置对话', error: true };
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

  // 如果任一字符串中含有 >=3 个数字，则确保返回值至少为 2
  const countDigits = (s: string) => (s.match(/\d/g) || []).length;
  const digits1 = countDigits(str1);
  const digits2 = countDigits(str2);
  if (digits1 >= 3 || digits2 >= 3) {
    return Math.max(commonCount, 2);
  }

  return commonCount;
}

import { puppeteer } from '.'
export async function wrapInHTML(str: string, width: number = 20): Promise<string> {
  if (!puppeteer) {
    logger.warn('puppeteer未就绪')
    return '出现错误，请联系管理员'
  }
  // 为了让渲染出的图片每行最多约为 20 个字符，我们使用 ch 单位限制宽度，
  // 并启用 pre-wrap/overflow-wrap/word-break 保留换行并允许中英文自动换行。
  // 如果你需要改成 10~20 之间的可配置值，可以将 20ch 改为变量或传入参数。
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        /* 让页面宽度随内容收缩，这样 puppeteer 渲染产物不会有大片空白 */
        html, body {
          margin: 0;
          padding: 0;
          width: auto;
          height: auto;
          display: inline-block; /* shrink-to-fit */
          background: transparent;
        }
        .satori-text {
          padding: 10px;
          display: inline-block;
          box-sizing: border-box;
          font-family: "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif;
          font-size: 16px;
          line-height: 1.4;
          /* 最大约 20 个字符宽度（可调整为 10-20ch） */
          max-width: ${width}ch;
          /* 同时允许内容根据文字宽度收缩（fit-content 在一些旧浏览器需备份） */
          width: -moz-fit-content;
          width: fit-content;
          /* 保留输入中的换行符并在需要时换行 */
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          -webkit-font-smoothing: antialiased;
        }
      </style>
    </head>
    <body>
      <div class="satori-text">${str.replaceAll(/\n/g, '<br/>')}</div>
    </body>
  </html>`;

  try {
    // 增加超时保护，防止 puppeteer 渲染卡死导致整个实例阻塞
    // Windows 更新后可能影响 Chromium 的 GPU/沙箱行为
    const renderPromise = puppeteer.render(html);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Puppeteer 渲染超时')), 30000)
    );
    return await Promise.race([renderPromise, timeoutPromise]);
  } catch (error) {
    logger.error(`Puppeteer 渲染失败: ${error}`)
    return '渲染失败，请联系管理员'
  }
}
