
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
  public async chat(user: User, messages: Sat.Msg[]): Promise<{content:string, error: boolean}> {
    if(user.userid == 'Alice') return { content: '(系统)（abc）测试', error: false }
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
    const payload = this.createPayload(messages, modle)
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
  public async auxiliaryChat(messages: Sat.Msg[]): Promise<{content:string, error: boolean}> {
    const AuxiliaryPayload = this.createAuxiliaryPayload(messages, this.config.auxiliary_LLM)
    const url = `${trimSlash(this.config.auxiliary_LLM_URL)}/chat/completions`
    const headers = this.createHeaders(this.config.auxiliary_LLM_key)

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
  private createPayload(messages: Sat.Msg[], model: string): Payload {
    return {
      model: model,
      messages,
      max_tokens: this.config.content_max_tokens,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty
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
  private async tryRequest(URL: string, payload: Payload, keys: string[]): Promise<{ content: string; error: boolean }> {
    const url = `${trimSlash(URL)}/chat/completions`
    const headers = this.createHeaders(keys)

    let content: string
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
        content = response.choices[0].message.content
        const reasoning_content = response.choices[0].message.reasoning_content
        if (this.config.reasoning_content) logger.info(`思维链: ${reasoning_content || '无'}`)
        if (!content && reasoning_content) {
          logger.warn('返回内容为空,但存在推理内容')
          content = response.choices[0].message.reasoning_content
        }
        if (content.length > this.config.content_max_length) {
          logger.warn(`返回内容超过最大长度(${content.length} > ${this.config.content_max_length})`)
          if (i >= 2) return { content: '返回内容超过最大长度', error: true }
          continue
        }
        const responseMsg:Sat.Msg = { role: 'assistant', content: content }
        if (payload.messages.some(msg => msg === responseMsg) && content.length > 5) {
          const lastMsg = payload.messages[payload.messages.length - 1]
          payload.messages[payload.messages.length - 1].content = lastMsg.content + '(注意不要重复之前的内容)'
          logger.warn(`返回内容与之前内容相同，重试(第${i}次)中...`)
          continue
        }
        return { content: content, error: false }
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
    return { content: '模型发生复读行为，建议重置对话', error: true }
  }

  // 生成请求头
  private createHeaders(keys: string[]): Record<string, string> {
    return {
      Authorization: `Bearer ${keys[this.currentKeyIndex]}`,
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
        return {content: '请求体格式错误', error: true};
      case 401:
        return {content: 'API key 错误，认证失败', error: true};
      case 402:
        return {content: '账号余额不足', error: true};
      case 422:
        return {content: '请求体参数错误', error: true};
      case 429:
        return {content: '请求速率（TPM 或 RPM）达到上限', error: true};
      case 500:
        return {content: `api服务器内部故障`, error: true};
      case 503:
        return {content: 'api服务器负载过高', error: true};
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
      logger.error('API connection test failed')
      return false
    }
  }
}
