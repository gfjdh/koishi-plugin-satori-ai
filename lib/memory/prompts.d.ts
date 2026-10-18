import { ProfileEntry } from './schema';
export interface ArchiveResult {
    topic?: string;
    summary?: string;
    user_state?: string;
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
