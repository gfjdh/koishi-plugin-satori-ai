import { Context, Logger, segment, Element, Session, h, Next, Fragment, trimSlash } from 'koishi'
import { } from '@koishijs/censor'
import { Sat } from './type'
import * as fs from 'fs';
import * as path from 'path';

const name = 'satori-ai'
const logger = new Logger(name)
const debug = 0;
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
  channelDialogues: { [channelId: string]: Sat.Msg[] } = {}
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
        p: 'integer',
        favorability: 'integer'
      }, { autoInc: true })
    }
    this.personality = { '人格': [{ 'role': 'system', 'content': `${config.prompt}` }] }

    this.session_config = Object.values(this.personality)[0]
    //at和私信触发对话的实现方法
    ctx.middleware(async (session, next) => {
      return this.middleware(session, next)
    })

    //主要逻辑
    ctx.command('sat <text:text>', { authority: config.authority })
      .alias(...config.alias)
      .action(async ({ session }, ...prompt) => {
        const message = await this.sat(session, prompt.join(' '));
        if (typeof message === 'string') return message;
        const content = (message as unknown as { attrs: { content: string } })?.attrs?.content;
        if (!content) { // 处理 message 为 undefined 或 attrs 为 undefined 的情况
          logger.error(message);
          return session.text('commands.sat.messages.err');
        }
        if (content.length > this.pluginConfig.content_max_tokens) return session.text('commands.sat.messages.content_tooLong')
        if (this.pluginConfig.enable_favorability) {
          const user = await this.ctx.database.get('p_system', { userid: session.userId });
          if (this.ctx.censor) {
            const censor_content = await this.ctx.censor.transform(content, session);
            const regex = /\*\*/g;
            if (regex.test(censor_content)) {
              const newFavorability = user[0].favorability - 10;
              await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
            }
            if (content == '……' || content == '滚') {
              const newFavorability = user[0].favorability - 5;
              await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
            }
          }
        } //检测bot的负面反馈以扣好感
        this.sessions = {}
        if (config.sentences_divide) {
          const sentences = content.split(/(?<=\。)(?!.*\。)/); // 以最后一个句号为分割符，保留句号
          for (const sentence of sentences)
            await session.sendQueued(h.text(sentence), config.time_interval);
        } else
          return content;
      });

    //清空所有会话及人格
    ctx.command('sat.clear', '清空会话', { authority: 1 }).action(({ session }) => { return this.clear(session) })
    //添加常识
    ctx.command('sat.common_sense <text:text>', '添加常识', { authority: 3 }).alias('添加常识')
      .action(async ({ session }, ...prompt) => {
        const content = prompt.join(' ');
        if (!content) return session.text('commands.sat.common_sense.messages.no-prompt');
        await addCommonSense(content, this.pluginConfig.dataDir);
        return session.text('commands.sat.common_sense.messages.succeed', [content]);
      });
  }


  /**
   *
   * @param session 会话
   * @param prompt 会话内容
   * @returns Promise<string | Element>
   */

  async sat(session: Session, prompt: string): Promise<string | Element | void> {
    let notExists: boolean, user;
    if (this.pluginConfig.enable_favorability)// 获取用户的好感度
    {
      notExists = await isTargetIdExists(this.ctx, session.userId); // 该群中的该用户是否签到过
      if (notExists) await this.ctx.database.create('p_system', { userid: session.userId, usersname: session.username, p: 0, favorability: 0 })
      user = await this.ctx.database.get('p_system', { userid: session.userId });
      if (user[0].favorability < -30 && user[0].favorability > -900) return session.text('commands.sat.messages.block1')
      const englishLettersCount = (prompt.match(/[a-zA-Z]/g) || []).length;
      if (user[0].favorability < 50 && englishLettersCount > 8) return session.text('commands.sat.messages.tooManyEnglishLetters')// 如果 prompt 中有超过八个英文字母则拦截
    }
    if (this.pluginConfig.blockuser.includes(session.userId)) return session.text('commands.sat.messages.block1')
    if (this.pluginConfig.blockchannel.includes(session.channelId)) return session.text('commands.sat.messages.block2') // 黑名单拦截
    if (!prompt && !session.quote?.content) return session.text('commands.sat.messages.no-prompt')           // 内容为空
    if (prompt.length > this.pluginConfig.max_tokens) return session.text('commands.sat.messages.tooLong')   // 内容过长
    let censored_prompt: string;
    if (this.ctx.censor) censored_prompt = await this.ctx.censor.transform(prompt, session);// 文本审核
    else censored_prompt = prompt;// 文本审核

    if (this.pluginConfig.enableContext) {  // 启用/关闭上下文
      this.personality['人格'][0].content = this.pluginConfig.prompt;
      // 获取频道的最近十条对话
      const channelId = session.channelId;
      const dialogues = this.channelDialogues[channelId] || [];
      const recentDialogues = dialogues.slice(-10);

      // 检查最近十条对话中是否含有和本次对话 role 和 content 一样的情况
      let duplicateDialogue: Sat.Msg;
      if (prompt.length <= 6)
        duplicateDialogue = recentDialogues.find(msg => msg.role === session.username && (msg.content.includes(prompt) || prompt.includes(msg.content)));
      else
        duplicateDialogue = recentDialogues.find(msg => msg.role === session.username && (msg.content.includes(prompt)));
      if (duplicateDialogue) {
        if (this.pluginConfig.enable_favorability) {
          const user = await this.ctx.database.get('p_system', { userid: session.userId });
          const newFavorability = user[0].favorability - 1; // 假设扣1点好感
          await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
        }
        return session.text('commands.sat.messages.duplicate-dialogue');
      }
    }

    const fs = require('fs');
    if (this.pluginConfig.enable_fixed_dialogues) {  // 启用/关闭固定对话
      const fixedDialoguesPath = path.join(this.pluginConfig.dataDir, 'fixed_dialogues.json');// 读取固定对话文件
      if (!fs.existsSync(fixedDialoguesPath)) {    // 检查文件是否存在
          // 如果文件不存在，创建一个默认的对话模板
          const defaultDialogues = [
              {triggers: ["你好", "您好"],favorabilityRange: [0, 100],probability: 1,timeRange: ["06:00", "08:00"],response: "早上好！很高兴见到你。"},
              {triggers: ["再见", "拜拜"],favorabilityRange: [0, 100],probability: 1,timeRange: ["18:00", "20:00"],response: "再见！希望很快再见到你。"}
          ];
          fs.writeFileSync(fixedDialoguesPath, JSON.stringify(defaultDialogues, null, 2), 'utf-8');// 将默认对话模板写入文件
      }
      // 读取文件内容
      const fixedDialogues = JSON.parse(fs.readFileSync(fixedDialoguesPath, 'utf-8'));
      // 获取当前时间
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      // 根据 prompt 和好感度匹配对话
      const matchedDialogues = fixedDialogues.filter(dialogue => {
          const promptMatch = dialogue.triggers.some(trigger => censored_prompt == trigger);
          const favorabilityMatch = dialogue.favorabilityRange ?
              user[0].favorability >= dialogue.favorabilityRange[0] && user[0].favorability <= dialogue.favorabilityRange[1] : true;
          // 检查时间范围
          const timeRangeMatch = dialogue.timeRange ?
              (() => {
                  const [startHour, startMinute] = dialogue.timeRange[0].split(':').map(Number);
                  const [endHour, endMinute] = dialogue.timeRange[1].split(':').map(Number);
                  const startTime = startHour * 60 + startMinute;
                  const endTime = endHour * 60 + endMinute;
                  const currentTime = currentHour * 60 + currentMinute;
                  return currentTime >= startTime && currentTime <= endTime;
              })() : true;
          return promptMatch && favorabilityMatch && timeRangeMatch;
      });
      if (matchedDialogues.length > 0) { // 如果有多个匹配的对话，根据概率选择一个
          const totalProbability = matchedDialogues.reduce((sum, dialogue) => sum + dialogue.probability, 0);
          let randomValue = Math.random() * totalProbability;
          for (const dialogue of matchedDialogues) {
              randomValue -= dialogue.probability;
              if (randomValue <= 0) {
                  // 更新用户的好感度
                  if (this.pluginConfig.enable_favorability){
                  const newFavorability = user[0].favorability + dialogue.favorability;
                  await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
                  }
                  // 更新频道的对话记录(短期记忆记录频道上下文)
                  if (!this.channelDialogues[session.channelId])
                    this.channelDialogues[session.channelId] = [];
                  this.channelDialogues[session.channelId].push({ 'role': session.username, 'content': prompt });
                  if (this.channelDialogues[session.channelId].length > this.pluginConfig.message_max_length)
                    this.channelDialogues[session.channelId].shift();
                  return dialogue.response;
              }
          }
      }
    }

    if (this.pluginConfig.enableContext) {  // 启用/关闭上下文
      this.personality['人格'][0].content = this.pluginConfig.prompt;
      // 获取频道的最近十条对话
      const channelId = session.channelId;
      const dialogues = this.channelDialogues[channelId] || [];
      const recentDialogues = dialogues.slice(-10);

      this.personality['人格'][0].content += '\n这是刚刚的聊天记录，禁止你重复其中的内容：{\n' + recentDialogues.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\n}';

      // 将 prompt 字符串拆分成单个字符并存储在 keywords 数组中
      const charactersToRemove: string[] = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
      const filePath = path.join(this.pluginConfig.dataDir, 'dialogues', `${session.userId}.txt`);
      const keywords = (session.username + prompt).split('').filter(word => !charactersToRemove.includes(word));
      const USERID = [session.userId]
      // 检查文件是否存在
      let sortedMatches;
      if (fs.existsSync(filePath)) {
        // 读取对话记录文件并搜索关键词
        sortedMatches = searchKeywordsInFile(filePath, keywords);
        if (sortedMatches.length > 0) {
          this.personality['人格'][0].content += appendTopMatches(JSON.parse(fs.readFileSync(filePath, 'utf-8')), sortedMatches, 10, '这是你和发言者较久之前的对话内容：');
        }
      }

      // 读取 common_sense 文件
      const commonSenseFilePath = path.join(this.pluginConfig.dataDir, 'common_sense.txt');
      let commonSenseContent;
      if (fs.existsSync(commonSenseFilePath))
        commonSenseContent = JSON.parse(fs.readFileSync(commonSenseFilePath, 'utf-8'));
      // 第一次搜索关键词
      sortedMatches = searchKeywordsInFile(commonSenseFilePath, keywords);
      if (sortedMatches.length > 0) {
        this.personality['人格'][0].content += appendTopMatches(commonSenseContent, sortedMatches, 10, '这是你需要知道的信息：');
        // 获取匹配度最高的记录并再次进行检索
        if (sortedMatches.length >= 3) {
          for (let i = 0; i < 3; i++) {
            const matchContent = commonSenseContent[sortedMatches[i].index].content.split('').filter(word => !charactersToRemove.includes(word));
            const reSortedMatches = searchKeywordsInFile(commonSenseFilePath, matchContent);
            if (reSortedMatches.length > 0) {
              this.personality['人格'][0].content += appendTopMatches(commonSenseContent, reSortedMatches, 4, `这是第${i + 1}条信息的补充信息：`, 1);
            }
          }
        }
      }
      // 获取当前日期
      const Date = await getCurrentDate();
      this.personality['人格'][0].content += `\n当前日期: ${Date}\n`;
      // 获取当前时间
      const timeOfDay = await getTimeOfDay();
      this.personality['人格'][0].content += `\n当前时间: ${timeOfDay}\n`;

      if (this.pluginConfig.enable_favorability) {// 获取用户的好感度
          const regex = /\*\*/g;
          if (regex.test(censored_prompt)) {
            const newFavorability = user[0].favorability - 15;
            await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: newFavorability });
          } else {
            await this.ctx.database.set('p_system', { userid: user[0].userid }, { favorability: user[0].favorability + 1 }); // 增加好感
          }

          const levels: readonly string[] = ["厌恶", "陌生", "朋友", "暧昧", "恋人"] as const;
          const favorability = user[0].favorability;
          let level: string;
          if (favorability < this.pluginConfig.favorability_div_1) {
            level = levels[0];
            this.personality['人格'][0].content += `\n ${this.pluginConfig.prompt_0} \n`;
          } else if (favorability < this.pluginConfig.favorability_div_2) {
            level = levels[1];
            this.personality['人格'][0].content += `\n ${this.pluginConfig.prompt_1} \n`;
          } else if (favorability < this.pluginConfig.favorability_div_3) {
            level = levels[2];
            this.personality['人格'][0].content += `\n ${this.pluginConfig.prompt_2} \n`;
          } else if (favorability < this.pluginConfig.favorability_div_4) {
            level = levels[3];
            this.personality['人格'][0].content += `\n ${this.pluginConfig.prompt_3} \n`;
          } else {
            level = levels[4];
            this.personality['人格'][0].content += `\n ${this.pluginConfig.prompt_4} \n`;
          }
          logger.info(`名字: ${session.username}, 关系: ${level}`);
      }
      this.personality['人格'][0].content += `发言者的名字: ${session.username}，发言者的id：${session.userId}`;
      // 搜索id
      sortedMatches = searchKeywordsInFile(commonSenseFilePath, USERID);
      if (sortedMatches.length > 0)
        this.personality['人格'][0].content += appendTopMatches(commonSenseContent, sortedMatches, 1, '这是发言者的真实身份：');
      if (debug) logger.info(this.personality['人格'][0].content.slice(-1500));
      return await this.chat(censored_prompt, session.userId, session)
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
    if (this.pluginConfig.private && matchResult && matchResult.includes("private"))
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
    if (session.event.message.elements[0].type == "img" || session.event.message.elements[0].type == "at" || matchResult && matchResult.includes("private"))
      return next();
    if (session.content.length < this.pluginConfig.random_min_tokens || session.content.length >= this.pluginConfig.max_tokens)
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
      max_tokens: this.pluginConfig.max_tokens,
      temperature: this.pluginConfig.temperature,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
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

    // 记录回答
    session_of_id.push({ 'role': 'assistant', 'content': message })

    this.sessions[sessionid] = session_of_id
    logger.info('模型返回内容: ' + message)

    // 更新频道的对话记录(短期记忆记录频道上下文)
    const channelId = session.channelId;
    if (!this.channelDialogues[channelId]) {
      this.channelDialogues[channelId] = [];
    }
    this.channelDialogues[channelId].push({ 'role': session.username, 'content': msg });
    if(this.pluginConfig.enable_self_memory) this.channelDialogues[channelId].push({ 'role': '你', 'content': message });
    if (this.channelDialogues[channelId].length > this.pluginConfig.message_max_length) {
      this.channelDialogues[channelId].shift();
    }

    // 保存对话记录到文件

    const filePath = path.join(this.pluginConfig.dataDir, 'dialogues', `${sessionid}.txt`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // 读取现有文件内容
    let existingContent = [];
    if (fs.existsSync(filePath)) {
      existingContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    // 过滤掉 其他 角色的对话
    const newContent = session_of_id.filter(msg => msg.role === 'user');
    //过滤记录屏蔽词
    for (let i = 0; i < this.pluginConfig.memory_block_words.length; i++) {
      if (newContent[0].content.includes(this.pluginConfig.memory_block_words[i]))
        return await this.getContent(sessionid, session_of_id, session.messageId, session.bot.selfId)
    }
    //记录
    if (this.pluginConfig.enable_favorability) {
      const user = await this.ctx.database.get('p_system', { userid: session.userId });
      const Favorability = user[0].favorability;
      const regex = /记住/g;
      if (regex.test(newContent[0].content) || newContent[0].content.length > this.pluginConfig.remember_min_length) {
        // 追加新的对话记录
        if (Favorability > this.pluginConfig.favorability_div_2) {
          existingContent.push(...newContent);
          logger.info('已记录，长度：' + newContent[0].content.length)
          fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2));
        }
      }
    }
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
    this.channelDialogues = {}
    return session.text('commands.sat.messages.clean')
  }
}

