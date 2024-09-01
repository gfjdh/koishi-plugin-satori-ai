var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/locales/zh.yml
var require_zh = __commonJS({
  "src/locales/zh.yml"(exports, module2) {
    module2.exports = { commands: { sat: { description: "AI聊天", messages: { censor: "不合规，请检查输入内容是否含有违禁词。", "no-prompt": "你好。使用说明可以看我的空间哦。", err: "寄！{0}", tooLong: "你的话太多了。", content_tooLong: "这个问题有点复杂，你还是去问别人吧。", "duplicate-dialogue": "这个刚刚说过了吧......", clean: "舒服了", block1: "我讨厌你！", block2: "我讨厌你们！" } }, "sat.clear": { description: "清空所有人的会话" }, "sat.common_sense": { description: "添加常识", messages: { "no-prompt": "你想让我知道什么？", succeed: "我知道了，{0}" } } } };
  }
});

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var import_koishi2 = require("koishi");

// src/type.ts
var import_koishi = require("koishi");
var Sat = class extends import_koishi.Service {
  static {
    __name(this, "Sat");
  }
  static inject = {
    required: ["console", "database"],
    optional: ["censor"]
  };
  output_type;
  session_config;
  sessions;
  personality;
  sessions_cmd;
  aliasMap;
  type;
  l6k;
  key_number;
  maxRetryTimes;
  constructor(ctx, config) {
    super(ctx, "sat", true);
  }
};
((Sat2) => {
  Sat2.Config = import_koishi.Schema.intersect([
    import_koishi.Schema.object({
      baseURL: import_koishi.Schema.string().default("https://api.deepseek.com").description("请求地址"),
      key: import_koishi.Schema.union([
        import_koishi.Schema.array(String).role("secret"),
        import_koishi.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("api_key"),
      enableContext: import_koishi.Schema.boolean().default(true).description("是否启用上下文, 关闭后将减少 token 消耗(无人格)"),
      appointModel: import_koishi.Schema.string().default("deepseek-chat").description("模型"),
      prompt: import_koishi.Schema.string().role("textarea").description("人格设定")
    }).description("基础设置"),
    import_koishi.Schema.object({
      max_tokens: import_koishi.Schema.number().description("最大请求长度").default(50),
      content_max_tokens: import_koishi.Schema.number().description("最大回答长度").default(100),
      message_max_length: import_koishi.Schema.number().description("最大频道上下文长度").default(10),
      memory_block_words: import_koishi.Schema.array(String).default(["好感"]).description("记忆屏蔽词"),
      remember_min_length: import_koishi.Schema.number().description("触发保存到记忆的长度").default(20),
      dataDir: import_koishi.Schema.string().default("./data/satori_ai").description("聊天记录保存位置（长期记忆）"),
      temperature: import_koishi.Schema.number().role("slider").min(0).max(1).step(0.01).default(0.5).description("温度"),
      authority: import_koishi.Schema.number().role("slider").min(0).max(5).step(1).description("允许使用的最低权限").default(1),
      alias: import_koishi.Schema.array(String).default(["ai"]).description("触发命令;别名"),
      private: import_koishi.Schema.boolean().default(true).description("开启后私聊AI可触发对话, 不需要使用指令"),
      mention: import_koishi.Schema.boolean().default(true).description("开启后机器人被提及(at/引用)可触发对话"),
      randnum: import_koishi.Schema.number().role("slider").min(0).max(1).step(0.01).default(0).description("随机触发对话的概率，如需关闭可设置为 0"),
      sentences_divide: import_koishi.Schema.boolean().default(true).description("是否分句发送"),
      time_interval: import_koishi.Schema.number().default(1e3).description("每句话的时间间隔"),
      maxRetryTimes: import_koishi.Schema.number().default(30).description("报错后最大重试次数")
    }).description("进阶设置"),
    import_koishi.Schema.object({
      enable_favorability: import_koishi.Schema.boolean().default(false).description("是否开启好感度系统（需要p-qiandao插件）"),
      prompt_0: import_koishi.Schema.string().role("textarea").description("厌恶好感补充设定"),
      favorability_div_1: import_koishi.Schema.number().default(15).description("厌恶-陌生分界线"),
      prompt_1: import_koishi.Schema.string().role("textarea").description("陌生好感补充设定"),
      favorability_div_2: import_koishi.Schema.number().default(150).description("陌生-朋友分界线"),
      prompt_2: import_koishi.Schema.string().role("textarea").description("朋友好感补充设定"),
      favorability_div_3: import_koishi.Schema.number().default(500).description("朋友-思慕分界线"),
      prompt_3: import_koishi.Schema.string().role("textarea").description("思慕好感补充设定"),
      favorability_div_4: import_koishi.Schema.number().default(1e3).description("思慕-恋慕分界线"),
      prompt_4: import_koishi.Schema.string().role("textarea").description("恋慕好感补充设定")
    }).description("好感度设置"),
    import_koishi.Schema.object({
      blockuser: import_koishi.Schema.array(String).default([]).description("屏蔽的用户"),
      blockchannel: import_koishi.Schema.array(String).default([]).description("屏蔽的频道")
    }).description("过滤器")
  ]);
})(Sat || (Sat = {}));

// src/index.tsx
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var name = "satori-ai";
var logger = new import_koishi2.Logger(name);
var debug = 1;
var SAt = class extends Sat {
  static {
    __name(this, "SAt");
  }
  pluginConfig;
  channelDialogues = {};
  constructor(ctx, config) {
    super(ctx, config);
    this.key_number = 0;
    this.sessions = {};
    this.maxRetryTimes = config.maxRetryTimes;
    this.pluginConfig = config;
    ctx.i18n.define("zh", require_zh());
    if (config.enable_favorability) {
      ctx.model.extend("p_system", {
        id: "unsigned",
        userid: "string",
        usersname: "string",
        favorability: "integer"
      }, { autoInc: true });
    }
    this.personality = { "人格": [{ "role": "system", "content": `${config.prompt}` }] };
    this.session_config = Object.values(this.personality)[0];
    ctx.middleware(async (session, next) => {
      return this.middleware(session, next);
    });
    ctx.command("sat <text:text>", { authority: config.authority }).alias(...config.alias).action(async ({ session }, ...prompt) => {
      const message = await this.sat(session, prompt.join(" "));
      if (typeof message === "string")
        return message;
      const content = message?.attrs?.content;
      if (!content) {
        console.error("Message or its attrs are undefined");
        return session.text("commands.sat.messages.err");
      }
      if (content.length > this.pluginConfig.content_max_tokens)
        return session.text("commands.sat.messages.content_tooLong");
      if (this.pluginConfig.enable_favorability) {
        const notExists = await isTargetIdExists(this.ctx, session.userId);
        if (!notExists) {
          const user = await this.ctx.database.get("p_system", { userid: session.userId });
          if (this.ctx.censor) {
            const censor_content = await this.ctx.censor.transform(content, session);
            const regex = /\*\*/g;
            if (regex.test(censor_content)) {
              const newFavorability = user[0].favorability - 5;
              await this.ctx.database.set("p_system", { userid: user[0].userid }, { favorability: newFavorability });
            }
            if (content == "6") {
              const newFavorability = user[0].favorability - 1;
              await this.ctx.database.set("p_system", { userid: user[0].userid }, { favorability: newFavorability });
            }
          }
        }
      }
      this.sessions = {};
      if (config.sentences_divide) {
        const sentences = content.split(/(?<=\。)\s*/);
        for (const sentence of sentences)
          await session.sendQueued(import_koishi2.h.text(sentence), config.time_interval);
      } else {
        return content;
      }
    });
    ctx.command("sat.clear", "清空所有会话及人格", { authority: 1 }).action(({ session }) => {
      return this.clear(session);
    });
    ctx.command("sat.common_sense <text:text>", "添加常识", { authority: 3 }).action(async ({ session }, ...prompt) => {
      const content = prompt.join(" ");
      if (!content)
        return session.text("commands.sat.common_sense.messages.no-prompt");
      await addCommonSense(content, this.pluginConfig.dataDir);
      return session.text("commands.sat.common_sense.messages.succeed", [content]);
    });
  }
  /**
   *
   * @param session 会话
   * @param prompt 会话内容
   * @returns Promise<string | Element>
   */
  async sat(session, prompt) {
    if (this.pluginConfig.blockuser.includes(session.userId))
      return session.text("commands.sat.messages.block1");
    if (this.pluginConfig.blockchannel.includes(session.channelId))
      return session.text("commands.sat.messages.block2");
    if (!prompt && !session.quote?.content)
      return session.text("commands.sat.messages.no-prompt");
    if (prompt.length > this.pluginConfig.max_tokens)
      return session.text("commands.sat.messages.tooLong");
    let censored_prompt;
    if (this.ctx.censor)
      censored_prompt = await this.ctx.censor.transform(prompt, session);
    if (this.pluginConfig.enableContext) {
      this.personality["人格"][0].content = this.pluginConfig.prompt;
      const channelId = session.channelId;
      const dialogues = this.channelDialogues[channelId] || [];
      const recentDialogues = dialogues.slice(-10);
      const duplicateDialogue = recentDialogues.find((msg) => msg.role === session.username && (msg.content.includes(prompt) || prompt.includes(msg.content)));
      if (duplicateDialogue) {
        const notExists2 = await isTargetIdExists(this.ctx, session.userId);
        if (!notExists2) {
          const user = await this.ctx.database.get("p_system", { userid: session.userId });
          const newFavorability = user[0].favorability - 1;
          await this.ctx.database.set("p_system", { userid: user[0].userid }, { favorability: newFavorability });
        }
        return session.text("commands.sat.messages.duplicate-dialogue");
      }
      this.personality["人格"][0].content += "\n这是刚刚的对话内容：{\n" + recentDialogues.map((msg) => `${msg.role}: ${msg.content}`).join("\n") + "\n}";
      const charactersToRemove = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
      const filePath = path.join(this.pluginConfig.dataDir, "dialogues", `${session.userId}.txt`);
      const notExists = await isTargetIdExists(this.ctx, session.userId);
      let tmp;
      if (!notExists) {
        const user = await this.ctx.database.get("p_system", { userid: session.userId });
        tmp = (user[0].usersname + prompt).split("");
      } else {
        tmp = (session.username + prompt).split("");
      }
      const keywords = tmp.filter((word) => !charactersToRemove.includes(word));
      const fs2 = require("fs");
      const USERID = [session.userId];
      let sortedMatches = searchKeywordsInFile(filePath, keywords);
      if (sortedMatches.length > 0) {
        this.personality["人格"][0].content += appendTopMatches(JSON.parse(fs2.readFileSync(filePath, "utf-8")), sortedMatches, 10, "这是你可能用到的较久之前的对话内容：");
      }
      const commonSenseFilePath = path.join(this.pluginConfig.dataDir, "common_sense.txt");
      let commonSenseContent;
      try {
        commonSenseContent = JSON.parse(fs2.readFileSync(commonSenseFilePath, "utf-8"));
      } catch (error) {
        console.error("Error reading or parsing common_sense file:", error);
        return;
      }
      sortedMatches = searchKeywordsInFile(commonSenseFilePath, keywords);
      if (sortedMatches.length > 0) {
        this.personality["人格"][0].content += appendTopMatches(commonSenseContent, sortedMatches, 10, "这是你需要知道的信息：");
        if (sortedMatches.length > 4) {
          for (let i = 0; i < 5; i++) {
            const matchContent = commonSenseContent[sortedMatches[i].index].content.split("").filter((word) => !charactersToRemove.includes(word));
            const reSortedMatches = searchKeywordsInFile(commonSenseFilePath, matchContent);
            if (reSortedMatches.length > 0) {
              this.personality["人格"][0].content += appendTopMatches(commonSenseContent, reSortedMatches, 3, `这是第${i + 1}条信息的补充信息：`, 1);
            }
          }
        }
      }
      const timeOfDay = await getTimeOfDay();
      this.personality["人格"][0].content += `
当前时间: ${timeOfDay}
`;
      if (this.pluginConfig.enable_favorability) {
        const notExists2 = await isTargetIdExists(this.ctx, session.userId);
        if (!notExists2) {
          const user = await this.ctx.database.get("p_system", { userid: session.userId });
          const regex = /\*\*/g;
          if (regex.test(censored_prompt)) {
            const newFavorability = user[0].favorability - 11;
            await this.ctx.database.set("p_system", { userid: user[0].userid }, { favorability: newFavorability });
          } else {
            await this.ctx.database.set("p_system", { userid: user[0].userid }, { favorability: user[0].favorability + 1 });
          }
          const levels = ["厌恶", "陌生", "朋友", "暧昧", "恋人"];
          const favorability = user[0].favorability;
          let level;
          if (favorability < this.pluginConfig.favorability_div_1) {
            level = levels[0];
            this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_0} 
`;
          } else if (favorability < this.pluginConfig.favorability_div_2) {
            level = levels[1];
            this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_1} 
`;
          } else if (favorability < this.pluginConfig.favorability_div_3) {
            level = levels[2];
            this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_2} 
`;
          } else if (favorability < this.pluginConfig.favorability_div_4) {
            level = levels[3];
            this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_3} 
`;
          } else {
            level = levels[4];
            this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_4} 
`;
          }
          this.personality["人格"][0].content += `发言者的名字: ${session.username}，发言者的id：${session.userId}`;
          logger.info(`名字: ${session.username}, 关系: ${level}`);
        } else {
          this.personality["人格"][0].content += `
 ${this.pluginConfig.prompt_1} 
发言者的名字: ${session.username}，发言者的id：${session.userId}`;
          logger.info(`名字: ${session.username}, 关系: 陌生`);
        }
      }
      sortedMatches = searchKeywordsInFile(commonSenseFilePath, USERID);
      if (sortedMatches.length > 0)
        this.personality["人格"][0].content += appendTopMatches(commonSenseContent, sortedMatches, 1, "这是发言者的真实身份：");
      if (debug)
        logger.info(this.personality["人格"][0].content.slice(-1500));
      return await this.chat(censored_prompt, session.userId, session);
    } else {
      const text = await this.chat_with_gpt(session, [{ "role": "user", "content": prompt }]);
      const resp = [{ "role": "user", "content": prompt }, { "role": "assistant", "content": text }];
      return await this.getContent(session.userId, resp, session.messageId, session.bot.selfId);
    }
  }
  /**
   *
   * @param session 当前会话
   * @param next 通过函数
   * @returns 消息
   */
  async middleware(session, next) {
    const matchResult = session.channelId.match(new RegExp("private", "g"));
    if (matchResult && matchResult.includes("private"))
      return this.sat(session, session.content);
    if (session.stripped.appel && this.pluginConfig.mention) {
      let msg = "";
      for (let i of session.elements.slice(1)) {
        if (i.type === "text")
          msg += i?.attrs?.content;
      }
      return this.sat(session, msg);
    }
    if (session.event.message.elements[0].type == "img" || session.event.message.elements[0].type == "at")
      return next();
    if (session.content.length < 20 || session.content.length >= this.pluginConfig.max_tokens)
      return next();
    const randnum = Math.random();
    if (randnum < this.pluginConfig.randnum)
      return await this.sat(session, session.content);
    return next();
  }
  /**
   *
   * @param message 发送给chatgpt的json列表
   * @returns 将返回文字处理成json
   */
  async chat_with_gpt(_session, message) {
    let url = (0, import_koishi2.trimSlash)(`${this.pluginConfig.baseURL ?? "https://api.deepseek.com"}/v1/chat/completions`);
    const payload = {
      model: this.pluginConfig.appointModel,
      temperature: this.pluginConfig.temperature,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      messages: message
    };
    const config = {
      timeout: 0,
      headers: {
        Authorization: `Bearer ${this.pluginConfig.key[this.key_number]}`,
        "Content-Type": "application/json"
      }
    };
    try {
      const response = await this.ctx.http.post(url, payload, config);
      return response.choices[0].message.content;
    } catch (e) {
      return "";
    }
  }
  /**
   *
   * @param sessionid QQ号
   * @returns 对应QQ的会话
   */
  get_chat_session(sessionid) {
    if (Object.keys(this.sessions).indexOf(sessionid) == -1)
      this.sessions[sessionid] = [...this.session_config];
    return this.sessions[sessionid];
  }
  /**
   *
   * @param msg prompt消息
   * @param sessionid QQ号
   * @returns json消息
   */
  async chat(msg, sessionid, session) {
    logger.info((session.author?.nick || session.username) + ":" + msg);
    let session_of_id = this.get_chat_session(sessionid);
    session_of_id.push({ "role": "user", "content": msg });
    let message = await this.try_control(this.chat_with_gpt, session, session_of_id);
    session_of_id.push({ "role": "assistant", "content": message });
    this.sessions[sessionid] = session_of_id;
    logger.info("ChatGPT返回内容: " + message);
    const channelId = session.channelId;
    if (!this.channelDialogues[channelId]) {
      this.channelDialogues[channelId] = [];
    }
    this.channelDialogues[channelId].push({ "role": session.username, "content": msg });
    if (this.channelDialogues[channelId].length > this.pluginConfig.message_max_length) {
      this.channelDialogues[channelId].shift();
    }
    const filePath = path.join(this.pluginConfig.dataDir, "dialogues", `${sessionid}.txt`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let existingContent = [];
    if (fs.existsSync(filePath)) {
      existingContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    const newContent = session_of_id.filter((msg2) => msg2.role === "user");
    for (let i = 0; i < this.pluginConfig.memory_block_words.length; i++) {
      if (newContent[0].content.includes(this.pluginConfig.memory_block_words[i]))
        return await this.getContent(sessionid, session_of_id, session.messageId, session.bot.selfId);
    }
    const notExists = await isTargetIdExists(this.ctx, session.userId);
    if (!notExists) {
      const user = await this.ctx.database.get("p_system", { userid: session.userId });
      const Favorability = user[0].favorability;
      const regex = /记住/g;
      if (regex.test(newContent[0].content) || newContent[0].content.length > this.pluginConfig.remember_min_length) {
        if (Favorability > this.pluginConfig.favorability_div_2) {
          existingContent.push(...newContent);
          logger.info("已记录，长度：" + newContent[0].content.length);
          fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2));
        }
      }
    }
    return await this.getContent(sessionid, session_of_id, session.messageId, session.bot.selfId);
  }
  /**
   *
   * @param cb chat 回调函数 chat_with_gpt
   * @param session 会话
   * @param session_of_id 会话 ID
   * @returns
   */
  async try_control(cb, session, session_of_id) {
    let try_times = 0;
    while (try_times < this.pluginConfig.maxRetryTimes) {
      const res = await cb.bind(this)(session, session_of_id);
      if (res !== "")
        return res;
      try_times++;
      await this.ctx.sleep(500);
    }
    return "请求错误，请查看日志";
  }
  /**
   *
   * @param userId 用户QQ号
   * @param resp gpt返回的json
   * @returns 文字，图片或聊天记录
   */
  async getContent(userId, resp, messageId, botId) {
    return import_koishi2.h.text(resp[resp.length - 1].content);
  }
  /**
   *
   * @param session 当前会话
   * @returns 返回清空的消息
   */
  clear(session) {
    this.sessions = {};
    this.channelDialogues = {};
    return session.text("commands.sat.messages.clean");
  }
};
async function isTargetIdExists(ctx, USERID) {
  const targetInfo = await ctx.database.get("p_system", { userid: USERID });
  return targetInfo.length == 0;
}
__name(isTargetIdExists, "isTargetIdExists");
async function addCommonSense(content, dir) {
  const filePath = path.join(dir, "common_sense.txt");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let existingContent = [];
  if (fs.existsSync(filePath)) {
    existingContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  existingContent.push({ role: "user", content });
  fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2));
}
__name(addCommonSense, "addCommonSense");
function searchKeywordsInFile(filePath, keywords) {
  if (!fs.existsSync(filePath))
    return [];
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const dialogues = JSON.parse(fileContent);
  const keywordRegex = new RegExp(keywords.join("|"), "gi");
  const chineseRegex = /[\u4e00-\u9fa5]/;
  let matchCounts = dialogues.map((dialogue, index) => {
    const matches = dialogue.content.match(keywordRegex);
    let count = 0;
    if (matches) {
      matches.forEach((match) => {
        let chineseCount = (match.match(chineseRegex) || []).length;
        let englishCount = match.length - chineseCount;
        count += chineseCount * 2 + englishCount;
      });
    }
    let totalChineseCount = (dialogue.content.match(chineseRegex) || []).length;
    let totalEnglishCount = dialogue.content.length - totalChineseCount;
    let totalCount = totalChineseCount * 2 + totalEnglishCount;
    let ratio = totalCount > 0 ? count / totalCount : 0;
    return { index, count, totalCount, ratio };
  });
  const filteredMatchCounts = matchCounts.filter((item) => item.count > 1);
  const sortedMatches = filteredMatchCounts.sort((a, b) => b.ratio - a.ratio);
  return sortedMatches;
}
__name(searchKeywordsInFile, "searchKeywordsInFile");
function appendTopMatches(dialogues, sortedMatches, topN, prefix, begin = 0) {
  const topMatches = sortedMatches.slice(begin, topN);
  const personalityContent = `
${prefix}{
` + topMatches.map((item) => dialogues[item.index].content).join("\n") + "\n}";
  return personalityContent;
}
__name(appendTopMatches, "appendTopMatches");
async function getTimeOfDay() {
  const now = /* @__PURE__ */ new Date();
  const hour = now.getHours();
  let timeOfDay;
  if (hour >= 5 && hour < 9)
    timeOfDay = "清晨";
  else if (hour >= 9 && hour < 12)
    timeOfDay = "上午";
  else if (hour >= 12 && hour < 14)
    timeOfDay = "中午";
  else if (hour >= 14 && hour < 17)
    timeOfDay = "下午";
  else if (hour >= 17 && hour < 19)
    timeOfDay = "傍晚";
  else if (hour >= 19 && hour < 22)
    timeOfDay = "晚上";
  else
    timeOfDay = "深夜";
  return timeOfDay;
}
__name(getTimeOfDay, "getTimeOfDay");
var src_default = SAt;
