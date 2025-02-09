// src/favorability.ts
import { Context, Session } from 'koishi'
import { User, FavorabilityLevel, FavorabilityConfig } from './types'
import { getUser, updateFavorability, ensureUserExists } from './database'
import { Sat } from './types'

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

// 生成辅助提示
export function generateAuxiliaryPrompt(prompt: string, responseContent: string): Sat.Msg[] {
  const messages: Sat.Msg[] = []
  // 添加系统提示
  messages.push({
    role: 'system',
    content: "请你评价我之后给你的对话，你需要从回答者的角度考虑其听到此问题和做出此回答的感受，然后返回判断。你返回的应当是‘暴怒’，‘平淡’，‘愉悦’中的一个，你只需要返回这几个词之一，不要补充其他内容"
  })
  // 添加当前对话
  messages.push({
    role: 'user',
    content: `问题：${prompt}，回答：${responseContent}`
  })
  return messages
}

// 处理辅助结果
export async function handleAuxiliaryResult(ctx: Context, session: Session, config: FavorabilityConfig, responseContent: string): Promise<string | void> {
  const user = await ensureUserExists(ctx, session.userId, session.username);

  const effectMap = {
    '暴怒': Math.floor(-1 * config.value_of_favorability),
    '平淡': 0,
    '愉悦': Math.floor(0.5 * config.value_of_favorability)
  }
  // 正则匹配responseContent中的关键词
  const regex = /暴怒|平淡|愉悦/g
  const KeyWord = responseContent.match(regex)?.[0]
  // 处理好感度检查
  const favorabilityEffect = effectMap[KeyWord]
  // 应用好感度效果
  await applyFavorabilityEffect(ctx, user, favorabilityEffect ? favorabilityEffect : 0)
  if (favorabilityEffect < 0) {
    return "(好感度↓)";
  }
  if (favorabilityEffect > 0) {
    return "(好感度↑)";
  }
}

// 处理好感度检查
export async function handleContentCheck(ctx: Context, content: string, userid: string): Promise<number> {
  const user = await getUser(ctx, userid)
  if (!user) return 0
  // 敏感词检测
  const regex = /\*\*/g
  const hasCensor = regex.test(content)

  if (hasCensor && this.config.censor_favorability) {
    await updateFavorability(ctx, user, -1 * this.config.value_of_favorability)
    return -1 * this.config.value_of_favorability
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
