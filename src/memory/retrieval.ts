// src/memory/retrieval.ts
// 纯函数检索层：中文分词 + BM25 + 时间衰减。
// 没有任何 IO，可以离线用 `npx tsx` 直接验证。

/** 停用词。种子来自旧 memory.ts 的 charactersToRemove，并扩充虚词/连词/高频动词。 */
export const STOPWORDS = new Set([
  '的', '一', '是', '了', '什', '么', '我', '谁', '不', '人', '在', '他', '有', '这', '个', '上',
  '们', '来', '到', '时', '大', '地', '为', '子', '中', '你', '说', '生', '国', '年', '着', '就',
  '那', '和', '要', '她', '出', '也', '得', '里', '后', '自', '以', '会', '啊', '吧', '吗', '呢',
  '呀', '哦', '嗯', '额', '哈', '呗', '啦', '嘛', '唉', '喂', '诶',
  '然后', '但是', '因为', '所以', '如果', '可以', '什么', '怎么', '这样', '那样', '还是', '就是',
  '只是', '已经', '一下', '一个', '没有', '知道', '觉得', '可能', '应该', '现在', '时候', '自己',
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '真的', '不是', '的是', '了的', '我是',
  '你是', '他是', '她说', 'reply', 'system', 'user', 'assistant',
])

/**
 * 中文检索的无词典分词：unigram + bigram。
 * - unigram 过滤停用字；
 * - bigram 不过滤（含停用字的 bigram 常常有意义，例如“的时候”）；
 * - 英文/数字整串保留。
 */
export function segment(text: string): string[] {
  if (!text) return []
  const tokens: string[] = []
  const lower = text.toLowerCase()

  for (const match of lower.matchAll(/[a-z0-9_]+/g)) {
    tokens.push(match[0])
  }
  for (const match of lower.matchAll(/[一-龥]+/g)) {
    const s = match[0]
    for (let i = 0; i < s.length; i++) {
      if (!STOPWORDS.has(s[i])) tokens.push(s[i])
      if (i + 1 < s.length) tokens.push(s.slice(i, i + 2))
    }
  }
  return tokens
}

export interface RetrievalDocument {
  id: number
  content: string
  /** 记忆的结束时间，用于新近度衰减 */
  timestamp?: Date
}

const K1 = 1.5
const B = 0.75
const RECENCY_WEIGHT = 0.25
const BM25_WEIGHT = 0.75
const DEFAULT_HALFLIFE_DAYS = 30

/** 单个汉字只提供很弱的证据（“力”不该把“压力”和“力学”判为同一话题） */
const SINGLE_CHAR_WEIGHT = 0.3

function isSingleChineseChar(token: string): boolean {
  return token.length === 1 && /[一-龥]/.test(token)
}

function termWeight(token: string): number {
  return isSingleChineseChar(token) ? SINGLE_CHAR_WEIGHT : 1
}

/**
 * 一个查询词是否算“有意义”：多字词或英文/数字整串。
 * 单个汉字只有在查询里根本没有多字词时才作为有效证据（例如只问“猫”）。
 */
function isMeaningful(token: string): boolean {
  return !isSingleChineseChar(token)
}

/**
 * 计算 BM25 分数。
 * idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
 * score  = Σ_{t ∈ unique(query)} idf(t) * tf*(k1+1) / (tf + k1*(1-b+b*|d|/avgdl))
 */
export function scoreBM25(query: string, docs: RetrievalDocument[]): Map<number, number> {
  const scores = new Map<number, number>()
  if (!docs.length) return scores

  // 查询词去重，否则查询中重复出现的词会被重复计分
  const queryTerms = [...new Set(segment(query))]
  if (!queryTerms.length) return scores

  const docTokens = docs.map(doc => segment(doc.content))
  const docLengths = docTokens.map(tokens => tokens.length)
  const avgLength = docLengths.reduce((sum, len) => sum + len, 0) / docs.length

  const documentFrequency = new Map<string, number>()
  for (const tokens of docTokens) {
    const unique = new Set(tokens)
    for (const term of queryTerms) {
      if (unique.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
    }
  }

  const total = docs.length
  const hasMeaningfulTerm = queryTerms.some(isMeaningful)
  docs.forEach((doc, index) => {
    const termFrequency = new Map<string, number>()
    for (const token of docTokens[index]) {
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1)
    }

    let score = 0
    let matchedMeaningful = false
    for (const term of queryTerms) {
      const tf = termFrequency.get(term) || 0
      if (!tf) continue
      if (isMeaningful(term)) matchedMeaningful = true
      const df = documentFrequency.get(term) || 0
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5))
      const lengthNorm = avgLength > 0 ? docLengths[index] / avgLength : 0
      score += termWeight(term) * idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * lengthNorm))
    }

    // 查询里有多个字组成的词时，只命中单个汉字的文档不算有效召回
    if (hasMeaningfulTerm && !matchedMeaningful) return
    if (score > 0) scores.set(doc.id, score)
  })

  return scores
}

export interface RankedDocument<T> {
  doc: T
  score: number
}

/**
 * BM25 归一化后与时间衰减加权。
 * recency = 0.5 ^ (ageDays / halflifeDays)
 */
export function rankDocuments<T extends RetrievalDocument>(
  query: string,
  docs: T[],
  options?: { halflifeDays?: number; now?: Date },
): RankedDocument<T>[] {
  if (!docs.length) return []

  const halflife = options?.halflifeDays ?? DEFAULT_HALFLIFE_DAYS
  const now = options?.now ?? new Date()
  const bm25 = scoreBM25(query, docs)

  let maxScore = 0
  for (const value of bm25.values()) maxScore = Math.max(maxScore, value)
  if (maxScore <= 0) return []

  const ranked: RankedDocument<T>[] = docs
    .filter(doc => bm25.has(doc.id))
    .map((doc) => {
      const normalized = (bm25.get(doc.id) || 0) / maxScore
      const recency = computeRecency(doc.timestamp, now, halflife)
      return {
        doc,
        score: BM25_WEIGHT * normalized + RECENCY_WEIGHT * recency,
      }
    })

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

function computeRecency(timestamp: Date | undefined, now: Date, halflifeDays: number): number {
  if (!timestamp) return 0.5
  const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return 0.5
  const ageDays = Math.max(0, (now.getTime() - time) / 86_400_000)
  return Math.pow(0.5, ageDays / halflifeDays)
}

/**
 * 返回“最近一个已经过去的日界线时刻”（真实 UTC 时间）。
 *
 * 参考实现用 now() 返回 Date.now()+8h 再配 setUTCHours/getUTC* 读墙面钟，
 * 一旦一次性迁移漏跑或跑两次就会让所有时间戳错乱。这里输入输出都是真实时刻。
 */
export function lastBoundary(now: Date, timezoneOffsetHours: number, boundaryHour: number): Date {
  const offsetMs = timezoneOffsetHours * 3_600_000
  const shifted = new Date(now.getTime() + offsetMs)
  const boundaryLocal = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    boundaryHour, 0, 0, 0,
  )
  const resolved = shifted.getTime() < boundaryLocal ? boundaryLocal - 86_400_000 : boundaryLocal
  return new Date(resolved - offsetMs)
}

/** 截断到指定长度，尽量不切断代理对 */
export function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text
  if (maxChars <= 0) return ''
  const sliced = text.slice(0, maxChars)
  const lastCode = sliced.charCodeAt(sliced.length - 1)
  // 孤立的高位代理会让字符串出现乱码字符
  return (lastCode >= 0xD800 && lastCode <= 0xDBFF) ? sliced.slice(0, -1) : sliced
}
