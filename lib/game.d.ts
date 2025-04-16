import { Session, Context } from 'koishi';
import { Sat } from './types';
import { SAT } from './index';
/**
 * 游戏总控类，管理所有可用游戏和命令
 */
export declare class Game {
    private GAMES;
    private channelGames;
    private availableGames;
    private context;
    private config;
    private sat;
    constructor(ctx: Context, cfg: Sat.Config, sat: SAT);
    private registerCommands;
    startGame(session: Session, gameName: string, args: string[]): Promise<string>;
    endGame(session: Session): Promise<string>;
    private chat;
}
