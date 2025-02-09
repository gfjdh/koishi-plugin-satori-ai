
// src/api.ts
import { Context, Logger } from 'koishi'
import { trimSlash, isErrorWithMessage } from './utils'
import { APIConfig, APIError, Sat } from './types'

const logger = new Logger('satori-api')
export class APIClient {
  private currentKeyIndex = 0

  constructor(
    private ctx: Context,
    private config: APIConfig
  ) {
    this.initialize()
  }

  // 启动时测试连接
  async initialize() {
    if (!await this.testConnection()) {
      logger.error('无法连接到API服务')
    }
  }

  // 发送聊天请求
  public async chat(messages: Sat.Msg[]): Promise<{content:string, error: boolean}> {
    const payload = this.createPayload(messages)
    for (let i = 0; i < this.config.keys.length; i++) {
      try {
        return await this.tryRequest(payload)
      } catch (error) {
        if (i == this.config.keys.length - 1) {
          return this.handleAPIError(error as APIError)
        }
        this.rotateKey()
      }
    }
  }

  // 生成请求体
  protected createPayload(messages: Sat.Msg[]): any {
    return {
      model: this.config.appointModel,
      messages,
      max_tokens: this.config.content_max_tokens,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty
    }
  }

  // 尝试请求
  private async tryRequest(payload: any): Promise<{ content: string; error: boolean }> {
    const url = `${trimSlash(this.config.baseURL)}/chat/completions`
    const headers = this.createHeaders()

    let content: string
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
        content = response.choices[0].message.content
        if (this.config.reasoning_content) logger.info(`思维链: ${response.choices[0].message.reasoning_content || '无'}`)
        return { content: content, error: false }
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error)
        }
        logger.warn(`API请求失败(${error})，重试(第${i}次)中...`)
        continue
      }
    }
    throw new Error('unreachable')
  }

  // 生成请求头
  private createHeaders() {
    return {
      Authorization: `Bearer ${this.config.keys[this.currentKeyIndex]}`,
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
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders() })
      logger.info('API connection test succeeded')
      return true
    } catch (error) {
      logger.error('API connection test failed:', error)
      return false
    }
  }
}
