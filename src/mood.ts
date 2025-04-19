import { Context, Session, Logger } from 'koishi'
import { User, Sat } from './types'
import { ensureUserExists, getUser, updateFavorability, updateUserItems, updateUserP } from './database'
import { randomInt } from 'crypto'

const logger = new Logger('satori-ai-mood')

export class MoodManager {
  private ctx: Context
  private config: Sat.Config
  private moodMap: Map<string, { mood: number; lastUpdate: number }> = new Map()

  constructor(ctx: Context, config: Sat.Config) {
    this.ctx = ctx
    this.config = config
  }

  // 初始化用户心情
  private initUser(userId: string) {
    this.moodMap.set(userId, {
      mood: this.config.mood_div_1 + this.config.value_of_output_mood,
      lastUpdate: Date.now()
    })
  }

  // 每日重置检查
  private async checkDailyReset(userId: string) {
    const data = this.moodMap.get(userId)
    if (!data) return
    const user = await getUser(this.ctx, userId)
    if (user?.items?.['点心盒']) {
      delete user.items['点心盒']
      await updateUserItems(this.ctx, user)
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() })
    }
    const lastDate = new Date(data.lastUpdate)
    const now = new Date()
    if ( lastDate.getDate() !== now.getDate() || lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear() ) {
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() })
    }
  }

  // 处理输入内容心情变化
  public async handleInputMoodChange(user: User, favorabilityLevel: string ): Promise<void> {
    if (!this.config.enable_mood) return
    const userId = user.userid
    if (!this.moodMap.has(userId)) this.initUser(userId)
    await this.checkDailyReset(userId)
    let effect = this.config.value_of_input_mood
    switch (favorabilityLevel) {
      case '厌恶': effect = effect * 1.5; break
      case '陌生': effect = effect * 1; break
      case '朋友': effect = effect * 0.9; break
      case '暧昧': effect = effect * 0.8; break
      case '恋人': effect = effect * 0.6; break
      case '夫妻': effect = effect * 0.4; break
      default: effect = 0; break
    }
    effect = Math.round(effect) + 1
    this.applyMoodChange(user, -effect)
    return
  }

  // 处理输出内容心情变化
  public async handleOutputMoodChange(user: User, favorabilityLevel: string): Promise<void> {
    if (!this.config.enable_mood) return
    const userId = user.userid
    if (!this.moodMap.has(userId)) this.initUser(userId)
    await this.checkDailyReset(userId)
    let effect = this.config.value_of_output_mood
    switch (favorabilityLevel) {
      case '厌恶': effect = effect * 1.5; break
      case '陌生': effect = effect * 1; break
      case '朋友': effect = effect * 0.9; break
      case '暧昧': effect = effect * 0.8; break
      case '恋人': effect = effect * 0.6; break
      case '夫妻': effect = effect * 0.4; break
      default: effect = 0; break
    }
    effect = Math.round(effect) + 1
    this.applyMoodChange(user, -effect)
    return
  }

  // 应用心情变化
  public applyMoodChange(user: User, delta: number): void {
    if (!this.config.enable_mood) return
    const userId = user.userid
    let data = this.moodMap.get(userId)
    if (!data) {
      this.initUser(userId)
      data = this.moodMap.get(userId)
    }

    // 限制心情范围
    const newMood = Math.min(this.config.max_mood, data.mood + delta)

    this.moodMap.set(userId, {
      mood: newMood,
      lastUpdate: Date.now()
    })

    return
  }

  // 获取心情等级
  public getMoodLevel(userId: string): string {
    if (!this.config.enable_mood) return 'normal'
    const data = this.moodMap.get(userId)
    if (!data) {
      this.initUser(userId)
      return 'normal'
    }
    if (data.mood == this.config.max_mood) return 'happy'
    if (data.mood <= this.config.mood_div_2) return 'angry'
    if (data.mood <= this.config.mood_div_1) return 'upset'
    return 'normal'
  }

  // 获取心情值
  public getMoodValue(userId: string): number {
    if (!this.config.enable_mood) return 0
    const data = this.moodMap.get(userId)
    if (!data) {
      this.initUser(userId)
      return 0
    }
    return data.mood
  }

  // 生成心情提示
  public generateMoodPrompt(userId: string): string {
    const level = this.getMoodLevel(userId)
    return {
      'upset': `\n${this.config.mood_prompt_0}\n`,
      'angry': `\n${this.config.mood_prompt_1}\n`,
      'happy': `\n${this.config.mood_prompt_2}\n`,
      'normal': '你现在的心情很平淡',
    }[level]
  }

  public async handlePocketMoney(session: Session): Promise<string> {
    const user = await ensureUserExists(this.ctx, session.userId, session.username)
    const mood = this.getMoodValue(user.userid)
    if (mood < this.config.max_mood / 2) {
      updateFavorability(this.ctx, user, -this.config.value_of_output_favorability)
      return session.text('commands.sat.messages.not_good_mood')
    }
    this.applyMoodChange(user, -this.config.pocket_money_cost)
    const pocketMoney = randomInt(this.config.min_pocket_money, this.config.max_pocket_money + 1)
    updateUserP(this.ctx, user, pocketMoney)
    return session.text('commands.sat.messages.pocket_money', [pocketMoney])
  }

  public setMood(id: string, mood: number): string {
    this.moodMap.set(id, {
      mood: Math.min(this.config.max_mood, mood),
      lastUpdate: Date.now()
    })
    return '已设置' + id + '心情值为' + mood
  }

  public viewMood(session: Session, id: string): string {
    if (!this.config.enable_mood) return 'normal'
    const level = this.getMoodLevel(id)
    if (id === session.userId) {
      switch (level) {
        case 'upset': return `！`
        case 'angry': return `滚`
        case 'happy': return `♥`
        case 'normal': return `~`
        default: return `你的心情等级为 ${level}`
      }
    }
    else
      return `用户 ${id} 的心情等级为 ${level}`
  }
}
