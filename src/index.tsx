// src/index.ts
import { Context, Logger, Session, h } from 'koishi'
import { } from '@koishijs/censor'
import * as path from 'path'
import { APIClient } from './api'
import { MemoryManager } from './memory'
import { handleFixedDialogues } from './fixed-dialogues'
import { handleFavorabilitySystem, handleContentCheck, generateLevelPrompt, getFavorabilityLevel } from './favorability'
import { createMiddleware } from './middleware'
import { extendDatabase, ensureUserExists, updateFavorability } from './database'
import { Sat, User, FavorabilityConfig, MemoryConfig, APIConfig, MiddlewareConfig } from './types'
import { splitSentences, getTimeOfDay } from './utils'

const logger = new Logger('satori-ai')

export class SAT extends Sat {
  private apiClient: APIClient
  private memoryManager: MemoryManager

  // 重写构造函数
  constructor(ctx: Context, public config: Sat.Config) {
    // 调用父类构造函数
    super(ctx, config)
    // 初始化本地化
    ctx.i18n.define('zh', require('./locales/zh'))
    // 初始化数据库
    extendDatabase(ctx)
    // 初始化模块
    this.apiClient = new APIClient(ctx, this.getAPIConfig())
    this.memoryManager = new MemoryManager(ctx, this.getMemoryConfig())
    // 注册中间件
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()))
    // 注册命令
    this.registerCommands(ctx)
  }

  private getAPIConfig(): APIConfig {
    return {
      baseURL: this.config.baseURL,
      keys: this.config.key,
      appointModel: this.config.appointModel,
      content_max_tokens: this.config.content_max_tokens,
      temperature: this.config.temperature
    }
  }

  private getMemoryConfig(): MemoryConfig {
    return {
      dataDir: this.config.dataDir,
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      remember_min_length: this.config.remember_min_length
    }
  }

  private getMiddlewareConfig(): MiddlewareConfig & FavorabilityConfig {
      return {
        private: this.config.private,
        mention: this.config.mention,
        random_min_tokens: this.config.random_min_tokens,
        randnum: this.config.randnum,
        max_tokens: this.config.max_tokens,
        enable_favorability: this.config.enable_favorability,
        prompt_0: this.config.prompt_0,
        favorability_div_1: this.config.favorability_div_1,
        prompt_1: this.config.prompt_1,
        favorability_div_2: this.config.favorability_div_2,
        prompt_2: this.config.prompt_2,
        favorability_div_3: this.config.favorability_div_3,
        prompt_3: this.config.prompt_3,
        favorability_div_4: this.config.favorability_div_4,
        prompt_4: this.config.prompt_4
      }
  }

  private registerCommands(ctx: Context) {
    ctx.command('sat <text:text>', { authority: this.config.authority })
      .alias(...this.config.alias)
      .action(async ({ session }, prompt) => this.handleSatCommand(session, prompt))

    ctx.command('sat.clear', '清空会话')
      .action(({ session }) => this.clearSession(session))

    ctx.command('sat.common_sense <text:text>', '添加常识')
      .action(async ({ session }, prompt) => this.addCommonSense(session, prompt))
  }

  private async handleSatCommand(session: Session, prompt: string) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username)

    // 好感度阻断检查
    const favorabilityBlock = await this.checkFavorabilityBlock(session)
    if (favorabilityBlock) return favorabilityBlock
    // 前置检查
    const preCheckResult = this.performPreChecks(session, prompt)
    if (preCheckResult) return preCheckResult
    // 获取频道记忆
    const channelId = session.channelId
    const recentDialogues = this.memoryManager.getChannelMemory(channelId).slice(-10)
    // 重复对话检查
    const duplicateCheck = await this.checkDuplicateDialogue(session, prompt, recentDialogues, user)
    if (duplicateCheck) return duplicateCheck
    // 固定对话处理
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user)
    if (fixedResponse) return fixedResponse

    // 处理记忆和上下文
    logger.info(`用户 ${session.username}：${prompt}`)
    const processedPrompt = await this.processInput(session, prompt)
    const response = await this.generateResponse(session, processedPrompt)
    logger.info(`Satori AI：${response}`)
    // 更新记忆
    await this.updateMemories(session, processedPrompt, response)
    return this.formatResponse(session, response)
  }

  // 好感度阻断检查
  private async checkFavorabilityBlock(session: Session): Promise<string | void> {
    if (!this.config.enable_favorability) return null
    return await handleFavorabilitySystem(this.ctx, session, this.config)
  }

  // 前置检查
  private performPreChecks(session: Session, prompt: string): string {
    if (this.config.blockuser.includes(session.userId))
      return session.text('commands.sat.messages.block1')
    if (this.config.blockchannel.includes(session.channelId))
      return session.text('commands.sat.messages.block2')
    if (!prompt)
      return session.text('commands.sat.messages.no-prompt')
    if (prompt.length > this.config.max_tokens)
      return session.text('commands.sat.messages.tooLong')
    return null
  }

  // 重复对话检查
  private async checkDuplicateDialogue(session: Session, prompt: string, recentDialogues: Sat.Msg[], user: User): Promise<string> {
    let duplicateDialogue: Sat.Msg
    if (prompt.length <= 6)
      duplicateDialogue = recentDialogues.find(msg => msg.content.includes(prompt) || prompt.includes(msg.content))
    else
      duplicateDialogue = recentDialogues.find(msg => msg.content.includes(prompt))
    if (!duplicateDialogue) return null

    if (this.config.enable_favorability)
      updateFavorability(this.ctx, user, -1)
    return session.text('commands.sat.messages.duplicate-dialogue')
  }

  // 处理固定对话
  private async handleFixedDialoguesCheck(session: Session, user: User): Promise<string> {
    return await handleFixedDialogues(
      this.ctx,
      session,
      user,
      {
        dataDir: this.config.dataDir,
        enable_favorability: this.config.enable_favorability,
        enable_fixed_dialogues: this.config.enable_fixed_dialogues
      }
    )
  }

  // 处理输入
  private async processInput(session: Session, prompt: string) {
    // 敏感词处理
    let censored = prompt
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(prompt, session)
    }
    // 好感度检查
    if (this.config.enable_favorability) {
      await handleContentCheck(this.ctx, censored, session.userId)
    }
    return censored
  }

  // 生成回复
  private async generateResponse(session: Session, prompt: string) {
    const messages = this.buildMessages(session, prompt)
    return this.apiClient.chat(await messages)
  }

  // 构建消息
  private async buildMessages(session: Session, prompt: string) {
    const messages: Sat.Msg[] = []
    // 添加人格设定
    messages.push({
      role: 'system',
      content: await this.buildSystemPrompt(session)
    })
    // 添加上下文记忆
    const channelMemory = this.memoryManager.getChannelContext(session.channelId)
    messages.push(...channelMemory)

    // 添加当前对话
    messages.push({
      role: 'user',
      content: session.username + ':' + prompt
    })
    return messages
  }

  // 构建系统提示
  private async buildSystemPrompt(session: Session): Promise<string> {
    let prompt = this.config.prompt
    // 添加常识
    const commonSense = this.memoryManager.searchMemories(session, [], 'common')
    prompt += commonSense
    // 添加用户记忆
    const userMemory = this.memoryManager.searchMemories(session, [session.userId])
    prompt += userMemory
    // 添加时间信息
    prompt += `\n当前时间：${new Date().toLocaleString()}`
    // 添加好感度提示
    if (this.config.enable_favorability) {
      const user = await ensureUserExists(this.ctx, session.userId, session.username)
      prompt += generateLevelPrompt(getFavorabilityLevel(user.favorability, this.config), this.config)
    }
    return prompt
  }

  // 更新记忆
  private async updateMemories(session: Session, prompt: string, response: string) {
    // 更新短期记忆
    this.memoryManager.updateChannelMemory(session, prompt, response)
    // 保存长期记忆
    if (this.shouldRemember(prompt)) {
      await this.memoryManager.saveLongTermMemory(session, [{
        role: 'user',
        content: prompt
      }])
    }
  }

  // 是否应当记忆
  private shouldRemember(content: string): boolean {
    return content.length >= this.config.remember_min_length && !this.config.memory_block_words.some(word => content.includes(word))
  }

  // 格式化回复
  private formatResponse(session: Session, response: string) {
    if (this.config.sentences_divide) {
      return splitSentences(response).map(text => h.text(text))
    }
    return response
  }

  // 清空会话
  private clearSession(session: Session) {
    this.memoryManager.clearChannelMemory(session.channelId)
    return session.text('commands.sat.clear.messages.clean')
  }

  // 添加常识
  private async addCommonSense(session: Session, content: string) {
    const filePath = path.join(this.config.dataDir, 'common_sense.txt')
    await this.memoryManager.saveLongTermMemory(session, [{
      role: 'system',
      content
    }], filePath)
    return session.text('commands.sat.common_sense.messages.succeed', [content]);
  }

  // 中间件转接
  public async handleMiddleware(session: Session, prompt: string) {
    return this.handleSatCommand(session, prompt)
  }
}

// 导出 SAT 类
export default SAT
