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
export declare abstract class abstractGameSingleGame {
    protected session: Session;
    protected disposeListener: () => boolean;
    constructor(disposeListener: () => boolean, session: Session);
    startGame(): string;
    endGame(): {
        message: string;
        gameName: string;
    };
    processInput(str: string): Promise<string>;
}
type Constructor<T> = new (...args: any[]) => T;
export declare abstract class abstractGame<T extends abstractGameSingleGame> {
    protected gameClass: Constructor<T>;
    constructor(GameClass: Constructor<T>);
    protected channelGames: Map<string, T>;
    protected listener: (userID: string, guildID: string) => ((session: Session) => void);
    startGame(session: Session, ctx: Context, args: string[]): abstractGameSingleGame | null;
    endGame(session: Session, ctx: Context): string;
}
export {};
