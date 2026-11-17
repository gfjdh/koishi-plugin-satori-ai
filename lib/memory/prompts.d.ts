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
 * 群记忆每一层的 summary 上限（topic 归档与 day/week/month/season/year 汇总共用）。
 * 只约束提示词，不做代码截断：模型按这个长度自行取舍。
 */
export declare const GROUP_SUMMARY_MAX_CHARS = 1000;
/**
 * 个人记忆各级汇总的 summary 上限（字），按时间跨度递增。
 * 参考生产库实测长度（p90）：day 194 / week 555 / month 1006 / season 1381 / year 2449，
 * 上限压在 p90 附近，日常节点不受影响，只压明显膨胀的。只约束提示词，不做截断。
 */
export declare const SUMMARY_MAX_CHARS: Record<string, number>;
/** topic 归档（单日与批量）的 summary 上限，同样只约束提示词 */
export declare const TOPIC_SUMMARY_MAX_CHARS = 300;
/**
 * 归档输入里的固定发言人标签。不随昵称变化：用户的昵称、用户消息里打出的称呼
 * 都可能是任意角色名，靠识别名字区分发言人是穷举不完的，所以只认标签。
 */
export declare const ROLE_USER = "\u7528\u6237";
/** 昵称列表为空时的兜底标签；正常情况由昵称列表第一个提供 */
export declare const BOT_NAME_FALLBACK = "\u89D2\u8272";
/** 机器人作为发言人/记忆主语时的名字：优先用配置里的第一个昵称 */
export declare function resolveBotName(botName?: string): string;
/** 判断话题是否切换 */
export declare function buildTopicSwitchPrompt(dialogues: string, topicStart: string): {
    role: string;
    content: string;
}[];
/** 把一段原始对话归档为一条 topic 记忆 */
export declare function buildTopicArchivePrompt(dialogues: string, botName?: string): {
    role: string;
    content: string;
}[];
/** 把连续多个稀疏日的对话合并成一次调用，按日分别归档 */
export declare function buildTopicBatchPrompt(days: {
    date: string;
    dialogues: string;
}[], botName?: string): {
    role: string;
    content: string;
}[];
/** 把子级记忆汇总为父级记忆 */
export declare function buildSummaryPrompt(level: string, children: string, botName?: string): {
    role: string;
    content: string;
}[];
/** 增量更新用户画像 */
export declare function buildProfilePrompt(existing: ProfileEntry[], input: string, botName?: string): {
    role: string;
    content: string;
}[];
/** 把一个时间块内的群聊记录归档为一条 topic 记忆 */
export declare function buildGroupArchivePrompt(messages: string, botName?: string): {
    role: string;
    content: string;
}[];
/** 把子级群记忆汇总为父级群记忆 */
export declare function buildGroupSummaryPrompt(level: string, children: string, botName?: string): {
    role: string;
    content: string;
}[];
/** 增量更新群画像 */
export declare function buildGroupProfilePrompt(existing: ProfileEntry[], input: string, botName?: string): {
    role: string;
    content: string;
}[];
/**
 * 省流概要的目标篇幅，按材料长度等比换算。
 *
 * 实测（2026-11-17，生产库 8 个群）：默认「上次发言以来」的材料中位数约
 * 3600 字，500 字对这个量刚好，于是取 7:1——材料 7 字对应概要 1 字。
 * 材料大多来自未归档原文（一天约 30~60 条、每条 30 字上下），压缩比 7:1
 * 与常规摘要一致；已归档节点占比高的请求会略偏短，但不会短到没有内容。
 */
export declare const DIGEST_CHARS_PER_MATERIAL = 7;
/** 材料很少时也至少给出一段完整的话 */
export declare const DIGEST_MIN_TARGET_CHARS = 150;
/** 材料极多时的上限，避免一次回复刷屏 */
export declare const DIGEST_MAX_TARGET_CHARS = 3000;
export declare function digestTargetChars(materials: string): number;
/**
 * 群聊「省流」的任务输入。
 * 人格、用户画像、好感度等由正常对话的系统提示负责，这里只给群聊材料和任务要求。
 */
export declare function buildGroupDigestTask(materials: string, range: string): {
    role: string;
    content: string;
}[];
export interface GroupReportTaskOptions {
    /** 上一份报告选中的群友，本期不能重复选 */
    previousFavoriteName?: string;
    /** 活跃榜候选（按发言条数降序）；为空时不输出活跃榜 */
    ranking?: {
        name: string;
        count: number;
    }[];
    /** 报纸刊名 */
    masthead?: string;
}
/**
 * 群聊日报/周报/月报/年报的任务输入。
 *
 * 输出被要求拆成报纸栏目（头条/导语/要闻/金句/活跃/点评/热词/最喜欢），
 * 由 report-card 分块渲染；解析不到标记时渲染器会退回整块正文。
 */
export declare function buildGroupReportTask(materials: string, range: string, participants: string[], spec: GroupReportSpec, options?: GroupReportTaskOptions): {
    role: string;
    content: string;
}[];
export declare function buildGroupDailyDigestTask(materials: string, range: string, participants: string[], options?: GroupReportTaskOptions): {
    role: string;
    content: string;
}[];
