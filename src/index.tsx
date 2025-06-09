// src/index.ts
import { Context, Logger, Session, h } from 'koishi'
import { } from '@koishijs/censor'
import * as path from 'path'
import { APIClient } from './api'
import { MemoryManager } from './memory'
import { handleFixedDialogues } from './fixed-dialogues'
import { handleFavorabilitySystem, inputContentCheck, generateLevelPrompt, getFavorabilityLevel, generateAuxiliaryPrompt, handleAuxiliaryResult, ensureCensorFileExists, outputContentCheck } from './favorability'
import { createMiddleware } from './middleware'
import { extendDatabase, ensureUserExists, updateFavorability, getUser, updateUserLevel, updateUserUsage } from './database'
import { Sat, User, FavorabilityConfig, MemoryConfig, APIConfig, MiddlewareConfig } from './types'
import { addOutputCensor, filterResponse, processPrompt, splitSentences, updateUserPWithTicket } from './utils'
import { UserPortraitManager } from './userportrait'
import { MoodManager } from './mood'
import { Game } from './game'
import Puppeteer, { } from 'koishi-plugin-puppeteer'
import { BroadcastManager } from './broadcast'

const logger = new Logger('satori-ai')

export let puppeteer : Puppeteer | null = null

export function refreshPuppeteer(ctx: Context) {
  if (ctx.puppeteer) {
    puppeteer = ctx.puppeteer
  } else {
    logger.warn('puppeteer未就绪')
  }
}

export class SAT extends Sat {
  private apiClient: APIClient
  private memoryManager: MemoryManager
  private portraitManager: UserPortraitManager
  private ChannelParallelCount: Map<string, number> = new Map()
  private onlineUsers: string[] = []
  private moodManager: MoodManager
  public broadcastManager: BroadcastManager
  private usersToWarn: Map<string, string> = new Map()
  private game: Game

