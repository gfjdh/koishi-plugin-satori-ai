import { Session, Context } from 'koishi';
export declare class Game {
    private GAMES;
    private channelGames;
    private goBang;
    constructor(ctx: Context);
    private registerCommands;
    startGame(session: Session, gameName: string, args: string[]): Promise<string>;
    endGame(session: Session): Promise<"当前频道没有游戏在进行中" | "游戏已结束">;
    private selectGame;
}
