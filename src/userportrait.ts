// src/portrait.ts
import { Context, Session, Logger } from 'koishi'
import { FavorabilityConfig, MemoryEntry, Sat, User } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { APIClient } from './api'
import { getFavorabilityLevel } from './favorability'

const logger = new Logger('satori-portrait')

export class UserPortraitManager {

  constructor(
    private ctx: Context,
    private config: Sat.Config,
  ) {}

  // 获取用户印象路径
  private getPortraitPath(userId: string): string {
    return path.join(this.config.dataDir, 'UserPortrait', `${userId}.txt`)
  }

  // 检查用户印象文件
  public hasPortrait(userId: string): boolean {
    return fs.existsSync(this.getPortraitPath(userId))
  }

  // 读取用户印象
  public readPortrait(userId: string): string {
    try {
      return fs.readFileSync(this.getPortraitPath(userId), 'utf-8')
    } catch {
      return ''
    }
  }

  // 获取长期记忆对话
  private async getDialogues(user: User): Promise<string[]> {
    const userId = user.userid
    const memoryPath = path.join(this.config.dataDir, 'dialogues', `${userId}.txt`)
    if (!fs.existsSync(memoryPath)) return []

    const MemoryContent: MemoryEntry[] = await JSON.parse(fs.readFileSync(memoryPath, 'utf-8'))
    const dialoguesContent = MemoryContent.map(msg => `${msg.content}${msg.role == 'user' ? '(未记录时间)' : msg.role}`)
    const level = user.userlevel < 5 ? user.userlevel : 4
    const usageLimit = this.config.max_usage[level] == 0 ? this.config.max_portrait_dialogues : this.config.max_usage[level]
    if (dialoguesContent.length >= usageLimit || dialoguesContent.length >= this.config.max_portrait_dialogues) {
      dialoguesContent.splice(0, dialoguesContent.length - Math.min(usageLimit, this.config.max_portrait_dialogues))
    }
    return dialoguesContent
  }

  // 生成提示词模板
  private buildMessage(level: string, history: string, existingPortrait: string, user: User): Sat.Msg[] {
    return [{
      role: 'user',
      content: `你是一个角色扮演智能体工作流中的一环，请根据以下信息生成用户画像。需包括：
1. 基本信息（性别、年龄、生日等）
2. 生活习惯（作息、爱好等）
3. 性格特征（用几句话描述）
4. 交流偏好（常用语气词、话题倾向）
5. 敏感点（明确表示反感的内容）
6. 对AI的期望（从对话历史中推断）
7. 其他你认为需要记录的信息（如有）
8. 用户希望记住的信息（如有）
9. 需要短期记忆的信息（如有）

用户名：${user.usersname}
你与用户的关系：${level}
历史画像：
${existingPortrait ? '无' : existingPortrait}\n
近期的用户发言记录：
${history}

注意事项：
·用户一定是人类，其他情况是角色扮演
·若有历史画像则需要根据发言修正历史画像内容，以发言为准
·及时删除历史画像中的错误信息
·尤其注意用户说“记住”的部分，可能是用户希望记录的信息
·历史画像中的需要短期记忆的信息不需要保留，只需要删除旧的添加新的
·因为在保存聊天记录时，会将文本中的第一个“我”替换为用户名，所以可能并不是用户自己说的
·因为在角色扮演中，用户可能会说出不符合事实的信息，需要根据事实推断，避免盲目相信或主观臆测
·使用简洁的条目式表达，但内容要全面
·保留不确定性的表述（如"可能"、"似乎"、"用户自称"）
·保持中立和客观，避免带有个人情感色彩的描述，不要添加评价或建议
·仅给出画像内容，不要添加额外的描述、建议、评价、注解等任何内容
·不使用markdown等标记语言，直接书写即可`
    }]
  }

  // 执行画像生成
  public async generatePortrait(
    session: Session,
    user: User,
    apiClient: APIClient
  ): Promise<void> {
    if (!this.config.enable_favorability) return
    if (!this.config.enable_user_portrait) return
    if (user.favorability < this.config.portrait_min_favorability) return

    const dialogues = await this.getDialogues(user)
    const existing = this.readPortrait(user.userid)
    const userlevel = getFavorabilityLevel(user, this.getFavorabilityConfig())
    const messages = this.buildMessage(userlevel, dialogues.join('\n'), existing, user)
    logger.info(`用户 ${user.userid} 画像生成中...`)
    try {
      const response = await apiClient.generateUserPortrait(user, messages)
      if (response && !response.error) {
        this.savePortrait(user, response.content)
        if (user.usage > this.config.portrait_usage - 1) session.send('用户画像更新成功。')
        logger.success(`用户 ${user.userid} 画像更新成功`)
      }
    } catch (error) {
      logger.error(`画像生成失败：${error.message}`)
    }
  }

  private savePortrait(user: User, portrait: string): void {
    const filePath = this.getPortraitPath(user.userid)
    this.ensurePortraitFile(user.userid)
    fs.writeFileSync(filePath, portrait)
  }

  private ensurePortraitFile(userId: string): void {
    const filePath = this.getPortraitPath(userId)
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '')
    }
  }

  // 获取用户画像
  public getUserPortrait(session: Session): string {
    if (!this.config.enable_user_portrait) return ''
    const portrait = this.readPortrait(session.userId)
    return portrait ? `\n以下是当前用户的补充信息：{${portrait}\n}\n` : ''
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
      prompt_4: this.config.prompt_4
    }
  }
}
