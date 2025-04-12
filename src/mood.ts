import { Context, Session, Logger } from 'koishi'
import { User, Sat } from './types'
import { ensureUserExists, updateFavorability, updateUserP } from './database'
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
      mood: 0,
      lastUpdate: Date.now()
    })
  }

  // 每日重置检查
  private checkDailyReset(userId: string) {
    const data = this.moodMap.get(userId)
    if (!data) return

    const lastDate = new Date(data.lastUpdate)
    const now = new Date()
    if ( lastDate.getDate() !== now.getDate() || lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear() ) {
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() })
    }
  }

  // 处理输入内容心情变化
  public async handleInputMoodChange(user: User): Promise<void> {
    const userId = user.userid
    if (!this.moodMap.has(userId)) this.initUser(userId)
    this.checkDailyReset(userId)
    this.applyMoodChange(user, -this.config.value_of_input_mood)
    return
  }

  // 处理输出内容心情变化
  public async handleOutputMoodChange(user: User): Promise<void> {
    const userId = user.userid
    if (!this.moodMap.has(userId)) this.initUser(userId)
    this.checkDailyReset(userId)
    this.applyMoodChange(user, -this.config.value_of_output_mood)
    return
  }

  // 应用心情变化
  public applyMoodChange(user: User, delta: number): void {
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
    const data = this.moodMap.get(userId)
    if (!data) {
      this.initUser(userId)
      return 'normal'
    }
    if (data.mood <= this.config.mood_div_2) return 'angry'
    if (data.mood <= this.config.mood_div_1) return 'upset'
    return 'normal'
  }

  // 获取心情值
  public getMoodValue(userId: string): number {
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
      'angry': `\n${this.config.mood_prompt_1}\n`,
      'upset': `\n${this.config.mood_prompt_0}\n`,
      'normal': ''
    }[level]
  }

  public async handlePocketMoney(session: Session): Promise<string> {
    const user = await ensureUserExists(this.ctx, session.userId, session.username)
    const level = this.getMoodLevel(user.userid)
    if (level === 'angry' || level === 'upset') {
      updateFavorability(this.ctx, user, -this.config.value_of_output_favorability)
      return session.text('commands.sat.messages.not_good_mood')
    }
    this.applyMoodChange(user, -this.config.pocket_money_cost)
    const pocketMoney = randomInt(this.config.min_pocket_money, this.config.max_pocket_money + 1)
    updateUserP(this.ctx, user, pocketMoney)
    return session.text('commands.sat.messages.pocket_money', [pocketMoney])
  }
}
