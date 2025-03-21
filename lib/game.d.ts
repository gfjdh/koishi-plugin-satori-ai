import { Session, Context } from 'koishi';
export declare class Game {
    private GAMES;
    private channelGames;
    private availableGames;
    private context;
    constructor(ctx: Context);
    private registerCommands;
    startGame(session: Session, gameName: string, args: string[]): Promise<"当前频道已经有游戏正在进行中" | "没有这个游戏哦">;
    endGame(session: Session): Promise<string>;
    private selectGame;
}
