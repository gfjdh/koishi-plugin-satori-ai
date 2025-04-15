import { Session, Context } from 'koishi';
declare module 'koishi' {
    interface Events {
        'game-result'(session: Session, result: gameResult): void;
    }
}
export interface gameResult {
    message: string;
    gameName: string;
}
/**
 * 单局游戏的抽象基类，提供通用生命周期方法
 */
export declare abstract class abstractGameSingleGame {
    protected session: Session;
    protected disposeListener: () => boolean;
    constructor(disposeListener: () => boolean, session: Session);
    startGame(): Promise<string>;
    endGame(): Promise<{
        message: string;
        gameName: string;
    }>;
    processInput(str: string): Promise<string>;
}
type Constructor<T> = new (...args: any[]) => T;
/**
 * 游戏管理抽象基类，管理多个频道的游戏实例
 */
export declare abstract class abstractGame<T extends abstractGameSingleGame> {
    protected gameClass: Constructor<T>;
    protected channelGames: Map<string, T>;
    constructor(GameClass: Constructor<T>);
    /**
     * 生成消息监听器，用于处理玩家输入
     * @param userID 玩家ID
     * @param guildID 服务器ID
     * @returns 监听函数，将输入转发给对应频道的游戏实例
     */
    protected listener: (userID: string, guildID: string) => ((session: Session) => void);
    /**
     * 启动游戏实例
     * @param session 会话上下文
     * @param ctx Koishi 上下文
     * @param args 启动参数（如难度等级）
     */
    startGame(session: Session, ctx: Context, args: string[]): Promise<abstractGameSingleGame | null>;
    /**
     * 结束游戏实例，触发结果事件
     */
    endGame(session: Session, ctx: Context): Promise<string>;
}
export {};
