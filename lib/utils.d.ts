import { Context, Session } from 'koishi';
import { User } from './types';
export declare function escapeRegExp(str: string): string;
export declare function parseTimeToMinutes(timeStr: string): number;
export declare function parseTime(timestamp: number): number;
export declare function getTimeOfDay(hours: number): string;
export declare function detectEnglishLetters(text: string): number;
export declare function trimSlash(url: string): string;
export declare function splitSentences(text: string, MIN_LENGTH: number, MAX_LENGTH: number): string[];
export declare function shouldFilterContent(content: string, blockWords: string[]): boolean;
export declare function probabilisticCheck(probability: number): boolean;
export declare function isErrorWithMessage(error: unknown): error is {
    response: any;
    message: string;
};
/**
 * @param prompt 包含待处理标签的原始字符串
 * @returns 处理后的字符串，所有匹配标签被替换为对应名称
 */
export declare function processPrompt(prompt: string): string;
/**
 * @param prompt 包含待处理标签的原始字符串
 * @param words 需要过滤的关键词
 * @returns 处理后的字符串，删除含有关键词的部分
 */
export declare function filterResponse(prompt: string, words: string[], options?: {
    applyBracketFilter?: boolean;
    applyTagFilter?: boolean;
}): {
    content: string;
    error: boolean;
};
export declare function addOutputCensor(session: Session, word: string, baseURL: string): void;
export declare function updateUserPWithTicket(ctx: Context, user: User, adjustment: number): Promise<void>;
export declare function findLongestCommonSubstring(str1: string, str2: string): number;
export declare function countCommonChars(str1: string, str2: string): number;
export declare function wrapInHTML(str: string, width?: number): Promise<string>;
