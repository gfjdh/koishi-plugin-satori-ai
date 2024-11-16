import { Context, Dict, Schema, Service } from 'koishi';
export declare const usage = "\u4F7F\u7528\u8BF4\u660E\u89C1\u63D2\u4EF6\u4E3B\u9875";
export declare class Sat extends Service {
    static inject: {
        required: string[];
        optional: string[];
    };
    output_type: string;
    session_config: Sat.Msg[];
    sessions: Dict;
    personality: Dict;
    sessions_cmd: string[];
    aliasMap: any;
    type: string;
    l6k: boolean;
    key_number: number;
    maxRetryTimes: number;
    constructor(ctx: Context, config: Sat.Config);
}
export declare namespace Sat {
    interface Msg {
        role: string;
        content: string;
    }
    interface Payload {
        engine: string;
        prompt: string;
        temperature: number;
        max_tokens?: number;
        top_p: number;
        frequency_penalty: number;
        presence_penalty: number;
    }
    interface Config {
        enableContext: boolean;
        baseURL: string;
        key: string[];
        appointModel: string;
        prompt: string;
        max_tokens: number;
        content_max_tokens: number;
        message_max_length: number;
        remember_min_length: number;
        enable_self_memory: boolean;
        memory_block_words: string[];
        dataDir: string;
        temperature: number;
        authority: number;
        enable_fixed_dialogues: boolean;
        alias: string[];
        private: boolean;
        mention: boolean;
        random_min_tokens: number;
        randnum: number;
        sentences_divide: boolean;
        time_interval: number;
        enable_favorability: boolean;
        prompt_0: string;
        favorability_div_1: number;
        prompt_1: string;
        favorability_div_2: number;
        prompt_2: string;
        favorability_div_3: number;
        prompt_3: string;
        favorability_div_4: number;
        prompt_4: string;
        blockuser: string[];
        blockchannel: string[];
        maxRetryTimes: number;
    }
    const Config: Schema<Config>;
}
