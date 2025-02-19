import { log } from 'console';
import { Context, Dict, Schema, Service } from 'koishi'
export const usage = `使用说明见插件主页`;

//用户数据模型
export interface User {
  id?: number
  userid: string
  usersname: string
  p: number
  favorability: number
  items?: Record<string, ItemInfo>;
}

// 道具数据模型
export interface ItemInfo {
  id: string;
  count: number;
  price?: number;
  description?: string;
  favorability?: number;
  metadata?: Record<string, any>
}

// 请求体
export interface Payload {
  model: string
  messages: Sat.Msg[]
  max_tokens?: number
  temperature: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
}

//好感度调整
export type FavorabilityAdjustment =
  | number
  | { absolute: number }

//好感度配置
export interface FavorabilityConfig {
  enable_favorability: boolean
  dataDir: string
  input_censor_favorability: boolean
  value_of_input_favorability: number
  output_censor_favorability: boolean
  value_of_output_favorability: number
  enable_auxiliary_LLM: boolean
  offset_of_fafavorability: number
  prompt_0: string
  favorability_div_1: number
  prompt_1: string
  favorability_div_2: number
  prompt_2: string
  favorability_div_3: number
  prompt_3: string
  favorability_div_4: number
  prompt_4: string
}
//好感度等级
export type FavorabilityLevel = '厌恶' | '陌生' | '朋友' | '暧昧' | '恋人' | '夫妻'

//记忆配置
export interface MemoryEntry {
  role: string
  content: string
}
export interface ChannelMemory {
  dialogues: MemoryEntry[]
  updatedAt: number
}
export interface MemoryConfig {
  dataDir: string
  message_max_length: number
  memory_block_words: string[]
  enable_self_memory: boolean
  personal_memory: boolean
  remember_min_length: number
  common_topN: number
  dailogues_topN: number
}

// 中间件配置
export interface MiddlewareConfig {
  private: boolean
  mention: boolean
  random_min_tokens: number
  randnum: number
  max_tokens: number
}

// API配置
export interface APIConfig {
  baseURL: string
  keys: string[]
  appointModel: string
  auxiliary_LLM_URL: string
  auxiliary_LLM: string
  auxiliary_LLM_key: string[]
  content_max_tokens: number
  content_max_length: number
  temperature: number
  frequency_penalty: number
  presence_penalty: number
  maxRetryTimes?: number
  retry_delay_time?: number
  reasoning_content?: boolean
}
// API响应
export interface APIError extends Error {
  response?: {
    status: number
    data: {
      error?: {
        code: string
        message: string
      }
    }
  }
}

//固定对话结构
export interface FixedDialogue {
  triggers: string[]
  favorabilityRange?: [number, number]
  probability: number
  timeRange?: [string, string]
  response: string
  favorability?: number
}


export class Sat extends Service {
  static inject = {
    required: ['console', 'database'],
    optional: ['censor']
  }
  output_type: string
  session_config: Sat.Msg[]
  sessions: Dict
  personality: Dict
  sessions_cmd: string[]
  aliasMap: any
  type: string
  l6k: boolean
  key_number: number
  maxRetryTimes: number
  constructor(ctx: Context, config: Sat.Config) {
    super(ctx, 'sat', true)
  }
}


export namespace Sat {
  export interface Msg {
    role: string
    content: string
  }
  export interface Payload {
    engine: string
    prompt: string
    temperature: number
    max_tokens?: number
    top_p: number
    frequency_penalty: number
    presence_penalty: number
  }

  export interface Config {
    baseURL: string
    key: string[]
    appointModel: string
    auxiliary_LLM_URL: string
    auxiliary_LLM: string
    auxiliary_LLM_key: string[]
    prompt: string

    max_tokens: number
    content_max_tokens: number
    content_max_length: number
    message_max_length: number
    remember_min_length: number
    temperature: number
    frequency_penalty: number
    presence_penalty: number
    log_system_prompt: boolean
    log_reasoning_content: boolean
    log_ask_response: boolean
    authority: number

    alias: string[]
    dataDir: string
    enable_self_memory: boolean
    memory_block_words: string[]
    personal_memory: boolean
    common_topN: number
    dailogues_topN: number
    enable_fixed_dialogues: boolean

    private: boolean
    mention: boolean
    duplicateDialogueCheck: boolean
    enable_online_user_check: boolean
    random_min_tokens: number
    randnum: number
    sentences_divide: boolean
    time_interval: number
    max_parallel_count: number
    reply_pointing: boolean

