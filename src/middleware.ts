// src/middleware.ts
import { Context, Session, Next, h } from 'koishi'
import { } from '@koishijs/censor'
import { SAT } from './index'
import { probabilisticCheck, detectEnglishLetters } from './utils'
import { FavorabilityConfig, MiddlewareConfig } from './types'
import { MemoryManager } from './memory'

export function createMiddleware(
  ctx: Context,
  sat: SAT,
  config: MiddlewareConfig & FavorabilityConfig,
  memoryManager: MemoryManager
) {
  return async (session: Session, next: Next) => {
    // 频道短期记忆更新
    if (session.content.length <= config.max_tokens) {
      let censored = session.content
      if (ctx.censor) censored = await ctx.censor.transform(session.content, session)
      memoryManager.updateChannelDialogue(session, censored, session.username)
    }

    // 私信处理
    if (config.private && isPrivateSession(session)) {
      return handlePrivateMessage(sat, session)
    }

    // @提及处理
    if (config.mention && isMentionTriggered(session)) {
      return handleMentionMessage(sat, session)
    }

    // 随机触发处理
    if (shouldRandomTrigger(session, config)) {
      return handleRandomTrigger(sat, session, config)
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
  if (content) return SAT.handleMiddleware(session, content)
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

  if (message) return SAT.handleMiddleware(session, message)
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
  // 好感度检查
  if (config.enable_favorability) {
    const englishCount = detectEnglishLetters(session.content)
    if (englishCount > 8) return
  }

  return SAT.handleMiddleware(session, '根据最近群友的发言，请你随意聊一下')
}
