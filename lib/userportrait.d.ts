import { Context, Session } from 'koishi';
import { Sat, User } from './types';
import { APIClient } from './api';
export declare class UserPortraitManager {
    private ctx;
    private config;
    constructor(ctx: Context, config: Sat.Config);
    private getPortraitPath;
    hasPortrait(userId: string): boolean;
    readPortrait(userId: string): string;
    private getDialogues;
    private buildMessage;
    generatePortrait(session: Session, user: User, apiClient: APIClient): Promise<void>;
    private savePortrait;
    private ensurePortraitFile;
    getUserPortrait(session: Session): string;
    private getFavorabilityConfig;
}
