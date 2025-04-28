import { Context, Session, Logger } from 'koishi'
import { Sat } from './types'
import { puppeteer, refreshPuppeteer } from '.'


const logger = new Logger('satori-ai-broadcast')

export class BroadcastManager {
  private ctx: Context
  private config: Sat.Config
  private idCounter: number = 0
  private broadcastMessages: Map<string, broadcastMessage> = new Map()

  constructor(ctx: Context, cfg: Sat.Config) {
    this.ctx = ctx
    this.config = cfg
    this.idCounter = 0
    ctx.command('sat.broadcast <text:text>', '推送广播', { authority: 4 })
    .alias('广播')
    .option('delete', '-d <id:string>', { authority: 4 })
    .option('list', '-l', { authority: 4 })
    .option('img', '-i', { authority: 4 })
    .action(async ({ options }, prompt) => {
      refreshPuppeteer(this.ctx)
      if (options.list) {
        const list = this.broadcastMessages.size > 0 ? await this.getBroadcastList() : null
        return list ? `${list}` : '当前没有广播'
      }
      if (options.delete) {
        return await this.deleteBroadcast(options.delete)
      } else {
        return await this.createBroadcast(prompt, options.img)
      }
    })
  }

  async createBroadcast(message: string, img: boolean) {
    const id = `broadcast-${this.idCounter++}`
    const broadcast = new broadcastMessage(this.ctx, this.config, message, img)
    this.broadcastMessages.set(id, broadcast)
    logger.info(`广播已创建 ID: ${id}`)
    return `广播已创建 ID: ${id}`
  }

  async deleteBroadcast(id: string) {
    if (this.broadcastMessages.has(id)) {
      this.broadcastMessages.delete(id)
      logger.info(`广播已删除 ID: ${id}`)
      return '已删除广播：' + id
    } else {
      logger.warn(`未找到广播 ID: ${id}`)
      return '未找到该广播'
    }
  }

  async seedBroadcast(session: Session) {
    for (const [id, broadcast] of this.broadcastMessages.entries()) {
      if (broadcast.setTime.getTime() + 1000 * 60 * this.config.waiting_time < Date.now()) {
        this.broadcastMessages.delete(id)
        logger.info(`广播已过期 ID: ${id}`)
        continue
      }
      await broadcast.sendMessage(session)
    }
    return
  }

  async getBroadcastList() {
    const idList = Array.from(this.broadcastMessages.keys())
    const list: string[] = []
    list.push('当前广播列表:')
    for (const id of idList) {
      const broadcast = this.broadcastMessages.get(id)
      if (broadcast) {
        const time = broadcast.setTime.toLocaleString('zh-CN', { hour12: false })
        const ddl = new Date(broadcast.setTime.getTime() + 1000 * 60 * this.config.waiting_time).toLocaleString('zh-CN', { hour12: false })
        const message = broadcast.message
        const alreadySentChannels = broadcast.getAlreadySentChannels()
        list.push(`ID: ${id}\n消息: ${message}\n已发送频道: \n${alreadySentChannels}\n创建时间: ${time}\n过期时间: ${ddl}\n`)
      }
    }
    const result = list.length > 0 ? list.join('\n') : null
    return result ? wrapInHTML(result) : null
  }
}

export class broadcastMessage {
  private ctx: Context
  private config: Sat.Config
  public message: string
  private alreadySentChannels: Set<string> = new Set()
  public setTime: Date
  private img: boolean

  constructor(ctx: Context, cfg: Sat.Config, message: string, img: boolean) {
    this.message = message
    this.alreadySentChannels = new Set()
    this.ctx = ctx
    this.config = cfg
    this.img = img
    this.setTime = new Date()
    for (const channelId of this.config.Broadcast_block_channel) {
      this.alreadySentChannels.add(channelId)
    }
  }

  public async sendMessage(session: Session) {
    const channelId = session.channelId
    if (this.alreadySentChannels.has(channelId)) return
    try {
      this.alreadySentChannels.add(channelId)
      if (this.img) {
        session.send(await wrapInHTML(this.message))
      } else {
        session.send(this.message)
      }
      logger.info(`向群 ${channelId} 广播: ${this.message}`)
    } catch (error) {
      logger.error(`广播失败 ${channelId}: ${error}`)
    }
  }

  public getAlreadySentChannels() {
    const alreadySentChannels = Array.from(this.alreadySentChannels).filter(channelId => !this.config.Broadcast_block_channel.includes(channelId))
    return alreadySentChannels.length > 0 ? alreadySentChannels.join('\n') : '无'
  }
}

async function wrapInHTML(str: string): Promise<string> {
  if (!puppeteer) {
    logger.warn('puppeteer未就绪')
    return str
  }
  return puppeteer.render(`<html><body>${str.replaceAll(/\n/g, '<BR>')}</body>
          <style>
          body {
            padding: 10px;
            display: inline-block;
           }
          </style>
          </html>`);
}
