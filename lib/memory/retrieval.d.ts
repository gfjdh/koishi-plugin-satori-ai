/** 停用词。种子来自旧 memory.ts 的 charactersToRemove，并扩充虚词/连词/高频动词。 */
export declare const STOPWORDS: Set<string>;
/**
 * 中文检索的无词典分词：unigram + bigram。
 * - unigram 过滤停用字；
 * - bigram 不过滤（含停用字的 bigram 常常有意义，例如“的时候”）；
 * - 英文/数字整串保留。
 */
export declare function segment(text: string): string[];
export interface RetrievalDocument {
    id: number;
    content: string;
    /** 记忆的结束时间，用于新近度衰减 */
    timestamp?: Date;
}
/**
 * 计算 BM25 分数。
 * idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
 * score  = Σ_{t ∈ unique(query)} idf(t) * tf*(k1+1) / (tf + k1*(1-b+b*|d|/avgdl))
 */
export declare function scoreBM25(query: string, docs: RetrievalDocument[]): Map<number, number>;
export interface RankedDocument<T> {
    doc: T;
    score: number;
}
/**
 * BM25 归一化后与时间衰减加权。
 * recency = 0.5 ^ (ageDays / halflifeDays)
 */
export declare function rankDocuments<T extends RetrievalDocument>(query: string, docs: T[], options?: {
    halflifeDays?: number;
    now?: Date;
}): RankedDocument<T>[];
/**
 * 返回“最近一个已经过去的日界线时刻”（真实 UTC 时间）。
 *
 * 参考实现用 now() 返回 Date.now()+8h 再配 setUTCHours/getUTC* 读墙面钟，
 * 一旦一次性迁移漏跑或跑两次就会让所有时间戳错乱。这里输入输出都是真实时刻。
 */
export declare function lastBoundary(now: Date, timezoneOffsetHours: number, boundaryHour: number): Date;
/** 截断到指定长度，尽量不切断代理对 */
export declare function truncate(text: string, maxChars: number): string;
