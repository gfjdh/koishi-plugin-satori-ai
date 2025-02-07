import { Session } from 'koishi';
import { User } from './types';
import { Context } from 'koishi';
export interface FixedDialogue {
    triggers: string[];
    favorabilityRange?: [number, number];
    probability: number;
    timeRange?: [string, string];
    response: string;
    favorability?: number;
}
export declare function handleFixedDialogues(ctx: Context, session: Session, user: User, config: {
    dataDir: string;
    enable_favorability: boolean;
    enable_fixed_dialogues: boolean;
}): Promise<string | null>;
export interface DialogueMatcher {
    match(session: Session, user: User): boolean;
}
export interface DialogueSelector {
    select(dialogues: FixedDialogue[]): FixedDialogue;
}
