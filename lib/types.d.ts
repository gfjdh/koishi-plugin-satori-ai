import { Context, Dict, Schema, Service } from 'koishi';
export declare const usage = "\u4F7F\u7528\u8BF4\u660E\u89C1\u63D2\u4EF6\u4E3B\u9875";
export interface User {
    id?: number;
    userid: string;
    usersname: string;
    p: number;
    favorability: number;
    time: Date;
}
export type FavorabilityAdjustment = number | {
    absolute: number;
};
export interface FavorabilityConfig {
    enable_favorability: boolean;
    censor_favorability: boolean;
    value_of_favorability: number;
    enable_auxiliary_LLM: boolean;
    prompt_0: string;
    favorability_div_1: number;
    prompt_1: string;
    favorability_div_2: number;
    prompt_2: string;
    favorability_div_3: number;
    prompt_3: string;
    favorability_div_4: number;
    prompt_4: string;
}
export type FavorabilityLevel = '厌恶' | '陌生' | '朋友' | '暧昧' | '恋人';
export interface MemoryEntry {
    role: string;
    content: string;
}
export interface ChannelMemory {
    dialogues: MemoryEntry[];
    updatedAt: number;
}
export interface MemoryConfig {
    dataDir: string;
    message_max_length: number;
    memory_block_words: string[];
    enable_self_memory: boolean;
    remember_min_length: number;
    common_topN: number;
    dailogues_topN: number;
}
export interface MiddlewareConfig {
    private: boolean;
    mention: boolean;
    random_min_tokens: number;
    randnum: number;
    max_tokens: number;
}
export interface APIConfig {
    baseURL: string;
    keys: string[];
    appointModel: string;
    auxiliary_LLM_URL: string;
    auxiliary_LLM: string;
    auxiliary_LLM_key: string[];
    content_max_tokens: number;
    temperature: number;
    frequency_penalty: number;
    presence_penalty: number;
    maxRetryTimes?: number;
    retry_delay_time?: number;
    reasoning_content?: boolean;
}
export interface APIError extends Error {
    response?: {
        status: number;
        data: {
            error?: {
                code: string;
                message: string;
            };
        };
    };
}
export interface FixedDialogue {
    triggers: string[];
    favorabilityRange?: [number, number];
    probability: number;
    timeRange?: [string, string];
    response: string;
    favorability?: number;
}
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
        baseURL: string;
        key: string[];
        appointModel: string;
        auxiliary_LLM_URL: string;
        auxiliary_LLM: string;
        auxiliary_LLM_key: string[];
        prompt: string;
        max_tokens: number;
        content_max_tokens: number;
        message_max_length: number;
        remember_min_length: number;
        temperature: number;
        frequency_penalty: number;
        presence_penalty: number;
        log_system_prompt: boolean;
        log_reasoning_content: boolean;
        authority: number;
        alias: string[];
        dataDir: string;
        enable_self_memory: boolean;
        memory_block_words: string[];
        common_topN: number;
        dailogues_topN: number;
        enable_fixed_dialogues: boolean;
        private: boolean;
        mention: boolean;
        random_min_tokens: number;
        randnum: number;
        sentences_divide: boolean;
        time_interval: number;
        max_parallel_count: number;
        reply_pointing: boolean;
        enable_favorability: boolean;
        censor_favorability: boolean;
        value_of_favorability: number;
        enable_auxiliary_LLM: boolean;
        visible_favorability: boolean;
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
        retry_delay_time: number;
    }
    const Config: Schema<Config>;
}
