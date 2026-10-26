
// src/api.ts
import { Context, Logger } from 'koishi'
import { trimSlash } from './utils'
import { APIConfig, Payload, Sat, User } from './types'

const logger = new Logger('satori-api')

/** 票失败后的冷却时间：冷却期内直接使用默认辅助模型，不再浪费时间试坏 key。 */
const TICKET_FAILURE_COOLDOWN_MS = 10 * 60_000
/** 这些状态码代表票本身不可用，冷却期内跳过；网络/5xx 只降级本次，不冷却。 */
const TICKET_FAILURE_COOLDOWN_STATUSES = new Set([401, 402, 403, 404, 422, 429])
const MAX_RATE_LIMIT_BACKOFF_MS = 30_000
const MAX_RETRY_AFTER_MS = 60_000

export class APIClient {
  private currentKeyIndex = 0
  private ticketFailedUntil = new Map<string, number>()

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
      const mainKeys = (config.keys || []).filter(Boolean)
      const notReasonerKeys = (config.not_reasoner_LLM_key || []).filter(Boolean)
      if (useNotReasoner && !notReasonerKeys.length) {
        // 短消息本该走非思考模型，但没配 key；退回主模型，避免整个请求被静默跳过
        keys = mainKeys
        modle = config.appointModel
        baseURL = config.baseURL
        thinkingType = "enabled"
      } else {
        keys = useNotReasoner ? notReasonerKeys : mainKeys
        modle = useNotReasoner ? config.not_reasoner_LLM : config.appointModel;
        baseURL = useNotReasoner ? config.not_reasoner_LLM_URL : config.baseURL;
        thinkingType = useNotReasoner ? "disabled" : "enabled"
      }
    }
    // 通行证/配置里可能残留空字符串，先剔除再判断是否还能发请求
    keys = (keys || []).filter(Boolean)
    if (!keys.length) {
      logger.error('未配置任何可用的 API key')
      return { content: '未配置 API key，请联系管理员', error: true }
    }
    const payload = this.createPayload(messages, modle, thinkingType)
    for (let i = 0; i < keys.length; i++) {
      try {
        return await this.tryRequest(baseURL, payload, keys)
      } catch (error) {
        if (i == keys.length - 1) {
          return this.handleAPIError(error)
        }
        this.rotateKey()
      }
    }
    return { content: '请求失败，请重试', error: true }
  }

  // 发送辅助聊天请求
  // 与 chat() 一致：持“地灵殿通行证”的用户优先使用自己的 key/模型，
  // 这样后台归档、汇总和画像不会消耗机器人的辅助模型额度。
  // 票里的 key 运行失败时降级到默认辅助模型，避免该用户的历史补齐每轮都卡住。
  public async auxiliaryChat(messages: Sat.Msg[], user?: User | null): Promise<{content:string, error: boolean}> {
    const userId = user?.userid
    const ticket = this.ticketAuxiliaryRoute(messages, user)

    if (ticket) {
      const until = userId ? this.ticketFailedUntil.get(userId) : undefined
      if (until && until > Date.now()) {
        logger.debug(`用户 ${userId} 的地灵殿通行证处于失败冷却期，辅助请求直接使用默认模型`)
      } else {
        if (until) this.ticketFailedUntil.delete(userId)
        // 票只试一次：失败就立刻降级，不把整轮心跳耗在坏 key 的重试上
        const result = await this.requestAuxiliary(ticket, messages, 1)
        if (!result.error) return result

        const status = result.status
        if (userId && TICKET_FAILURE_COOLDOWN_STATUSES.has(status)) {
          this.ticketFailedUntil.set(userId, Date.now() + TICKET_FAILURE_COOLDOWN_MS)
          if (this.ticketFailedUntil.size > 500) this.pruneTicketFailures()
        }
        logger.warn(`地灵殿通行证辅助请求失败（${result.content}），本次降级到默认辅助模型`
          + (TICKET_FAILURE_COOLDOWN_STATUSES.has(status) ? '，后续 10 分钟不再尝试该票' : ''))
      }
    }

    return this.requestAuxiliary(this.defaultAuxiliaryRoute(), messages)
  }

  /**
   * 辅助请求的实际发送与重试。
   * 所有失败之间都有 retry_delay_time 的间隔；429/503 按指数退避并带抖动，
   * 有 Retry-After 时优先遵守，避免并发 worker 在同一时刻再次冲击限流接口。
   */
  private async requestAuxiliary(
    route: { keys: string[], model: string, baseURL: string },
    messages: Sat.Msg[],
    maxAttempts = Math.max(1, this.config.maxRetryTimes),
  ): Promise<{content:string, error: boolean, status: number}> {
    const payload = this.createAuxiliaryPayload(messages, route.model)
    const url = `${trimSlash(route.baseURL)}/chat/completions`
    const headers = this.createHeaders(route.keys)
    const retryDelay = Math.max(0, this.config.retry_delay_time || 5000)

    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
        return { content: response.choices[0].message.content, error: false, status: 0 }
      } catch (error) {
        const status = this.statusOf(error)
        if (i == maxAttempts) {
          return { ...this.handleAPIError(error), status }
        }
        const delay = this.retryDelayFor(status, i, retryDelay, this.retryAfterMs(error))
        logger.warn(`辅助模型API请求失败(${error})，${Math.round(delay / 1000 * 10) / 10}秒后重试(第${i}次)...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    return { content: 'unreachable', error: true, status: 0 }
  }

  /** 指数退避，最高 30 秒；加 ±20% 抖动，避免多个 worker 同步重试。
   *  服务端给了 Retry-After 就严格按它来，不再打折。 */
  private retryDelayFor(status: number, attempt: number, base: number, retryAfter: number | null): number {
    if (status !== 429 && status !== 503) return base
    if (retryAfter != null) return Math.min(retryAfter, MAX_RETRY_AFTER_MS)
    const backoff = Math.min(base * 2 ** (attempt - 1), MAX_RATE_LIMIT_BACKOFF_MS)
    return backoff > 0 ? Math.round(backoff * (0.8 + Math.random() * 0.4)) : 0
  }

  /** Retry-After 可能是秒数，也可能是 HTTP 日期。 */
  private retryAfterMs(error: unknown): number | null {
    const headers = (error as { response?: { headers?: unknown } })?.response?.headers
    if (!headers) return null
    const getter = headers as { get?: (name: string) => string | null }
    const raw = typeof getter.get === 'function'
      ? getter.get('retry-after')
      : (headers as Record<string, unknown>)['retry-after']
    if (raw == null) return null
    const text = String(raw).trim()
    if (!text) return null
    const seconds = Number(text)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(text)
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
    return null
  }

  private statusOf(error: unknown): number {
    return (error as { response?: { status?: number }, status?: number })?.response?.status
      || (error as { status?: number })?.status
      || 0
  }

  private pruneTicketFailures(): void {
    const now = Date.now()
    for (const [userId, until] of this.ticketFailedUntil) {
      if (until <= now) this.ticketFailedUntil.delete(userId)
    }
  }

  private ticketAuxiliaryRoute(messages: Sat.Msg[], user?: User | null) {
    const ticket = user?.items?.['地灵殿通行证']
    if (ticket?.description !== 'on') return null
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
    return null
  }

  private defaultAuxiliaryRoute() {
    return {
      keys: this.config.auxiliary_LLM_key,
      model: this.config.auxiliary_LLM,
      baseURL: this.config.auxiliary_LLM_URL,
    }
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
      reasoning_effort: this.config.reasoning_effort || "low",
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
        let result = await this.sendChat(url, payload, headers)
        // 思考模式下模型偶尔把正文留在 reasoning_content 里，content 为空。
        // 原样再发一次通常还是空，改成关闭思考再要一次；每轮最多重试一次，
        // 已经是关闭思考的请求不再重复。
        if (!result.content.trim() && payload.thinking?.type !== 'disabled') {
          logger.warn('返回内容为空，关闭思考模式后重试一次')
          result = await this.sendChat(url, { ...payload, thinking: { type: 'disabled' } }, headers)
        }
        content = result.content
        const reasoning_content = result.reasoning_content
        if (!content.trim()) {
          if (reasoning_content != '无') logger.warn('返回内容为空,但存在推理内容')
          else logger.warn('返回内容为空')
        }
        if (reasoning_content != '无' && content && content.length > reasoning_content.length) {
          logger.warn('返回内容疑似包含推理内容')
        }
        if (result.completion_tokens > this.config.max_output_tokens) {
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

  // 单次发送：记录用量与思维链日志，返回 choices[0] 的关键字段
  private async sendChat(url: string, payload: Payload, headers: Record<string, string>) {
    const response = await this.ctx.http.post(url, payload, { headers, timeout: 3600000 })
    // 部分兼容接口不返回 usage，不能直接解引用
    const usage = response.usage || {}
    logger.info(`APIID: ${response.id}, 输入token: ${usage.prompt_tokens}, 输出token: ${usage.completion_tokens}, 总token: ${usage.total_tokens}`)
    const message = response.choices[0].message
    const reasoning_content = message.reasoning_content || '无'
    if (this.config.reasoning_content) logger.info(`思维链: ${reasoning_content}`)
    return {
      // content 可能是 null，统一成空串，避免下游 filterResponse 直接崩掉
      content: typeof message.content === 'string' ? message.content : '',
      reasoning_content,
      completion_tokens: usage.completion_tokens ?? 0,
    }
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
    // 错误对象不一定带 message（可能直接是字符串、undefined 或解析失败的对象），
    // 原来的类型守卫会把这些情况重新抛出，让整轮对话中断。
    const err = error as {
      message?: unknown
      status?: unknown
      response?: { status?: unknown; data?: { error?: { code?: unknown; message?: unknown } } }
    }
    const response = err?.response
    const status = typeof response?.status === 'number' ? response.status : 0
    const errorCode = response?.data?.error?.code ?? 'unknown'
    const rawMessage = response?.data?.error?.message ?? err?.message
    const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? '未知错误')

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
    const total = (this.config.keys || []).length
    if (!total) return
    this.currentKeyIndex = (this.currentKeyIndex + 1) % total
    logger.debug(`Switched to API key index: ${this.currentKeyIndex}`)
  }

  // 测试连接
  public async testConnection(): Promise<boolean> {
    const keys = (this.config.keys || []).filter(Boolean)
    if (!keys.length) {
      logger.warn('API connection test skipped: no key configured')
      return false
    }
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders(keys) })
      logger.info('API connection test succeeded')
      return true
    } catch (error) {
      logger.warn('API connection test failed')
      return false
    }
  }
}
