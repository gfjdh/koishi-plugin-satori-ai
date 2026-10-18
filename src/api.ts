
// src/api.ts
import { Context, Logger } from 'koishi'
import { trimSlash, isErrorWithMessage } from './utils'
import { APIConfig, APIError, Payload, Sat, User } from './types'

const logger = new Logger('satori-api')
export class APIClient {
  private currentKeyIndex = 0

  constructor(
    private ctx: Context,
    private config: APIConfig
  ) {
    this.testConnection()
  }

  // 发送聊天请求
  public async chat(user: User, messages: Sat.Msg[]): Promise<{content:string, error: boolean, reasoning_content?: string}> {
    // if(user.userid == 'Alice') return { content: '<p>(系统)这是一个测试句子。这个句子稍长一些，包含多个标点符号！这是一个特别长的句子，需要超过最大长度限制的句子应该被保留原样，但这种情况在实际使用中应该尽量避免。最后？这是一个需要合并的短句！;</p>',
    //    error: false, reasoning_content: '(测试111111111111111111111111111111111111111111111111111111111111111555555555555)（测试2）' }
    const enableUserKey = user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description == 'on'
    let keys: string[]
    let modle: string
    let baseURL: string
    let thinkingType: string = "enabled"
    if (enableUserKey) {
      const ticket = user.items['地灵殿通行证'].metadata
      keys = [ticket?.key]
      modle = ticket?.model
      baseURL = ticket?.baseURL
      const not_reasoner_model = ticket?.not_reasoner_model
      const length = ticket?.use_not_reasoner_LLM_length
      if (not_reasoner_model && length && messages[messages.length - 1].content.length <= length) {
        thinkingType = "disabled"
        modle = not_reasoner_model
      }
    } else {
      const config = this.config;
      const useNotReasoner = messages[messages.length - 1].content.length <= config.use_not_reasoner_LLM_length;
      keys = useNotReasoner ? config.not_reasoner_LLM_key : config.keys;
      modle = useNotReasoner ? config.not_reasoner_LLM : config.appointModel;
      baseURL = useNotReasoner ? config.not_reasoner_LLM_URL : config.baseURL;
      thinkingType = useNotReasoner ? "disabled" : "enabled"
    }
    const payload = this.createPayload(messages, modle, thinkingType)
    for (let i = 0; i < keys.length; i++) {
      try {
        return await this.tryRequest(baseURL, payload, keys)
      } catch (error) {
        if (i == keys.length - 1) {
          return this.handleAPIError(error as APIError)
        }
        this.rotateKey()
      }
    }
  }