  // 重写构造函数
  constructor(ctx: Context, public config: Sat.Config) {
    // 调用父类构造函数
    super(ctx, config)
    // 初始化本地化
    ctx.i18n.define('zh', require('./locales/zh'))
    // 实例化puppeteer
    puppeteer = ctx.puppeteer
    // 初始化数据库
    extendDatabase(ctx)
    // 初始化模块
    this.apiClient = new APIClient(ctx, this.getAPIConfig())
    this.memoryManager = new MemoryManager(ctx, this.getMemoryConfig())
    this.portraitManager = new UserPortraitManager(ctx, config)
    this.moodManager = new MoodManager(ctx, config)
    this.broadcastManager = new BroadcastManager(ctx, config)
    ensureCensorFileExists(this.config.dataDir)
    // 注册中间件
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()))
    // 注册命令
    this.registerCommands(ctx)
    if (this.config.enable_game) this.game = new Game(ctx, config, this)
  }

  private getAPIConfig(): APIConfig {
    return {
      baseURL: this.config.baseURL,
      keys: this.config.key,
      appointModel: this.config.appointModel,
      not_reasoner_LLM_URL: this.config.not_reasoner_LLM_URL,
      not_reasoner_LLM: this.config.not_reasoner_LLM,
      not_reasoner_LLM_key: this.config.not_reasoner_LLM_key,
      use_not_reasoner_LLM_length: this.config.use_not_reasoner_LLM_length,
      auxiliary_LLM_URL: this.config.auxiliary_LLM_URL,
      auxiliary_LLM: this.config.auxiliary_LLM,
      auxiliary_LLM_key: this.config.auxiliary_LLM_key,
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
      bracket_filter: this.config.bracket_filter,
      memory_filter: this.config.memory_filter,
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      personal_memory: this.config.personal_memory,
      channel_dialogues: this.config.channel_dialogues,
      channel_dialogues_max_length: this.config.channel_dialogues_max_length,
      remember_min_length: this.config.remember_min_length,
      common_topN: this.config.common_topN,
      dailogues_topN: this.config.dailogues_topN
    }
  }
  private getMiddlewareConfig(): MiddlewareConfig & FavorabilityConfig {
      return {
        private: this.config.private,
        nick_name: this.config.nick_name,
        nick_name_list: this.config.nick_name_list,
        nick_name_block_words: this.config.nick_name_block_words,
        max_favorability_perday: this.config.max_favorability_perday,
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
        prompt_4: this.config.prompt_4,
        prompt_5: this.config.prompt_5,
        enable_warning: this.config.enable_warning,
        warning_group: this.config.warning_group,
      }
  }
  private getFavorabilityConfig(): FavorabilityConfig {
    return {
      enable_favorability: this.config.enable_favorability,
      dataDir: this.config.dataDir,
      max_favorability_perday: this.config.max_favorability_perday,
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
      prompt_4: this.config.prompt_4,
      prompt_5: this.config.prompt_5
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

    ctx.command('sat.update_user_level', '更新用户等级', { authority: 2 })
      .alias('更新用户')
      .option('id', '-i <id:string>', { authority: 4 })
      .option('level', '-l <level:number>', { authority: 4 })
      .action(async ({ session, options }) => this.handleUserLevel(session, options))

    ctx.command('sat.user_usage', '查看用户使用次数')
      .alias('查询次数')
      .action(async ({ session }) => this.handleUserUsage(session))

    ctx.command('sat.add_output_censor <text:text>', '添加输出敏感词', { authority: 4 })
      .alias('添加输出屏蔽词')
      .action(async ({ session }, word) => addOutputCensor(session, word, this.config.dataDir))

    ctx.command('sat.get_user_portrait <text:text>', '查看用户画像', { authority: 4 })
      .alias('查看画像')
      .action(async ({}, userId) => this.portraitManager.getUserPortraitById(userId))

    ctx.command('sat.get_warning_list', '查看警告列表', { authority: 4 })
      .alias('查看警告')
      .action(async ({ session }) => this.getWarningList(session))

    if (this.config.enable_mood && this.config.enable_favorability && this.config.enable_pocket_money) {
      ctx.command('sat.pocket_money', '消耗心情值换取p点')
        .alias('要零花钱')
        .action(async ({ session }) => this.moodManager.handlePocketMoney(session))

      ctx.command('sat.set_mood', '设置心情值', { authority: 4 })
        .alias('设置心情')
        .option('id', '-i <id:string>', { authority: 4 })
        .option('value', '-v <value:number>', { authority: 4 })
        .action(async ({ session, options }) => this.moodManager.setMood(options.id || session.userId, options.value || 0))

      ctx.command('sat.get_mood', '查看心情状态')
        .alias('查看心情')
        .option('id', '-i <id:string>', { authority: 4 })
        .action(async ({ session, options }) => this.moodManager.viewMood(session, options.id || session.userId))
    }
  }

  private async handleSatCommand(session: Session, prompt: string) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username)
    // 处理输入
    const processedPrompt = await this.processInput(session, prompt)
    // 好感度阻断检查
    const favorabilityBlock = await this.checkFavorabilityBlock(session)
    if (favorabilityBlock) return favorabilityBlock
    // 前置检查
    const preCheckResult = this.performPreChecks(session, processedPrompt)
    if (preCheckResult) return preCheckResult
    // 重复对话检查
    const channelId = this.config.enable_self_memory ? session.userId : session.channelId
    const recentDialogues = this.memoryManager.getChannelMemory(channelId).slice(-10)
    const duplicateCheck = await this.checkDuplicateDialogue(session, processedPrompt, recentDialogues, user)
    if (duplicateCheck) return duplicateCheck
    // 固定对话处理
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user, processedPrompt)
    if (fixedResponse) return fixedResponse
    // 对话次数检查
    const dialogueCountCheck = await this.checkUserDialogueCount(session, user)
    if (dialogueCountCheck) return dialogueCountCheck
    // 更新频道并发数
    await this.updateChannelParallelCount(session, 1)
    // 生成回复
    const response = await this.generateResponse(session, processedPrompt)
    const auxiliaryResult = await this.handleAuxiliaryDialogue(session, processedPrompt, response)
    // 更新记忆
    await this.memoryManager.updateMemories(session, processedPrompt, this.getMemoryConfig(), response)
    // 更新用户p
    if (!response.error) await updateUserPWithTicket(this.ctx, user, 10)
    // 更新用户画像
    if (user.usage == this.config.portrait_usage - 1)
      this.portraitManager.generatePortrait(session, user, this.apiClient)
    return await this.formatResponse(session, response.content, auxiliaryResult)
  }

  // 处理辅助判断
  private async handleAuxiliaryDialogue(session: Session, prompt: string, response: { content: string, error: boolean}) {
    if (response.error || !this.config.enable_favorability) return null
    const user = await getUser(this.ctx, session.userId)
    const outputCheck = await outputContentCheck(this.ctx, response, session.userId, this.getFavorabilityConfig(), session, this.moodManager)
    const regex = /\*\*/g
    const inputCensor = prompt.match(regex)?.length
    const outputCensor = outputCheck < 0
    if (inputCensor) return "(好感↓↓)"
    if (outputCensor) return "(好感↓)"
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
    if (!prompt || prompt.length == 0)
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
    if (session.content == '戳戳') return null
    let duplicateDialogue = recentDialogues.find(msg => msg.content == prompt)
    if (!duplicateDialogue) return null

    if (this.config.enable_favorability){
      updateFavorability(this.ctx, user, -5)
      return session.text('commands.sat.messages.duplicate-dialogue')  + ' (好感↓)'
    }
    return session.text('commands.sat.messages.duplicate-dialogue')
  }

  // 处理固定对话
  private async handleFixedDialoguesCheck(session: Session, user: User, prompt: string): Promise<string | void> {
    const fixedDialogues = await handleFixedDialogues(this.ctx, session, user, prompt, {
        dataDir: this.config.dataDir,
        enable_favorability: this.config.enable_favorability,
        enable_fixed_dialogues: this.config.enable_fixed_dialogues
      }
    )
    if (fixedDialogues){ return fixedDialogues }
    return null
  }

  // 对话次数检查
  private async checkUserDialogueCount(session: Session, user: User, adjustment: number = 1): Promise<string | void> {
    const usage = await updateUserUsage(this.ctx, user, adjustment)
    if (user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description === 'on')
      return null
    const level = user.userlevel < 5 ? user.userlevel : 4
    const usageLimit = this.config.max_usage[level] || 0
    if (usage && usageLimit != 0 && usage > usageLimit) {
      return session.text('commands.sat.messages.exceeds')
    }
    return null
  }

  // 更新频道并发数
  private async updateChannelParallelCount(session: Session, value: number): Promise<void> {
    // 更新在线用户
    this.onlineUsers.push(session.userId)
    this.ChannelParallelCount.set(session.channelId, (this.ChannelParallelCount.get(session.channelId) || 0) + value)
  }
  // 获取频道并发数
  private getChannelParallelCount(session: Session): number {
    return this.ChannelParallelCount.get(session.channelId) || 0
  }

  // 处理输入
  private async processInput(session: Session, prompt: string) {
    const processedPrompt = processPrompt(prompt)
    // 敏感词处理
    let censored = processedPrompt
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(processedPrompt, session)
    }
    // 好感度检查
    if (this.config.enable_favorability) {
      await inputContentCheck(this.ctx, censored, session.userId, this.getFavorabilityConfig(), session, this.moodManager)
    }
    if (this.config.log_ask_response) logger.info(`用户 ${session.username}：${processedPrompt}`)
    return censored
  }

  // 生成回复
  public async generateResponse(session: Session, prompt: string) {
    if (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      logger.info(`频道 ${session.channelId} 并发数过高(${this.getChannelParallelCount(session)})，${session.username}等待中...`)
    }
    while (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      this.updateChannelParallelCount(session, -1)
      await new Promise(resolve => setTimeout(resolve, 1000))
      this.updateChannelParallelCount(session, 1)
    }
    const messages = await this.buildMessages(session, prompt)
    logger.info(`频道 ${session.channelId} 处理：${session.userId},剩余${this.getChannelParallelCount(session)}并发`)
    const user = await getUser(this.ctx, session.userId)
    let response = await this.getChatResponse(user, messages)
    if (response.error) response = await this.getChatResponse(user, messages)
    if (response.error) updateUserUsage(this.ctx, user, -1)
    return response
  }

  // 获取聊天回复
  public async getChatResponse(user: User, messages: Sat.Msg[]): Promise<{ content: string; error: boolean }> {
    let response = await this.apiClient.chat(user, messages)
    if (this.config.log_ask_response){
      if (this.config.enable_favorability && this.config.enable_mood)
        logger.info(`Satori AI：（心情值：${this.moodManager.getMoodValue(user.userid)}）${response.content}`)
      else
        logger.info(`Satori AI：${response.content}`)
    }
    if (this.config.reasoner_filter && !response.error)
      response = filterResponse(response.content, this.config.reasoner_filter_word.split('-'))
    return response
  }

  // 构建消息
  private async buildMessages(session: Session, prompt: string) {
    const messages: Sat.Msg[] = []
    const example = `<think>
好的，我会尽量做到的
</think>
<p>已明确对话要求</p>`
    // 添加人格设定
    if (this.config.no_system_prompt) {
      messages.push({ role: 'user', content: await this.buildSystemPrompt(session, prompt) })
      messages.push({ role: 'assistant', content: example })
    } else {
      messages.push({ role: 'system', content: await this.buildSystemPrompt(session, prompt) })
    }
    // 添加上下文记忆
    const userMemory = this.memoryManager.getChannelContext(this.config.personal_memory ? session.userId : session.channelId)
    messages.push(...userMemory)
    // 添加当前对话
    messages.push({ role: 'user', content: prompt })
    let payload = messages.map(msg => msg.role + ':' + msg.content).join('\n')
    if (this.config.log_system_prompt) logger.info(`系统提示：\n${payload}`)
    return messages
  }

  // 构建系统提示
  private async buildSystemPrompt(session: Session, prompt: string): Promise<string> {
    const commonSense = await this.memoryManager.searchMemories(session, prompt, 'common')
    const channelDialogue = await this.memoryManager.getChannelDialogue(session)
    const userMemory = await this.memoryManager.searchMemories(session, prompt)
    const user = await getUser(this.ctx, session.userId)
    const moodLevel = this.moodManager.getMoodLevel(user.userid)

    let systemPrompt = ''
    systemPrompt += '#首先明确一些参考信息\n'
    systemPrompt += '\n##' + commonSense
    systemPrompt += '\n##' + channelDialogue
    systemPrompt += '\n##' + userMemory
    if (moodLevel == 'normal' || moodLevel == 'happy') systemPrompt += '\n##' + this.portraitManager.getUserPortrait(session)

    systemPrompt += '\n#参考信息到此为止，接下来是思考要求\n'
    systemPrompt += this.getThinkingPrompt(user, prompt)

    systemPrompt += '\n#接下来是对话要求，以下要求仅对最终的回复内容生效，不限制思考过程\n'
    systemPrompt += this.config.prompt
    if (user?.items?.['觉的衣柜']?.count && (moodLevel == 'normal' || moodLevel == 'happy')) {
      const clothes = user?.items?.['觉的衣柜']?.metadata?.clothes
      if (clothes) systemPrompt += `\n##你当前的穿着(你可以根据穿着进行对应的行为)：${clothes}\n`
    }

    // 添加好感度提示
    if (this.config.enable_favorability) {
      const favorabilityLevel = getFavorabilityLevel(user, this.getFavorabilityConfig())
      if (this.config.enable_mood) {
        if ((moodLevel == 'normal' || moodLevel == 'happy') || favorabilityLevel == '厌恶')
          systemPrompt += '\n##' + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user)
        const moodPrompt = this.moodManager.generateMoodPrompt(user.userid)
        systemPrompt += `\n##${moodPrompt}\n` // 添加心情提示
      } else {
        systemPrompt += '\n##' + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user)
      }
    }

    // 添加用户名
    systemPrompt += `\n##用户的名字是：${session.username}`
    const nickName = user.items['情侣合照']?.metadata?.userNickName
    if (nickName) systemPrompt += `, 昵称是：${nickName},称呼用户时请优先使用昵称\n`

    systemPrompt += `\n#注意：你最终的回复内容必须使用“<p>”开头，使用“</p>”结尾\n`
    if (this.config.no_system_prompt) systemPrompt += '\n#如果你明白以上内容，请回复“<p>已明确对话要求</p>”'
    return systemPrompt
  }

  // 思考提示
  private getThinkingPrompt(user: User, prompt: string): string {
    const reasonerPrompt = this.config.reasoner_prompt
    const promptForNoReasoner = `#请你在回复时先进行分析思考，并且模仿思维链的模式输出思考内容，${reasonerPrompt};
#你在思考时必须以 "<think>" 开头, "<\/think>" 结尾。仔细揣摩用户意图，**完整输出思考内容后**再输出正式的回复内容;
#注意：你的正式回复内容必须使用“<p>”开头，使用“</p>”结尾，并且无论如何都要把标签输出完整\n`
    const promptForReasoner = `#你在思考时必须以 "嗯" 开头。仔细揣摩用户意图，思考结束后返回符合要求的回复。
#注意：你的回复内容必须使用“<p>”开头，使用“</p>”结尾\n`
    const hasTicket = user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description === 'on'
    const maxLength = hasTicket ? user?.items?.['地灵殿通行证']?.metadata?.use_not_reasoner_LLM_length : this.config.use_not_reasoner_LLM_length
    const useNoReasoner = prompt.length <= maxLength
    if (!this.config.enable_reasoner_like && useNoReasoner) return ''
    const reasonerText = `\n${useNoReasoner ? promptForNoReasoner : promptForReasoner}\n`
    return reasonerText
  }

  // 处理回复
  private async formatResponse(session: Session, response: string, auxiliaryResult: string | void) {
    const user = await getUser(this.ctx, session.userId)
    this.updateChannelParallelCount(session, -1)
    this.onlineUsers = this.onlineUsers.filter(id => id !== session.userId)
    if (!response) return session.text('commands.sat.messages.no-response')

    const catEar = user?.items?.['猫耳发饰']?.description && user.items['猫耳发饰'].description == 'on'
    const fumo = user?.items?.['觉fumo']?.description && user.items['觉fumo'].description == 'on'
    const ring = user?.items?.['订婚戒指']?.description && user.items['订婚戒指'].description == '已使用'
    const replyPointing = this.config.reply_pointing && (this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1)

    if (catEar) response += ' 喵~'
    if (fumo) response += '\nfumofumo'
    if (this.config.enable_mood && this.config.enable_favorability && this.config.visible_mood) {
      const moodLevel = this.moodManager.getMoodLevel(user.userid)
      if (moodLevel == 'angry') response += '（怒）'
      if (moodLevel == 'upset') response += '（烦躁）'
    }
    if (auxiliaryResult && this.config.visible_favorability && !ring) {
      response += auxiliaryResult
      this.addUserToWarnList(session, auxiliaryResult)
    }
    if (replyPointing) { response = `@${session.username} ` + response }

    if (this.config.sentences_divide && response.length > 10) {
      const sentences = splitSentences(response, this.config.min_sentences_length, this.config.max_sentences_length).map(text => h.text(text))
      for (const sentence of sentences) {
        await session.send(sentence)
        await new Promise(resolve => setTimeout(resolve, this.config.time_interval))
      }
      return null
    }
    return response
  }

  private addUserToWarnList(session: Session, auxiliaryResult: string) {
    if (!this.config.enable_warning) return
    if (auxiliaryResult.includes('好感↓')) {
      logger.info(`在群${session.channelId}中，${session.username}骚扰我！`)
      this.usersToWarn.set(session.channelId, session.username)
    }
  }

  public async getWarningList(session: Session) {
    let result = ''
    for (const [channelId, username] of this.usersToWarn.entries()) {
      if (channelId) {
        result += `在群${channelId}中，${username}骚扰我！\n`
      }
    }
    if (result.length == 0) return
    if (this.config.warning_admin_id)
      session.send(session.text('commands.sat.messages.warning',[this.config.warning_admin_id]) + result)
    else
      session.send(result)
    this.usersToWarn.clear()
    return
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
      this.memoryManager.clearChannelDialogue(session.channelId)
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

  // 更新用户等级
  private async handleUserLevel(session: Session, options: { id?: string , level?: number }) {
    const userId = options.id || session.userId
    const user = await ensureUserExists(this.ctx, userId, session.username)
    const level = options.level || (user.userlevel > 1 ? user.userlevel : 1)
    const enableUserKey = user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description == 'on'
    if (enableUserKey || level > 3) await this.portraitManager.generatePortrait(session, user, this.apiClient)
    await updateUserLevel(this.ctx, user, level)
    return session.text('commands.sat.messages.update_level_succeed', [level])
  }

  // 处理查询用户使用次数
  private async handleUserUsage(session: Session) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username)
    const userUsage = user.usage || 0
    const maxUsage = this.config.max_usage[user.userlevel || 0] || 0
    const enableUserKey = user?.items?.['地灵殿通行证']?.description && user.items['地灵殿通行证'].description == 'on'
    let result = ''
    result += '用户等级：' + user.userlevel + '\n'
    if (enableUserKey)
      result += session.text('commands.sat.messages.usage', [userUsage, '∞']) + '\n地灵殿通行证生效中\n'
    else
      result += session.text('commands.sat.messages.usage', [userUsage, maxUsage]) + '\n'
    if (this.portraitManager.hasPortrait(user.userid))
      result += '用户画像生效中\n'
    return result
  }

  // 随机中间件转接
  public async handleRandomMiddleware(session: Session, prompt: string) {
    const user = await getUser(this.ctx, session.userId)
    const processedPrompt = processPrompt(session.content)
    if (this.performPreChecks(session, processedPrompt)) return null
    if (await this.checkUserDialogueCount(session, user, 0)) return null
    if (await this.checkFavorabilityBlock(session)) return null
    // 敏感词处理
    let censored = processedPrompt
    if (this.ctx.censor) censored = await this.ctx.censor.transform(processedPrompt, session)
    if (censored.includes('**')) return null
    return this.handleSatCommand(session, prompt)
  }

  // 昵称中间件转接
  public async handleNickNameMiddleware(session: Session, prompt: string) {
    const user = await getUser(this.ctx, session.userId)
    if (await this.checkUserDialogueCount(session, user, 0)) return null
    if (await this.checkFavorabilityBlock(session)) return null
    return this.handleSatCommand(session, prompt)
  }

  // 频道记忆中间件转接
  public async handleChannelMemoryManager(session: Session): Promise<void> {
    const processedPrompt = processPrompt(session.content)
    if (this.performPreChecks(session, processedPrompt)) return null
    // 敏感词处理
    let censored = processedPrompt
    if (this.ctx.censor) censored = await this.ctx.censor.transform(processedPrompt, session)
    this.memoryManager.updateChannelDialogue(session, censored, session.username)
    return null
  }
}

// 导出 SAT 类
export default SAT
