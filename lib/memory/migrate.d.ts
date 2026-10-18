import { Context } from 'koishi';
import { MemoryRepository } from './repository';
export interface MigrateResult {
    dialogues: number;
    skippedDialogues: number;
    /** role 为 "user"、没有可信时间的条目 */
    skippedUndated: number;
    /** 同文件内 role+content 完全相同的重复条目 */
    duplicates: number;
    portraits: number;
    knowledge: number;
}
export declare class Migrator {
    private ctx;
    private repo;
    private dataDir;
    private personalMemory;
    private timezoneOffset;
    constructor(ctx: Context, repo: MemoryRepository, dataDir: string, personalMemory: boolean, timezoneOffset?: number);
    migrate(force?: boolean): Promise<MigrateResult>;
    private getMigratedAt;
    private migrateDialogues;
    private insertLegacyDialogues;
    /**
     * 旧时间由 `new Date().toLocaleString()` 在服务器的 locale 时区写出，
     * 实测服务器为 Asia/Shanghai。这里把“墙上时间”换算成真实 UTC。
     */
    private parseLegacyTime;
    private toUtc;
    private migratePortraits;
    private migrateKnowledge;
    private listFiles;
    private readText;
    private readJsonArray;
}
