import { Context, Logger, segment, Element, Session, h, Next, Fragment, trimSlash } from 'koishi'
import { } from '@koishijs/censor'
import { Sat } from './type'
const name = 'satori-ai'
const logger = new Logger(name)
type ChatCallback = (session: Session, session_of_id: Sat.Msg[]) => Promise<string>
declare module 'koishi' {
  interface Context {
    sat: SAt
  }
  interface Tables { p_system: p_system }
}
export interface p_system {
  id: number
  userid: string
  usersname: string
  p: number
  time: Date
  favorability: number
}
class SAt extends Sat {
  pluginConfig: Sat.Config
  constructor(ctx: Context, config: Sat.Config) {
    super(ctx, config)
    this.key_number = 0
    this.sessions = {}
    this.maxRetryTimes = config.maxRetryTimes
    this.pluginConfig = config
    ctx.i18n.define('zh', require('./locales/zh'))
    if (config.enable_favorability) {
      ctx.model.extend('p_system', {
        id: 'unsigned',
        userid: 'string',
        usersname: 'string',
        favorability: 'integer'
      }, { autoInc: true })
    }
    const system_prompt = config.prompt;
    this.personality = { '人格': [{ 'role': 'system', 'content': `${system_prompt}` }] }

    this.session_config = Object.values(this.personality)[0]

    //at和私信触发对话的实现方法
    ctx.middleware(async (session, next) => {
      return this.middleware(session, next)
    })

    //主要逻辑
    ctx.command('sat <text:text>', { authority: config.authority })
      .alias(...config.alias)
      .action(async ({ session }, ...prompt) => {
        if (config.sentences_divide) {
          const message = await this.sat(session, prompt.join(' '));
          if (typeof message === 'string') {
            return message;
          } else {
            const content = (message as unknown as { attrs: { content: string } }).attrs.content;
            if (content.length > this.pluginConfig.max_tokens) return session.text('commands.sat.messages.content_tooLong')
            if (this.pluginConfig.enable_favorability) {
              // 获取用户的好感度
              const notExists = await isTargetIdExists(this.ctx, session.userId); //该群中的该用户是否签到过
              if (!notExists) {
                const user = await this.ctx.database.get('p_system', { userid: session.userId })
                const regex = /\*\*/g;
                if (this.ctx.censor) {
                  const censor_content = await this.ctx.censor.transform(content, session)
                  if (regex.test(censor_content)) {
                    const newFavorability = user[0].favorability - 5;
                    await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
                  }
                }
              }
            } //以上检测bot的负面反馈以扣好感
            const sentences = content.split(/(?<=\。)\s*/); // 以句号为分割符，保留句号
            for (const sentence of sentences)
              await session.sendQueued(h.text(sentence), config.time_interval);
          }
        } else {
          return this.sat(session, prompt.join(' '));
        }
      });

    //清空所有会话及人格
    ctx.command('sat.clear', '清空所有会话及人格', {
      authority: 1
    }).action(({ session }) => {
      return this.clear(session)
    })
  }


  /**
   *
   * @param session 会话
   * @param prompt 会话内容
   * @returns Promise<string | Element>
   */

