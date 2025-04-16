import { Session } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
export declare enum winFlag {
    win = 1,
    lose = 2,
    draw = 3,
    pending = 4
}
export interface fencingGameResult extends gameResult {
    win: winFlag;
}
declare enum fencingAction {
    attack = 1,
    defence = 2
}
declare class fencingSingleGame extends abstractGameSingleGame {
    private winningFlag;
    private playerPosition;
    private enemyPosition;
    private availablePlayerActions;
    static fencingActionHint: Map<fencingAction, string>;
    constructor(disposeListener: () => boolean, session: Session);
    private render;
    startGame: () => Promise<string>;
    endGame: () => Promise<{
        message: string;
        win: winFlag;
        gameName: string;
        playerID: string;
    }>;
    private enemyDecision;
    processInput(str: string): Promise<string>;
}
export declare class fencing extends abstractGame<fencingSingleGame> {
    constructor();
}
export {};
