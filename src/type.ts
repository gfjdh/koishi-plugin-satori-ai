import { Context, Dict, Schema, Service } from 'koishi'
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
      temperature: number
      authority: number

      alias: string[]

      private: boolean
      mention: boolean
      randnum: number
      sentences_divide: boolean
      time_interval: number
      enable_favorability: boolean
      favorability_div_1: number
      favorability_div_2: number
      favorability_div_3: number
      favorability_div_4: number
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
        enableContext: Schema.boolean().default(true).description('是否启用上下文, 关闭后将减少 token 消耗'),
        appointModel: Schema.string().default('deepseek-chat').description('模型'),
        prompt: Schema.string().role('textarea').description('人格设定')
      }).description('基础设置'),
      Schema.object({
        max_tokens: Schema.number().description('请求长度,否则报错').default(50),
        temperature: Schema.number().role('slider').min(0).max(1).step(0.01).default(0).description('温度'),
        authority: Schema.number().role('slider').min(0).max(5).step(1).description('允许使用的最低权限').default(1),

        alias: Schema.array(String).default(['ai']).description('触发命令;别名'),

        private: Schema.boolean().default(true).description('开启后私聊AI可触发对话, 不需要使用指令'),
        mention: Schema.boolean().default(true).description('开启后机器人被提及(at/引用)可触发对话'),
        randnum: Schema.number().role('slider').min(0).max(1).step(0.01).default(0).description('随机触发对话的概率，如需关闭可设置为 0'),
        sentences_divide: Schema.boolean().default(true).description('是否分句发送'),
        time_interval: Schema.number().default(1000).description('每句话的时间间隔'),
        enable_favorability: Schema.boolean().default(false).description('是否开启好感度系统（需要p-qiandao插件）'),
        favorability_div_1: Schema.number().default(15).description('厌恶-陌生分界线'),
        favorability_div_2: Schema.number().default(150).description('陌生-朋友分界线'),
        favorability_div_3: Schema.number().default(500).description('朋友-思慕分界线'),
        favorability_div_4: Schema.number().default(1000).description('思慕-恋慕分界线'),
        maxRetryTimes: Schema.number().default(30).description('报错后最大重试次数')
      }).description('进阶设置'),

      Schema.object({
        blockuser: Schema.array(String).default([]).description('屏蔽的用户'),
        blockchannel: Schema.array(String).default([]).description('屏蔽的频道')
      }).description('过滤器'),
    ])
  }
