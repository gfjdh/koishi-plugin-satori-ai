// src/database.ts
import { Context } from 'koishi'
import { User, FavorabilityAdjustment } from './types'

// 用户数据模型
declare module 'koishi' {
  interface Tables {
    p_system: User
  }
}

/**
 * 本地日期键（YYYYMMDD）。旧版本把「几号」(1–31) 存进 lastChatTime，
 * 跨月同一天时不会重置每日次数；这里统一成完整日期，旧值比较不相等会自然重置一次。
 */
function todayKey(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

export async function isTargetIdNotExists(ctx: Context, userId: string): Promise<boolean> {
  const users = await ctx.database.get('p_system', { userid: userId })
  return users.length === 0
}

export async function createUser(ctx: Context, user: Omit<User, 'id'>): Promise<void> {
  await ctx.database.create('p_system', {
    userid: user.userid || '',
    usersname: user.usersname || '',
    p: user.p || 0,
    favorability: user.favorability || 0,
    userlevel: user.userlevel || 0,
    usage: user.usage || 0,
    location: user.location || '',
    lastChatTime: user.lastChatTime || todayKey(),
    items: user.items || {}
  })
}

// 更新好感度,参数（上下文，用户id，好感度调整值）
export async function updateFavorability(ctx: Context, user: User, adjustment: FavorabilityAdjustment): Promise<void> {
  if (!user) return

  let newValue: number
  if (typeof adjustment === 'number')
    newValue = user.favorability + adjustment
  else
    newValue = user.favorability

  user.favorability = newValue
  await ctx.database.set('p_system', { userid: user.userid }, { favorability: newValue })
}

// 更新用户等级
export async function updateUserLevel(ctx: Context, user: User, level: number): Promise<void> {
  if (!user) return
  level = level < 5 ? level : 4
  user.userlevel = level
  await ctx.database.set('p_system', { userid: user.userid }, { userlevel: level })
}

// 更新用户使用次数
export async function updateUserUsage(ctx: Context, user: User, adjustment: number = 1): Promise<number | void> {
  if (!user) return
  const today = todayKey()
  if (user.lastChatTime !== today) user.usage = 0
  const usage = Math.max(0, (user.usage || 0) + adjustment)
  user.usage = usage
  user.lastChatTime = today
  // usage 与 lastChatTime 必须一起写：拆成两次 set 时，进程中断会留下
  // 「次数已递增、日期还是昨天」的状态，下一次对话又会重置一次。
  await ctx.database.set('p_system', { userid: user.userid }, { usage, lastChatTime: today })
  return usage
}

// 更新用户物品
export async function updateUserItems(ctx: Context, user: User): Promise<void> {
  if (!user) return
  await ctx.database.set('p_system', { userid: user.userid }, { items: user.items })
}

// 更新用户p点数
export async function updateUserP(ctx: Context, user: User, adjustment: number): Promise<void> {
  if (!user) return
  // 先取数据库里的最新值：内存中的 user.p 可能已经过期（多频道同时操作）
  const [latest] = await ctx.database.get('p_system', { userid: user.userid })
  if (latest) user.p = latest.p
  if (user.p + adjustment < 0) adjustment = -user.p
  await ctx.database.set('p_system', { userid: user.userid }, { p: user.p + adjustment })
}

// 更新用户位置信息
export async function updateUserLocation(ctx: Context, user: User, location: string): Promise<void> {
  if (!user) return
  await ctx.database.set('p_system', { userid: user.userid }, { location: location })
}

export async function getUser(ctx: Context, userId: string): Promise<User | null> {
  const users = await ctx.database.get('p_system', { userid: userId })
  return users[0] || null
}

export async function ensureUserExists(ctx: Context, userId: string, username: string): Promise<User> {
  const notExists = await isTargetIdNotExists(ctx, userId)
  if (notExists) {
    await createUser(ctx, {
      userid: userId,
      usersname: username,
      p: 0,
      favorability: 0,
      userlevel: 0,
      usage: 0,
      location: '',
      lastChatTime: todayKey(),
      items: {}
    })
  }
  return getUser(ctx, userId)
}

// 类型增强
export function extendDatabase(ctx: Context) {
  ctx.model.extend('p_system', {
    id: 'unsigned',
    userid: 'string',
    usersname: 'string',
    p: 'integer',
    favorability: 'integer',
    userlevel: 'integer',
    usage: 'integer',
    location: 'string',
    lastChatTime: 'integer',
    items: 'object'
  }, { autoInc: true })
}
