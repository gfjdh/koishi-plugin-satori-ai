/** 变量条目：字符串，或带简介的对象（简介会一起注入，让模型能就这个话题展开） */
export interface ScheduleVar {
    text: string;
    note?: string;
}
export interface ScheduleItem {
    /** 开始时间 "HH:MM" */
    start: string;
    /** 结束时间 "HH:MM"，省略表示到当天结束；小于开始时间表示跨午夜 */
    end?: string;
    /** 只在指定星期生效，省略表示每天 */
    days?: string[];
    /** 候选活动，至少一条 */
    activities: string[];
    /** 可选小插曲 */
    variations?: string[];
    /** 覆盖全局的小插曲概率 */
    variationChance?: number;
}
export interface ScheduleFile {
    template: string;
    /** 日程后面的说明，限定它只是「没有互动时才会去做」的安排 */
    hint: string;
    variationChance: number;
    vars: Record<string, ScheduleVar[]>;
    items: ScheduleItem[];
}
export interface ScheduleOptions {
    file: ScheduleFile;
    /** 时区偏移（小时），与分层记忆共用，保证时段与提示里的日期时间一致 */
    timezoneOffset: number;
    /** 可注入时钟，便于验证；生产环境不传 */
    now?: () => Date;
    /** 配置有问题时的告警出口（同一个问题只报一次） */
    warn?: (message: string) => void;
}
/** 只演示写法、不含角色扮演内容的示例文件 */
export declare function createExampleSchedule(): Record<string, any>;
/** 把 JSON 内容整理成引擎能用的结构；结构性错误只跳过对应部分 */
export declare function parseScheduleFile(raw: any, warn?: ScheduleOptions['warn']): ScheduleFile | null;
/**
 * 读取 ${dataDir}/schedule.json。文件不存在时写入示例；按 mtime 缓存，
 * 改完文件不用重启，下一次回复就会生效。
 */
export declare function loadScheduleFile(dataDir: string, warn?: ScheduleOptions['warn']): ScheduleFile | null;
/** 当前时刻的日程文本；没有条目命中时返回 null（此时不注入） */
export declare function buildScheduleText(options: ScheduleOptions): string | null;
