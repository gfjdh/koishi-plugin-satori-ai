import { Session } from 'koishi';
export declare function escapeRegExp(str: string): string;
export declare function parseTimeToMinutes(timeStr: string): number;
export declare function parseTime(timestamp: number): number;
export declare function getTimeOfDay(hours: number): string;
export declare function detectEnglishLetters(text: string): number;
export declare function trimSlash(url: string): string;
export declare function splitSentences(text: string): string[];
export declare function shouldFilterContent(content: string, blockWords: string[]): boolean;
export declare function probabilisticCheck(probability: number): boolean;
export declare function isErrorWithMessage(error: unknown): error is {
    response: any;
    message: string;
};
/**
 * 将包含 `<...name="[xxx]"...>` 格式的文本替换
 * @param prompt 包含待处理标签的原始字符串
 * @returns 处理后的字符串，所有匹配标签被替换为对应名称
 */
export declare function processPrompt(prompt: string): string;
export declare function filterResponse(prompt: string, words: string[]): string;
export declare function addOutputCensor(session: Session, word: string, baseURL: string): void;
