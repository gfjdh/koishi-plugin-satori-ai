import { ProfileEntry } from './schema';
import { GroupReportSpec } from './report-specs';
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
/** 群聊时间块归档的结果。group_state 复用 sat_memory.userState 字段存放 */
export interface GroupArchiveResult {
    topic?: string;
    summary?: string;
    group_state?: string;
}
export interface GroupSummaryResult {
    summary?: string;
    group_state?: string;
}
/** 群画像的类别。与个人画像分开：这里描述的是「群」，不是某个用户 */
export declare const GROUP_CATEGORY_LABELS: Record<string, string>;
export declare const GROUP_CATEGORY_ORDER: string[];
/**
 * 归档输入里的固定发言人标签。不随昵称变化：用户的昵称、用户消息里打出的称呼
 * 都可能是任意角色名，靠识别名字区分发言人是穷举不完的，所以只认标签。
 */
export declare const ROLE_USER = "\u7528\u6237";
export declare const ROLE_AI = "AI";
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
/** 把一个时间块内的群聊记录归档为一条 topic 记忆 */
export declare function buildGroupArchivePrompt(messages: string): {
    role: string;
    content: string;
}[];
/** 把子级群记忆汇总为父级群记忆 */
export declare function buildGroupSummaryPrompt(level: string, children: string): {
    role: string;
    content: string;
}[];
/** 增量更新群画像 */
export declare function buildGroupProfilePrompt(existing: ProfileEntry[], input: string): {
    role: string;
    content: string;
}[];
/**
 * 群聊「省流」的任务输入。
 * 人格、用户画像、好感度等由正常对话的系统提示负责，这里只给群聊材料和任务要求。
 */
export declare function buildGroupDigestTask(materials: string, range: string): {
    role: string;
    content: string;
}[];
/**
 * 群聊日报/周报/月报/年报的任务输入。
 * 与省流共用人格与材料格式，但篇幅更长，并要求附一段角色点评；
 * 最后一行让角色选一个最喜欢的群友，供调用方加好感度。
 */
export declare function buildGroupReportTask(materials: string, range: string, participants: string[], spec: GroupReportSpec): {
    role: string;
    content: string;
}[];
export declare function buildGroupDailyDigestTask(materials: string, range: string, participants: string[]): {
    role: string;
    content: string;
}[];