  // 发送辅助聊天请求
  // 与 chat() 一致：持“地灵殿通行证”的用户优先使用自己的 key/模型，
  // 这样后台归档、汇总和画像不会消耗机器人的辅助模型额度。
  public async auxiliaryChat(messages: Sat.Msg[], user?: User | null): Promise<{content:string, error: boolean}> {
    const route = this.resolveAuxiliaryRoute(messages, user)
    const AuxiliaryPayload = this.createAuxiliaryPayload(messages, route.model)
    const url = `${trimSlash(route.baseURL)}/chat/completions`
    const headers = this.createHeaders(route.keys)

    let content: string
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, AuxiliaryPayload, { headers, timeout: 3600000 })
        content = response.choices[0].message.content
        return { content: content, error: false }
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error)
        }
        logger.warn(`辅助模型API请求失败(${error})，重试(第${i}次)中...`)
        continue
      }
    }
    return { content: 'unreachable', error: true }
  }

  /**
   * 辅助请求的路由：持票且配置完整时走用户的 key/model，否则回退默认辅助模型。
   * 不完整的票配置不能让后台归档静默失败，所以这里降级并告警。
   */
  private resolveAuxiliaryRoute(messages: Sat.Msg[], user?: User | null) {
    const ticket = user?.items?.['地灵殿通行证']
    if (ticket?.description === 'on') {
      const metadata = ticket.metadata || {}
      let model = metadata.model
      // 与 chat() 保持一致：输入较短的请求使用非思考模型
      const last = messages[messages.length - 1]
      if (metadata.not_reasoner_model && metadata.use_not_reasoner_LLM_length
        && last && (last.content || '').length <= metadata.use_not_reasoner_LLM_length) {
        model = metadata.not_reasoner_model
      }
      if (metadata.key && model && metadata.baseURL) {
        return {
          keys: [metadata.key as string],
          model: model as string,
          baseURL: metadata.baseURL as string,
        }
      }
      logger.warn('地灵殿通行证缺少 key/model/baseURL，辅助请求回退到默认辅助模型')
    }
    return {
      keys: this.config.auxiliary_LLM_key,
      model: this.config.auxiliary_LLM,
      baseURL: this.config.auxiliary_LLM_URL,
    }
  }

  // 发送生成用户画像请求
  public async generateUserPortrait(user: User, messages: Sat.Msg[]): Promise<{content:string, error: boolean}> {
    if(user.userid == 'Alice') return { content: '测试画像', error: false }
    const enableUserKey = user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description == 'on'
    let keys: string[]
    let modle: string
    let baseURL: string
    if (enableUserKey) {
      const key = user.items['地灵殿通行证'].metadata?.key
      keys = [key]
      modle = user.items['地灵殿通行证'].metadata?.model
      baseURL = user.items['地灵殿通行证'].metadata?.baseURL
    } else {
      keys = this.config.keys
      modle = this.config.appointModel
      baseURL = this.config.baseURL
    }
    const payload = this.createAuxiliaryPayload(messages, modle)
    const url = `${trimSlash(baseURL)}/chat/completions`
    const headers = this.createHeaders(keys)

    let content: string
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
        content = response.choices[0].message.content
        return { content: content, error: false }
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error)
        }
        //等待后重试
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay_time || 5000))
        logger.warn(`生成画像时API请求失败(${error})，重试(第${i}次)中...`)
        continue
      }
    }
    return { content: 'unreachable', error: true }
  }

  // 生成请求体
  private createPayload(messages: Sat.Msg[], model: string, thinkingType: string = "enabled"): Payload {
    return {
      model: model,
      messages,
      temperature: this.config.temperature,
      top_p: 0.9,
      max_tokens: this.config.max_output_tokens,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty,
      reasoning_effort: "low",
      thinking:{
         type: thinkingType
      }
    }
  }

  // 生成辅助请求体
  private createAuxiliaryPayload(messages: Sat.Msg[], model: string): Payload {
    return {
      model: model,
      messages,
      temperature: 0.1
    }
  }

  // 尝试请求
  private async tryRequest(URL: string, payload: Payload, keys: string[]): Promise<{ content: string; error: boolean; reasoning_content?: string }> {
    const url = `${trimSlash(URL)}/chat/completions`
    const headers = this.createHeaders(keys)

    let content: string
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
        logger.info(`APIID: ${response.id}, 输入token: ${response.usage.prompt_tokens}, 输出token: ${response.usage.completion_tokens}, 总token: ${response.usage.total_tokens}`)
        content = response.choices[0].message.content
        const reasoning_content = response.choices[0].message.reasoning_content || '无'
        if (this.config.reasoning_content) logger.info(`思维链: ${reasoning_content}`)
        if (!content && reasoning_content) {
          logger.warn('返回内容为空,但存在推理内容')
        }
        if (reasoning_content != '无' && content && content.length > reasoning_content.length) {
          logger.warn('返回内容疑似包含推理内容')
        }
        if (response.usage.completion_tokens > this.config.max_output_tokens) {
          logger.warn('返回内容过长导致被截断')
          continue
        }
        return { content: content, error: false , reasoning_content: reasoning_content}
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error)
        }
        //等待后重试
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay_time || 5000))
        logger.warn(`API请求失败(${error})，重试(第${i}次)中...`)
        continue
      }
    }
    return { content: '请求失败，请重试', error: true }
  }

  // 生成请求头
  private createHeaders(keys: string[]): Record<string, string> {
    return {
      // 持票用户只有一把 key，取模避免沿用多 key 轮换留下的下标
      Authorization: `Bearer ${keys[this.currentKeyIndex % keys.length]}`,
      'Content-Type': 'application/json'
    }
  }

  // 处理API错误
  private handleAPIError(error: unknown): {content:string, error: boolean} {
    if (!isErrorWithMessage(error)) throw error;

    const status = error.response?.status || 0;
    const errorCode = error.response?.data?.error?.code || 'unknown';
    const message = error.response?.data?.error?.message || error.message;

    logger.error(`API Error [${status}]: ${errorCode} - ${message}`);

    switch (status) {
      case 400:
        return {content: '请求体格式错误：' + message, error: true};
      case 401:
        return {content: 'API key 错误，认证失败：' + message, error: true};
      case 402:
        return {content: '账号余额不足：' + message, error: true};
      case 422:
        return {content: '请求体参数错误：' + message, error: true};
      case 429:
        return {content: '请求速率（TPM 或 RPM）达到上限：' + message, error: true};
      case 500:
        return {content: `api服务器内部故障：` + message, error: true};
      case 503:
        return {content: 'api服务器负载过高：' + message, error: true};
      default:
        return {content: message, error: true};
    }
  }

  // 切换API密钥
  private rotateKey(): void {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length
    logger.debug(`Switched to API key index: ${this.currentKeyIndex}`)
  }

  // 测试连接
  public async testConnection(): Promise<boolean> {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders(this.config.keys) })
      logger.info('API connection test succeeded')
      return true
    } catch (error) {
      logger.warn('API connection test failed')
      return false
    }
  }
}
