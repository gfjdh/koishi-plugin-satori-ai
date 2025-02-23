// src/index.ts
import { Context, Logger, Session, h } from 'koishi'
import { } from '@koishijs/censor'
import * as path from 'path'
import { APIClient } from './api'
import { MemoryManager } from './memory'
import { handleFixedDialogues } from './fixed-dialogues'
import { handleFavorabilitySystem, inputContentCheck, generateLevelPrompt, getFavorabilityLevel, generateAuxiliaryPrompt, handleAuxiliaryResult, ensureCensorFileExists, outputContentCheck } from './favorability'
import { createMiddleware } from './middleware'
import { extendDatabase, ensureUserExists, updateFavorability, getUser } from './database'
import { Sat, User, FavorabilityConfig, MemoryConfig, APIConfig, MiddlewareConfig } from './types'
import { splitSentences } from './utils'

const logger = new Logger('satori-ai')

export class SAT extends Sat {
  private apiClient: APIClient
  private memoryManager: MemoryManager
  private ChannelParallelCount: Map<string, number> = new Map()
  private onlineUsers: string[] = []

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
    this.memoryManager = new MemoryManager(this.getMemoryConfig())
    ensureCensorFileExists(this.config.dataDir)
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
      auxiliary_LLM_URL: this.config.auxiliary_LLM_URL,
      auxiliary_LLM: this.config.auxiliary_LLM,
      auxiliary_LLM_key: this.config.auxiliary_LLM_key,
      content_max_tokens: this.config.content_max_tokens,
      content_max_length: this.config.content_max_length,
      maxRetryTimes: this.config.maxRetryTimes,
      retry_delay_time: this.config.retry_delay_time,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty,
      reasoning_content: this.config.log_reasoning_content
    }
  }
  private getMemoryConfig(): MemoryConfig {
    return {
      dataDir: this.config.dataDir,
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      personal_memory: this.config.personal_memory,
      remember_min_length: this.config.remember_min_length,
      common_topN: this.config.common_topN,
      dailogues_topN: this.config.dailogues_topN
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
        dataDir: this.config.dataDir,
        input_censor_favorability: this.config.input_censor_favorability,
        value_of_input_favorability: this.config.value_of_input_favorability,
        output_censor_favorability: this.config.output_censor_favorability,
        value_of_output_favorability: this.config.value_of_output_favorability,
        enable_auxiliary_LLM: this.config.enable_auxiliary_LLM,
        offset_of_fafavorability: this.config.offset_of_fafavorability,
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
  private getFavorabilityConfig(): FavorabilityConfig {
    return {
      enable_favorability: this.config.enable_favorability,
      dataDir: this.config.dataDir,
      input_censor_favorability: this.config.input_censor_favorability,
      value_of_input_favorability: this.config.value_of_input_favorability,
      output_censor_favorability: this.config.output_censor_favorability,
      value_of_output_favorability: this.config.value_of_output_favorability,
      enable_auxiliary_LLM: this.config.enable_auxiliary_LLM,
      offset_of_fafavorability: this.config.offset_of_fafavorability,
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
      .option('global', '-g')
      .action(({ session, options }) => this.clearSession(session, options.global))

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
    // 重复对话检查
    const recentDialogues = this.memoryManager.getChannelMemory(session.channelId).slice(-10)
    const duplicateCheck = await this.checkDuplicateDialogue(session, prompt, recentDialogues, user)
    if (duplicateCheck) return duplicateCheck
    // 固定对话处理
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user, prompt)
    if (fixedResponse) return fixedResponse

    // 处理记忆和上下文
    if (this.config.log_ask_response) logger.info(`用户 ${session.username}：${prompt}`)
    this.onlineUsers.push(session.userId)
    // 更新频道并发数
    await this.updateChannelParallelCount(session, 1)
    const processedPrompt = await this.processInput(session, prompt)
    const response = await this.generateResponse(session, processedPrompt)
    if (this.config.log_ask_response) logger.info(`Satori AI：${response.content}`)
    const auxiliaryResult = await this.handleAuxiliaryDialogue(session, processedPrompt, response)
    // 更新记忆
    await this.memoryManager.updateMemories(session, processedPrompt, this.getMemoryConfig(), response)
    this.onlineUsers = this.onlineUsers.filter(id => id !== session.userId)
    return await this.formatResponse(session, response.content, auxiliaryResult)
  }

  // 处理辅助判断
  private async handleAuxiliaryDialogue(session: Session, prompt: string, response: { content: string, error: boolean}) {
    if (response.error) return null
    const user = await ensureUserExists(this.ctx, session.userId, session.username)
    const outputCheck = await outputContentCheck(this.ctx, response, session.userId, this.getFavorabilityConfig())
    const regex = /\*\*/g
    const inputCensor = prompt.match(regex)?.length
    const outputCensor = outputCheck < 0
    if (inputCensor && this.config.visible_favorability) return "(好感↓↓)"
    if (outputCensor && this.config.visible_favorability) return "(好感↓)"
    if (this.config.enable_auxiliary_LLM && !response.error && response.content) {
      const messages = generateAuxiliaryPrompt(prompt, response.content, user, this.getFavorabilityConfig())
      const result = await this.apiClient.auxiliaryChat(messages)
      if (result.error) {
        logger.error(`辅助判断失败：${result.content}`)
      } else {
        logger.info(`辅助判断：${result.content}`)
        return handleAuxiliaryResult(this.ctx, session, this.getFavorabilityConfig(), result.content)
      }
    }
    return null
  }

  // 好感度阻断检查
  private async checkFavorabilityBlock(session: Session): Promise<string | void> {
    if (!this.config.enable_favorability) return null
    return await handleFavorabilitySystem(this.ctx, session, this.getFavorabilityConfig())
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
    if (this.onlineUsers.includes(session.userId) && this.config.enable_online_user_check)
      return session.text('commands.sat.messages.online')
    return null
  }

  // 重复对话检查
  private async checkDuplicateDialogue(session: Session, prompt: string, recentDialogues: Sat.Msg[], user: User): Promise<string> {
    if (!this.config.duplicateDialogueCheck) return null
    let duplicateDialogue = recentDialogues.find(msg => msg.content == user.usersname + ':' + prompt)
    if (!duplicateDialogue) return null

    if (this.config.enable_favorability)
      updateFavorability(this.ctx, user, -1)
    return session.text('commands.sat.messages.duplicate-dialogue')
  }

  // 处理固定对话
  private async handleFixedDialoguesCheck(session: Session, user: User, prompt: string): Promise<string | void> {
    const fixedDialogues = await handleFixedDialogues(
      this.ctx,
      session,
      user,
      prompt,
      {
        dataDir: this.config.dataDir,
        enable_favorability: this.config.enable_favorability,
        enable_fixed_dialogues: this.config.enable_fixed_dialogues
      }
    )
    if (fixedDialogues){
      return fixedDialogues
    }
    return null
  }

  // 更新频道并发数
  private async updateChannelParallelCount(session: Session, value: number): Promise<void> {
    this.ChannelParallelCount.set(session.channelId, (this.ChannelParallelCount.get(session.channelId) || 0) + value)
  }
  // 获取频道并发数
  private getChannelParallelCount(session: Session): number {
    return this.ChannelParallelCount.get(session.channelId) || 0
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
      await inputContentCheck(this.ctx, censored, session.userId, this.getFavorabilityConfig())
    }
    return censored
  }

  // 生成回复
  private async generateResponse(session: Session, prompt: string) {
    if (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      logger.info(`频道 ${session.channelId} 并发数过高(${this.getChannelParallelCount(session)})，${session.username}等待中...`)
    }
    while (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      this.updateChannelParallelCount(session, -1)
      await new Promise(resolve => setTimeout(resolve, 1000))
      this.updateChannelParallelCount(session, 1)
    }
    const messages = this.buildMessages(session, prompt)
    logger.info(`频道 ${session.channelId} 处理：${session.userId},剩余${this.getChannelParallelCount(session)}并发`)
    return await this.apiClient.chat(await messages)
  }

  // 构建消息
  private async buildMessages(session: Session, prompt: string) {
    const messages: Sat.Msg[] = []
    // 添加人格设定
    messages.push({
      role: 'system',
      content: await this.buildSystemPrompt(session, prompt)
    })
    // 添加上下文记忆
    if (this.config.personal_memory) {
      const userMemory = this.memoryManager.getChannelContext(session.userId)
      messages.push(...userMemory)
    } else {
      const channelMemory = this.memoryManager.getChannelContext(session.channelId)
      messages.push(...channelMemory)
    }
    // 添加当前对话
    messages.push({
      role: 'user',
      content: prompt
    })
    return messages
  }

  // 构建系统提示
  private async buildSystemPrompt(session: Session, prompt: string): Promise<string> {
    let systemPrompt = this.config.prompt
    // 添加常识
    const commonSense = await this.memoryManager.searchMemories(session, prompt, 'common')
    // 添加用户记忆
    const userMemory = await this.memoryManager.searchMemories(session, prompt)
    systemPrompt += commonSense
    systemPrompt += userMemory
    // 添加用户信息
    systemPrompt += `用户的名字是：${session.username}, id是：${session.userId}`
    // 添加好感度提示
    if (this.config.enable_favorability) {
      const user = await ensureUserExists(this.ctx, session.userId, session.username)
      systemPrompt += generateLevelPrompt(getFavorabilityLevel(user, this.getFavorabilityConfig()), this.getFavorabilityConfig(), user)
    }
    if (this.config.log_system_prompt) logger.info(`系统提示：${systemPrompt}`)
      return systemPrompt
  }

  // 处理回复
  private async formatResponse(session: Session, response: string, auxiliaryResult: string | void) {
    const user = await getUser(this.ctx, session.userId)
    this.updateChannelParallelCount(session, -1)
    if (!response) return session.text('commands.sat.messages.no-response')

    if (this.config.sentences_divide && response.length > 10) {
      if (response.endsWith('。')) response = response.slice(0, -1)
      if (user?.items['猫耳发饰']?.count > 0 && user?.items['猫耳发饰']?.description && user?.items['猫耳发饰']?.description == 'on') response += ' 喵~'
      if (user?.items['觉fumo']?.count > 0 && user?.items['觉fumo']?.description && user?.items['觉fumo']?.description == 'on') response += '\nfumofumo'
      if (auxiliaryResult && this.config.visible_favorability) response += auxiliaryResult
      const sentences = splitSentences(response).map(text => h.text(text))
      for (const sentence of sentences) {
        if (this.config.reply_pointing && (this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1))
          { await session.send(`@${session.username} ` + sentence) }
        else
          { await session.send(sentence) }
        await new Promise(resolve => setTimeout(resolve, this.config.time_interval))
      }
      return null
    }

    if (this.config.reply_pointing && (this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1)) { response = `@${session.username} ` + response }
    if (user?.items['猫耳发饰']?.count > 0 && user?.items['猫耳发饰']?.description && user?.items['猫耳发饰']?.description == 'on') response += ' 喵~'
    if (user?.items['觉fumo']?.count > 0 && user?.items['觉fumo']?.description && user?.items['觉fumo']?.description == 'on') response += '\nfumofumo'
    if (auxiliaryResult && this.config.visible_favorability) response += auxiliaryResult
    return response
  }

  // 清空会话
  private clearSession(session: Session, global: boolean) {
    if (global) {
      this.memoryManager.clearAllMemories()
      return session.text('commands.sat.clear.messages.Allclean')
    } else {
      if (this.config.personal_memory) {
        this.memoryManager.clearChannelMemory(session.userId)
      } else {
        this.memoryManager.clearChannelMemory(session.channelId)
      }
    }
    return session.text('commands.sat.clear.messages.clean')
  }

  // 添加常识
  private async addCommonSense(session: Session, content: string) {
    if (!content) return session.text('commands.sat.common_sense.messages.no-prompt')
    const filePath = path.join(this.config.dataDir, 'common_sense.txt')
    await this.memoryManager.saveLongTermMemory(session, [{
      role: 'user',
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
