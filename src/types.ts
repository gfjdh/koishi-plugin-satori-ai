import { Context, Dict, Schema, Service } from 'koishi'
export const usage = `使用说明见插件主页`;

//用户数据模型
export interface User {
  id?: number
  userid: string
  usersname: string
  p: number
  favorability: number
  time: Date
}
//好感度调整
export type FavorabilityAdjustment =
  | number
  | { absolute: number }

//好感度配置
export interface FavorabilityConfig {
  enable_favorability: boolean
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
export type FavorabilityLevel = '厌恶' | '陌生' | '朋友' | '暧昧' | '恋人'

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
  remember_min_length: number
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
  content_max_tokens: number
  temperature: number
  maxRetryTimes?: number
  timeout?: number
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
    enableContext: boolean
    baseURL: string
    key: string[]
    appointModel: string
    prompt: string

    max_tokens: number
    content_max_tokens: number
    message_max_length: number
    remember_min_length: number
    enable_self_memory: boolean
    memory_block_words: string[]
    dataDir: string
    temperature: number
    authority: number
    enable_fixed_dialogues: boolean

    alias: string[]

    private: boolean
    mention: boolean
    random_min_tokens: number
    randnum: number
    sentences_divide: boolean
    time_interval: number
    enable_favorability: boolean
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
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      baseURL: Schema.string().default('https://api.deepseek.com').description('请求地址'),
      key: Schema.union([
        Schema.array(String).role('secret'),
        Schema.transform(String, value => [value]),
      ]).default([]).role('secret').description('api_key'),
      enableContext: Schema.boolean().default(true).description('是否启用上下文, 关闭后将减少 token 消耗(无人格)'),
      appointModel: Schema.string().default('deepseek-chat').description('模型'),
      prompt: Schema.string().role('textarea').description('人格设定')
    }).description('基础设置'),

    Schema.object({
      max_tokens: Schema.number().description('最大请求长度').default(50),
      content_max_tokens: Schema.number().description('最大回答长度').default(100),
      message_max_length: Schema.number().description('最大频道上下文长度').default(10),
      enable_self_memory: Schema.boolean().default(true).description('是否启用自发言记忆（启用容易发生复读）'),
      memory_block_words: Schema.array(String).default(['好感']).description('记忆屏蔽词'),
      remember_min_length: Schema.number().description('触发保存到记忆的长度').default(20),
      dataDir: Schema.string().default("./data/satori_ai").description('聊天记录保存位置（长期记忆）'),
      temperature: Schema.number().role('slider').min(0).max(2).step(0.01).default(0.5).description('温度'),
      authority: Schema.number().role('slider').min(0).max(5).step(1).description('允许使用的最低权限').default(1),
      enable_fixed_dialogues: Schema.boolean().default(false).description('是否启用固定对话（在dataDir中的fixed_dialogues.json修改）'),
      alias: Schema.array(String).default(['ai']).description('触发命令;别名'),

      private: Schema.boolean().default(true).description('开启后私聊AI可触发对话, 不需要使用指令'),
      mention: Schema.boolean().default(true).description('开启后机器人被提及(at/引用)可触发对话'),
      random_min_tokens: Schema.number().default(20).description('随机触发的最小长度'),
      randnum: Schema.number().role('slider').min(0).max(1).step(0.01).default(0).description('在群聊中随机触发对话的概率，如需关闭可设置为 0'),
      sentences_divide: Schema.boolean().default(true).description('是否分句发送'),
      time_interval: Schema.number().default(1000).description('每句话的时间间隔'),
      maxRetryTimes: Schema.number().default(30).description('报错后最大重试次数')
    }).description('进阶设置'),

    Schema.object({
      enable_favorability: Schema.boolean().default(false).description('是否开启好感度系统（建议添加p-qiandao插件）'),
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
