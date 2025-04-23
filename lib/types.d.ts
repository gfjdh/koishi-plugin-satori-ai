import { Context, Schema, Service } from 'koishi';
export declare const usage = "\u4F7F\u7528\u8BF4\u660E\u89C1\u63D2\u4EF6\u4E3B\u9875";
export interface User {
    id?: number;
    userid: string;
    usersname: string;
    p: number;
    favorability: number;
    userlevel: number;
    usage: number;
    lastChatTime?: number;
    items?: Record<string, ItemInfo>;
}
export interface ItemInfo {
    id: string;
    count: number;
    price?: number;
    description?: string;
    favorability?: number;
    metadata?: Record<string, any>;
}
export interface Payload {
    model: string;
    messages: Sat.Msg[];
    max_tokens?: number;
    temperature: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}
export type FavorabilityAdjustment = number | {
    absolute: number;
};
export interface FavorabilityConfig {
    enable_favorability: boolean;
    max_favorability_perday: number;
    dataDir: string;
    input_censor_favorability: boolean;
    value_of_input_favorability: number;
    output_censor_favorability: boolean;
    value_of_output_favorability: number;
    enable_auxiliary_LLM: boolean;
    offset_of_fafavorability: number;
    prompt_0: string;
    favorability_div_1: number;
    prompt_1: string;
    favorability_div_2: number;
    prompt_2: string;
    favorability_div_3: number;
    prompt_3: string;
    favorability_div_4: number;
    prompt_4: string;
    prompt_5: string;
}
export type FavorabilityLevel = '厌恶' | '陌生' | '朋友' | '暧昧' | '恋人' | '夫妻';
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
    bracket_filter: boolean;
    memory_filter: string;
    message_max_length: number;
    memory_block_words: string[];
    enable_self_memory: boolean;
    personal_memory: boolean;
    channel_dialogues: boolean;
    channel_dialogues_max_length: number;
    remember_min_length: number;
    common_topN: number;
    dailogues_topN: number;
}
export interface MiddlewareConfig {
    private: boolean;
    nick_name: boolean;
    nick_name_list: string[];
    nick_name_block_words: string[];
    random_min_tokens: number;
    randnum: number;
    max_tokens: number;
    enable_warning: boolean;
    warning_group: string;
}
export interface APIConfig {
    baseURL: string;
    keys: string[];
    appointModel: string;
    not_reasoner_LLM_URL: string;
    not_reasoner_LLM: string;
    not_reasoner_LLM_key: string[];
    use_not_reasoner_LLM_length: number;
    auxiliary_LLM_URL: string;
    auxiliary_LLM: string;
    auxiliary_LLM_key: string[];
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
        not_reasoner_LLM_URL: string;
        not_reasoner_LLM: string;
        not_reasoner_LLM_key: string[];
        use_not_reasoner_LLM_length: number;
        auxiliary_LLM_URL: string;
        auxiliary_LLM: string;
        auxiliary_LLM_key: string[];
        prompt: string;
        reasoner_prompt: string;
        no_system_prompt: boolean;
        max_tokens: number;
        message_max_length: number;
        remember_min_length: number;
        temperature: number;
        frequency_penalty: number;
        presence_penalty: number;
        log_system_prompt: boolean;
        log_reasoning_content: boolean;
        log_ask_response: boolean;
        authority: number;
        alias: string[];
        dataDir: string;
        enable_self_memory: boolean;
        bracket_filter: boolean;
        memory_filter: string;
        memory_block_words: string[];
        personal_memory: boolean;
        channel_dialogues: boolean;
        channel_dialogues_max_length: number;
        common_topN: number;
        dailogues_topN: number;
        enable_fixed_dialogues: boolean;
        enable_reasoner_like: boolean;
        max_usage: number[];
        private: boolean;
        nick_name: boolean;
        nick_name_list: string[];
        nick_name_block_words: string[];
        reasoner_filter: boolean;
        reasoner_filter_word: string;
        duplicateDialogueCheck: boolean;
        enable_online_user_check: boolean;
        random_min_tokens: number;
        randnum: number;
        sentences_divide: boolean;
        min_sentences_length: number;
        max_sentences_length: number;
        time_interval: number;
        max_parallel_count: number;
        reply_pointing: boolean;
        enable_mood: boolean;
        max_mood: number;
        value_of_input_mood: number;
        value_of_output_mood: number;
        visible_mood: boolean;
        mood_div_1: number;
        mood_prompt_0: string;
        mood_div_2: number;
        mood_prompt_1: string;
        mood_prompt_2: string;
        enable_pocket_money: boolean;
        min_pocket_money: number;
        max_pocket_money: number;
        pocket_money_cost: number;
        enable_favorability: boolean;
        max_favorability_perday: number;
        input_censor_favorability: boolean;
        value_of_input_favorability: number;
        output_censor_favorability: boolean;
        value_of_output_favorability: number;
        enable_auxiliary_LLM: boolean;
        offset_of_fafavorability: number;
        visible_favorability: boolean;
        enable_user_portrait: boolean;
        max_portrait_dialogues: number;
        portrait_usage: number;
        portrait_min_favorability: number;
        prompt_0: string;
        favorability_div_1: number;
        prompt_1: string;
        favorability_div_2: number;
        prompt_2: string;
        favorability_div_3: number;
        prompt_3: string;
        favorability_div_4: number;
        prompt_4: string;
        prompt_5: string;
        enable_warning: boolean;
        warning_group: string;
        warning_admin_id: string;
        maxRetryTimes: number;
        retry_delay_time: number;
        enable_game: boolean;
        game_block_channel: string[];
        enable_gobang: boolean;
        channel_id_for_gobang: string[];
        cd_for_gobang: number;
        enable_fencing: boolean;
        enable_OneTouch: boolean;
        cd_for_OneTouch: number;
    }
    const Config: Schema<Config>;
}
