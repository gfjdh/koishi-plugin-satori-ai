// src/favorability.ts
import { Context, Session, Logger } from 'koishi'
import { User, FavorabilityLevel, FavorabilityConfig } from './types'
import { getUser, updateFavorability, ensureUserExists } from './database'

const logger = new Logger('satori-ai')

export async function handleFavorabilitySystem(ctx: Context, session: Session, config: FavorabilityConfig): Promise<string | void> {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  // 初始好感度检查
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900) {
    return session.text('commands.sat.messages.block1');
  }
  // 英语内容检查
  const englishCount = (session.content.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8) {
    return session.text('commands.sat.messages.tooManyEnglishLetters');
  }
  // 获取当前好感度等级
  const level = getFavorabilityLevel(user.favorability, config);
  return;
}

// 获取好感度等级
export function getFavorabilityLevel(
  favorability: number,
  config: FavorabilityConfig
): FavorabilityLevel {
  if (favorability < config.favorability_div_1) return '厌恶'
  if (favorability < config.favorability_div_2) return '陌生'
  if (favorability < config.favorability_div_3) return '朋友'
  if (favorability < config.favorability_div_4) return '暧昧'
  return '恋人'
}

// 生成等级提示
export function generateLevelPrompt(
  level: FavorabilityLevel,
  config: FavorabilityConfig
): string {
  const prompts = {
    '厌恶': config.prompt_0,
    '陌生': config.prompt_1,
    '朋友': config.prompt_2,
    '暧昧': config.prompt_3,
    '恋人': config.prompt_4
  }
  return `\n${prompts[level]}\n`
}

// 处理好感度检查
export async function handleContentCheck(ctx: Context, content: string, userid: string): Promise<number> {
  const user = await getUser(ctx, userid)
  if (!user) return 0
  // 敏感词检测
  const regex = /\*\*/g
  const hasCensor = regex.test(content)
  if (hasCensor) {
    await updateFavorability(ctx, user, -15)
    return -15
  }

  // 正常情况增加1点
  await updateFavorability(ctx, user, 1)
  return 1
}

// 应用好感度效果
export async function applyFavorabilityEffect(
  ctx: Context,
  user: User,
  effect: number
): Promise<void> {
  await updateFavorability(ctx, user, effect)
}

// 实现自定义好感度效果
interface FavorabilityEffect {
  type: 'add' | 'multiply' | 'set'
  value: number
}
// 应用自定义效果
export async function applyCustomEffect(ctx: Context, user: User, effect: FavorabilityEffect) {
  let newValue = user.favorability
  switch (effect.type) {
    case 'add':
      newValue += effect.value
      break
    case 'multiply':
      newValue *= effect.value
      break
    case 'set':
      newValue = effect.value
      break
  }

  await updateFavorability(ctx, user, newValue)
}

// 实现好感度策略
export interface FavorabilityStrategy {
  calculate(content: string, user: User): number
}
