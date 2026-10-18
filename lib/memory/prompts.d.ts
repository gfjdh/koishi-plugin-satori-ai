import { ProfileEntry } from './schema';
export interface ArchiveResult {
    topic?: string;
    summary?: string;
    user_state?: string;
}
/** 合并归档时模型为每一天返回的结果，date 用于与输入分组对齐 */
export interface ArchiveDayResult extends ArchiveResult {
    date?: string;
}
export interface SummaryResult {
    summary?: string;
    user_state?: string;
}
/** 判断话题是否切换 */
export declare function buildTopicSwitchPrompt(dialogues: string, topicStart: string): {
    role: string;
    content: string;
}[];
/** 把一段原始对话归档为一条 topic 记忆 */
export declare function buildTopicArchivePrompt(dialogues: string): {
    role: string;
    content: string;
}[];
/** 把连续多个稀疏日的对话合并成一次调用，按日分别归档 */
export declare function buildTopicBatchPrompt(days: {
    date: string;
    dialogues: string;
}[]): {
    role: string;
    content: string;
}[];
/** 把子级记忆汇总为父级记忆 */
export declare function buildSummaryPrompt(level: string, children: string): {
    role: string;
    content: string;
}[];
/** 增量更新用户画像 */
export declare function buildProfilePrompt(existing: ProfileEntry[], input: string): {
    role: string;
    content: string;
}[];
