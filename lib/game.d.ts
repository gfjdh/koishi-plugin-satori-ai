import { Session, Context } from 'koishi';
import { Sat } from './types';
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
    constructor(ctx: Context, cfg: Sat.Config, sat: Sat);
    private registerCommands;
    startGame(session: Session, gameName: string, args: string[]): Promise<"当前频道已经有游戏在进行中" | "没有这个游戏哦">;
    endGame(session: Session): Promise<string>;
    private selectGame;
}
