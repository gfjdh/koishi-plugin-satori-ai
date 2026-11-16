import { Context, Session } from 'koishi';
import { User } from './types';
export declare function getMentionedUser(session: Session): {
    id: string;
    name?: string;
} | null;
export declare function escapeRegExp(str: string): string;
export declare function parseTimeToMinutes(timeStr: string): number;
export declare function parseTime(timestamp: number): number;
export declare function getTimeOfDay(hours: number): string;
export declare function detectEnglishLetters(text: string): number;
export declare function trimSlash(url: string): string;
export declare function splitSentences(text: string, MIN_LENGTH: number, MAX_LENGTH: number): string[];
export declare function shouldFilterContent(content: string, blockWords: string[]): boolean;
/**
 * 输入是否被 censor 命中。
 * mint-filter 会把屏蔽词的每个字符替换成 '*'，所以连续的 '**' 就是命中标记。
 * 注意不要把「只剩称呼」的空消息占位符（见 EMPTY_PROMPT）算进来。
 */
export declare function hasCensorMark(content: string): boolean;
export declare function probabilisticCheck(probability: number): boolean;
export declare function isErrorWithMessage(error: unknown): error is {
    response: any;
    message: string;
};
/**
 * 消息去掉称呼后什么也不剩（且连 @ 的名字都拿不到）时的兜底占位符。
 *
 * 这里不能用 '**'：审查命中（censor 把屏蔽词替换成等长星号）也是 '**'，
 * 两者混用会让空消息被 inputContentCheck 当成触发屏蔽词，白白扣掉一整档好感度，
 * 回复后面还会挂上「(好感↓↓)」。
 */
export declare const EMPTY_PROMPT = "\uFF08\u7A7A\uFF09";
/**
 * @param prompt 包含待处理标签的原始字符串
 * @param botNames bot 的称呼列表；用于去掉 @bot / 以昵称开场这类「称呼」，
 *   它们只是唤起方式，不应该进入对话记录与总结
 * @param botIds bot 的账号 id；群名片可能改得和正文很像，优先用 id 判断 @ 的是不是 bot
 * @returns 处理后的字符串，所有匹配标签被替换为对应名称
 */
export declare function processPrompt(prompt: string, botNames?: string[], botIds?: string[]): string;
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
