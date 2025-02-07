
// src/api.ts
import { Context, Logger } from 'koishi'
import { trimSlash, probabilisticCheck, isErrorWithMessage } from './utils'
import { APIConfig, APIError, Sat } from './types'

const logger = new Logger('satori-api')
// 错误处理策略
const ERROR_RETRY_MAP = {
  429: { retryAfter: 5000 }, // 5秒后重试
  502: { retryAfter: 1000 }, // 1秒后重试
  503: { retryAfter: 2000 }  // 2秒后重试
}

export class APIClient {
  private currentKeyIndex = 0
  private retryCount = 0

  constructor(
    private ctx: Context,
    private config: APIConfig
  ) {}

  // 启动时测试连接
  async initialize() {
    if (!await this.testConnection()) {
      logger.error('无法连接到API服务')
    }
  }

  public async chat(messages: Sat.Msg[]): Promise<string> {
    const payload = this.createPayload(messages)

    for (let i = 0; i < this.config.keys.length; i++) {
      try {
        return await this.tryRequest(payload)
      } catch (error) {
        this.rotateKey()
        this.handleAPIError(error as APIError)
      }
    }

    throw new Error('All API keys exhausted')
  }

  // 生成请求体
  protected createPayload(messages: Sat.Msg[]): any {
    return {
      model: this.config.appointModel,
      messages,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0.5
    }
  }

  // 尝试请求
  private async tryRequest(payload: any): Promise<string> {
    const url = `${trimSlash(this.config.baseURL)}/v1/chat/completions`
    const headers = this.createHeaders()
    try {
      const response = await this.ctx.http.post(url, payload, {
        headers,
        timeout: this.config.timeout
      })
      this.retryCount = 0
      return response.choices[0].message.content
    } catch (error) {
      return this.handleAPIError(error)
    }
  }

  // 生成请求头
  private createHeaders() {
    return {
      Authorization: `Bearer ${this.config.keys[this.currentKeyIndex]}`,
      'Content-Type': 'application/json'
    }
  }

  // 处理API错误
  private handleAPIError(error: unknown): never {
    if (!isErrorWithMessage(error)) throw error

    const status = error.response?.status || 500
    const errorCode = error.response?.data?.error?.code || 'unknown'
    const message = error.response?.data?.error?.message || error.message

    logger.error(`API Error [${status}]: ${errorCode} - ${message}`)

    if (status === 429) {
      if (probabilisticCheck(0.3)) this.rotateKey()
      throw new Error('Rate limit exceeded')
    }
    if (status === 401) {
      this.rotateKey()
      throw new Error('Invalid API key')
    }
    throw error
  }

  // 切换API密钥
  private rotateKey(): void {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length
    logger.debug(`Switched to API key index: ${this.currentKeyIndex}`)
  }

  // 测试连接
  public async testConnection(): Promise<boolean> {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/v1/models`, {
        headers: this.createHeaders()
      })
      return true
    } catch (error) {
      logger.error('API connection test failed:', error)
      return false
    }
  }
}

// 实现自定义API适配器
interface APIAdapter {
  formatRequest(messages: Sat.Msg[]): any
  parseResponse(response: any): string
}

// 例：兼容OpenAI格式
export class OpenAIAdapter implements APIAdapter {
  formatRequest(messages) {
    return { messages, model: 'gpt-3.5-turbo' }
  }

  parseResponse(response) {
    return response.choices[0].message.content
  }
}

// 在APIClient中使用适配器
export class ExtendedAPIClient extends APIClient {
  constructor(
    ctx: Context,
    config: APIConfig,
    private adapter: APIAdapter
  ) {
    super(ctx, config)
  }

  override createPayload(messages: Sat.Msg[]) {
    return this.adapter.formatRequest(messages)
  }
}

// 实现请求拦截器
interface RequestInterceptor {
  preRequest(payload: any): Promise<any>
  postResponse(response: any): Promise<any>
}

// 实现分布式请求队列
class RequestQueue {
  private queue: Array<() => Promise<void>> = []
  private concurrent = 0

  async enqueue(request: () => Promise<any>) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          this.concurrent++
          const result = await request()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.concurrent--
          this.dequeue()
        }
      })
      if (this.concurrent < 5) this.dequeue()
    })
  }

  private dequeue() {
    if (this.queue.length === 0) return
    const task = this.queue.shift()
    task()
  }
}