async function isTargetIdExists(ctx: Context, USERID: string) {
  //检查数据表中是否有指定id者
  const targetInfo = await ctx.database.get('p_system', { userid: USERID });
  return targetInfo.length == 0;
}

// 添加常识的方法
async function addCommonSense(content: string, dir: string) {
  const filePath = path.join(dir, 'common_sense.txt');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let existingContent = [];
  if (fs.existsSync(filePath))
    existingContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  existingContent.push({ role: 'user', content });
  fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2));
}

function searchKeywordsInFile(filePath, keywords) {
  if (!fs.existsSync(filePath)) return [];
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const dialogues = JSON.parse(fileContent);
  // 使用正则表达式进行关键词匹配
  const escapedKeywords = keywords.map(escapeRegExp);
  const keywordRegex = new RegExp(escapedKeywords.join('|'), 'gi');
  const chineseRegex = /[\u4e00-\u9fa5]/; // 匹配中文字符的正则表达式
  let matchCounts = dialogues.map((dialogue: { content: string; }, index: any) => {
    const matches = dialogue.content.match(keywordRegex);
    let count = 0;
    if (matches) {
      matches.forEach(match => {
        let chineseCount = (match.match(chineseRegex) || []).length;
        let englishCount = match.length - chineseCount;
        count += chineseCount * 2 + englishCount; // 中文字符权重为2，英文字符权重为1
      });
    }
    // 计算总字符数
    let totalChineseCount = (dialogue.content.match(chineseRegex) || []).length;
    let totalEnglishCount = dialogue.content.length - totalChineseCount;
    let totalCount = totalChineseCount * 2 + totalEnglishCount; // 总字符数权重计算
    let ratio = totalCount > 0 ? count / totalCount : 0; // 计算匹配字符数与总字符数之比
    return { index, count, totalCount, ratio };
  });
  const filteredMatchCounts = matchCounts.filter((item: { count: number; }) => item.count > 1);
  const sortedMatches = filteredMatchCounts.sort((a: { ratio: number; }, b: { ratio: number; }) => b.ratio - a.ratio);
  return sortedMatches;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendTopMatches(dialogues, sortedMatches, topN, prefix, begin = 0) {
  const topMatches = sortedMatches.slice(begin, topN);
  const personalityContent = `\n${prefix}{\n` + topMatches.map(item => dialogues[item.index].content).join('\n') + '\n}';
  return personalityContent;
}

async function getTimeOfDay(): Promise<string> {
  const now = new Date();
  const hour = now.getHours();
  let timeOfDay: string;
  if (hour >= 5 && hour < 9) timeOfDay = '清晨';
  else if (hour >= 9 && hour < 12) timeOfDay = '上午';
  else if (hour >= 12 && hour < 14) timeOfDay = '中午';
  else if (hour >= 14 && hour < 17) timeOfDay = '下午';
  else if (hour >= 17 && hour < 19) timeOfDay = '傍晚';
  else if (hour >= 19 && hour < 22) timeOfDay = '晚上';
  else timeOfDay = '深夜';
  return timeOfDay;
}
// 获取当前日期的函数
async function getCurrentDate(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 月份从0开始，所以需要加1
  const day = now.getDate();
  return `${year}年${month}月${day}日`;
}
namespace SAt {
}
export default SAt
