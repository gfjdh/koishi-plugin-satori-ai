import { Context, Session } from 'koishi';
import { Sat } from './types';
export declare class Galgame {
    private ctx;
    private config;
    private ongoingEvents;
    private waitingForOptions;
    private completedEvents;
    private currentId;
    constructor(ctx: Context, config: Sat.Config);
    private loadEvent;
    private sendStoryContent;
    private computeAutoAdvanceDelay;
    private handleEventProgress;
    private handleEnding;
    private updateFavorability;
    private updatePPoints;
    private updateItemRewards;
    startEvent(session: Session, eventName?: string): Promise<void>;
    handleOption(session: Session, optionId: number): Promise<void>;
    initialize(): Promise<void>;
}
