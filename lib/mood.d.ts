import { Context, Session } from 'koishi';
import { User, Sat } from './types';
export declare class MoodManager {
    private ctx;
    private config;
    private moodMap;
    constructor(ctx: Context, config: Sat.Config);
    private initUser;
    /** 每日重置值，与配置说明「每天重置为 mood_div_1 + value_of_output_mood」保持一致 */
    private defaultMood;
    private isNewDay;
    /**
     * 跨天时把内存中的心情重置为默认值。
     * 必须同步完成：getMoodLevel/getMoodValue 是同步 getter，不能等数据库。
     */
    private resetIfNewDay;
    /** 「点心盒」按道具说明在购买后的下一次对话自动消耗，并把心情清零 */
    private consumeSnackBox;
    handleInputMoodChange(user: User, favorabilityLevel: string): Promise<void>;
    handleOutputMoodChange(user: User, favorabilityLevel: string): Promise<void>;
    applyMoodChange(user: User, delta: number): Promise<void>;
    getMoodLevel(userId: string): string;
    getMoodValue(userId: string): number;
    generateMoodPrompt(userId: string): string;
    handlePocketMoney(session: Session): Promise<string>;
    setMood(id: string, mood: number): string;
    viewMood(session: Session, id: string): string;
}
