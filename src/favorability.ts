// src/favorability.ts
import { Context, Session } from 'koishi'
import { User, FavorabilityLevel, FavorabilityConfig } from './types'
import { getUser, updateFavorability, ensureUserExists, updateUserItems } from './database'
import { MoodManager } from './mood'
import { Sat } from './types'
import * as fs from 'fs'
import * as path from 'path'

export async function handleFavorabilitySystem(ctx: Context, session: Session, config: FavorabilityConfig): Promise<string | void> {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  const level = getFavorabilityLevel(user, config)
  // 初始好感度检查
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900 && level !== '夫妻') {
    return session.text('commands.sat.messages.block1');
  }
  // 英语内容检查
  const englishCount = (session.content.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8 && level !== '夫妻') {
    return session.text('commands.sat.messages.tooManyEnglishLetters');
  }
  return;
}

// 获取好感度等级
export function getFavorabilityLevel(
  user: User,
  config: FavorabilityConfig
): FavorabilityLevel {
  if (user?.items['订婚戒指']?.count > 0 && user?.items['订婚戒指']?.description && user?.items['订婚戒指']?.description == '已使用') return '夫妻'
  if (user.favorability < config.favorability_div_1) return '厌恶'
  if (user.favorability < config.favorability_div_2) return '陌生'
  if (user.favorability < config.favorability_div_3) return '朋友'
  if (user.favorability < config.favorability_div_4) return '暧昧'
  return '恋人'
}

// 生成等级提示
export function generateLevelPrompt(
  level: FavorabilityLevel,
  config: FavorabilityConfig,
  user: User
): string {
  const prompts = {
    '厌恶': config.prompt_0,
    '陌生': config.prompt_1,
    '朋友': config.prompt_2,
    '暧昧': config.prompt_3,
    '恋人': config.prompt_4,
    '夫妻': config.prompt_5
  }
  return `\n${prompts[level]}\n`
}

// 生成辅助提示
export function generateAuxiliaryPrompt(prompt: string, responseContent: string, user: User, config: FavorabilityConfig): Sat.Msg[] {
  const messages: Sat.Msg[] = []
  // 添加系统提示
  messages.push({
    role: 'system',
    content: "请你评价我之后给你的对话，你需要从回答者的角度，猜测回答者听到此问题和做出此回答的感受好坏，然后返回打分。你需要谨慎判断回答者是在警告还是在调情。你返回的值应当是从0到9之间的一个数字，数字越大代表感受越幸福，数字越小代表感受越恶心。你只需要返回一个数字，不要补充其他内容"
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
  // 正则匹配responseContent中的第一个数字
  const regex = /\d+/g
  const value = parseInt(responseContent.match(regex)[0]) ? parseInt(responseContent.match(regex)[0]) : 5
  // 处理好感度检查
  let favorabilityEffect = value - config.offset_of_fafavorability
  // 应用好感度效果
  await applyFavorabilityEffect(ctx, user, favorabilityEffect ? favorabilityEffect : 0, session)
  if (favorabilityEffect < 0) {
    return "(好感↓)";
  }
  if (favorabilityEffect > 0) {
    return "(好感↑)";
  }
  return;
}

// 处理输入好感度检查
export async function inputContentCheck(
  ctx: Context,
  content: string,
  userid: string,
  config: FavorabilityConfig,
  session: Session,
  moodManager: MoodManager
): Promise<number> {
  const user = await getUser(ctx, userid)
  if (!user) return 0
  // 敏感词检测
  const regex = /\*\*/g
  const hasCensor = regex.test(content)

  if (hasCensor && config.input_censor_favorability) {
    moodManager.handleInputMoodChange(user) // 处理心情变化
    await applyFavorabilityEffect(ctx, user, -1 * config.value_of_input_favorability, session) // 应用好感度效果
    return -1 * config.value_of_input_favorability
  }
  // 正常情况增加1点心情
  moodManager.applyMoodChange(user, 1)
  // 如果开启辅助LLM或者当天好感度已达上限则不增加好感度
  if (config.enable_auxiliary_LLM || user.usage > config.max_favorability_perday) return 0
  // 正常情况增加1点好感度
  await applyFavorabilityEffect(ctx, user, 1, session)
  return 1
}

// 处理输出好感度检查
export async function outputContentCheck(
  ctx: Context,
  response: { content: string; error: boolean },
  userid: string,
  config: FavorabilityConfig,
  session: Session,
  moodManager: MoodManager
): Promise<number> {
  if (response.error) return 0
  const user = await getUser(ctx, userid)
  if (!user) return 0
  if (config.output_censor_favorability) {
    const content = response.content
    const filePath = path.join(config.dataDir, 'output_censor.txt')
    if (!fs.existsSync(filePath)) { return 0 }
    const censorWords = fs.readFileSync(filePath, 'utf-8').split(',')
    const censoredContent = censorWords.reduce((acc, cur) => acc.replace(cur, '**'), content)
    // 敏感词检测
    const regex = /\*\*/g
    const hasCensor = regex.test(censoredContent)
    const moodLevel = moodManager.getMoodLevel(user.userid)
    if (hasCensor) {
      const mood = moodManager.getMoodValue(user.userid)
      moodManager.handleOutputMoodChange(user) // 处理心情变化
      if (mood <= 0) {
        await updateFavorability(ctx, user, -1 * config.value_of_output_favorability)
        return -config.value_of_output_favorability
      }
    }
    if (moodLevel === 'angry') {
      await updateFavorability(ctx, user, -1 * config.value_of_output_favorability)
      return -config.value_of_output_favorability
    }
  }
  return 0
}

// 确保输出屏蔽词文件存在
export async function ensureCensorFileExists(basePath: string): Promise<void> {
  const filePath = path.join(basePath, 'output_censor.txt')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (!fs.existsSync(filePath)) {
    // 写入格式为UTF-8
    fs.writeFileSync(filePath, '示例屏蔽词1,示例屏蔽词2,示例屏蔽词3', 'utf-8')
  }
}

// 应用好感度效果
export async function applyFavorabilityEffect(
  ctx: Context,
  user: User,
  effect: number,
  session: Session
): Promise<void> {
  if (effect < 0 && user.items['谷底小石']?.count > 0) {
    session.send(session.text('commands.sat.messages.rockBottom'))
    return
  }
  if (effect < 0 && user.items['帽子先生']?.count > 0) {
    user.items['帽子先生'].count--
    if (user.items['帽子先生'].count === 0) delete user.items['帽子先生']
    await updateUserItems(ctx, user)
    session.send(session.text('commands.sat.messages.hatMan'))
    return
  }
  await updateFavorability(ctx, user, effect)
}
