// src/middleware.ts
import { Context, Session, Next, Logger } from 'koishi'
import { } from '@koishijs/censor'
import { SAT } from './index'
import { probabilisticCheck, detectEnglishLetters } from './utils'
import { FavorabilityConfig, MiddlewareConfig } from './types'
import { ensureUserExists } from './database'

const logger = new Logger('satori-ai')

export function createMiddleware(
  ctx: Context,
  sat: SAT,
  config: MiddlewareConfig & FavorabilityConfig,
) {
  return async (session: Session, next: Next) => {
    await sat.handleChannelMemoryManager(session)

    // 私信处理
    if (config.private && isPrivateSession(session)) {
      return await handlePrivateMessage(sat, session)
    }

    // 昵称处理
    if (config.nick_name && await hasNickName(ctx, session, config)) {
      return await handleNickNameMessage(sat, session)
    }

    // @提及处理
    if (config.mention && isMentionTriggered(session)) {
      return await handleMentionMessage(sat, session)
    }

    // 随机触发处理
    if (shouldRandomTrigger(session, config)) {
      session.send(await handleRandomTrigger(sat, session, config))
    }

    return next()
  }
}

// 私聊会话判断
function isPrivateSession(session: Session): boolean {
  return session.subtype === 'private' || session.channelId.includes('private')
}

// 处理私聊消息
async function handlePrivateMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) return await SAT.handleMiddleware(session, content)
}

// 昵称判断
async function hasNickName(ctx: Context, session: Session, config: MiddlewareConfig): Promise<boolean> {
  const user = await ensureUserExists(ctx, session.userId, session.username)
  let names = config.nick_name_list
  if (user?.items['情侣合照']?.metadata?.botNickName){
    names = names.concat(user.items['情侣合照'].metadata.botNickName)
  }
  return names.some(name => session.content.includes(name))
}

// 处理昵称消息
async function handleNickNameMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) return await SAT.handleMiddleware(session, content)
}

// @提及判断
function isMentionTriggered(session: Session): boolean {
  return !!session.stripped.appel
}

// 处理@提及消息
async function handleMentionMessage(SAT: SAT, session: Session) {
  let message = session.elements
    .slice(1)
    .filter(e => e.type === 'text')
    .map(e => e.attrs.content)
    .join('')
    .trim()

  if (message) return await SAT.handleMiddleware(session, message)
}

// 随机触发判断
function shouldRandomTrigger(
  session: Session,
  config: MiddlewareConfig
): boolean {
  const { content } = session
  return (
    !isSpecialMessage(session) &&
    content.length >= config.random_min_tokens &&
    content.length < config.max_tokens &&
    probabilisticCheck(config.randnum)
  )
}

// 特殊消息类型判断
function isSpecialMessage(session: Session): boolean {
  const firstElement = session.elements[0]
  return ['img', 'at', 'file'].includes(firstElement?.type)
}

// 处理随机触发
async function handleRandomTrigger(
  SAT: SAT,
  session: Session,
  config: FavorabilityConfig
) {
  if (config.enable_favorability) {
    const englishCount = detectEnglishLetters(session.content)
    if (englishCount > 8) return
  }
  return await SAT.handleMiddleware(session, session.content)
}