    enable_favorability: boolean
    input_censor_favorability: boolean
    value_of_input_favorability: number
    output_censor_favorability: boolean
    value_of_output_favorability: number
    enable_auxiliary_LLM: boolean
    offset_of_fafavorability: number
    visible_favorability: boolean
    prompt_0: string
    favorability_div_1: number
    prompt_1: string
    favorability_div_2: number
    prompt_2: string
    favorability_div_3: number
    prompt_3: string
    favorability_div_4: number
    prompt_4: string
    blockuser: string[]
    blockchannel: string[]
    maxRetryTimes: number
    retry_delay_time: number
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      baseURL: Schema.string().default('https://api.deepseek.com').description('请求地址'),
      key: Schema.union([
        Schema.array(String).role('secret'),
        Schema.transform(String, value => [value]),
      ]).default([]).role('secret').description('api_key'),
      appointModel: Schema.string().default('deepseek-reasoner').description('主模型'),
      auxiliary_LLM_URL: Schema.string().default('https://api.deepseek.com').description('辅助模型请求地址'),
      auxiliary_LLM: Schema.string().default('deepseek-chat').description('辅助模型(用于好感度调整等功能，如不需要可不填，建议使用低成本模型'),
      auxiliary_LLM_key: Schema.union([
        Schema.array(String).role('secret'),
        Schema.transform(String, value => [value]),
      ]).default([]).role('secret').description('辅助模型api_key'),
      prompt: Schema.string().role('textarea').description('人格设定')
    }).description('基础设置'),

    Schema.object({
      alias: Schema.array(String).default(['ai']).description('触发命令;别名'),
      authority: Schema.number().role('slider').min(0).max(5).step(1).description('允许使用的最低权限').default(1),
      max_tokens: Schema.number().description('最大请求长度（字符数）').default(100),
      content_max_tokens: Schema.number().description('最大回答长度（思维链+输出token）').default(4096),
      content_max_length: Schema.number().description('最大回答长度（仅输出，字符数）').default(100),
      message_max_length: Schema.number().description('最大频道上下文长度（条数）').default(10),
      temperature: Schema.number().role('slider').min(0).max(2).step(0.01).default(0.5).description('温度'),
      frequency_penalty: Schema.number().default(0.0).description('频率惩罚'),
      presence_penalty: Schema.number().default(0.0).description('存在惩罚'),
      maxRetryTimes: Schema.number().default(10).description('报错后最大重试次数'),
      retry_delay_time: Schema.number().default(5000).description('每次重试延迟时间'),
      max_parallel_count: Schema.number().default(2).description('频道最大并行请求数'),
      log_system_prompt: Schema.boolean().default(false).description('是否在日志中输出系统提示'),
      log_reasoning_content: Schema.boolean().default(true).description('是否在日志中输出思维链'),
      log_ask_response: Schema.boolean().default(true).description('是否在日志中输出问答')
    }).description('请求设置'),

    Schema.object({
      enable_self_memory: Schema.boolean().default(true).description('是否启用模型自发言记忆（仅短期）'),
      personal_memory: Schema.boolean().default(true).description('是否启用分人记忆（频道内）'),
      dataDir: Schema.string().default("./data/satori_ai").description('聊天记录保存位置（长期记忆）'),
      memory_block_words: Schema.array(String).default(['好感']).description('记忆屏蔽词'),
      remember_min_length: Schema.number().description('触发保存到记忆的长度').default(20),
      common_topN: Schema.number().default(5).description('常识记忆检索最大匹配数'),
      dailogues_topN: Schema.number().default(5).description('对话记忆检索最大匹配数'),
      enable_fixed_dialogues: Schema.boolean().default(false).description('是否启用固定对话（在dataDir中的fixed_dialogues.json修改）'),
    }).description('记忆设置'),

    Schema.object({
      private: Schema.boolean().default(true).description('开启后私聊AI可触发对话, 不需要使用指令'),
      mention: Schema.boolean().default(true).description('开启后机器人被提及(at/引用)可触发对话'),
      duplicateDialogueCheck: Schema.boolean().default(true).description('是否检查重复对话'),
      enable_online_user_check: Schema.boolean().default(true).description('在未回答而再次提问时是否提示用户有未完成的对话'),
      random_min_tokens: Schema.number().default(20).description('随机触发对话的最小长度'),
      randnum: Schema.number().role('slider').min(0).max(1).step(0.01).default(0).description('在群聊中随机触发对话的概率，如需关闭可设置为 0'),
      sentences_divide: Schema.boolean().default(true).description('是否分句发送'),
      time_interval: Schema.number().default(1000).description('每句话的时间间隔'),
      reply_pointing: Schema.boolean().default(true).description('是否在与多人同时对话时显示回复指向'),
    }).description('对话设置'),

    Schema.object({
      enable_favorability: Schema.boolean().default(false).description('是否开启好感度系统(每次对话默认+1好感度)'),
      input_censor_favorability: Schema.boolean().default(false).description('是否开启好感度审查(通过输入屏蔽词扣除好感)'),
      value_of_input_favorability: Schema.number().default(15).description('输入触发屏蔽词每次扣除的好感度'),
      output_censor_favorability: Schema.boolean().default(false).description('通过输出屏蔽词扣除好感,在dataDir中的output_censor.txt修改)'),
      value_of_output_favorability: Schema.number().default(15).description('输出触发屏蔽词每次扣除的好感度'),
      enable_auxiliary_LLM: Schema.boolean().default(false).description('是否使用辅助大模型判断好感度增减(量与输入屏蔽词每次扣除的好感度相关,不稳定，慎用)'),
      offset_of_fafavorability: Schema.number().default(3.5).description('辅助大模型好感度偏移量(越大越容易扣好感度)'),
      visible_favorability: Schema.boolean().default(true).description('是否开启好感度升降显示'),
      prompt_0: Schema.string().role('textarea').description('厌恶好感补充设定'),
      favorability_div_1: Schema.number().default(15).description('厌恶-陌生分界线'),
      prompt_1: Schema.string().role('textarea').description('陌生好感补充设定'),
      favorability_div_2: Schema.number().default(150).description('陌生-朋友分界线'),
      prompt_2: Schema.string().role('textarea').description('朋友好感补充设定'),
      favorability_div_3: Schema.number().default(500).description('朋友-思慕分界线'),
      prompt_3: Schema.string().role('textarea').description('思慕好感补充设定'),
      favorability_div_4: Schema.number().default(1000).description('思慕-恋慕分界线'),
      prompt_4: Schema.string().role('textarea').description('恋慕好感补充设定'),
    }).description('好感度设置'),

    Schema.object({
      blockuser: Schema.array(String).default([]).description('屏蔽的用户'),
      blockchannel: Schema.array(String).default([]).description('屏蔽的频道')
    }).description('过滤器'),
  ])
}
