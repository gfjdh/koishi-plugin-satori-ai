import { Context, Session, h } from 'koishi';
import { Sat } from './types';
export declare class SAT extends Sat {
    config: Sat.Config;
    private apiClient;
    private memoryManager;
    constructor(ctx: Context, config: Sat.Config);
    private getAPIConfig;
    private getMemoryConfig;
    private getMiddlewareConfig;
    private registerCommands;
    private handleSatCommand;
    private checkFavorabilityBlock;
    private performPreChecks;
    private checkDuplicateDialogue;
    private handleFixedDialoguesCheck;
    private processInput;
    private generateResponse;
    private buildMessages;
    private buildSystemPrompt;
    private formatResponse;
    private clearSession;
    private addCommonSense;
    handleMiddleware(session: Session, prompt: string): Promise<string | h[]>;
}
export default SAT;