  async sat(session: Session, prompt: string): Promise<string | Element | void> {
    // 黑名单拦截
    if (this.pluginConfig.blockuser.includes(session.userId)) return session.text('commands.sat.messages.block1')
    if (this.pluginConfig.blockchannel.includes(session.channelId)) return session.text('commands.sat.messages.block2')
    // 内容为空
    if (!prompt && !session.quote?.content) return session.text('commands.sat.messages.no-prompt')
    if (prompt.length > this.pluginConfig.max_tokens) return session.text('commands.sat.messages.tooLong')
    // 文本审核
    if (this.ctx.censor) prompt = await this.ctx.censor.transform(prompt, session)
    // 启用/关闭上下文
    if (this.pluginConfig.enableContext) {
      if (this.pluginConfig.enable_favorability) {
        // 获取用户的好感度
        const notExists = await isTargetIdExists(this.ctx, session.userId); //该群中的该用户是否签到过
        if (!notExists) {
          const user = await this.ctx.database.get('p_system', { userid: session.userId })
          const regex = /\*\*/g;
          if (regex.test(prompt)) {
            const newFavorability = user[0].favorability - 11;
            await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
          }
          else
            await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: user[0].favorability + 1 });//增加好感
          let level: string;
          if (user[0].favorability < this.pluginConfig.favorability_div_1) {
            level = '厌恶';
          } else if (user[0].favorability < this.pluginConfig.favorability_div_2) {
            level = '陌生';
          } else if (user[0].favorability < this.pluginConfig.favorability_div_3) {
            level = '朋友';
          } else if (user[0].favorability < this.pluginConfig.favorability_div_4) {
            level = '暧昧';
          } else {
            level = '恋人';
          }
          // 更新 system_prompt
          const system_prompt = `${this.pluginConfig.prompt} \n我的名字: ${user[0].usersname}, 你对我的关系: ${level}`
          this.personality['人格'][0].content = system_prompt
        }
      }
      return await this.chat(prompt, session.userId, session)
    } else {
      const text: string = await this.chat_with_gpt(session, [{ 'role': 'user', 'content': prompt }])
      const resp = [{ 'role': 'user', 'content': prompt }, { 'role': 'assistant', 'content': text }]
      return await this.getContent(session.userId, resp, session.messageId, session.bot.selfId)
    }
  }

  /**
   *
   * @param session 当前会话
   * @param next 通过函数
   * @returns 消息
   */

  async middleware(session: Session, next: Next): Promise<string | string[] | segment | void | Fragment> {
    // 私信触发
    const matchResult = session.channelId.match(new RegExp("private", "g"));
    if (matchResult && matchResult.includes("private"))
      return this.sat(session, session.content)

    // 艾特触发
    if (session.stripped.appel && this.pluginConfig.mention) {
      let msg: string = ''
      for (let i of session.elements.slice(1,)) {
        if (i.type === 'text') msg += i?.attrs?.content
      }
      return this.sat(session, msg)
    }
    // 随机触发
    if (session.event.message.elements[0].type == "img" || session.event.message.elements[0].type == "at")
      return next();
    if (session.content.length < 20 || session.content.length >= this.pluginConfig.max_tokens)
      return next();
    const randnum: number = Math.random()
    if (randnum < this.pluginConfig.randnum)
      return await this.sat(session, session.content)
    return next()
  }
  /**
   *
   * @param message 发送给chatgpt的json列表
   * @returns 将返回文字处理成json
   */


  async chat_with_gpt(_session: Session, message: Sat.Msg[]): Promise<string> {
    let url = trimSlash(`${this.pluginConfig.baseURL ?? 'https://api.deepseek.com'}/v1/chat/completions`)
    const payload = {
      model: this.pluginConfig.appointModel,
      temperature: this.pluginConfig.temperature,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      messages: message
    }
    const config = {
      timeout: 0,
      headers: {
        Authorization: `Bearer ${this.pluginConfig.key[this.key_number]}`,
        'Content-Type': 'application/json'
      }
    }
    try {
      const response = await this.ctx.http.post(url, payload, config)
      return response.choices[0].message.content
    }
    catch (e) {
      return ''
    }
  }

  /**
   *
   * @param sessionid QQ号
   * @returns 对应QQ的会话
   */

  get_chat_session(sessionid: string): Sat.Msg[] {
    if (Object.keys(this.sessions).indexOf(sessionid) == -1)
      this.sessions[sessionid] = [...this.session_config]
    return this.sessions[sessionid]
  }

  /**
   *
   * @param msg prompt消息
   * @param sessionid QQ号
   * @returns json消息
   */

  async chat(msg: string, sessionid: string, session: Session): Promise<string | segment> {
    logger.info((session.author?.nick || session.username) + ':' + msg)
    // 获得对话session
    let session_of_id = this.get_chat_session(sessionid)
    // 设置本次对话内容
    session_of_id.push({ 'role': 'user', 'content': msg })
    // 与ChatGPT交互获得对话内容
    let message: string = await this.try_control(this.chat_with_gpt, session, session_of_id)

    // 记录上下文
    session_of_id.push({ 'role': 'assistant', 'content': message })
    while (JSON.stringify(session_of_id).length > 10000) {
      session_of_id.splice(1, 1)
      if (session_of_id.length <= 1) break
    }

    this.sessions[sessionid] = session_of_id
    logger.info('ChatGPT返回内容: ')
    logger.info(message)
    return await this.getContent(sessionid, session_of_id, session.messageId, session.bot.selfId)

  }
  /**
   *
   * @param cb chat 回调函数 chat_with_gpt
   * @param session 会话
   * @param session_of_id 会话 ID
   * @returns
   */
  async try_control(cb: ChatCallback, session: Session, session_of_id: Sat.Msg[]) {
    let try_times = 0
    while (try_times < this.pluginConfig.maxRetryTimes) {
      const res = await cb.bind(this)(session, session_of_id)
      if (res !== '') return res
      try_times++
      await this.ctx.sleep(500)
    }
    return '请求错误，请查看日志'
  }

  /**
   *
   * @param userId 用户QQ号
   * @param resp gpt返回的json
   * @returns 文字，图片或聊天记录
   */
  async getContent(userId: string, resp: Sat.Msg[], messageId: string, botId: string): Promise<string | segment> {
    return h.text(resp[resp.length - 1].content)
  }

  /**
   *
   * @param session 当前会话
   * @returns 返回清空的消息
   */

  clear(session: Session): string {
    this.sessions = {}
    return session.text('commands.sat.messages.clean')
  }
}

async function isTargetIdExists(ctx: Context, USERID: string) {
  //检查数据表中是否有指定id者
  const targetInfo = await ctx.database.get('p_system', { userid: USERID });
  return targetInfo.length == 0;
}
namespace SAt {
}
export default SAt
