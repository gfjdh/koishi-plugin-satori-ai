import { Context, Session } from 'koishi';
import { Sat } from './types';
export declare class BroadcastManager {
    private ctx;
    private config;
    private idCounter;
    private broadcastMessages;
    constructor(ctx: Context, cfg: Sat.Config);
    createBroadcast(message: string, img: boolean): Promise<string>;
    deleteBroadcast(id: string): Promise<string>;
    seedBroadcast(session: Session): Promise<void>;
    getBroadcastList(): Promise<string>;
}
export declare class broadcastMessage {
    private ctx;
    private config;
    message: string;
    private alreadySentChannels;
    setTime: Date;
    private img;
    constructor(ctx: Context, cfg: Sat.Config, message: string, img: boolean);
    sendMessage(session: Session): Promise<void>;
    getAlreadySentChannels(): string;
}
