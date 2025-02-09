// src/database.ts
import { Context } from 'koishi'
import { User, FavorabilityAdjustment } from './types'

// 用户数据模型
declare module 'koishi' {
  interface Tables {
    p_system: User
  }
}

export async function isTargetIdExists(ctx: Context, userId: string): Promise<boolean> {
  const users = await ctx.database.get('p_system', { userid: userId })
  return users.length === 0
}

export async function createUser(ctx: Context, user: Omit<User, 'id'>): Promise<void> {
  await ctx.database.create('p_system', {
    userid: user.userid,
    usersname: user.usersname,
    p: user.p || 0,
    favorability: user.favorability || 0,
    time: new Date()
  })
}

// 更新好感度,参数（上下文，用户id，好感度调整值）
export async function updateFavorability(ctx: Context, user: User, adjustment: FavorabilityAdjustment): Promise<void> {
  if (!user) return

  let newValue: number
  if (typeof adjustment === 'number')
    newValue = user.favorability + adjustment
  else
    newValue = 0

  await ctx.database.set('p_system', { userid: user.userid }, { favorability: newValue })
}

export async function getUser(ctx: Context, userId: string): Promise<User | null> {
  const users = await ctx.database.get('p_system', { userid: userId })
  return users[0] || null
}

export async function ensureUserExists(ctx: Context, userId: string, username: string): Promise<User> {
  const exists = await isTargetIdExists(ctx, userId)
  if (exists) {
    await createUser(ctx, {
      userid: userId,
      usersname: username,
      p: 0,
      favorability: 0,
      time: new Date()
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
    time: 'timestamp'
  }, { autoInc: true })
}
