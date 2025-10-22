import { Context, Session } from 'koishi';
import { Sat } from './types';
export declare class WeatherManager {
    private ctx;
    private config;
    private lastFetchTime;
    private weatherCache;
    constructor(ctx: Context, config: Sat.Config, lastFetchTime?: Map<string, number>, weatherCache?: Map<string, string>);
    private generateJWT;
    private fetchJson;
    updateLocation(session: Session, location: string): Promise<string | void>;
    getWeatherInfo(session: Session): Promise<string | null>;
    buildWeatherPrompt(session: Session): Promise<string | null>;
}
