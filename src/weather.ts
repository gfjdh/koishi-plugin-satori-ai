// src/weather.ts
import { Context, Logger, Session } from 'koishi'
import { gunzipSync } from 'zlib'
import { getUser, updateUserLocation } from './database'
import { Sat, User } from './types'

const logger = new Logger('satori-weather')
export class WeatherManager {
  constructor(
    private ctx: Context,
    private config: Sat.Config,
    private lastFetchTime: Map<string, number> = new Map(),
    private weatherCache: Map<string, string> = new Map(),
  ) {}

  // 生成 JWT (Ed25519)，返回 null 表示未配置 JWT
  private async generateJWT(): Promise<string | null> {
    const kid = this.config.weather_jwt_kid
    const sub = this.config.weather_jwt_sub
    const privateKeyPem = this.config.weather_jwt_private_key_pem // PEM 字符串
    if (!kid || !sub || !privateKeyPem) return null
    try {
      // Header 和 Payload
      const header = {
        alg: 'EdDSA',
        kid,
      }

      const now = Math.floor(Date.now() / 1000)
      const iat = Math.max(0, now - 30) // 建议将 iat 设为当前时间之前 30 秒以防止时间误差
      const expSeconds = this.config.weather_jwt_exp_seconds || 300
      const maxExp = Math.min(expSeconds, 86400)
      const exp = iat + maxExp

      const payload = {
        sub,
        iat,
        exp,
      }

      const base64url = (input: string | Buffer | Uint8Array) => {
        let buf: Buffer
        if (typeof input === 'string') buf = Buffer.from(input)
        else if (Buffer.isBuffer(input)) buf = input
        else buf = Buffer.from(input)
        return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
      }

      const encodedHeader = base64url(JSON.stringify(header))
      const encodedPayload = base64url(JSON.stringify(payload))
      const signingInput = `${encodedHeader}.${encodedPayload}`

      // 使用 Web Crypto (subtle) 签名 Ed25519，兼容 Node.js 的 webcrypto
      const pemToDer = (pem: string) => {
        const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '')
        return Buffer.from(b64, 'base64')
      }

      // 获取 SubtleCrypto
      let subtle: SubtleCrypto | undefined = (globalThis as any).crypto?.subtle
      if (!subtle) {
        // 在 Node.js 环境中尝试动态导入 webcrypto
        const cryptoModule = await import('crypto')
        subtle = (cryptoModule.webcrypto as any).subtle
      }

      if (!subtle) throw new Error('Web Crypto 不可用，无法生成 JWT')

      const pkcs8 = pemToDer(privateKeyPem)
      const pkcs8ArrayBuffer = pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength)
      const cryptoKey = await (subtle as any).importKey('pkcs8', pkcs8ArrayBuffer, { name: 'Ed25519' } as any, false, ['sign'])
      const data = new TextEncoder().encode(signingInput)
      const sig = await (subtle as any).sign({ name: 'Ed25519' } as any, cryptoKey, data)
      const signature = base64url(new Uint8Array(sig as ArrayBuffer))
      return `${signingInput}.${signature}`
    } catch (error: any) {
      logger.error('生成 JWT 失败: ' + (error.message || error.status || error))
      return null
    }
  }

  // 发起 HTTP 请求并兼容 gzip 压缩的 JSON 响应
  private async fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    try {
      // 请求原始二进制以便检测并解压 gzip
      const response: any = await this.ctx.http.get(url, { headers, responseType: 'arraybuffer' })

      // 规范化为 Buffer
      let buf: Buffer
      if (response instanceof ArrayBuffer) {
        buf = Buffer.from(response)
      } else if (response && response.data instanceof ArrayBuffer) {
        buf = Buffer.from(response.data)
      } else if (Buffer.isBuffer(response)) {
        buf = response
      } else if (response && typeof response === 'object') {
        // 某些 http client 可能已经解析为对象
        return response
      } else {
        buf = Buffer.from(String(response))
      }

      // 检测 gzip 魔数 0x1f 0x8b
      if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
          buf = gunzipSync(buf)
        } catch (e: any) {
          logger.warn('Gzip 解压失败，尝试按文本解析: ' + (e.message || e))
        }
      }

      const text = buf.toString('utf8')
      try {
        return JSON.parse(text)
      } catch {
        // 如果无法解析为 JSON，返回原始文本或响应对象
        try {
          return response
        } catch {
          return text
        }
      }
    } catch (error: any) {
      logger.error('fetchJson 请求失败: ' + (error.message || error.status || error))
      throw error
    }
  }

  // 更新用户位置信息
  public async updateLocation(session: Session, location: string): Promise<string | void> {
    if (!this.config.enable_weather_perception) return null
    if (!location || location.trim() === '') {
      return '位置不能为空，请提供有效的位置名称。'
    }
    const user = await getUser(this.ctx, session.userId)

    // 如果配置了 JWT，则不在 URL 上带 key 参数，使用 Authorization: Bearer
    const useJwt = !!(this.config.weather_jwt_kid && this.config.weather_jwt_sub && this.config.weather_jwt_private_key_pem)
    const jwt = useJwt ? await this.generateJWT() : null

    const baseURL = this.config.Location_search_API_URL
    const searchURL = useJwt
      ? `${baseURL}${this.config.location_param_name}=${encodeURIComponent(location)}`
      : `${baseURL}${this.config.location_param_name}=${encodeURIComponent(location)}&key=${this.config.weather_api_key}`

    const headers: Record<string, string> = {}
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`

    try {
      const response = await this.fetchJson(searchURL, headers)
      // 兼容不同结构：results 或 location
      const results = response?.results ?? response?.location ?? response
      if (Array.isArray(results) && results.length > 0) {
        const city = results[0]
        const fullLocation = city.path ?? `${city.adm1 || ''}${city.adm2 || ''}${city.name || ''}`
        logger.info(`用户 ${session.userId} 的位置已更新为 ${fullLocation}`)
        location = city.id || location
        await updateUserLocation(this.ctx, user, location)
        return `${session.username} 的位置已更新为 ${fullLocation}。`
      } else if (results && results.name) {
        const city = results
        const fullLocation = city.path ?? `${city.adm1 || ''}${city.adm2 || ''}${city.name || ''}`
        logger.info(`用户 ${session.userId} 的位置已更新为 ${fullLocation}`)
        location = city.id || location
        await updateUserLocation(this.ctx, user, location)
        return `${session.username} 的位置已更新为 ${fullLocation}。`
      } else {
        logger.warn(`未找到用户 ${session.userId} 的位置，输入为 "${location}"`)
        return '未能找到该位置，请确认输入是否正确。'
      }
    } catch (error: any) {
      logger.error(`未能更新用户 ${session.userId} 的位置: ${error.message || error.status}`)
      return '无法更新位置，错误: ' + error.message || error.status + '。'
    }
  }

   // 获取用户位置信息并调用天气API获取天气信息
  public async getWeatherInfo(session: Session): Promise<string | null> {
    if (!this.config.enable_weather_perception) return null
    const user = await getUser(this.ctx, session.userId)
    const location = user.location
    if (!location) return '未设置位置信息，请先使用“更新位置”命令设置位置。'

    // 优先使用 JWT，若未配置则用 API key 查询参数
  const useJwt = !!(this.config.weather_jwt_kid && this.config.weather_jwt_sub && this.config.weather_jwt_private_key_pem)
  const jwt = useJwt ? await this.generateJWT() : null

    const baseURL = this.config.weather_api_URL
    const weatherURL = useJwt
      ? `${baseURL}${this.config.weather_param_name}=${encodeURIComponent(location)}`
      : `${baseURL}${this.config.weather_param_name}=${encodeURIComponent(location)}&key=${this.config.weather_api_key}`

    const headers: Record<string, string> = {}
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`

    const currentTime = Date.now()
    const lastFetch = this.lastFetchTime.get(session.userId) || 0
    if (currentTime - lastFetch < this.config.weather_cd_time * 60 * 1000) {
      const cachedWeather = this.weatherCache.get(session.userId)
      if (cachedWeather) {
        return cachedWeather
      }
    }

    try {
      const response = await this.fetchJson(weatherURL, headers)
      const results = response?.results ?? response?.now ?? response
      let weatherData: any = null
      if (Array.isArray(results) && results.length > 0) {
        weatherData = results[0]?.now ?? results[0]
      } else if (results && results.now) {
        weatherData = results.now
      } else if (results && (results.text || results.temperature)) {
        weatherData = results
      }

      if (weatherData) {
        const weatherInfo = `当前天气：${weatherData.text ?? weatherData.description ?? '未知'}，温度：${weatherData.temperature ?? weatherData.temp ?? '未知'}°C`
        this.lastFetchTime.set(session.userId, currentTime)
        this.weatherCache.set(session.userId, weatherInfo)
        logger.info(`为用户 ${session.userId} 获取了最新的天气信息`)
        return weatherInfo
      } else {
        logger.warn(`未能获取用户 ${session.userId} 的天气信息，位置ID为 "${location}"`)
        return '未能获取天气信息，请稍后再试。'
      }
    } catch (error: any) {
      logger.error(`未能获取用户 ${session.userId} 的天气信息: ${error.message || error.status}`)
      return '无法获取天气信息，错误: ' + error.message || error.status || error.status + '。'
    }
  }

  // 构建天气提示词
  public async buildWeatherPrompt(session: Session): Promise<string | null> {
    if (!this.config.enable_weather_perception) return null
    const weatherInfo = await this.getWeatherInfo(session)
    if (!weatherInfo) return null
    return `当前我这里的天气是${weatherInfo}，你是明确知道这一点的。`
  }
}
