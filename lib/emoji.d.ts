import { Context, Session } from 'koishi';
import { Sat, User } from './types';
export declare class EmojiManager {
    private ctx;
    private config;
    private categories;
    private emojiDir;
    constructor(ctx: Context, config: Sat.Config);
    private loadEmojis;
    shouldSendEmoji(): boolean;
    getEmoji(session: Session, user: User, recentMessages: Sat.Msg[]): Promise<string | null>;
    private getAPIConfig;
    private callLLM;
}
