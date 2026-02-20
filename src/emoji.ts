import { Context, Logger, Session, h } from 'koishi'
import { Sat, User, APIError } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { trimSlash, isErrorWithMessage } from './utils'
import { pathToFileURL } from 'url'

const logger = new Logger('satori-emoji')

interface EmojiCategory {
  name: string
  files: string[]
}

export class EmojiManager {
  private categories: EmojiCategory[] = []
  private emojiDir: string

  constructor(private ctx: Context, private config: Sat.Config) {
    this.emojiDir = path.resolve(this.config.dataDir, 'emojis')
    this.loadEmojis()
  }

  private async loadEmojis() {
    try {
      if (!fs.existsSync(this.emojiDir)) {
        logger.warn(`表情包目录不存在: ${this.emojiDir}`)
        return
      }

      const entries = await fs.promises.readdir(this.emojiDir, { withFileTypes: true })
      const folders = entries.filter(entry => entry.isDirectory())

      for (const folder of folders) {
        const folderPath = path.join(this.emojiDir, folder.name)
        const files = await fs.promises.readdir(folderPath)
        // 过滤出图片文件，这里简单根据是否有后缀名判断，或者可以加更严格的过滤
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))

        if (imageFiles.length > 0) {
          this.categories.push({
            name: folder.name,
            files: imageFiles
          })
        }
      }

      logger.info(`已加载表情包类别: ${this.categories.map(c => c.name).join(', ')}`)
    } catch (error) {
      logger.error(`加载表情包失败: ${error}`)
    }
  }

  public shouldSendEmoji(): boolean {
    if (!this.config.enable_emoji) return false
    return Math.random() < this.config.emoji_probability
  }

  public async getEmoji(session: Session, user: User, recentMessages: Sat.Msg[]): Promise<string | null> {
    if (this.categories.length === 0) return null

    // 获取最近5条消息
    const contextMessages = recentMessages.slice(-5).map(msg => {
      // 避免 system prompt 混入 context 导致模型困惑
      if (msg.role === 'system') return '';
      return `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`
    }).filter(s => s).join('\n')

    // 构建提示词
    const categoryNames = this.categories.map(c => c.name).join('、')
    const systemPrompt = `你是一个表情包推荐助手。请根据提供的对话上下文，从给定的表情包类别中为AI选择一个最合适的表情包类别。
表情包类别列表：[${categoryNames}]
如果不适合发送表情包，请返回 "none"。
请只返回类别名称或 "none"，不要包含其他内容。`

    const userPrompt = `对话上下文：
${contextMessages}

请推荐一个最合适的表情包类别，只输出类别名称。`

    // 将 system prompt 合并到 user prompt 中，以提高兼容性
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`

    const messages: Sat.Msg[] = [
        { role: 'user', content: fullPrompt }
    ]
    logger.info(`表情包推荐提示词:\n${fullPrompt}`)

    // 获取API配置
    const { baseURL, key, model } = this.getAPIConfig(user)

    try {
      const response = await this.callLLM(baseURL, key, model, messages)
      const categoryName = response.trim()
      logger.info(`模型推荐的表情包类别: ${categoryName}`)

      if (!categoryName || categoryName === 'none') return null

      const category = this.categories.find(c => c.name === categoryName)
      if (category) {
        const randomFile = category.files[Math.floor(Math.random() * category.files.length)]
        const filePath = path.join(this.emojiDir, category.name, randomFile)
        logger.info(`选择表情包: ${category.name}/${randomFile}`)
        return filePath
      } else {
        // 如果返回的类别不在列表中，忽略
        logger.info(`模型返回了无效的表情包类别: ${categoryName}`)
        return null
      }
    } catch (error) {
      logger.warn(`获取表情包失败: ${error}`)
      return null
    }
  }

  private getAPIConfig(user: User): { baseURL: string, key: string, model: string } {
    const enableUserKey = user?.items?.['地灵殿通行证']?.description === 'on'

    if (enableUserKey) {
      const ticket = user.items['地灵殿通行证'].metadata
      // 优先使用 not_reasoner_model
      if (ticket?.not_reasoner_model) {
        return {
          baseURL: ticket.baseURL,
          key: ticket.key,
          model: ticket.not_reasoner_model
        }
      }
      return {
        baseURL: ticket.baseURL,
        key: ticket.key,
        model: ticket.model
      }
    }

    return {
      baseURL: this.config.not_reasoner_LLM_URL,
      key: this.config.not_reasoner_LLM_key[0], // 简化处理，使用第一个key
      model: this.config.not_reasoner_LLM
    }
  }

  private async callLLM(baseURL: string, key: string, model: string, messages: Sat.Msg[]): Promise<string> {
    const url = `${trimSlash(baseURL)}/chat/completions`
    const headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    }

    const payload = {
      model: model,
      messages: messages,
      temperature: 0.6,
      max_tokens: 500, // 增加到500以适应可能的思考过程
    }

    try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 10000 })
        logger.info(`LLM响应: ${JSON.stringify(response)}`)
        if (response.choices && response.choices.length > 0) {
            const content = response.choices[0].message?.content
            return content || ''
        }
        throw new Error('API响应格式错误')
    } catch (error) {
        if (isErrorWithMessage(error)) {
             const status = error.response?.status || 0;
             const message = error.response?.data?.error?.message || error.message;
             logger.warn(`API Error [${status}]: ${message}`);
        }
        throw error
    }
  }
}
