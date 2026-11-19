// src/middleware.ts
import { Context, Session, Next, Logger } from 'koishi'
import { } from '@koishijs/censor'
import type { SAT } from './index'
import { probabilisticCheck } from './utils'
import { FavorabilityConfig, MiddlewareConfig } from './types'
import { ensureUserExists } from './database'
import { currentImages, hasTextContent } from './vision'
import { forgetImageMessage, rememberImageMessage } from './image-cache'

const logger = new Logger('satori-ai-middleware')

export function createMiddleware(
  ctx: Context,
  sat: SAT,
  config: MiddlewareConfig & FavorabilityConfig,
) {
  return async (session: Session, next: Next) => {
    // 纯图片消息不触发对话，但用户紧接着发文字时要把这张图一起识别
    const images = currentImages(session)
    const pureImage = images.length > 0 && !hasTextContent(session)
    if (pureImage) rememberImageMessage(session, images)
    try {
      if (config.enable_favorability && config.enable_warning && session.channelId === config.warning_group)
        sat.getWarningList(session)
      await sat.broadcastManager.seedBroadcast(session)

      // 冷场救场：任何群消息都会更新本群活动时间、打断待触发的救场；
      // 这条消息若发生在十分钟沉默之后，返回它的序号，写入群聊环境后再武装救场。
      const coldStart = sat.coldRescue.observe(session)
      // 主动静默/管理员封禁：这段时间里不回复；命令中间件是前置的，指令另行拦截
      const silenced = await sat.isMuted(session.userId)

      // 私信处理
      if (config.private && isPrivateSession(session)) {
        // 游戏进行中：「左 右」「游戏规则」这类输入不是命令，若不拦截会同时触发 AI 对话，
        // 和游戏回合互相打断。这里直接放行，交给游戏自己的消息监听器处理。
        if (sat.isGameActive(session)) {
          sat.proactive.touch(session)
          return next()
        }
        if (silenced) return
        return await handlePrivateMessage(sat, session)
      }

      // 昵称处理
      if (config.nick_name && await hasNickName(ctx, session, config)) {
        if (!silenced) return await handleNickNameMessage(sat, session)
        // 被静默的用户：不回复，但继续记录群聊环境
      }

      // 随机触发处理
      if (!silenced && shouldRandomTrigger(session, config)) {
        // 触发插话的这条消息也要先进群聊环境：否则模型看不到引出它的话题，
        // 事后群聊记录里也只有 bot 的发言，像是凭空接话。
        await sat.handleChannelMemoryManager(session)
        return await sat.handleRandomMiddleware(session)
      }

      if (!isSpecialMessage(session)) {
        const recorded = await sat.handleChannelMemoryManager(session)
        // 已触发随机回复/昵称回复的消息不会走到这里，不会再武装救场
        if (coldStart !== null && recorded && !silenced) sat.coldRescue.arm(session, coldStart)
      }

      return next()
    } finally {
      // 这个用户发了别的消息，上一条纯图片就不再是「上一条」了
      if (!pureImage) forgetImageMessage(session)
    }
  }
}

// 私聊会话判断
function isPrivateSession(session: Session): boolean {
  if (isSpecialMessage(session)) return false
  return session.subtype === 'private' || session.channelId.includes('private')
}

// 处理私聊消息
async function handlePrivateMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) {
    // 记录活跃并在沉默后重新计时；主动消息只覆盖私聊
    SAT.proactive.touch(session)
    return await SAT.handleNickNameMiddleware(session, content)
  }
}

// 昵称判断
async function hasNickName(ctx: Context, session: Session, config: MiddlewareConfig): Promise<boolean> {
  if (session.userId === session.selfId) return false
  if (config.nick_name_block_words.some(word => session.content.includes(word))) return false
  const user = await ensureUserExists(ctx, session.userId, session.username)
  let names = config.nick_name_list
  if (user?.items?.['情侣合照']?.metadata?.botNickName){
    names = names.concat(user.items['情侣合照'].metadata.botNickName)
  }
  return names.some(name => session.content.includes(name))
}

// 处理昵称消息
async function handleNickNameMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) return await SAT.handleNickNameMiddleware(session, content)
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
  if (session.content.includes(':poke')) return true
  // 有正文的消息（哪怕同时带图片或链接）照常触发对话、写入频道记忆；
  // 图片交给识图流程，正文里的标签由 processPrompt 去掉。
  if (hasTextContent(session)) return false
  // 纯图片、纯文件、纯 @、纯链接仍然跳过
  return ['img', 'at', 'file'].includes(session.elements[0]?.type)
    || session.content.includes('file://')
    || /https?:\/\//.test(session.content)
}
