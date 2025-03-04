// src/database.ts
import { Context } from 'koishi'
import { User, FavorabilityAdjustment } from './types'

// 用户数据模型
declare module 'koishi' {
  interface Tables {
    p_system: User
  }
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
    lastChatTime: user.lastChatTime || new Date().getDate(),
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

  await ctx.database.set('p_system', { userid: user.userid }, { favorability: newValue })
}

// 更新用户等级
export async function updateUserLevel(ctx: Context, user: User, level: number): Promise<void> {
  if (!user) return
  await ctx.database.set('p_system', { userid: user.userid }, { userlevel: level })
}

// 更新用户使用次数
export async function updateUserUsage(ctx: Context, user: User, adjustment: number = 1): Promise<number | void> {
  if (!user) return
  if (user.lastChatTime && new Date().getDate() !== user.lastChatTime) user.usage = 0
  await ctx.database.set('p_system', { userid: user.userid }, { usage: user.usage + adjustment })
  await ctx.database.set('p_system', { userid: user.userid }, { lastChatTime: new Date().getDate() })
  return user.usage + adjustment
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
      lastChatTime: new Date().getDate(),
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
    lastChatTime: 'integer',
    items: 'object'
  }, { autoInc: true })
}
