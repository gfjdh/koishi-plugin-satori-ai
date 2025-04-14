import { Context, Session } from 'koishi';
import { User, Sat } from './types';
export declare class MoodManager {
    private ctx;
    private config;
    private moodMap;
    constructor(ctx: Context, config: Sat.Config);
    private initUser;
    private checkDailyReset;
    handleInputMoodChange(user: User): Promise<void>;
    handleOutputMoodChange(user: User): Promise<void>;
    applyMoodChange(user: User, delta: number): void;
    getMoodLevel(userId: string): string;
    getMoodValue(userId: string): number;
    generateMoodPrompt(userId: string): string;
    handlePocketMoney(session: Session): Promise<string>;
    setMood(id: string, mood: number): string;
    viewMood(session: Session, id: string): string;
}
