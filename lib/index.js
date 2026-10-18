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
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
  "src/locales/zh.yml"(exports2, module2) {
    module2.exports = { commands: { sat: { description: "AI聊天", messages: { "no-prompt": "你好。使用说明可以看我的空间哦。", tooManyEnglishLetters: "请不要用这么多英文......", err: "寄！{0}", tooLong: "你的话太多了。", content_tooLong: "这个问题有点复杂，你还是去问别人吧。", "duplicate-dialogue": "这个刚刚说过了吧......", online: "思考中，请再等一会！", "no-response": "我不知道你在说什么……", update_level_succeed: "用户等级已更新为{0}", exceeds: "已经差不多够了吧？请明天再来。", usage: "今日次数{0}/{1}", hatMan: "叮！帽子先生保护了你的好感度，快说谢谢帽子先生吧！", rockBottom: "叮！谷底小石保护了你的好感度，快说谢谢谷底小石吧！", not_good_mood: "别得寸进尺……（好感↓）", pocket_money: "心情不错，给你点零花钱吧~（获得了{0}p点）", warning: "<at id={0}/>", block1: "我讨厌你！", block2: "我讨厌你们！" } }, "sat.clear": { description: "清空当前频道会话", messages: { clean: "已清空当前会话。", Allclean: "已清空所有会话。" } }, "sat.common_sense": { description: "添加常识", messages: { "no-prompt": "你想让我知道什么？", succeed: "我知道了，{0}" } }, "sat.broadcast": { description: "广播一条消息，在每个生效群收到首条消息时会推送", options: { delete: "删除一条广播，参数为广播的ID", list: "查看当前所有广播", img: "使用puppeteer图片化广播消息" } } } };
  }
});

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  SAT: () => SAT,
  default: () => src_default,
  puppeteer: () => puppeteer,
  refreshPuppeteer: () => refreshPuppeteer
});
module.exports = __toCommonJS(src_exports);
var import_koishi19 = require("koishi");
var path7 = __toESM(require("path"));
var import_fs2 = require("fs");

// src/emoji.ts
var import_koishi2 = require("koishi");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/utils.ts
var import_koishi = require("koishi");

// src/database.ts
async function isTargetIdNotExists(ctx, userId) {
  const users = await ctx.database.get("p_system", { userid: userId });
  return users.length === 0;
}
__name(isTargetIdNotExists, "isTargetIdNotExists");
async function createUser(ctx, user) {
  await ctx.database.create("p_system", {
    userid: user.userid || "",
    usersname: user.usersname || "",
    p: user.p || 0,
    favorability: user.favorability || 0,
    userlevel: user.userlevel || 0,
    usage: user.usage || 0,
    location: user.location || "",
    lastChatTime: user.lastChatTime || (/* @__PURE__ */ new Date()).getDate(),
    items: user.items || {}
  });
}
__name(createUser, "createUser");
async function updateFavorability(ctx, user, adjustment) {
  if (!user)
    return;
  let newValue;
  if (typeof adjustment === "number")
    newValue = user.favorability + adjustment;
  else
    newValue = user.favorability;
  await ctx.database.set("p_system", { userid: user.userid }, { favorability: newValue });
}
__name(updateFavorability, "updateFavorability");
async function updateUserLevel(ctx, user, level) {
  if (!user)
    return;
  level = level < 5 ? level : 4;
  await ctx.database.set("p_system", { userid: user.userid }, { userlevel: level });
}
__name(updateUserLevel, "updateUserLevel");
async function updateUserUsage(ctx, user, adjustment = 1) {
  if (!user)
    return;
  if (user.lastChatTime && (/* @__PURE__ */ new Date()).getDate() !== user.lastChatTime)
    user.usage = 0;
  await ctx.database.set("p_system", { userid: user.userid }, { usage: user.usage + adjustment });
  await ctx.database.set("p_system", { userid: user.userid }, { lastChatTime: (/* @__PURE__ */ new Date()).getDate() });
  return user.usage + adjustment;
}
__name(updateUserUsage, "updateUserUsage");
async function updateUserItems(ctx, user) {
  if (!user)
    return;
  await ctx.database.set("p_system", { userid: user.userid }, { items: user.items });
}
__name(updateUserItems, "updateUserItems");
async function updateUserP(ctx, user, adjustment) {
  if (!user)
    return;
  user.p = await ctx.database.get("p_system", { userid: user.userid })[0]?.p || user.p;
  if (user.p + adjustment < 0)
    adjustment = -user.p;
  await ctx.database.set("p_system", { userid: user.userid }, { p: user.p + adjustment });
}
__name(updateUserP, "updateUserP");
async function updateUserLocation(ctx, user, location) {
  if (!user)
    return;
  await ctx.database.set("p_system", { userid: user.userid }, { location });
}
__name(updateUserLocation, "updateUserLocation");
async function getUser(ctx, userId) {
  const users = await ctx.database.get("p_system", { userid: userId });
  return users[0] || null;
}
__name(getUser, "getUser");
async function ensureUserExists(ctx, userId, username) {
  const notExists = await isTargetIdNotExists(ctx, userId);
  if (notExists) {
    await createUser(ctx, {
      userid: userId,
      usersname: username,
      p: 0,
      favorability: 0,
      userlevel: 0,
      usage: 0,
      location: "",
      lastChatTime: (/* @__PURE__ */ new Date()).getDate(),
      items: {}
    });
  }
  return getUser(ctx, userId);
}
__name(ensureUserExists, "ensureUserExists");
function extendDatabase(ctx) {
  ctx.model.extend("p_system", {
    id: "unsigned",
    userid: "string",
    usersname: "string",
    p: "integer",
    favorability: "integer",
    userlevel: "integer",
    usage: "integer",
    location: "string",
    lastChatTime: "integer",
    items: "object"
  }, { autoInc: true });
}
__name(extendDatabase, "extendDatabase");

// src/utils.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var logger = new import_koishi.Logger("satori-utils");
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegExp, "escapeRegExp");
function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}
__name(parseTimeToMinutes, "parseTimeToMinutes");
function parseTime(timestamp) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}
__name(parseTime, "parseTime");
function getTimeOfDay(hours) {
  if (hours >= 5 && hours < 9)
    return "清晨";
  if (hours < 12)
    return "上午";
  if (hours < 14)
    return "中午";
  if (hours < 17)
    return "下午";
  if (hours < 19)
    return "傍晚";
  if (hours < 22)
    return "晚上";
  return "深夜";
}
__name(getTimeOfDay, "getTimeOfDay");
function trimSlash(url) {
  return url.replace(/\/$/, "");
}
__name(trimSlash, "trimSlash");
function splitSentences(text, MIN_LENGTH, MAX_LENGTH) {
  const PUNCTUATION_REGEX = /([。！？!?…]+)/g;
  const rawSegments = text.split(PUNCTUATION_REGEX);
  const initialSentences = [];
  for (let i = 0; i < rawSegments.length; i += 2) {
    const sentence = rawSegments[i]?.trim() || "";
    const punctuation = rawSegments[i + 1]?.trim() || "";
    if (sentence)
      initialSentences.push(sentence + punctuation);
  }
  const finalSentences = [];
  let currentSentence = "";
  for (const sentence of initialSentences) {
    const potentialLength = currentSentence.length + sentence.length;
    if (sentence.length > MAX_LENGTH) {
      if (currentSentence)
        finalSentences.push(currentSentence);
      finalSentences.push(sentence);
      currentSentence = "";
      continue;
    }
    if (potentialLength <= MAX_LENGTH) {
      currentSentence += sentence;
      if (currentSentence.length >= MIN_LENGTH && potentialLength >= MAX_LENGTH * 0.8) {
        finalSentences.push(currentSentence);
        currentSentence = "";
      }
    } else {
      finalSentences.push(currentSentence);
      currentSentence = sentence;
    }
  }
  if (currentSentence)
    finalSentences.push(currentSentence);
  return finalSentences.reduce((result, sentence) => {
    if (sentence.length < MIN_LENGTH && result.length > 0) {
      result[result.length - 1] += sentence;
    } else {
      result.push(sentence);
    }
    return result;
  }, []);
}
__name(splitSentences, "splitSentences");
function probabilisticCheck(probability) {
  return Math.random() < probability;
}
__name(probabilisticCheck, "probabilisticCheck");
function isErrorWithMessage(error) {
  return typeof error === "object" && error !== null && "message" in error;
}
__name(isErrorWithMessage, "isErrorWithMessage");
function processPrompt(prompt, botNames = [], botIds = []) {
  if (!prompt)
    return "";
  if (prompt.includes(":poke"))
    return "戳戳";
  const names = botNames.filter(Boolean);
  const ids = botIds.filter(Boolean);
  prompt = prompt.replace(/<at\b[^>]*?name="([^\"]*)"[^>]*>/gi, (tag, name) => {
    const id = /\bid="([^"]*)"/i.exec(tag)?.[1];
    if (ids.includes(id) || names.includes(name))
      return "";
    return name;
  });
  prompt = prompt.replace(/<at\b[^>]*\/?>/gi, "");
  prompt = prompt.replace(/<[^>]*?avatar[^>]*>/g, "。回复：");
  prompt = prompt.replace(/<[^>]*?img[^>]*>/g, "[图片]");
  prompt = prompt.replace(/<[^>]*?name="([^\"]*)"[^>]*>/g, (_, name) => `${name}`);
  if (names.length) {
    const pattern = [...new Set(names.map((name) => name.replace(/[\s,，.。!！?？~～:：;；、]+$/, "")))].filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
    if (pattern) {
      const stripped = prompt.replace(
        new RegExp(`^\\s*(?:${pattern})(?:\\s+|[，,。.!！?？~～:：;；、]+|$)`),
        ""
      );
      if (stripped.trim())
        prompt = stripped;
    }
  }
  prompt = prompt.replace(/\*\*/g, "");
  if (!prompt.trim())
    return "**";
  return prompt.trim();
}
__name(processPrompt, "processPrompt");
function filterResponse(prompt, words, options) {
  const applyBracketFilter = options?.applyBracketFilter ?? true;
  const applyTagFilter = options?.applyTagFilter ?? true;
  let working = prompt;
  if (applyBracketFilter) {
    const parts = working.split(/([（\[【《(][^）)]{0,500}[）\]】》)])/g);
    const filtered = parts.map((part) => {
      if (part.startsWith("（") && part.endsWith("）") || part.startsWith("(") && part.endsWith(")") || part.startsWith("[") && part.endsWith("]") || part.startsWith("【") && part.endsWith("】") || part.startsWith("《") && part.endsWith("》")) {
        return words.some((word) => part.includes(word)) ? "" : part;
      }
      return part;
    }).join("…");
    working = filtered.replace(/\s+/g, ".");
    if (!working) {
      working = prompt;
    }
  }
  if (!applyTagFilter) {
    return working ? { content: working, error: false } : { content: "返回内容为空，请重置对话", error: true };
  }
  const pTagRegex = /<p>[\s\S]*?<\/p>/g;
  const doubaoRegex = /<doubaothinking>[\s\S]*?<\/doubaothinking>/g;
  const answerTagRegex = /<answer>[\s\S]*?<\/answer>/g;
  const pMatches = working.match(pTagRegex) || [];
  const doubaoMatches = working.match(doubaoRegex) || [];
  const answerTagMatches = working.match(answerTagRegex) || [];
  let combined = null;
  if (pMatches.length > 0) {
    combined = pMatches.map((s) => s.replace(/^<p>/i, "").replace(/<\/p>$/i, "")).join("，");
  } else if (doubaoMatches.length > 0) {
    combined = doubaoMatches.map((s) => s.replace(/<doubaothinking>/i, "").replace(/<\/doubaothinking>/i, "")).join("，");
  } else if (answerTagMatches.length > 0) {
    combined = answerTagMatches.map((s) => s.replace(/<answer>/i, "").replace(/<\/answer>/i, "")).join("，");
  }
  if (!combined) {
    return { content: "内容抽取失败，请重置对话", error: true };
  }
  const cleanupRegex = /<p>|<\/p>|<doubaothinking>|<\/doubaothinking>|<answer>|<\/answer>|<br>|<\/br>|<br\/>/gi;
  const cleanedContent = combined.replace(cleanupRegex, "").trim();
  return cleanedContent ? { content: cleanedContent, error: false } : { content: "标签过滤失败，请重置对话", error: true };
}
__name(filterResponse, "filterResponse");
function addOutputCensor(session, word, baseURL) {
  const blockWordsPath = path.resolve(baseURL, "output_censor.txt");
  if (!fs.existsSync(blockWordsPath)) {
    fs.mkdirSync(blockWordsPath);
    fs.writeFileSync(blockWordsPath, word);
  }
  let blockWords = fs.readFileSync(blockWordsPath, "utf-8").split(",");
  blockWords.push(word);
  fs.writeFileSync(blockWordsPath, blockWords.join(","));
  session.send(`添加"${word}"成功`);
}
__name(addOutputCensor, "addOutputCensor");
async function updateUserPWithTicket(ctx, user, adjustment) {
  if (!user)
    return;
  if (user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on") {
    await updateUserP(ctx, user, adjustment);
  }
}
__name(updateUserPWithTicket, "updateUserPWithTicket");
async function wrapInHTML(str, width = 20) {
  if (!puppeteer) {
    logger.warn("puppeteer未就绪");
    return "出现错误，请联系管理员";
  }
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        /* 让页面宽度随内容收缩，这样 puppeteer 渲染产物不会有大片空白 */
        html, body {
          margin: 0;
          padding: 0;
          width: auto;
          height: auto;
          display: inline-block; /* shrink-to-fit */
          background: transparent;
        }
        .satori-text {
          padding: 10px;
          display: inline-block;
          box-sizing: border-box;
          font-family: "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif;
          font-size: 16px;
          line-height: 1.4;
          /* 最大约 20 个字符宽度（可调整为 10-20ch） */
          max-width: ${width}ch;
          /* 同时允许内容根据文字宽度收缩（fit-content 在一些旧浏览器需备份） */
          width: -moz-fit-content;
          width: fit-content;
          /* 保留输入中的换行符并在需要时换行 */
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          -webkit-font-smoothing: antialiased;
        }
      </style>
    </head>
    <body>
      <div class="satori-text">${str.replaceAll(/\n/g, "<br/>")}</div>
    </body>
  </html>`;
  try {
    const renderPromise = puppeteer.render(html);
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Puppeteer 渲染超时")), 3e4)
    );
    return await Promise.race([renderPromise, timeoutPromise]);
  } catch (error) {
    logger.error(`Puppeteer 渲染失败: ${error}`);
    return "渲染失败，请联系管理员";
  }
}
__name(wrapInHTML, "wrapInHTML");

// src/emoji.ts
var logger2 = new import_koishi2.Logger("satori-emoji");
var EmojiManager = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.emojiDir = path2.resolve(this.config.dataDir, "emojis");
    this.loadEmojis();
  }
  static {
    __name(this, "EmojiManager");
  }
  categories = [];
  emojiDir;
  async loadEmojis() {
    try {
      if (!fs2.existsSync(this.emojiDir)) {
        logger2.warn(`表情包目录不存在: ${this.emojiDir}`);
        return;
      }
      const entries = await fs2.promises.readdir(this.emojiDir, { withFileTypes: true });
      const folders = entries.filter((entry) => entry.isDirectory());
      for (const folder of folders) {
        const folderPath = path2.join(this.emojiDir, folder.name);
        const files = await fs2.promises.readdir(folderPath);
        const imageFiles = files.filter((file) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
        if (imageFiles.length > 0) {
          this.categories.push({
            name: folder.name,
            files: imageFiles
          });
        }
      }
      logger2.info(`已加载表情包类别: ${this.categories.map((c) => c.name).join(", ")}`);
    } catch (error) {
      logger2.error(`加载表情包失败: ${error}`);
    }
  }
  shouldSendEmoji() {
    if (!this.config.enable_emoji)
      return false;
    return Math.random() < this.config.emoji_probability;
  }
  async getEmoji(session, user, recentMessages) {
    if (this.categories.length === 0)
      return null;
    const contextMessages = recentMessages.slice(-5).map((msg) => {
      if (msg.role === "system")
        return "";
      return `${msg.role === "user" ? "用户" : "AI"}: ${msg.content}`;
    }).filter((s) => s).join("\n");
    const categoryNames = this.categories.map((c) => c.name).join("、");
    const systemPrompt = `你是一个表情包推荐助手。请根据提供的对话上下文，从给定的表情包类别中为AI选择一个最合适的表情包类别。
表情包类别列表：[${categoryNames}]
如果不适合发送表情包，请返回 "none"。
请只返回类别名称或 "none"，不要包含其他内容。`;
    const userPrompt = `对话上下文：
${contextMessages}

请推荐一个最合适的表情包类别，只输出类别名称。`;
    const fullPrompt = `${systemPrompt}

${userPrompt}`;
    const messages = [
      { role: "user", content: fullPrompt }
    ];
    logger2.info(`表情包推荐提示词:
${fullPrompt}`);
    const { baseURL, key, model } = this.getAPIConfig(user);
    try {
      const response = await this.callLLM(baseURL, key, model, messages);
      const categoryName = response.trim();
      logger2.info(`模型推荐的表情包类别: ${categoryName}`);
      if (!categoryName || categoryName === "none")
        return null;
      const category = this.categories.find((c) => c.name === categoryName);
      if (category) {
        const randomFile = category.files[Math.floor(Math.random() * category.files.length)];
        const filePath = path2.join(this.emojiDir, category.name, randomFile);
        logger2.info(`选择表情包: ${category.name}/${randomFile}`);
        return filePath;
      } else {
        logger2.info(`模型返回了无效的表情包类别: ${categoryName}`);
        return null;
      }
    } catch (error) {
      logger2.warn(`获取表情包失败: ${error}`);
      return null;
    }
  }
  getAPIConfig(user) {
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description === "on";
    if (enableUserKey) {
      const ticket = user.items["地灵殿通行证"].metadata;
      if (ticket?.not_reasoner_model) {
        return {
          baseURL: ticket.baseURL,
          key: ticket.key,
          model: ticket.not_reasoner_model
        };
      }
      return {
        baseURL: ticket.baseURL,
        key: ticket.key,
        model: ticket.model
      };
    }
    return {
      baseURL: this.config.not_reasoner_LLM_URL,
      key: this.config.not_reasoner_LLM_key[0],
      // 简化处理，使用第一个key
      model: this.config.not_reasoner_LLM
    };
  }
  async callLLM(baseURL, key, model, messages) {
    const url = `${trimSlash(baseURL)}/chat/completions`;
    const headers = {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    const payload = {
      model,
      messages,
      temperature: 0.6,
      max_tokens: 500
      // 增加到500以适应可能的思考过程
    };
    try {
      const response = await this.ctx.http.post(url, payload, { headers, timeout: 1e4 });
      logger2.info(`LLM响应: ${JSON.stringify(response)}`);
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message?.content;
        return content || "";
      }
      throw new Error("API响应格式错误");
    } catch (error) {
      if (isErrorWithMessage(error)) {
        const status = error.response?.status || 0;
        const message = error.response?.data?.error?.message || error.message;
        logger2.warn(`API Error [${status}]: ${message}`);
      }
      throw error;
    }
  }
};

// src/api.ts
var import_koishi3 = require("koishi");
var logger3 = new import_koishi3.Logger("satori-api");
var TICKET_FAILURE_COOLDOWN_MS = 10 * 6e4;
var TICKET_FAILURE_COOLDOWN_STATUSES = /* @__PURE__ */ new Set([401, 402, 403, 404, 422, 429]);
var MAX_RATE_LIMIT_BACKOFF_MS = 3e4;
var MAX_RETRY_AFTER_MS = 6e4;
var APIClient = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.testConnection();
  }
  static {
    __name(this, "APIClient");
  }
  currentKeyIndex = 0;
  ticketFailedUntil = /* @__PURE__ */ new Map();
  // 发送聊天请求
  async chat(user, messages) {
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description == "on";
    let keys;
    let modle;
    let baseURL;
    let thinkingType = "enabled";
    if (enableUserKey) {
      const ticket = user.items["地灵殿通行证"].metadata;
      keys = [ticket?.key];
      modle = ticket?.model;
      baseURL = ticket?.baseURL;
      const not_reasoner_model = ticket?.not_reasoner_model;
      const length = ticket?.use_not_reasoner_LLM_length;
      if (not_reasoner_model && length && messages[messages.length - 1].content.length <= length) {
        thinkingType = "disabled";
        modle = not_reasoner_model;
      }
    } else {
      const config = this.config;
      const useNotReasoner = messages[messages.length - 1].content.length <= config.use_not_reasoner_LLM_length;
      keys = useNotReasoner ? config.not_reasoner_LLM_key : config.keys;
      modle = useNotReasoner ? config.not_reasoner_LLM : config.appointModel;
      baseURL = useNotReasoner ? config.not_reasoner_LLM_URL : config.baseURL;
      thinkingType = useNotReasoner ? "disabled" : "enabled";
    }
    const payload = this.createPayload(messages, modle, thinkingType);
    for (let i = 0; i < keys.length; i++) {
      try {
        return await this.tryRequest(baseURL, payload, keys);
      } catch (error) {
        if (i == keys.length - 1) {
          return this.handleAPIError(error);
        }
        this.rotateKey();
      }
    }
  }
  // 发送辅助聊天请求
  // 与 chat() 一致：持“地灵殿通行证”的用户优先使用自己的 key/模型，
  // 这样后台归档、汇总和画像不会消耗机器人的辅助模型额度。
  // 票里的 key 运行失败时降级到默认辅助模型，避免该用户的历史补齐每轮都卡住。
  async auxiliaryChat(messages, user) {
    const userId = user?.userid;
    const ticket = this.ticketAuxiliaryRoute(messages, user);
    if (ticket) {
      const until = userId ? this.ticketFailedUntil.get(userId) : void 0;
      if (until && until > Date.now()) {
        logger3.debug(`用户 ${userId} 的地灵殿通行证处于失败冷却期，辅助请求直接使用默认模型`);
      } else {
        if (until)
          this.ticketFailedUntil.delete(userId);
        const result = await this.requestAuxiliary(ticket, messages, 1);
        if (!result.error)
          return result;
        const status = result.status;
        if (userId && TICKET_FAILURE_COOLDOWN_STATUSES.has(status)) {
          this.ticketFailedUntil.set(userId, Date.now() + TICKET_FAILURE_COOLDOWN_MS);
          if (this.ticketFailedUntil.size > 500)
            this.pruneTicketFailures();
        }
        logger3.warn(`地灵殿通行证辅助请求失败（${result.content}），本次降级到默认辅助模型` + (TICKET_FAILURE_COOLDOWN_STATUSES.has(status) ? "，后续 10 分钟不再尝试该票" : ""));
      }
    }
    return this.requestAuxiliary(this.defaultAuxiliaryRoute(), messages);
  }
  /**
   * 辅助请求的实际发送与重试。
   * 所有失败之间都有 retry_delay_time 的间隔；429/503 按指数退避并带抖动，
   * 有 Retry-After 时优先遵守，避免并发 worker 在同一时刻再次冲击限流接口。
   */
  async requestAuxiliary(route, messages, maxAttempts = Math.max(1, this.config.maxRetryTimes)) {
    const payload = this.createAuxiliaryPayload(messages, route.model);
    const url = `${trimSlash(route.baseURL)}/chat/completions`;
    const headers = this.createHeaders(route.keys);
    const retryDelay = Math.max(0, this.config.retry_delay_time || 5e3);
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 36e5 });
        return { content: response.choices[0].message.content, error: false, status: 0 };
      } catch (error) {
        const status = this.statusOf(error);
        if (i == maxAttempts) {
          return { ...this.handleAPIError(error), status };
        }
        const delay = this.retryDelayFor(status, i, retryDelay, this.retryAfterMs(error));
        logger3.warn(`辅助模型API请求失败(${error})，${Math.round(delay / 1e3 * 10) / 10}秒后重试(第${i}次)...`);
        await new Promise((resolve4) => setTimeout(resolve4, delay));
      }
    }
    return { content: "unreachable", error: true, status: 0 };
  }
  /** 指数退避，最高 30 秒；加 ±20% 抖动，避免多个 worker 同步重试。
   *  服务端给了 Retry-After 就严格按它来，不再打折。 */
  retryDelayFor(status, attempt, base, retryAfter) {
    if (status !== 429 && status !== 503)
      return base;
    if (retryAfter != null)
      return Math.min(retryAfter, MAX_RETRY_AFTER_MS);
    const backoff = Math.min(base * 2 ** (attempt - 1), MAX_RATE_LIMIT_BACKOFF_MS);
    return backoff > 0 ? Math.round(backoff * (0.8 + Math.random() * 0.4)) : 0;
  }
  /** Retry-After 可能是秒数，也可能是 HTTP 日期。 */
  retryAfterMs(error) {
    const headers = error?.response?.headers;
    if (!headers)
      return null;
    const getter = headers;
    const raw = typeof getter.get === "function" ? getter.get("retry-after") : headers["retry-after"];
    if (raw == null)
      return null;
    const text = String(raw).trim();
    if (!text)
      return null;
    const seconds = Number(text);
    if (Number.isFinite(seconds))
      return Math.max(0, seconds * 1e3);
    const date = Date.parse(text);
    if (!Number.isNaN(date))
      return Math.max(0, date - Date.now());
    return null;
  }
  statusOf(error) {
    return error?.response?.status || error?.status || 0;
  }
  pruneTicketFailures() {
    const now = Date.now();
    for (const [userId, until] of this.ticketFailedUntil) {
      if (until <= now)
        this.ticketFailedUntil.delete(userId);
    }
  }
  ticketAuxiliaryRoute(messages, user) {
    const ticket = user?.items?.["地灵殿通行证"];
    if (ticket?.description !== "on")
      return null;
    const metadata = ticket.metadata || {};
    let model = metadata.model;
    const last = messages[messages.length - 1];
    if (metadata.not_reasoner_model && metadata.use_not_reasoner_LLM_length && last && (last.content || "").length <= metadata.use_not_reasoner_LLM_length) {
      model = metadata.not_reasoner_model;
    }
    if (metadata.key && model && metadata.baseURL) {
      return {
        keys: [metadata.key],
        model,
        baseURL: metadata.baseURL
      };
    }
    logger3.warn("地灵殿通行证缺少 key/model/baseURL，辅助请求回退到默认辅助模型");
    return null;
  }
  defaultAuxiliaryRoute() {
    return {
      keys: this.config.auxiliary_LLM_key,
      model: this.config.auxiliary_LLM,
      baseURL: this.config.auxiliary_LLM_URL
    };
  }
  // 发送生成用户画像请求
  async generateUserPortrait(user, messages) {
    if (user.userid == "Alice")
      return { content: "测试画像", error: false };
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description == "on";
    let keys;
    let modle;
    let baseURL;
    if (enableUserKey) {
      const key = user.items["地灵殿通行证"].metadata?.key;
      keys = [key];
      modle = user.items["地灵殿通行证"].metadata?.model;
      baseURL = user.items["地灵殿通行证"].metadata?.baseURL;
    } else {
      keys = this.config.keys;
      modle = this.config.appointModel;
      baseURL = this.config.baseURL;
    }
    const payload = this.createAuxiliaryPayload(messages, modle);
    const url = `${trimSlash(baseURL)}/chat/completions`;
    const headers = this.createHeaders(keys);
    let content;
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 36e5 });
        content = response.choices[0].message.content;
        return { content, error: false };
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error);
        }
        await new Promise((resolve4) => setTimeout(resolve4, this.config.retry_delay_time || 5e3));
        logger3.warn(`生成画像时API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    return { content: "unreachable", error: true };
  }
  // 生成请求体
  createPayload(messages, model, thinkingType = "enabled") {
    return {
      model,
      messages,
      temperature: this.config.temperature,
      top_p: 0.9,
      max_tokens: this.config.max_output_tokens,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty,
      reasoning_effort: "low",
      thinking: {
        type: thinkingType
      }
    };
  }
  // 生成辅助请求体
  createAuxiliaryPayload(messages, model) {
    return {
      model,
      messages,
      temperature: 0.1
    };
  }
  // 尝试请求
  async tryRequest(URL, payload, keys) {
    const url = `${trimSlash(URL)}/chat/completions`;
    const headers = this.createHeaders(keys);
    let content;
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, payload, { headers, timeout: 36e5 });
        logger3.info(`APIID: ${response.id}, 输入token: ${response.usage.prompt_tokens}, 输出token: ${response.usage.completion_tokens}, 总token: ${response.usage.total_tokens}`);
        content = response.choices[0].message.content;
        const reasoning_content = response.choices[0].message.reasoning_content || "无";
        if (this.config.reasoning_content)
          logger3.info(`思维链: ${reasoning_content}`);
        if (!content && reasoning_content) {
          logger3.warn("返回内容为空,但存在推理内容");
        }
        if (reasoning_content != "无" && content && content.length > reasoning_content.length) {
          logger3.warn("返回内容疑似包含推理内容");
        }
        if (response.usage.completion_tokens > this.config.max_output_tokens) {
          logger3.warn("返回内容过长导致被截断");
          continue;
        }
        return { content, error: false, reasoning_content };
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error);
        }
        await new Promise((resolve4) => setTimeout(resolve4, this.config.retry_delay_time || 5e3));
        logger3.warn(`API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    return { content: "请求失败，请重试", error: true };
  }
  // 生成请求头
  createHeaders(keys) {
    return {
      // 持票用户只有一把 key，取模避免沿用多 key 轮换留下的下标
      Authorization: `Bearer ${keys[this.currentKeyIndex % keys.length]}`,
      "Content-Type": "application/json"
    };
  }
  // 处理API错误
  handleAPIError(error) {
    if (!isErrorWithMessage(error))
      throw error;
    const status = error.response?.status || 0;
    const errorCode = error.response?.data?.error?.code || "unknown";
    const message = error.response?.data?.error?.message || error.message;
    logger3.error(`API Error [${status}]: ${errorCode} - ${message}`);
    switch (status) {
      case 400:
        return { content: "请求体格式错误：" + message, error: true };
      case 401:
        return { content: "API key 错误，认证失败：" + message, error: true };
      case 402:
        return { content: "账号余额不足：" + message, error: true };
      case 422:
        return { content: "请求体参数错误：" + message, error: true };
      case 429:
        return { content: "请求速率（TPM 或 RPM）达到上限：" + message, error: true };
      case 500:
        return { content: `api服务器内部故障：` + message, error: true };
      case 503:
        return { content: "api服务器负载过高：" + message, error: true };
      default:
        return { content: message, error: true };
    }
  }
  // 切换API密钥
  rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length;
    logger3.debug(`Switched to API key index: ${this.currentKeyIndex}`);
  }
  // 测试连接
  async testConnection() {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders(this.config.keys) });
      logger3.info("API connection test succeeded");
      return true;
    } catch (error) {
      logger3.warn("API connection test failed");
      return false;
    }
  }
};

// src/memory/index.ts
var import_koishi8 = require("koishi");

// src/memory/retrieval.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "的",
  "一",
  "是",
  "了",
  "什",
  "么",
  "我",
  "谁",
  "不",
  "人",
  "在",
  "他",
  "有",
  "这",
  "个",
  "上",
  "们",
  "来",
  "到",
  "时",
  "大",
  "地",
  "为",
  "子",
  "中",
  "你",
  "说",
  "生",
  "国",
  "年",
  "着",
  "就",
  "那",
  "和",
  "要",
  "她",
  "出",
  "也",
  "得",
  "里",
  "后",
  "自",
  "以",
  "会",
  "啊",
  "吧",
  "吗",
  "呢",
  "呀",
  "哦",
  "嗯",
  "额",
  "哈",
  "呗",
  "啦",
  "嘛",
  "唉",
  "喂",
  "诶",
  "然后",
  "但是",
  "因为",
  "所以",
  "如果",
  "可以",
  "什么",
  "怎么",
  "这样",
  "那样",
  "还是",
  "就是",
  "只是",
  "已经",
  "一下",
  "一个",
  "没有",
  "知道",
  "觉得",
  "可能",
  "应该",
  "现在",
  "时候",
  "自己",
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "这些",
  "那些",
  "真的",
  "不是",
  "的是",
  "了的",
  "我是",
  "你是",
  "他是",
  "她说",
  "reply",
  "system",
  "user",
  "assistant"
]);
function segment(text) {
  if (!text)
    return [];
  const tokens = [];
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(/[a-z0-9_]+/g)) {
    tokens.push(match[0]);
  }
  for (const match of lower.matchAll(/[一-龥]+/g)) {
    const s = match[0];
    for (let i = 0; i < s.length; i++) {
      if (!STOPWORDS.has(s[i]))
        tokens.push(s[i]);
      if (i + 1 < s.length)
        tokens.push(s.slice(i, i + 2));
    }
  }
  return tokens;
}
__name(segment, "segment");
var K1 = 1.5;
var B = 0.75;
var RECENCY_WEIGHT = 0.25;
var BM25_WEIGHT = 0.75;
var DEFAULT_HALFLIFE_DAYS = 30;
var SINGLE_CHAR_WEIGHT = 0.3;
function isSingleChineseChar(token) {
  return token.length === 1 && /[一-龥]/.test(token);
}
__name(isSingleChineseChar, "isSingleChineseChar");
function termWeight(token) {
  return isSingleChineseChar(token) ? SINGLE_CHAR_WEIGHT : 1;
}
__name(termWeight, "termWeight");
function isMeaningful(token) {
  return !isSingleChineseChar(token);
}
__name(isMeaningful, "isMeaningful");
function scoreBM25(query, docs) {
  const scores = /* @__PURE__ */ new Map();
  if (!docs.length)
    return scores;
  const queryTerms = [...new Set(segment(query))];
  if (!queryTerms.length)
    return scores;
  const docTokens = docs.map((doc) => segment(doc.content));
  const docLengths = docTokens.map((tokens) => tokens.length);
  const avgLength = docLengths.reduce((sum, len) => sum + len, 0) / docs.length;
  const documentFrequency = /* @__PURE__ */ new Map();
  for (const tokens of docTokens) {
    const unique = new Set(tokens);
    for (const term of queryTerms) {
      if (unique.has(term))
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const total = docs.length;
  const hasMeaningfulTerm = queryTerms.some(isMeaningful);
  docs.forEach((doc, index) => {
    const termFrequency = /* @__PURE__ */ new Map();
    for (const token of docTokens[index]) {
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
    }
    let score = 0;
    let matchedMeaningful = false;
    for (const term of queryTerms) {
      const tf = termFrequency.get(term) || 0;
      if (!tf)
        continue;
      if (isMeaningful(term))
        matchedMeaningful = true;
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const lengthNorm = avgLength > 0 ? docLengths[index] / avgLength : 0;
      score += termWeight(term) * idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * lengthNorm));
    }
    if (hasMeaningfulTerm && !matchedMeaningful)
      return;
    if (score > 0)
      scores.set(doc.id, score);
  });
  return scores;
}
__name(scoreBM25, "scoreBM25");
function rankDocuments(query, docs, options) {
  if (!docs.length)
    return [];
  const halflife = options?.halflifeDays ?? DEFAULT_HALFLIFE_DAYS;
  const now = options?.now ?? /* @__PURE__ */ new Date();
  const bm25 = scoreBM25(query, docs);
  let maxScore = 0;
  for (const value of bm25.values())
    maxScore = Math.max(maxScore, value);
  if (maxScore <= 0)
    return [];
  const ranked = docs.filter((doc) => bm25.has(doc.id)).map((doc) => {
    const normalized = (bm25.get(doc.id) || 0) / maxScore;
    const recency = computeRecency(doc.timestamp, now, halflife);
    return {
      doc,
      score: BM25_WEIGHT * normalized + RECENCY_WEIGHT * recency
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
__name(rankDocuments, "rankDocuments");
function computeRecency(timestamp, now, halflifeDays) {
  if (!timestamp)
    return 0.5;
  const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (!Number.isFinite(time))
    return 0.5;
  const ageDays = Math.max(0, (now.getTime() - time) / 864e5);
  return Math.pow(0.5, ageDays / halflifeDays);
}
__name(computeRecency, "computeRecency");
function lastBoundary(now, timezoneOffsetHours, boundaryHour) {
  const offsetMs = timezoneOffsetHours * 36e5;
  const shifted = new Date(now.getTime() + offsetMs);
  const boundaryLocal = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    boundaryHour,
    0,
    0,
    0
  );
  const resolved = shifted.getTime() < boundaryLocal ? boundaryLocal - 864e5 : boundaryLocal;
  return new Date(resolved - offsetMs);
}
__name(lastBoundary, "lastBoundary");
function truncate(text, maxChars) {
  if (!text || text.length <= maxChars)
    return text;
  if (maxChars <= 0)
    return "";
  const sliced = text.slice(0, maxChars);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  return lastCode >= 55296 && lastCode <= 56319 ? sliced.slice(0, -1) : sliced;
}
__name(truncate, "truncate");

// src/memory/summarizer.ts
var import_koishi4 = require("koishi");

// src/memory/json.ts
function repairJson(raw) {
  return raw.replace(/```(?:json)?/gi, "").replace(/,\s*([}\]])/g, "$1").trim();
}
__name(repairJson, "repairJson");
function extractJsonObjects(text) {
  const result = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (ch === "\\")
        escaped = true;
      else if (ch === '"')
        inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0)
        start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          result.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return result;
}
__name(extractJsonObjects, "extractJsonObjects");
function parseLlmJson(raw) {
  if (!raw || typeof raw !== "string")
    return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const candidates = [cleaned, ...[...extractJsonObjects(cleaned)].reverse()];
  for (const candidate of candidates) {
    for (const attempt of [candidate, repairJson(candidate)]) {
      if (!attempt)
        continue;
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object")
          return parsed;
      } catch {
      }
    }
  }
  return null;
}
__name(parseLlmJson, "parseLlmJson");

// src/memory/prompts.ts
var LEVEL_LABELS = {
  day: "一天",
  week: "一周",
  month: "一个月",
  season: "一个季度",
  year: "一年"
};
function buildTopicSwitchPrompt(dialogues, topicStart) {
  return [{
    role: "user",
    content: `请判断下面的对话是否已经从当前话题切换到了新的话题。

当前话题开始时间：${topicStart}

最近的对话记录：
${dialogues}

判定标准：
· 如果对话仍在延续同一个话题（包括对同一件事的追问、补充、吐槽），回答“否”。
· 如果已经明显转到不相关的新话题，回答“是”。
· 只回答“是”或“否”，不要输出任何其他内容。`
  }];
}
__name(buildTopicSwitchPrompt, "buildTopicSwitchPrompt");
function buildTopicArchivePrompt(dialogues) {
  return [{
    role: "user",
    content: `请总结以下对话记录，形成一条可长期保存的记忆。

对话记录：
${dialogues}

要求：
· 综合考虑这段记忆未来被调用的场景和目的，无状态地存储信息。
· 把“今天”“明天”“最近”“刚才”等相对时间替换成具体的日期或时间范围。
· summary 简洁但保留关键事实、人物、地点、数字和用户的明确要求。
· user_state 描述此时段用户的处境、作息、情绪或正在做的事；没有相关信息时留空字符串。
· topic 用不超过 12 个字概括这段对话的主题。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"topic": "...", "summary": "...", "user_state": "..."}`
  }];
}
__name(buildTopicArchivePrompt, "buildTopicArchivePrompt");
function buildSummaryPrompt(level, children) {
  const label = LEVEL_LABELS[level] || level;
  return [{
    role: "user",
    content: `请把以下记忆汇总成对${label}的整体总结。

子级记忆：
${children}

要求：
· 无状态地存储信息：把相对时间替换成具体日期或时间范围。
· 优先保留对长期对话有价值的信息：用户的稳定特征、重要事件、明确要求、关系变化。
· 合并重复内容，删除琐碎细节；不要编造子级记忆中不存在的信息。
· user_state 描述这段时间用户整体处于什么状态；没有相关信息时留空字符串。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"summary": "...", "user_state": "..."}`
  }];
}
__name(buildSummaryPrompt, "buildSummaryPrompt");
var CATEGORY_HELP = `类别（category）只能是以下六种之一：
· identity：身份信息（性别、年龄、职业、生日、所在地等）
· preference：喜好
· aversion：厌恶或反感的事物
· requirement：用户对 AI 的长期要求
· habit：习惯（作息、口头禅、说话方式等）
· fact：其他值得长期记住的事实`;
function buildProfilePrompt(existing, input) {
  const existingText = existing.length ? existing.map((entry) => `- [${entry.key}] (${entry.category}, 重要度${entry.importance}) ${entry.content}`).join("\n") : "（暂无）";
  return [{
    role: "user",
    content: `你是一个用户画像整理助手。请根据新材料增量更新用户画像。

${CATEGORY_HELP}

已有画像：
${existingText}

新材料（近期的总结与记忆）：
${input}

要求：
· 只输出增量，不要重复已有条目里已经包含的信息。
· key 使用简短稳定的标识，同一语义必须始终使用同一个 key。
· importance 为 0-50 的整数：越稳定、越重要越高；临时信息给较低分值。
· modified 中的 key 必须已经存在于已有画像或本次 added 中。
· deleted 是要整条删除的条目的 key 字符串数组。要删除某条只能放进 deleted，绝不能通过改写 content 来表达删除或修改意图。
· content 必须是关于用户的陈述性事实，不能是给助手的编辑说明（如“移除某表述”“该项以某条为准”“更新…”）。
· legacy_portrait 是迁移来的旧画像原文，仅用于提取信息：不要修改或缩短它的 content；把其中仍有效的信息拆成独立条目后，用 deleted 删除 "legacy_portrait"。
· 新材料中不确定的信息保留不确定性表述（如“可能”“用户自称”）。
· 用户一定是人类，角色扮演中的设定不要当作事实。
· 没有值得记录的变化时，三个数组都返回空数组。
· 仅输出 JSON，不要包含 markdown 代码块或其他内容：
{"added":[{"key":"...","category":"...","content":"...","importance":20}],"modified":[{"key":"...","content":"...","importance":20}],"deleted":["key"]}`
  }];
}
__name(buildProfilePrompt, "buildProfilePrompt");

// src/memory/summarizer.ts
var logger4 = new import_koishi4.Logger("satori-summary");
var TOPIC_MIN_TURNS = 5;
var TOPIC_MAX_TURNS = 20;
var TOPIC_MAX_AGE_HOURS = 24;
var MAX_ARCHIVE_DIALOGUES = 200;
var MAX_CHILDREN_PER_SUMMARY = 100;
var MAX_LEVEL_NODES_PER_TICK = 10;
var DEFAULT_MAX_CALLS_PER_TICK = 8;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var LEVEL_ORDER = ["day", "week", "month", "season", "year"];
var CHILD_OF = {
  day: "topic",
  week: "day",
  month: "week",
  season: "month",
  year: "season"
};
var DIALOGUE_KINDS = ["turn", "legacy"];
function formatTime(date, timezoneOffsetHours) {
  const shifted = new Date(new Date(date).getTime() + timezoneOffsetHours * 36e5);
  const pad = /* @__PURE__ */ __name((value) => String(value).padStart(2, "0"), "pad");
  return `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}
__name(formatTime, "formatTime");
function dayStart(date, timezoneOffset, boundaryHour) {
  return lastBoundary(date, timezoneOffset, boundaryHour);
}
__name(dayStart, "dayStart");
function nextDayStart(date, timezoneOffset, boundaryHour) {
  return new Date(lastBoundary(date, timezoneOffset, boundaryHour).getTime() + DAY_MS);
}
__name(nextDayStart, "nextDayStart");
function periodStart(level, date, timezoneOffset, boundaryHour) {
  const start = lastBoundary(date, timezoneOffset, boundaryHour);
  if (level === "day")
    return start;
  const offsetMs = timezoneOffset * HOUR_MS;
  const local = new Date(start.getTime() + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  if (level === "week") {
    const back = (local.getUTCDay() + 6) % 7;
    return new Date(start.getTime() - back * DAY_MS);
  }
  if (level === "month") {
    return new Date(Date.UTC(year, month, 1, boundaryHour) - offsetMs);
  }
  if (level === "season") {
    return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1, boundaryHour) - offsetMs);
  }
  return new Date(Date.UTC(year, 0, 1, boundaryHour) - offsetMs);
}
__name(periodStart, "periodStart");
function periodEnd(level, start, timezoneOffset, boundaryHour) {
  if (level === "day")
    return new Date(start.getTime() + DAY_MS);
  if (level === "week")
    return new Date(start.getTime() + 7 * DAY_MS);
  const offsetMs = timezoneOffset * HOUR_MS;
  const local = new Date(start.getTime() + offsetMs);
  let year = local.getUTCFullYear();
  let month = local.getUTCMonth();
  if (level === "month")
    month += 1;
  else if (level === "season")
    month += 3;
  else
    year += 1;
  year += Math.floor(month / 12);
  month = (month % 12 + 12) % 12;
  return new Date(Date.UTC(year, month, 1, boundaryHour) - offsetMs);
}
__name(periodEnd, "periodEnd");
var Summarizer = class {
  constructor(ctx, repo, api, profile, config) {
    this.ctx = ctx;
    this.repo = repo;
    this.api = api;
    this.profile = profile;
    this.config = config;
  }
  static {
    __name(this, "Summarizer");
  }
  /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
  busy = /* @__PURE__ */ new Set();
  get tz() {
    return this.config.timezoneOffset;
  }
  get boundaryHour() {
    return this.config.dayBoundaryHour;
  }
  // ---------- 话题 ----------
  /**
   * 每轮对话后调用：必要时归档当前话题。
   * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
   */
  async maybeSwitchTopic(scopeId) {
    if (!this.config.topicSwitchCheck)
      return;
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId);
      const meta = await this.repo.ensureMeta(scopeId);
      const dialogues = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: DIALOGUE_KINDS,
        // 只需要判断是否达到阈值，不把迁移后的全部历史读进内存
        limit: TOPIC_MAX_TURNS
      });
      if (dialogues.length <= TOPIC_MIN_TURNS)
        return;
      let shouldSwitch = dialogues.length >= TOPIC_MAX_TURNS;
      if (!shouldSwitch) {
        const text = this.formatDialogues(dialogues);
        const result = await this.api.auxiliaryChat(
          buildTopicSwitchPrompt(text, formatTime(meta.topicStart, this.tz)),
          user
        );
        if (result.error)
          return;
        const answer = (result.content || "").replace(/[\s。，,.!！?？]/g, "");
        shouldSwitch = answer.startsWith("是");
      }
      if (shouldSwitch)
        await this.archiveTopicLocked(scopeId, user);
    });
  }
  /**
   * 把游标所在自然日内、尚未归档的对话归档为一条 topic 记忆。
   * 超过 MAX_ARCHIVE_DIALOGUES 时只取前 200 条（同一天拆成多块）。
   * 返回是否真的发起并完成了归档。
   */
  async archiveTopicLocked(scopeId, user) {
    const meta = await this.repo.ensureMeta(scopeId);
    const cursor = new Date(meta.topicStart);
    const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour);
    const dialogues = await this.repo.getDialoguesAfter(scopeId, cursor, {
      kinds: DIALOGUE_KINDS,
      limit: MAX_ARCHIVE_DIALOGUES,
      before: dayEnd
    });
    if (!dialogues.length)
      return false;
    const text = this.formatDialogues(dialogues);
    if (this.config.dryRun) {
      logger4.info(`[dry-run] topic 归档 scope=${scopeId} 对话=${dialogues.length} 字符=${text.length} 日=${formatTime(cursor, this.tz)}`);
      return false;
    }
    const result = await this.api.auxiliaryChat(buildTopicArchivePrompt(text), user);
    if (result.error) {
      logger4.warn(`topic 归档失败 scope=${scopeId}: ${result.content}`);
      return false;
    }
    const parsed = parseLlmJson(result.content);
    const summary = parsed?.summary?.trim();
    if (!summary) {
      logger4.warn(`topic 归档解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`);
      return false;
    }
    const periodStart2 = dialogues[0].createdAt;
    const last = dialogues[dialogues.length - 1];
    let nextCursor = new Date(last.createdAt);
    if (dayEnd.getTime() <= Date.now()) {
      const remaining2 = await this.repo.countDialoguesInRange(
        scopeId,
        nextCursor,
        dayEnd,
        DIALOGUE_KINDS
      );
      if (!remaining2)
        nextCursor = dayEnd;
    }
    await this.repo.commitTopicArchive({
      scopeId,
      granularity: "topic",
      topic: (parsed.topic || "").trim(),
      content: summary,
      userState: (parsed.user_state || "").trim(),
      periodStart: periodStart2,
      periodEnd: last.createdAt,
      sourceCount: dialogues.length,
      createdAt: /* @__PURE__ */ new Date()
    }, scopeId, nextCursor);
    const remaining = await this.repo.countDialoguesAfter(scopeId, nextCursor);
    logger4.info(`topic 归档完成 scope=${scopeId} 对话=${dialogues.length} 日=${formatTime(dayStart(cursor, this.tz, this.boundaryHour), this.tz)}` + (remaining ? ` 剩余${remaining}条待处理` : ""));
    return true;
  }
  /**
   * 按自然日消费积压：每次归档一个日块，直到预算用完。
   * - 全是空白的日期用一次查询跨过去，不逐天循环；
   * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
   * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
   */
  async drainTopics(scopeId, user, budget) {
    if (this.config.dryRun) {
      const meta = await this.repo.ensureMeta(scopeId);
      const [next] = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: DIALOGUE_KINDS,
        limit: 1
      });
      if (next)
        logger4.info(`[dry-run] 将归档 scope=${scopeId} 起点=${formatTime(next.createdAt, this.tz)}`);
      return;
    }
    while (budget.calls > 0) {
      const meta = await this.repo.ensureMeta(scopeId);
      const cursor = new Date(meta.topicStart);
      const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour);
      const [next] = await this.repo.getDialoguesAfter(scopeId, cursor, {
        kinds: DIALOGUE_KINDS,
        limit: 1
      });
      if (!next) {
        const todayStart = dayStart(/* @__PURE__ */ new Date(), this.tz, this.boundaryHour);
        if (todayStart.getTime() > cursor.getTime()) {
          await this.repo.setTopicStart(scopeId, todayStart);
        }
        return;
      }
      const nextDay = dayStart(new Date(next.createdAt), this.tz, this.boundaryHour);
      if (nextDay.getTime() > cursor.getTime()) {
        await this.repo.setTopicStart(scopeId, nextDay);
        continue;
      }
      if (dayEnd.getTime() > Date.now()) {
        const ageHours = (Date.now() - cursor.getTime()) / HOUR_MS;
        if (ageHours < TOPIC_MAX_AGE_HOURS)
          return;
      }
      const archived = await this.archiveTopicLocked(scopeId, user);
      if (!archived)
        return;
      budget.calls -= 1;
    }
  }
  // ---------- 分层汇总 ----------
  async summarizeScope(scopeId) {
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId);
      await this.repo.touchMeta(scopeId);
      const total = Math.max(2, this.config.maxCallsPerTick ?? DEFAULT_MAX_CALLS_PER_TICK);
      const archiveQuota = Math.max(1, Math.floor(total / 2));
      const archiveBudget = { calls: archiveQuota };
      await this.drainTopics(scopeId, user, archiveBudget);
      const levelBudget = {
        calls: Math.max(1, total - (archiveQuota - archiveBudget.calls))
      };
      await this.buildLevels(scopeId, user, levelBudget);
    });
  }
  /**
   * 自下而上补齐已闭合的周期，每个周期最多一条节点。
   *
   * 起算点来自该层最新节点的 periodEnd（没有则取最早子节点所在周期），
   * 因此不会重复生成同一周期；空周期没有子节点，会被自然跳过。
   * 周期末尾晚于归档游标时说明周期内的对话还没归档完，立即停止该层。
   */
  async buildLevels(scopeId, user, budget) {
    const meta = await this.repo.ensureMeta(scopeId);
    const frontier = new Date(meta.topicStart);
    for (const level of LEVEL_ORDER) {
      let nodes = 0;
      let reached = false;
      while (nodes < MAX_LEVEL_NODES_PER_TICK) {
        const parent = await this.repo.getLatestMemory(scopeId, level);
        const from = parent ? new Date(parent.periodEnd) : null;
        const [child] = await this.repo.getMemoriesInRange(
          scopeId,
          CHILD_OF[level],
          from,
          frontier,
          1
        );
        if (!child) {
          reached = true;
          break;
        }
        const start = periodStart(level, new Date(new Date(child.periodEnd).getTime() - 1), this.tz, this.boundaryHour);
        const end = periodEnd(level, start, this.tz, this.boundaryHour);
        if (end.getTime() > frontier.getTime()) {
          reached = true;
          break;
        }
        const children = await this.repo.getMemoriesInRange(
          scopeId,
          CHILD_OF[level],
          start,
          end
        );
        if (!children.length)
          break;
        if (level === "day") {
          const stray = children.find((row) => dayStart(new Date(row.periodStart), this.tz, this.boundaryHour).getTime() !== dayStart(new Date(new Date(row.periodEnd).getTime() - 1), this.tz, this.boundaryHour).getTime());
          if (stray) {
            logger4.warn(`day 汇总暂停：存在跨日 topic 记忆 scope=${scopeId} 记忆区间=${formatTime(stray.periodStart, this.tz)} ~ ${formatTime(stray.periodEnd, this.tz)}`);
            break;
          }
        }
        const range = `${formatTime(start, this.tz)} ~ ${formatTime(end, this.tz)}`;
        const single = children.length === 1;
        if (single) {
          if (this.config.dryRun) {
            logger4.info(`[dry-run] ${level} 晋升 scope=${scopeId} 周期=${range} 子记忆=1`);
            return;
          }
          if (level === "day" && this.profile.isEnabled()) {
            if (budget.calls <= 0)
              return;
            budget.calls -= 1;
            await this.profile.summarize(scopeId, children[0].content, children, user);
          }
          await this.repo.createMemory({
            scopeId,
            granularity: level,
            topic: "",
            content: children[0].content,
            userState: children[0].userState || "",
            periodStart: start,
            periodEnd: end,
            sourceCount: 1,
            createdAt: /* @__PURE__ */ new Date()
          });
          logger4.info(`${level} 晋升 scope=${scopeId} 周期=${range}`);
          nodes += 1;
          continue;
        }
        const need = 1 + (level === "day" && this.profile.isEnabled() ? 1 : 0);
        if (budget.calls < need)
          return;
        const input = children.slice(0, MAX_CHILDREN_PER_SUMMARY);
        if (children.length > MAX_CHILDREN_PER_SUMMARY) {
          logger4.warn(`${level} 子记忆过多，只汇总前 ${MAX_CHILDREN_PER_SUMMARY} 条 scope=${scopeId} 实际=${children.length}`);
        }
        const text = this.formatChildren(input);
        if (this.config.dryRun) {
          logger4.info(`[dry-run] ${level} 汇总 scope=${scopeId} 周期=${range} 子记忆=${children.length}`);
          return;
        }
        const result = await this.api.auxiliaryChat(buildSummaryPrompt(level, text), user);
        budget.calls -= 1;
        if (result.error) {
          logger4.warn(`${level} 汇总失败 scope=${scopeId}: ${result.content}`);
          return;
        }
        const parsed = parseLlmJson(result.content);
        const summary = parsed?.summary?.trim();
        if (!summary) {
          logger4.warn(`${level} 汇总解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`);
          return;
        }
        await this.repo.createMemory({
          scopeId,
          granularity: level,
          topic: "",
          content: summary,
          userState: (parsed.user_state || "").trim(),
          periodStart: start,
          periodEnd: end,
          sourceCount: children.length,
          createdAt: /* @__PURE__ */ new Date()
        });
        logger4.info(`${level} 汇总完成 scope=${scopeId} 周期=${range} 子记忆=${children.length}`);
        nodes += 1;
        if (level === "day" && this.profile.isEnabled()) {
          budget.calls -= 1;
          await this.profile.summarize(scopeId, summary, children, user);
        }
      }
      if (!reached)
        return;
    }
  }
  // ---------- 工具 ----------
  formatDialogues(rows) {
    return rows.map((row) => {
      const time = formatTime(row.createdAt, this.tz);
      const user = row.username || "用户";
      const ai = row.aiContent && row.aiContent !== "…" ? `
AI：${row.aiContent}` : "";
      return `[${time}] ${user}：${row.userContent}${ai}`;
    }).join("\n");
  }
  formatChildren(children) {
    return children.map((child) => {
      const range = `${formatTime(child.periodStart, this.tz)} ~ ${formatTime(child.periodEnd, this.tz)}`;
      const topic = child.topic ? `（${child.topic}）` : "";
      const state = child.userState ? `
用户状态：${child.userState}` : "";
      return `[${range}]${topic} ${child.content}${state}`;
    }).join("\n\n");
  }
  /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
  async lookupUser(scopeId) {
    if (!this.config.resolveUser)
      return null;
    try {
      return await this.config.resolveUser(scopeId);
    } catch (error) {
      logger4.warn(`查询用户失败 scope=${scopeId}: ${error}`);
      return null;
    }
  }
  async runExclusive(scopeId, task) {
    if (this.busy.has(scopeId)) {
      logger4.debug(`scope=${scopeId} 已有汇总任务在运行，跳过本次`);
      return;
    }
    this.busy.add(scopeId);
    try {
      await task();
    } catch (error) {
      logger4.error(`汇总任务失败 scope=${scopeId}: ${error}`);
    } finally {
      this.busy.delete(scopeId);
    }
  }
};

// src/memory/context.ts
var ContextBuilder = class {
  constructor(repo, shortTerm, profile, config) {
    this.repo = repo;
    this.shortTerm = shortTerm;
    this.profile = profile;
    this.config = config;
  }
  static {
    __name(this, "ContextBuilder");
  }
  async build(session, query) {
    const scopeId = this.config.memoryConfig.personal_memory ? session.userId : session.channelId;
    const [common, group, pyramid, recalled, profile] = await Promise.all([
      this.buildKnowledge("common", "*", query, this.config.commonTopN),
      this.buildKnowledge("group", session.channelId, query, this.config.commonTopN),
      this.config.enabled ? this.buildPyramid(scopeId) : Promise.resolve(""),
      this.config.enabled ? this.buildRecall(scopeId, query) : Promise.resolve(""),
      this.profile.getContext(scopeId)
    ]);
    const ambient = this.shortTerm.getChannelDialogue(session, this.config.memoryConfig);
    return this.applyBudget({ common, group, ambient, pyramid, recalled, profile });
  }
  // ---------- 知识 ----------
  async buildKnowledge(kind, targetId, query, topN) {
    const rows = await this.repo.getKnowledge(kind, targetId);
    if (!rows.length) {
      if (kind === "common")
        return this.wrapCommon([]);
      return "";
    }
    const matched = this.pickTop(rows, query, topN);
    if (kind === "common")
      return this.wrapCommon(matched.map((row) => row.content));
    if (!matched.length)
      return "";
    return `以下是本群聊你可能需要知道的信息：{
${matched.map((row) => row.content).join("\n")}
}
`;
  }
  wrapCommon(contents) {
    const time = `时段：${getTimeOfDay((/* @__PURE__ */ new Date()).getHours())}`;
    const date = `当前日期和时间：${(/* @__PURE__ */ new Date()).toLocaleString()} ${time}`;
    if (!contents.length)
      return "这是你可能用到的信息：{\n" + date + "\n}\n";
    return `这是你可能需要知道的信息：{
${contents.join("\n")} 
${date}
}
`;
  }
  pickTop(rows, query, topN) {
    const docs = rows.map((row) => ({
      ...row,
      id: row.id,
      content: row.content
    }));
    const ranked = rankDocuments(query, docs);
    if (ranked.length)
      return ranked.slice(0, topN).map((item) => item.doc);
    return rows.slice(0, topN);
  }
  // ---------- 金字塔 ----------
  async buildPyramid(scopeId) {
    const sections = [];
    const latestTopic = await this.repo.getLatestMemory(scopeId, "topic");
    if (latestTopic) {
      sections.push({
        header: "### 近期话题",
        content: `${latestTopic.topic ? `【${latestTopic.topic}】` : ""}${latestTopic.content}`,
        droppable: false
      });
    }
    const levels = [
      { level: "day", header: "### 近日总结" },
      { level: "week", header: "### 近周总结" },
      { level: "month", header: "### 近月总结" },
      { level: "season", header: "### 近季总结" },
      { level: "year", header: "### 年度总结" }
    ];
    for (const { level, header } of levels) {
      const memory = await this.repo.getLatestMemory(scopeId, level);
      if (!memory)
        continue;
      sections.push({
        header,
        content: memory.content,
        droppable: level !== "day"
      });
    }
    return sections.map((section) => `${section.header}
${section.content}`).join("\n\n");
  }
  // ---------- 召回 ----------
  async buildRecall(scopeId, query) {
    if (!query)
      return "";
    const since = new Date(Date.now() - this.config.retentionDays * 864e5);
    const candidates = await this.repo.getRecallCandidates(scopeId, ["topic", "day"], since);
    if (!candidates.length)
      return "";
    const [latestTopic, latestDay] = await Promise.all([
      this.repo.getLatestMemory(scopeId, "topic"),
      this.repo.getLatestMemory(scopeId, "day")
    ]);
    const excluded = new Set([latestTopic?.id, latestDay?.id].filter(Boolean));
    const docs = candidates.filter((memory) => !excluded.has(memory.id)).map((memory) => ({
      id: memory.id,
      content: memory.content,
      timestamp: new Date(memory.periodEnd),
      memory
    }));
    const ranked = rankDocuments(query, docs).slice(0, this.config.recallTopN);
    if (!ranked.length)
      return "";
    const lines = ranked.map(({ doc }) => {
      const time = formatTime(doc.memory.periodStart, this.config.timezoneOffset);
      return `[${time}] ${doc.content}`;
    });
    return `以下是较久之前用户说过的话和对话时间：{
${lines.join("\n")}
}
`;
  }
  // ---------- 预算 ----------
  /**
   * 超出预算时按“越近越优先”的顺序削减：
   * 年度 → 近季 → 近月 → 召回 → 近周 → 近日 → 近期话题。
   * 常识、群常识、群聊环境与画像保持完整（它们通常很短且高频有用）。
   */
  applyBudget(context) {
    const max = this.config.contextMaxChars;
    if (max <= 0)
      return context;
    const total = /* @__PURE__ */ __name(() => context.common.length + context.group.length + context.ambient.length + context.pyramid.length + context.recalled.length + context.profile.length, "total");
    if (total() <= max)
      return context;
    context.recalled = "";
    if (total() <= max)
      return context;
    const dropOrder = ["### 年度总结", "### 近季总结", "### 近月总结", "### 近周总结", "### 近日总结"];
    let sections = context.pyramid.split("\n\n");
    for (const header of dropOrder) {
      const index = sections.findIndex((section) => section.startsWith(header));
      if (index >= 0)
        sections.splice(index, 1);
      context.pyramid = sections.join("\n\n");
      if (total() <= max)
        return context;
    }
    const otherLength = /* @__PURE__ */ __name(() => context.common.length + context.group.length + context.ambient.length + context.recalled.length + context.profile.length, "otherLength");
    const allowed = Math.max(0, max - otherLength());
    context.pyramid = truncate(context.pyramid, allowed);
    return context;
  }
};

// src/memory/heartbeat.ts
var import_koishi5 = require("koishi");
var logger5 = new import_koishi5.Logger("satori-heartbeat");
var Heartbeat = class {
  constructor(ctx, repo, summarizer, config) {
    this.ctx = ctx;
    this.repo = repo;
    this.summarizer = summarizer;
    this.config = config;
  }
  static {
    __name(this, "Heartbeat");
  }
  running = false;
  cursor = 0;
  disposers = [];
  start() {
    const interval = Math.max(1, this.config.intervalMinutes) * 6e4;
    this.disposers.push(this.ctx.setTimeout(() => void this.tick(), 3e4));
    this.disposers.push(this.ctx.setInterval(() => void this.tick(), interval));
    logger5.info(`分层记忆心跳已启动：每 ${this.config.intervalMinutes} 分钟，每次最多 ${this.config.maxScopesPerTick} 个 scope，并发 ${this.config.concurrency}`);
  }
  stop() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
      }
    }
    this.disposers = [];
  }
  async tick() {
    if (this.running) {
      logger5.debug("上一次心跳尚未结束，跳过本次");
      return;
    }
    this.running = true;
    try {
      const since = new Date(Date.now() - this.config.activeWindowDays * 864e5);
      const candidates = await this.repo.getActiveMetas(since, this.config.maxScopesPerTick * 3);
      if (candidates.length) {
        const start = this.cursor % candidates.length;
        const ordered = [...candidates.slice(start), ...candidates.slice(0, start)];
        const batch = ordered.slice(0, this.config.maxScopesPerTick);
        this.cursor = (start + batch.length) % candidates.length;
        await this.runBatch(batch);
      }
      const before = new Date(Date.now() - this.config.retentionDays * 864e5);
      const pruned = await this.repo.pruneDialogues(before);
      if (pruned)
        logger5.info(`已清理 ${pruned} 条超过 ${this.config.retentionDays} 天的对话`);
    } catch (error) {
      logger5.error(`心跳执行失败：${error}`);
    } finally {
      this.running = false;
    }
  }
  /**
   * 以固定并发消费 batch。每个 scope 内部仍是一条串行链路：
   * 归档必须按游标顺序推进，层级也依赖上一层结果，不能并发。
   * 并发只发生在 scope 之间，可以安全地放大到 10 倍左右。
   */
  async runBatch(batch) {
    const limit = Math.max(1, Math.min(this.config.concurrency, batch.length));
    let next = 0;
    let failed = 0;
    await Promise.all(Array.from({ length: limit }, async () => {
      while (next < batch.length) {
        const meta = batch[next++];
        try {
          await this.summarizer.summarizeScope(meta.scopeId);
        } catch (error) {
          failed++;
          logger5.error(`scope=${meta.scopeId} 汇总失败：${error}`);
        }
      }
    }));
    if (failed)
      logger5.warn(`本轮有 ${failed} 个 scope 汇总失败，将在后续心跳重试`);
  }
};

// src/memory/migrate.ts
var import_koishi6 = require("koishi");
var import_fs = require("fs");
var path3 = __toESM(require("path"));

// src/memory/schema.ts
var GLOBAL_SCOPE = "__global__";
var extendedContexts = /* @__PURE__ */ new WeakSet();
function extendMemoryDatabase(ctx) {
  if (extendedContexts.has(ctx))
    return;
  extendedContexts.add(ctx);
  ctx.model.extend("sat_dialogue", {
    id: "unsigned",
    scopeId: "string",
    userId: "string",
    username: "string",
    kind: "string",
    userContent: "text",
    aiContent: "text",
    createdAt: "timestamp"
  }, {
    autoInc: true,
    indexes: [["scopeId", "createdAt"], ["scopeId", "kind"]]
  });
  ctx.model.extend("sat_memory", {
    id: "unsigned",
    scopeId: "string",
    granularity: "string",
    topic: "string",
    content: "text",
    userState: "text",
    periodStart: "timestamp",
    periodEnd: "timestamp",
    sourceCount: "integer",
    createdAt: "timestamp"
  }, {
    autoInc: true,
    indexes: [["scopeId", "granularity", "periodEnd"]]
  });
  ctx.model.extend("sat_knowledge", {
    id: "unsigned",
    kind: "string",
    targetId: "string",
    content: "text",
    createdAt: "timestamp"
  }, {
    autoInc: true,
    indexes: [["kind", "targetId"]]
  });
  ctx.model.extend("sat_profile", {
    id: "unsigned",
    scopeId: "string",
    data: "json",
    updatedAt: "timestamp"
  }, {
    autoInc: true,
    unique: [["scopeId"]]
  });
  ctx.model.extend("sat_meta", {
    id: "unsigned",
    scopeId: "string",
    topicStart: "timestamp",
    lastActiveAt: "timestamp",
    migratedAt: "timestamp"
  }, {
    autoInc: true,
    unique: [["scopeId"]]
  });
}
__name(extendMemoryDatabase, "extendMemoryDatabase");

// src/memory/migrate.ts
var logger6 = new import_koishi6.Logger("satori-migrate");
var CN_TIME = /对话日期和时间：\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/;
var US_TIME = /对话日期和时间：\s*(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i;
var Migrator = class {
  constructor(ctx, repo, dataDir, personalMemory, timezoneOffset = 8) {
    this.ctx = ctx;
    this.repo = repo;
    this.dataDir = dataDir;
    this.personalMemory = personalMemory;
    this.timezoneOffset = timezoneOffset;
  }
  static {
    __name(this, "Migrator");
  }
  async migrate(force = false) {
    const result = {
      dialogues: 0,
      skippedDialogues: 0,
      skippedUndated: 0,
      duplicates: 0,
      portraits: 0,
      knowledge: 0
    };
    const migratedAt = await this.getMigratedAt();
    if (!force && migratedAt.getTime() > 0) {
      logger6.info(`记忆迁移已于 ${migratedAt.toLocaleString()} 完成，跳过（可用 force 重跑）`);
      return result;
    }
    await this.ctx.database.remove("sat_dialogue", { kind: "legacy" });
    await this.migrateDialogues(result);
    await this.migratePortraits(result);
    await this.migrateKnowledge(result);
    await this.repo.setMigratedAt(GLOBAL_SCOPE, /* @__PURE__ */ new Date());
    logger6.info(`记忆迁移完成：对话 ${result.dialogues} 条，跳过 ${result.skippedDialogues} 条（其中无时间 ${result.skippedUndated} 条），重复 ${result.duplicates} 条，画像 ${result.portraits} 份，知识 ${result.knowledge} 条`);
    if (result.skippedUndated) {
      logger6.warn(`有 ${result.skippedUndated} 条历史对话的 role 是 "user"、没有记录时间，无法归入任何日期，已跳过（原文件未改动）`);
    }
    return result;
  }
  async getMigratedAt() {
    const meta = await this.repo.getMeta(GLOBAL_SCOPE);
    return meta?.migratedAt ? new Date(meta.migratedAt) : /* @__PURE__ */ new Date(0);
  }
  // ---------- 对话 ----------
  async migrateDialogues(result) {
    const dir = path3.join(this.dataDir, "dialogues");
    const files = await this.listFiles(dir, ".txt");
    if (!files.length)
      return;
    if (!this.personalMemory) {
      logger6.warn("检测到 personal_memory=false：历史对话无法反推 channelId，将统一按 userId 导入");
    }
    for (const file of files) {
      const userId = path3.basename(file, ".txt");
      const entries = await this.readJsonArray(file);
      const range = await this.insertLegacyDialogues(userId, entries, result);
      if (range) {
        const meta = await this.repo.ensureMeta(userId, range.earliest);
        if (!await this.repo.hasAnyMemory(userId)) {
          const current = new Date(meta.topicStart);
          if (range.earliest < current)
            await this.repo.setTopicStart(userId, range.earliest);
        }
        await this.repo.touchMetaIfNewer(userId, range.latest);
      }
    }
  }
  async insertLegacyDialogues(userId, entries, result) {
    let earliest = null;
    let latest = null;
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (!entry?.content || typeof entry.content !== "string") {
        result.skippedDialogues++;
        continue;
      }
      const createdAt = this.parseLegacyTime(entry.role);
      if (!createdAt) {
        if (entry.role === "user")
          result.skippedUndated++;
        else
          result.skippedDialogues++;
        continue;
      }
      const key = `${entry.role}\0${entry.content}`;
      if (seen.has(key)) {
        result.duplicates++;
        continue;
      }
      seen.add(key);
      rows.push({
        scopeId: userId,
        userId,
        username: "",
        kind: "legacy",
        userContent: entry.content,
        aiContent: "",
        createdAt
      });
      if (!earliest || createdAt < earliest)
        earliest = createdAt;
      if (!latest || createdAt > latest)
        latest = createdAt;
    }
    await this.repo.createDialogueBatch(rows);
    result.dialogues += rows.length;
    return earliest && latest ? { earliest, latest } : null;
  }
  /**
   * 旧时间由 `new Date().toLocaleString()` 在服务器的 locale 时区写出，
   * 实测服务器为 Asia/Shanghai。这里把“墙上时间”换算成真实 UTC。
   */
  parseLegacyTime(role) {
    if (typeof role !== "string")
      return null;
    let match = CN_TIME.exec(role);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return this.toUtc(year, month, day, hour, minute, second);
    }
    match = US_TIME.exec(role);
    if (match) {
      const [, month, day, year, hour, minute, second, meridiem] = match;
      let hours = Number(hour);
      const pm = meridiem.toUpperCase() === "PM";
      if (pm && hours !== 12)
        hours += 12;
      if (!pm && hours === 12)
        hours = 0;
      return this.toUtc(year, month, day, String(hours), minute, second);
    }
    return null;
  }
  toUtc(year, month, day, hour, minute, second) {
    const wallClock = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    const date = new Date(wallClock - this.timezoneOffset * 36e5);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // ---------- 画像 ----------
  async migratePortraits(result) {
    const dir = path3.join(this.dataDir, "UserPortrait");
    const files = await this.listFiles(dir, ".txt");
    for (const file of files) {
      const userId = path3.basename(file, ".txt");
      const content = await this.readText(file);
      if (!content.trim())
        continue;
      if (await this.repo.getProfile(userId))
        continue;
      await this.repo.saveProfile(userId, {
        entries: [{
          key: "legacy_portrait",
          category: "fact",
          content: content.trim(),
          importance: 30,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }],
        lastSummarizedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      result.portraits++;
    }
  }
  // ---------- 知识 ----------
  async migrateKnowledge(result) {
    const commonFile = path3.join(this.dataDir, "common_sense.txt");
    const common = await this.readJsonArray(commonFile);
    for (const entry of common) {
      if (!entry?.content)
        continue;
      if (await this.repo.addKnowledgeIfAbsent("common", "*", entry.content))
        result.knowledge++;
    }
    const groupDir = path3.join(this.dataDir, "group_sense");
    for (const file of await this.listFiles(groupDir, ".txt")) {
      const channelId = path3.basename(file, ".txt");
      const entries = await this.readJsonArray(file);
      for (const entry of entries) {
        if (!entry?.content)
          continue;
        if (await this.repo.addKnowledgeIfAbsent("group", channelId, entry.content))
          result.knowledge++;
      }
    }
  }
  // ---------- IO ----------
  async listFiles(dir, suffix) {
    try {
      const names = await import_fs.promises.readdir(dir);
      return names.filter((name) => name.endsWith(suffix)).map((name) => path3.join(dir, name));
    } catch {
      return [];
    }
  }
  async readText(file) {
    try {
      return await import_fs.promises.readFile(file, "utf-8");
    } catch {
      return "";
    }
  }
  async readJsonArray(file) {
    try {
      const raw = await import_fs.promises.readFile(file, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

// src/memory/profile.ts
var import_koishi7 = require("koishi");

// src/memory/delta.ts
function clampImportance(value, fallback = 10) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return fallback;
  return Math.max(0, Math.min(50, Math.round(value)));
}
__name(clampImportance, "clampImportance");
var PROTECTED_PROFILE_KEYS = /* @__PURE__ */ new Set(["legacy_portrait"]);
var EDIT_INSTRUCTION_RE = /^(?:请\s*)?(?:(?:移除|删除|删掉|去掉|修改|更正|更新|替换|改为)|将[^。]{0,20}(?:改为|删除|移除|去掉|替换))/;
var EDIT_NOTE_RE = /(?:该项|该条|此项|此条)[^。]{0,20}(?:为准|删除|移除)|以\s*["“']?[A-Za-z][\w-]*["”']?\s*为准/;
function looksLikeEditInstruction(content) {
  const text = (content || "").trim();
  if (!text)
    return false;
  return EDIT_INSTRUCTION_RE.test(text) || EDIT_NOTE_RE.test(text);
}
__name(looksLikeEditInstruction, "looksLikeEditInstruction");
function sanitizeProfileDelta(delta) {
  const rejected = [];
  const filter = /* @__PURE__ */ __name((items, kind) => (items || []).filter((item) => {
    if (!item?.key)
      return true;
    if (PROTECTED_PROFILE_KEYS.has(item.key)) {
      rejected.push(`${item.key}(${kind}:protected)`);
      return false;
    }
    if (looksLikeEditInstruction(item.content)) {
      rejected.push(`${item.key}(${kind}:instruction)`);
      return false;
    }
    return true;
  }), "filter");
  const deleted = [];
  for (const item of delta.deleted || []) {
    const key = typeof item === "string" ? item : item?.key ?? item?.title;
    if (typeof key === "string" && key.trim())
      deleted.push(key.trim());
  }
  return {
    delta: {
      added: filter(delta.added, "added"),
      modified: filter(delta.modified, "modified"),
      deleted
    },
    rejected
  };
}
__name(sanitizeProfileDelta, "sanitizeProfileDelta");
function applyProfileDelta(entries, delta, now, maxEntries) {
  const merged = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry?.key)
      merged.set(entry.key, { ...entry });
  }
  const incoming = /* @__PURE__ */ new Map();
  for (const item of delta.added || []) {
    if (!item?.key || !item?.content)
      continue;
    incoming.set(item.key, {
      key: item.key,
      category: item.category || "fact",
      content: item.content,
      importance: clampImportance(item.importance),
      updatedAt: now
    });
  }
  for (const item of delta.modified || []) {
    if (!item?.key)
      continue;
    const base = incoming.get(item.key) || merged.get(item.key);
    if (!base && !item.content)
      continue;
    incoming.set(item.key, {
      key: item.key,
      category: item.category || base?.category || "fact",
      content: item.content ?? base?.content ?? "",
      importance: clampImportance(item.importance, base?.importance ?? 10),
      updatedAt: now
    });
  }
  for (const key of delta.deleted || []) {
    if (!key)
      continue;
    merged.delete(key);
    incoming.delete(key);
  }
  for (const [key, entry] of incoming) {
    if (entry.content)
      merged.set(key, entry);
  }
  const result = [...merged.values()];
  result.sort(
    (a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key)
  );
  return result.slice(0, Math.max(0, maxEntries));
}
__name(applyProfileDelta, "applyProfileDelta");

// src/memory/profile.ts
var logger7 = new import_koishi7.Logger("satori-profile");
var CATEGORY_LABELS = {
  identity: "身份信息",
  preference: "喜好",
  aversion: "厌恶",
  requirement: "长期要求",
  habit: "习惯",
  fact: "其他"
};
var CATEGORY_ORDER = ["identity", "preference", "aversion", "requirement", "habit", "fact"];
var ProfileManager = class {
  constructor(ctx, repo, api, config) {
    this.ctx = ctx;
    this.repo = repo;
    this.api = api;
    this.config = config;
  }
  static {
    __name(this, "ProfileManager");
  }
  isEnabled() {
    return this.config.enabled;
  }
  /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致） */
  async summarize(scopeId, summary, memories, user = null) {
    if (!this.config.enabled)
      return;
    if (!summary && !memories.length)
      return;
    if (this.config.dryRun) {
      logger7.info(`[dry-run] 画像更新跳过 scope=${scopeId} 输入长度=${summary.length + memories.length}`);
      return;
    }
    const profile = await this.repo.getProfile(scopeId);
    const entries = profile?.data?.entries || [];
    const input = [
      summary ? `【总结】
${summary}` : "",
      ...memories.map((memory) => `【记忆】${memory.content}${memory.userState ? `（用户状态：${memory.userState}）` : ""}`)
    ].filter(Boolean).join("\n\n");
    if (!input)
      return;
    const result = await this.api.auxiliaryChat(buildProfilePrompt(entries, input), user);
    if (result.error) {
      logger7.warn(`画像更新失败 scope=${scopeId}: ${result.content}`);
      return;
    }
    const delta = parseLlmJson(result.content);
    if (!delta) {
      logger7.warn(`画像 delta 解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`);
      return;
    }
    const { delta: cleanDelta, rejected } = sanitizeProfileDelta(delta);
    if (rejected.length) {
      logger7.warn(`画像 delta 丢弃无效条目 scope=${scopeId}: ${rejected.join(", ")}`);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const next = applyProfileDelta(entries, cleanDelta, now, this.config.maxEntries);
    const data = { entries: next, lastSummarizedAt: now };
    await this.repo.saveProfile(scopeId, data);
    const added = (cleanDelta.added || []).length;
    const modified = (cleanDelta.modified || []).length;
    const deleted = (cleanDelta.deleted || []).length;
    logger7.info(`画像已更新 scope=${scopeId} (+${added} ~${modified} -${deleted}, 共 ${next.length} 条)`);
  }
  async getContext(scopeId) {
    if (!this.config.enabled)
      return "";
    const profile = await this.repo.getProfile(scopeId);
    const entries = profile?.data?.entries || [];
    if (!entries.length)
      return "";
    const selected = [...entries].sort((a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.config.contextEntries);
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of selected) {
      const category = CATEGORY_LABELS[entry.category] ? entry.category : "fact";
      const list = grouped.get(category) || [];
      list.push(entry.content);
      grouped.set(category, list);
    }
    const lines = [];
    for (const category of CATEGORY_ORDER) {
      const list = grouped.get(category);
      if (!list?.length)
        continue;
      lines.push(`${CATEGORY_LABELS[category]}：`);
      for (const content of list)
        lines.push(`· ${content}`);
    }
    return `以下是当前用户的补充信息：{
${lines.join("\n")}
}
`;
  }
  async has(scopeId) {
    const profile = await this.repo.getProfile(scopeId);
    return !!profile?.data?.entries?.length;
  }
  async formatById(scopeId) {
    if (!this.config.enabled)
      return "当前未启用用户画像功能";
    const profile = await this.repo.getProfile(scopeId);
    const entries = profile?.data?.entries || [];
    if (!entries.length)
      return `用户${scopeId}没有画像`;
    const lines = entries.map((entry) => `- [${CATEGORY_LABELS[entry.category] || entry.category}] ${entry.content}`);
    return `以下是用户${scopeId}的画像：{
${lines.join("\n")}
}`;
  }
};

// src/memory/repository.ts
var MemoryRepository = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  static {
    __name(this, "MemoryRepository");
  }
  // ---------- 原始对话 ----------
  async createDialogue(row) {
    await this.ctx.database.create("sat_dialogue", row);
  }
  /**
   * 批量写入对话。minato 的 create 只接受单行，这里包在一个事务里，
   * 避免 10 万级迁移数据每行一个隐式事务。
   */
  async createDialogueBatch(rows) {
    if (!rows.length)
      return;
    await this.ctx.database.transact(async (db) => {
      for (const row of rows)
        await db.create("sat_dialogue", row);
    });
  }
  async getDialoguesAfter(scopeId, after, options) {
    const createdAt = { $gt: after };
    if (options?.before)
      createdAt.$lt = options.before;
    const query = { scopeId, createdAt };
    if (options?.kinds?.length)
      query.kind = { $in: options.kinds };
    return this.ctx.database.get("sat_dialogue", query, {
      sort: { createdAt: "asc" },
      limit: options?.limit
    });
  }
  async countDialoguesAfter(scopeId, after, kinds) {
    const query = { scopeId, createdAt: { $gt: after } };
    if (kinds?.length)
      query.kind = { $in: kinds };
    const rows = await this.ctx.database.get("sat_dialogue", query, { fields: ["id"] });
    return rows.length;
  }
  /** after < createdAt < before 的对话数，用于判断一个已关闭的日块是否归档干净 */
  async countDialoguesInRange(scopeId, after, before, kinds) {
    const query = { scopeId, createdAt: { $gt: after, $lt: before } };
    if (kinds?.length)
      query.kind = { $in: kinds };
    const rows = await this.ctx.database.get("sat_dialogue", query, { fields: ["id"] });
    return rows.length;
  }
  async countDialogues(scopeId) {
    const rows = await this.ctx.database.get("sat_dialogue", { scopeId }, { fields: ["id"] });
    return rows.length;
  }
  /** 只清理普通对话，legacy 迁移数据保留（一次性数据，量有界） */
  async pruneDialogues(before) {
    const rows = await this.ctx.database.get("sat_dialogue", {
      kind: { $in: ["turn", "ambient"] },
      createdAt: { $lt: before }
    });
    if (!rows.length)
      return 0;
    await this.ctx.database.remove("sat_dialogue", { id: { $in: rows.map((row) => row.id) } });
    return rows.length;
  }
  // ---------- meta ----------
  async getMeta(scopeId) {
    const rows = await this.ctx.database.get("sat_meta", { scopeId }, { limit: 1 });
    return rows[0] || null;
  }
  async ensureMeta(scopeId, at = /* @__PURE__ */ new Date()) {
    const existing = await this.getMeta(scopeId);
    if (existing)
      return existing;
    try {
      await this.ctx.database.create("sat_meta", {
        scopeId,
        topicStart: at,
        lastActiveAt: at,
        migratedAt: /* @__PURE__ */ new Date(0)
      });
    } catch {
    }
    return await this.getMeta(scopeId) || {
      id: 0,
      scopeId,
      topicStart: at,
      lastActiveAt: at,
      migratedAt: /* @__PURE__ */ new Date(0)
    };
  }
  async touchMeta(scopeId, at = /* @__PURE__ */ new Date()) {
    await this.ensureMeta(scopeId, at);
    await this.ctx.database.set("sat_meta", { scopeId }, { lastActiveAt: at });
  }
  /**
   * 只在更晚时才更新 lastActiveAt。迁移会拿旧对话的时间回填这个字段，
   * 不能让历史时间把「最近活跃」往回拨、把 scope 挤出活跃窗口。
   */
  async touchMetaIfNewer(scopeId, at) {
    const meta = await this.ensureMeta(scopeId, at);
    if (new Date(meta.lastActiveAt).getTime() >= at.getTime())
      return;
    await this.ctx.database.set("sat_meta", { scopeId }, { lastActiveAt: at });
  }
  /**
   * 只推进归档游标，不动 lastActiveAt。
   * 游标是历史时间（本批对话的末尾），写进 lastActiveAt 会让 scope 归档完
   * 立刻掉出活跃窗口，只能等用户再开口才会被心跳重新选中——历史积压就永远
   * 只能一条消息推一批。
   */
  async setTopicStart(scopeId, at) {
    await this.ensureMeta(scopeId, at);
    await this.ctx.database.set("sat_meta", { scopeId }, { topicStart: at });
  }
  async setMigratedAt(scopeId, at) {
    await this.ensureMeta(scopeId, at);
    await this.ctx.database.set("sat_meta", { scopeId }, { migratedAt: at });
  }
  /**
   * 活跃 scope：最近活跃时间不早于 since。
   * `__global__` 只用来记迁移时间，不是对话作用域——它有 meta 但没有对话，
   * 会被心跳当成候选白占一个处理名额（它的 lastActiveAt 每次都被刷新，永远排在前面）。
   */
  async getActiveMetas(since, limit) {
    return this.ctx.database.get("sat_meta", {
      lastActiveAt: { $gte: since },
      scopeId: { $ne: GLOBAL_SCOPE }
    }, {
      sort: { lastActiveAt: "desc" },
      limit
    });
  }
  // ---------- 分层记忆 ----------
  /** 某粒度的最新一条（按 periodEnd 排序，服务端 LIMIT 1，等价于 MAX(periodEnd)） */
  async getLatestMemory(scopeId, granularity) {
    const rows = await this.ctx.database.get("sat_memory", { scopeId, granularity }, {
      sort: { periodEnd: "desc" },
      limit: 1
    });
    return rows[0] || null;
  }
  /** 子粒度的最早起点（服务端 ORDER BY periodStart ASC LIMIT 1，等价于 MIN(periodStart)） */
  async getEarliestChildStart(scopeId, granularity) {
    const rows = await this.ctx.database.get("sat_memory", { scopeId, granularity }, {
      sort: { periodStart: "asc" },
      limit: 1
    });
    return rows[0]?.periodStart || null;
  }
  /** 区间查询：from < periodEnd <= to，走真正的 SQL 条件而不是 JS 侧过滤 */
  async getMemoriesInRange(scopeId, granularity, from, to, limit) {
    const periodEnd2 = { $lte: to };
    if (from)
      periodEnd2.$gt = from;
    return this.ctx.database.get("sat_memory", { scopeId, granularity, periodEnd: periodEnd2 }, {
      sort: { periodEnd: "asc" },
      limit
    });
  }
  async createMemory(row) {
    await this.ctx.database.create("sat_memory", row);
  }
  /** 该 scope 是否已经产过分层记忆（用于判断迁移是否第一次跑） */
  async hasAnyMemory(scopeId) {
    const rows = await this.ctx.database.get("sat_memory", { scopeId }, { fields: ["id"], limit: 1 });
    return !!rows.length;
  }
  /**
   * 归档结果与游标推进必须一起生效。分成两次写的话，进程在中间被中断
   * （重启 / 崩溃）会留下没推进的游标，下一轮把同一批对话再归档一次。
   */
  async commitTopicArchive(memory, scopeId, topicStart) {
    await this.ctx.database.transact(async (db) => {
      await db.create("sat_memory", memory);
      await db.set("sat_meta", { scopeId }, { topicStart });
    });
  }
  async getRecallCandidates(scopeId, granularities, since) {
    return this.ctx.database.get("sat_memory", {
      scopeId,
      granularity: { $in: granularities },
      periodEnd: { $gte: since }
    }, {
      sort: { periodEnd: "desc" }
    });
  }
  async listMemories(scopeId, limit = 50) {
    return this.ctx.database.get("sat_memory", { scopeId }, {
      sort: { periodEnd: "desc" },
      limit
    });
  }
  async clearScope(scopeId) {
    await this.ctx.database.remove("sat_dialogue", { scopeId });
    await this.ctx.database.remove("sat_memory", { scopeId });
    await this.ctx.database.remove("sat_profile", { scopeId });
    await this.ctx.database.remove("sat_meta", { scopeId });
  }
  async clearAll() {
    await this.ctx.database.remove("sat_dialogue", {});
    await this.ctx.database.remove("sat_memory", {});
    await this.ctx.database.remove("sat_profile", {});
    await this.ctx.database.remove("sat_meta", {});
  }
  // ---------- 知识 ----------
  async getKnowledge(kind, targetId) {
    return this.ctx.database.get("sat_knowledge", { kind, targetId }, {
      sort: { createdAt: "asc" }
    });
  }
  async addKnowledge(kind, targetId, content) {
    await this.ctx.database.create("sat_knowledge", {
      kind,
      targetId,
      content,
      createdAt: /* @__PURE__ */ new Date()
    });
  }
  /** 幂等添加：内容完全相同则跳过 */
  async addKnowledgeIfAbsent(kind, targetId, content) {
    const existing = await this.getKnowledge(kind, targetId);
    if (existing.some((row) => row.content === content))
      return false;
    await this.addKnowledge(kind, targetId, content);
    return true;
  }
  // ---------- 画像 ----------
  async getProfile(scopeId) {
    const rows = await this.ctx.database.get("sat_profile", { scopeId }, { limit: 1 });
    return rows[0] || null;
  }
  async saveProfile(scopeId, data) {
    const now = /* @__PURE__ */ new Date();
    const existing = await this.getProfile(scopeId);
    if (existing) {
      await this.ctx.database.set("sat_profile", { scopeId }, { data, updatedAt: now });
    } else {
      await this.ctx.database.create("sat_profile", { scopeId, data, updatedAt: now });
    }
  }
};

// src/memory/short-term.ts
var ShortTermMemory = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  static {
    __name(this, "ShortTermMemory");
  }
  channelMemories = /* @__PURE__ */ new Map();
  channelDialogues = /* @__PURE__ */ new Map();
  // ---------- 过滤 ----------
  bracketFilter(content, config) {
    if (!config.bracket_filter)
      return content;
    let filtered = content.replace(/["'‘“]|[’”'"]/g, "");
    let previous;
    do {
      previous = filtered;
      filtered = filtered.replace(/[（({\[][^（）\]})]*[）)\]\}]/g, "");
    } while (filtered !== previous);
    return filtered.trim() || content.replace(/[（({\[]|[）)\]\}]/g, "");
  }
  memoryFilter(content, config) {
    if (!config.memory_filter)
      return content;
    const filterWords = config.memory_filter.split("-").map((word) => word.trim()).filter((word) => word.length > 0);
    if (!filterWords.length)
      return content;
    const sentenceSplitRegex = /([。！？；!?;…]|\.{3})/g;
    const sentences = content.split(sentenceSplitRegex).reduce((acc, cur, i, arr) => {
      if (i % 2 === 0)
        acc.push(cur + (arr[i + 1] || ""));
      return acc;
    }, []);
    const filtered = sentences.filter((sentence) => !filterWords.some((word) => sentence.includes(word))).join("");
    const result = filtered.replace(/([，、…])\1+/g, "$1").replace(/^[，。！？;,.!?]+/, "").trim();
    return result || content;
  }
  // ---------- 写入 ----------
  /** 记录一轮用户↔bot 对话到短期记忆 */
  updateChannelMemory(session, prompt, config, response, scopeId) {
    if (response) {
      response = this.bracketFilter(response, config);
      response = this.memoryFilter(response, config);
    }
    if (!response)
      response = "…";
    const channelId = scopeId || (config.personal_memory ? session.userId : session.channelId);
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, { dialogues: [], updatedAt: Date.now() });
    }
    const memory = this.channelMemories.get(channelId);
    memory.dialogues.push({ role: "user", content: prompt });
    this.updateChannelDialogue(session, prompt, session.username, config);
    if (config.enhanceReasoningProtection) {
      memory.dialogues.push({
        role: "assistant",
        content: "<p>" + (config.enable_self_memory ? response : "…") + "</p>"
      });
    } else {
      memory.dialogues.push({
        role: "assistant",
        content: config.enable_self_memory ? response : "…"
      });
    }
    if (memory.dialogues.length > config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-config.message_max_length);
    }
  }
  /** 记录一条群聊环境发言（含不对 bot 说的） */
  updateChannelDialogue(session, prompt, name, config) {
    if (!config.channel_dialogues)
      return;
    const list = this.channelDialogues.get(session.channelId) || [];
    list.push('"' + name + '" 说: ' + prompt);
    this.channelDialogues.set(
      session.channelId,
      list.length > config.channel_dialogues_max_length ? list.slice(-config.channel_dialogues_max_length) : list
    );
  }
  // ---------- 读取 ----------
  getChannelDialogue(session, config) {
    if (!config.channel_dialogues)
      return "";
    const dialogue = this.channelDialogues.get(session.channelId)?.join("\n") || "";
    return "以下是群聊内最近的包括所有人的聊天记录，当当前对话涉及其中内容时你可以参考这些信息，但是要注意分辨发言人是谁：{\n" + dialogue + "\n}\n";
  }
  getChannelMemory(channelId) {
    return this.channelMemories.get(channelId)?.dialogues || [];
  }
  getChannelContext(channelId) {
    return this.getChannelMemory(channelId);
  }
  // ---------- 清理 ----------
  clearChannelMemory(channelId) {
    this.channelMemories.delete(channelId);
  }
  clearChannelDialogue(channelId) {
    this.channelDialogues.delete(channelId);
  }
  clearAll() {
    this.channelMemories.clear();
    this.channelDialogues.clear();
  }
};

// src/memory/index.ts
var logger8 = new import_koishi8.Logger("satori-memory");
var MemoryService = class {
  constructor(ctx, config, api) {
    this.ctx = ctx;
    this.config = config;
    extendMemoryDatabase(ctx);
    this.repo = new MemoryRepository(ctx);
    this.shortTerm = new ShortTermMemory(ctx);
    this.profile = new ProfileManager(ctx, this.repo, api, {
      enabled: config.profile_enabled,
      dryRun: config.summary_dry_run,
      maxEntries: config.profile_max_entries,
      contextEntries: config.profile_context_entries
    });
    const resolveUser = config.personal_memory ? (scopeId) => getUser(ctx, scopeId) : void 0;
    this.summarizer = new Summarizer(ctx, this.repo, api, this.profile, {
      dryRun: config.summary_dry_run,
      topicSwitchCheck: config.topic_switch_check,
      timezoneOffset: config.memory_timezone_offset,
      dayBoundaryHour: config.memory_day_boundary_hour,
      maxCallsPerTick: config.summary_max_calls_per_tick,
      resolveUser
    });
    this.contextBuilder = new ContextBuilder(this.repo, this.shortTerm, this.profile, {
      enabled: config.enable_layered_memory,
      commonTopN: config.common_topN,
      dialogueTopN: config.dailogues_topN,
      recallTopN: config.memory_recall_topN,
      retentionDays: config.memory_retention_days,
      contextMaxChars: config.memory_context_max_chars,
      timezoneOffset: config.memory_timezone_offset,
      memoryConfig: config
    });
    this.heartbeat = new Heartbeat(ctx, this.repo, this.summarizer, {
      intervalMinutes: config.summary_heartbeat_minutes,
      maxScopesPerTick: config.summary_max_scopes_per_tick,
      concurrency: config.summary_concurrency,
      activeWindowDays: config.memory_active_window_days,
      retentionDays: config.memory_retention_days
    });
    this.migrator = new Migrator(
      ctx,
      this.repo,
      config.dataDir,
      config.personal_memory,
      config.memory_timezone_offset
    );
  }
  static {
    __name(this, "MemoryService");
  }
  repo;
  shortTerm;
  profile;
  summarizer;
  contextBuilder;
  heartbeat;
  migrator;
  start() {
    if (!this.config.enable_layered_memory) {
      logger8.info("分层记忆已关闭：仅保留短期记忆与知识库，不落库、不汇总");
      return;
    }
    this.heartbeat.start();
  }
  stop() {
    this.heartbeat.stop();
  }
  // ---------- 作用域 ----------
  getScopeId(session) {
    return this.config.personal_memory ? session.userId || session.channelId : session.channelId || session.userId;
  }
  // ---------- 短期记忆 ----------
  getChannelMemory(channelId) {
    return this.shortTerm.getChannelMemory(channelId);
  }
  getChannelContext(channelId) {
    return this.shortTerm.getChannelContext(channelId);
  }
  getChannelDialogue(session) {
    return this.shortTerm.getChannelDialogue(session, this.config);
  }
  updateChannelDialogue(session, prompt, name) {
    this.shortTerm.updateChannelDialogue(session, prompt, name, this.config);
  }
  clearChannelMemory(channelId) {
    this.shortTerm.clearChannelMemory(channelId);
  }
  clearChannelDialogue(channelId) {
    this.shortTerm.clearChannelDialogue(channelId);
  }
  clearAllMemories() {
    this.shortTerm.clearAll();
  }
  // ---------- 每轮对话 ----------
  async recordTurn(session, prompt, response) {
    if (response?.error)
      return;
    const scopeId = this.getScopeId(session);
    this.shortTerm.updateChannelMemory(session, prompt, this.config, response?.content, scopeId);
    if (!this.config.enable_layered_memory)
      return;
    if (this.isBlocked(prompt))
      return;
    const now = /* @__PURE__ */ new Date();
    try {
      await this.repo.createDialogue({
        scopeId,
        userId: session.userId,
        username: session.username || "",
        kind: "turn",
        userContent: prompt,
        aiContent: response?.content || "",
        createdAt: now
      });
      await this.repo.touchMeta(scopeId, now);
    } catch (error) {
      logger8.warn(`写入对话失败 scope=${scopeId}: ${error}`);
      return;
    }
    void this.summarizer.maybeSwitchTopic(scopeId);
  }
  isBlocked(content) {
    if (!content)
      return false;
    return this.config.memory_block_words.some((word) => word && content.includes(word));
  }
  // ---------- 系统提示 ----------
  async getPromptContext(session, query) {
    return this.contextBuilder.build(session, query);
  }
  // ---------- 知识 ----------
  async addCommonSense(content) {
    await this.repo.addKnowledgeIfAbsent("common", "*", content);
  }
  async addGroupCommonSense(content, channelId) {
    await this.repo.addKnowledgeIfAbsent("group", channelId, content);
  }
  // ---------- 画像 ----------
  async hasProfile(scopeId) {
    return this.profile.has(scopeId);
  }
  async getProfileById(scopeId) {
    return this.profile.formatById(scopeId);
  }
  // ---------- 迁移与运维 ----------
  async migrate(force = false) {
    return this.migrator.migrate(force);
  }
  async clearPersistent(scopeId) {
    if (scopeId)
      await this.repo.clearScope(scopeId);
    else
      await this.repo.clearAll();
  }
  async view(scopeId) {
    const dialogueCount = await this.repo.countDialogues(scopeId);
    const memories = await this.repo.listMemories(scopeId, 20);
    const profile = await this.repo.getProfile(scopeId);
    const entries = profile?.data?.entries || [];
    const lines = [];
    lines.push(`作用域：${scopeId}`);
    lines.push(`原始对话：${dialogueCount} 条`);
    lines.push(`分层记忆：${memories.length} 条`);
    for (const memory of memories) {
      const range = `${formatTime(memory.periodStart, this.config.memory_timezone_offset)} ~ ${formatTime(memory.periodEnd, this.config.memory_timezone_offset)}`;
      const topic = memory.topic ? `【${memory.topic}】` : "";
      lines.push(`  [${memory.granularity}] ${range} ${topic}${memory.content}`);
    }
    lines.push(`画像条目：${entries.length} 条`);
    for (const entry of entries.slice(0, 20)) {
      lines.push(`  - [${entry.category}] ${entry.content}`);
    }
    return lines.join("\n");
  }
};

// src/fixed-dialogues.ts
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
async function handleFixedDialogues(ctx, session, user, prompt, config) {
  if (!config.enable_fixed_dialogues)
    return null;
  const filePath = path4.join(config.dataDir, "fixed_dialogues.json");
  const dialogues = await loadFixedDialogues(filePath);
  const currentTime = parseTime(session.timestamp);
  const matched = dialogues.filter((dialogue) => matchDialogue(dialogue, prompt, user, currentTime));
  if (matched.length === 0)
    return null;
  const selected = selectDialogueByProbability(matched);
  await processFavorability(ctx, user, selected);
  return selected.response;
}
__name(handleFixedDialogues, "handleFixedDialogues");
async function ensureFixedDialoguesFile(filePath) {
  if (!fs4.existsSync(filePath)) {
    const defaultDialogues = [
      {
        triggers: ["你好", "您好"],
        favorabilityRange: [0, 100],
        probability: 1,
        timeRange: ["06:00", "08:00"],
        response: "早上好！很高兴见到你。"
      },
      {
        triggers: ["再见", "拜拜"],
        favorabilityRange: [0, 100],
        probability: 1,
        timeRange: ["18:00", "20:00"],
        response: "再见！希望很快再见到你。"
      }
    ];
    fs4.writeFileSync(filePath, JSON.stringify(defaultDialogues, null, 2));
  }
}
__name(ensureFixedDialoguesFile, "ensureFixedDialoguesFile");
async function loadFixedDialogues(filePath) {
  await ensureFixedDialoguesFile(filePath);
  try {
    return JSON.parse(fs4.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error("Error loading fixed dialogues:", error);
    return [];
  }
}
__name(loadFixedDialogues, "loadFixedDialogues");
function matchDialogue(dialogue, content, user, currentTime) {
  const triggerMatch = dialogue.triggers.some((t) => content === t);
  const favorabilityMatch = matchFavorability(dialogue, user);
  const timeMatch = matchTimeRange(dialogue, currentTime);
  return triggerMatch && favorabilityMatch && timeMatch;
}
__name(matchDialogue, "matchDialogue");
function matchFavorability(dialogue, user) {
  if (!dialogue.favorabilityRange)
    return true;
  const [min, max] = dialogue.favorabilityRange;
  return user.favorability >= min && user.favorability <= max;
}
__name(matchFavorability, "matchFavorability");
function matchTimeRange(dialogue, currentTime) {
  if (!dialogue.timeRange)
    return true;
  const [start, end] = dialogue.timeRange.map(parseTimeToMinutes);
  return currentTime >= start && currentTime <= end;
}
__name(matchTimeRange, "matchTimeRange");
function selectDialogueByProbability(dialogues) {
  const total = dialogues.reduce((sum, d) => sum + d.probability, 0);
  let random = Math.random() * total;
  for (const dialogue of dialogues) {
    random -= dialogue.probability;
    if (random <= 0)
      return dialogue;
  }
  return dialogues[0];
}
__name(selectDialogueByProbability, "selectDialogueByProbability");
async function processFavorability(ctx, user, dialogue) {
  if (dialogue.favorability) {
    await updateFavorability(ctx, user, dialogue.favorability);
  }
}
__name(processFavorability, "processFavorability");

// src/favorability.ts
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
async function handleFavorabilitySystem(ctx, session, config) {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  const level = getFavorabilityLevel(user, config);
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900 && level !== "夫妻") {
    return session.text("commands.sat.messages.block1");
  }
  const processedPrompt = processPrompt(session.content);
  const englishCount = (processedPrompt.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8 && level !== "夫妻") {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  if (englishCount > 30 && level !== "夫妻") {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  if (englishCount > 60) {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  return;
}
__name(handleFavorabilitySystem, "handleFavorabilitySystem");
function getFavorabilityLevel(user, config) {
  if (user.favorability >= config.favorability_div_3 && user?.items["镇定贴"]?.count > 0 && user?.items["镇定贴"]?.description && user?.items["镇定贴"]?.description == "on")
    return "朋友";
  if (user?.items["订婚戒指"]?.count > 0 && user?.items["订婚戒指"]?.description && user?.items["订婚戒指"]?.description == "已使用")
    return "夫妻";
  if (user.favorability < config.favorability_div_1)
    return "厌恶";
  if (user.favorability < config.favorability_div_2)
    return "陌生";
  if (user.favorability < config.favorability_div_3)
    return "朋友";
  if (user.favorability < config.favorability_div_4)
    return "暧昧";
  return "恋人";
}
__name(getFavorabilityLevel, "getFavorabilityLevel");
function generateLevelPrompt(level, config, user) {
  const prompts = {
    "厌恶": config.prompt_0,
    "陌生": config.prompt_1,
    "朋友": config.prompt_2,
    "暧昧": config.prompt_3,
    "恋人": config.prompt_4,
    "夫妻": config.prompt_5
  };
  return `${prompts[level]}
`;
}
__name(generateLevelPrompt, "generateLevelPrompt");
function generateAuxiliaryPrompt(prompt, responseContent, user, config) {
  const messages = [];
  messages.push({
    role: "system",
    content: "请你评价我之后给你的对话，你需要从回答者的角度，猜测回答者听到此问题和做出此回答的感受好坏，然后返回打分。你需要谨慎判断回答者是在警告还是在调情。你返回的值应当是从0到9之间的一个数字，数字越大代表感受越幸福，数字越小代表感受越恶心。你只需要返回一个数字，不要补充其他内容"
  });
  messages.push({
    role: "user",
    content: `问题：${prompt}，回答：${responseContent}`
  });
  return messages;
}
__name(generateAuxiliaryPrompt, "generateAuxiliaryPrompt");
async function handleAuxiliaryResult(ctx, session, config, responseContent) {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  const regex = /\d+/g;
  const value = parseInt(responseContent.match(regex)[0]) ? parseInt(responseContent.match(regex)[0]) : 5;
  let favorabilityEffect = value - config.offset_of_fafavorability;
  await applyFavorabilityEffect(ctx, user, favorabilityEffect ? favorabilityEffect : 0, session);
  if (favorabilityEffect < 0) {
    return "(好感↓)";
  }
  if (favorabilityEffect > 0) {
    return "(好感↑)";
  }
  return;
}
__name(handleAuxiliaryResult, "handleAuxiliaryResult");
async function inputContentCheck(ctx, content, userid, config, session, moodManager) {
  const user = await getUser(ctx, userid);
  if (!user)
    return 0;
  const regex = /\*\*/g;
  const hasCensor = regex.test(content);
  if (hasCensor && config.input_censor_favorability) {
    moodManager.handleInputMoodChange(user, getFavorabilityLevel(user, config));
    await applyFavorabilityEffect(ctx, user, -1 * config.value_of_input_favorability, session);
    return -1 * config.value_of_input_favorability;
  }
  moodManager.applyMoodChange(user, 1);
  if (config.enable_auxiliary_LLM || user.usage > config.max_favorability_perday)
    return 0;
  const mood = moodManager.getMoodValue(user.userid);
  if (mood >= 0)
    await applyFavorabilityEffect(ctx, user, 1, session);
  return 1;
}
__name(inputContentCheck, "inputContentCheck");
async function outputContentCheck(ctx, response, userid, config, session, moodManager) {
  if (response.error)
    return 0;
  const user = await getUser(ctx, userid);
  if (!user)
    return 0;
  if (config.output_censor_favorability) {
    const content = response.content;
    const filePath = path5.join(config.dataDir, "output_censor.txt");
    if (!fs5.existsSync(filePath)) {
      return 0;
    }
    const censorWords = fs5.readFileSync(filePath, "utf-8").split(",");
    const censoredContent = censorWords.reduce((acc, cur) => acc.replace(cur, "**"), content);
    const regex = /\*\*/g;
    const hasCensor = regex.test(censoredContent);
    const moodLevel = moodManager.getMoodLevel(user.userid);
    if (hasCensor) {
      const mood = moodManager.getMoodValue(user.userid);
      moodManager.handleOutputMoodChange(user, getFavorabilityLevel(user, config));
      if (mood <= 0) {
        await updateFavorability(ctx, user, -1 * config.value_of_output_favorability);
        return -config.value_of_output_favorability;
      }
    }
    if (moodLevel === "angry") {
      await updateFavorability(ctx, user, -1 * config.value_of_output_favorability);
      return -config.value_of_output_favorability;
    }
  }
  return 0;
}
__name(outputContentCheck, "outputContentCheck");
async function ensureCensorFileExists(basePath) {
  const filePath = path5.join(basePath, "output_censor.txt");
  fs5.mkdirSync(path5.dirname(filePath), { recursive: true });
  if (!fs5.existsSync(filePath)) {
    fs5.writeFileSync(filePath, "示例屏蔽词1,示例屏蔽词2,示例屏蔽词3", "utf-8");
  }
}
__name(ensureCensorFileExists, "ensureCensorFileExists");
async function applyFavorabilityEffect(ctx, user, effect, session) {
  if (effect < 0 && user.items["谷底小石"]?.count > 0) {
    session.send(session.text("commands.sat.messages.rockBottom"));
    return;
  }
  if (effect < 0 && user.items["帽子先生"]?.count > 0) {
    user.items["帽子先生"].count--;
    if (user.items["帽子先生"].count === 0)
      delete user.items["帽子先生"];
    await updateUserItems(ctx, user);
    session.send(session.text("commands.sat.messages.hatMan"));
    return;
  }
  await updateFavorability(ctx, user, effect);
}
__name(applyFavorabilityEffect, "applyFavorabilityEffect");

// src/middleware.ts
var import_koishi9 = require("koishi");
var logger9 = new import_koishi9.Logger("satori-ai-middleware");
function createMiddleware(ctx, sat, config) {
  return async (session, next) => {
    if (config.enable_favorability && config.enable_warning && session.channelId === config.warning_group)
      sat.getWarningList(session);
    await sat.broadcastManager.seedBroadcast(session);
    if (config.private && isPrivateSession(session)) {
      return await handlePrivateMessage(sat, session);
    }
    if (config.nick_name && await hasNickName(ctx, session, config)) {
      return await handleNickNameMessage(sat, session);
    }
    if (shouldRandomTrigger(session, config)) {
      return await sat.handleRandomMiddleware(session);
    }
    if (!isSpecialMessage(session))
      await sat.handleChannelMemoryManager(session);
    return next();
  };
}
__name(createMiddleware, "createMiddleware");
function isPrivateSession(session) {
  if (isSpecialMessage(session))
    return false;
  return session.subtype === "private" || session.channelId.includes("private");
}
__name(isPrivateSession, "isPrivateSession");
async function handlePrivateMessage(SAT2, session) {
  const content = session.content.trim();
  if (content)
    return await SAT2.handleNickNameMiddleware(session, content);
}
__name(handlePrivateMessage, "handlePrivateMessage");
async function hasNickName(ctx, session, config) {
  if (session.userId === session.selfId)
    return false;
  if (config.nick_name_block_words.some((word) => session.content.includes(word)))
    return false;
  const user = await ensureUserExists(ctx, session.userId, session.username);
  let names = config.nick_name_list;
  if (user?.items?.["情侣合照"]?.metadata?.botNickName) {
    names = names.concat(user.items["情侣合照"].metadata.botNickName);
  }
  return names.some((name) => session.content.includes(name));
}
__name(hasNickName, "hasNickName");
async function handleNickNameMessage(SAT2, session) {
  const content = session.content.trim();
  if (content)
    return await SAT2.handleNickNameMiddleware(session, content);
}
__name(handleNickNameMessage, "handleNickNameMessage");
function shouldRandomTrigger(session, config) {
  const { content } = session;
  return !isSpecialMessage(session) && content.length >= config.random_min_tokens && content.length < config.max_tokens && probabilisticCheck(config.randnum);
}
__name(shouldRandomTrigger, "shouldRandomTrigger");
function isSpecialMessage(session) {
  const firstElement = session.elements[0];
  return ["img", "at", "file"].includes(firstElement?.type) || session.content.includes(":poke") || session.content.includes("file://") || session.content.includes("http://") || session.content.includes("https://");
}
__name(isSpecialMessage, "isSpecialMessage");

// src/types.ts
var import_koishi10 = require("koishi");
var Sat = class extends import_koishi10.Service {
  static {
    __name(this, "Sat");
  }
  static inject = {
    required: ["console", "database"],
    optional: ["censor", "puppeteer"]
  };
  constructor(ctx, config) {
    super(ctx, "sat", true);
  }
};
((Sat2) => {
  Sat2.Config = import_koishi10.Schema.intersect([
    import_koishi10.Schema.object({
      baseURL: import_koishi10.Schema.string().default("https://api.deepseek.com").description("深度思考模型请求地址"),
      key: import_koishi10.Schema.union([
        import_koishi10.Schema.array(String).role("secret"),
        import_koishi10.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("深度思考模型api_key"),
      appointModel: import_koishi10.Schema.string().default("deepseek-reasoner").description("深度思考模型"),
      enhanceReasoningProtection: import_koishi10.Schema.boolean().default(true).description("是否增强思维链保护（开启后会强制输出内容带有限制标签，极大防止思维链溢出问题）"),
      not_reasoner_LLM_URL: import_koishi10.Schema.string().default("https://api.deepseek.com").description("非深度思考模型请求地址"),
      not_reasoner_LLM: import_koishi10.Schema.string().default("deepseek-chat").description("非深度思考模型(用于节省成本"),
      not_reasoner_LLM_key: import_koishi10.Schema.union([
        import_koishi10.Schema.array(String).role("secret"),
        import_koishi10.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("非深度思考模型api_key"),
      use_not_reasoner_LLM_length: import_koishi10.Schema.number().default(8).description("触发使用非深度思考模型的字数（输入少于此字数时）,如果你希望始终使用非深度思考模型进行对话，请将此值设置成一个较大的值,反之亦然"),
      enable_reasoner_like: import_koishi10.Schema.boolean().default(true).description("是否启用非深度思考模型模仿思维链（可以在节省成本的同时提高效果，但是模型经常不按规定格式输出，所以不推荐开启）"),
      auxiliary_LLM_URL: import_koishi10.Schema.string().default("https://api.deepseek.com").description("辅助模型请求地址"),
      auxiliary_LLM: import_koishi10.Schema.string().default("deepseek-chat").description("辅助模型(用于好感度调整等功能，如不需要可不填，建议使用低成本模型"),
      auxiliary_LLM_key: import_koishi10.Schema.union([
        import_koishi10.Schema.array(String).role("secret"),
        import_koishi10.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("辅助模型api_key"),
      prompt: import_koishi10.Schema.string().role("textarea").description("人格设定"),
      reasoner_prompt: import_koishi10.Schema.string().role("textarea").description("思考提示词（对于非深度思考模型模仿思维链时生效）").default("你在思考时应当逐步分析以下内容：1.当前对话的禁止事项；2.是否与群聊中其他人的发言有关联；3.是否与当前用户之前说的话有关联；4.对话的具体要求；5.用户的意图如何；6.最终的发言的主要内容。")
    }).description("基础设置"),
    import_koishi10.Schema.object({
      alias: import_koishi10.Schema.array(String).default(["ai"]).description("触发命令;别名"),
      authority: import_koishi10.Schema.number().role("slider").min(0).max(5).step(1).description("允许使用的最低权限").default(1),
      no_system_prompt: import_koishi10.Schema.boolean().default(false).description("是否将系统提示的system替换为user（用于具有思维链的模型）"),
      max_tokens: import_koishi10.Schema.number().description("最大请求长度（字符数）").default(100),
      max_output_tokens: import_koishi10.Schema.number().description("最大返回长度(不含思维链)（token数）").default(4096),
      message_max_length: import_koishi10.Schema.number().description("最大频道上下文长度（条数）").default(10),
      temperature: import_koishi10.Schema.number().role("slider").min(0).max(2).step(0.01).default(0.5).description("温度"),
      frequency_penalty: import_koishi10.Schema.number().default(0).description("频率惩罚"),
      presence_penalty: import_koishi10.Schema.number().default(0).description("存在惩罚"),
      maxRetryTimes: import_koishi10.Schema.number().default(10).description("报错后最大重试次数"),
      retry_delay_time: import_koishi10.Schema.number().default(5e3).description("每次重试延迟时间"),
      max_parallel_count: import_koishi10.Schema.number().default(2).description("频道最大并行请求数"),
      log_system_prompt: import_koishi10.Schema.boolean().default(false).description("是否在日志中输出系统提示"),
      log_reasoning_content: import_koishi10.Schema.boolean().default(true).description("是否在日志中输出思维链"),
      log_ask_response: import_koishi10.Schema.boolean().default(true).description("是否在日志中输出问答")
    }).description("请求设置"),
    import_koishi10.Schema.object({
      enable_self_memory: import_koishi10.Schema.boolean().default(true).description("是否启用模型自发言记忆（仅短期）"),
      personal_memory: import_koishi10.Schema.boolean().default(true).description("是否启用按人记忆（否则将群内所有人视为同一个用户）"),
      channel_dialogues: import_koishi10.Schema.boolean().default(true).description("是否获取群聊内最近对话（包括不对bot说的）"),
      channel_dialogues_max_length: import_koishi10.Schema.number().default(20).description("群聊内最近对话最大长度(条数)"),
      bracket_filter: import_koishi10.Schema.boolean().default(false).description("是否启用括号过滤，开启后在写入短期记忆时会过滤掉括号内的内容，用于缓解复读问题"),
      memory_filter: import_koishi10.Schema.string().role("textarea").default("示例1-示例2").description("短期记忆过滤词，使用“-”分隔，含有过滤词的那一句不会被记忆，用于缓解复读问题"),
      dataDir: import_koishi10.Schema.string().default("./data/satori_ai").description("聊天记录保存位置（长期记忆）"),
      memory_block_words: import_koishi10.Schema.array(String).default(["好感"]).description("记忆屏蔽词"),
      remember_min_length: import_koishi10.Schema.number().description("已废弃：分层记忆不再用长度门槛过滤与 AI 的对话").default(20),
      common_topN: import_koishi10.Schema.number().default(5).description("群常识、常识记忆检索最大匹配数"),
      dailogues_topN: import_koishi10.Schema.number().default(5).description("对话记忆检索最大匹配数"),
      enable_fixed_dialogues: import_koishi10.Schema.boolean().default(false).description("是否启用固定对话（在dataDir中的fixed_dialogues.json修改）")
    }).description("记忆设置"),
    import_koishi10.Schema.object({
      enable_layered_memory: import_koishi10.Schema.boolean().default(true).description("是否启用分层长期记忆（话题→日→周→月→季→年的自动归档）。关闭后仅保留短期记忆与常识库"),
      memory_timezone_offset: import_koishi10.Schema.number().default(8).description("分层记忆使用的时区偏移（小时），用于计算日界线"),
      memory_day_boundary_hour: import_koishi10.Schema.number().min(0).max(23).step(1).default(4).description("日界线小时，默认凌晨 4 点"),
      topic_switch_check: import_koishi10.Schema.boolean().default(true).description("是否用辅助模型判断话题切换"),
      summary_heartbeat_minutes: import_koishi10.Schema.number().default(10).description("后台汇总心跳间隔（分钟）"),
      summary_max_scopes_per_tick: import_koishi10.Schema.number().default(30).description("每次心跳最多处理的用户/群数量"),
      summary_max_calls_per_tick: import_koishi10.Schema.number().default(8).description("每个用户/群每次心跳最多发起的辅助模型调用数（归档与分层汇总各占一半预算；历史积压时调大可加快补齐）"),
      summary_concurrency: import_koishi10.Schema.number().default(10).description("同时处理的用户/群数量。单个用户/群内部仍串行以保证归档顺序；不同用户/群之间可并发，调大能明显加快历史积压补齐"),
      memory_active_window_days: import_koishi10.Schema.number().default(7).description("只对最近多少天内活跃过的用户/群做汇总"),
      memory_retention_days: import_koishi10.Schema.number().default(180).description("原始对话保留天数"),
      memory_recall_topN: import_koishi10.Schema.number().default(5).description("关键词召回的历史记忆条数"),
      memory_context_max_chars: import_koishi10.Schema.number().default(2e3).description("分层记忆注入系统提示的最大字符数，超出时按“越近越优先”截断"),
      summary_dry_run: import_koishi10.Schema.boolean().default(false).description("调试用：只记录将要执行的汇总，不调用模型、不写库"),
      profile_enabled: import_koishi10.Schema.boolean().default(true).description("是否启用增量用户画像（由日总结驱动更新）"),
      profile_max_entries: import_koishi10.Schema.number().default(60).description("用户画像最多保留的条目数"),
      profile_context_entries: import_koishi10.Schema.number().default(30).description("注入系统提示的画像条目数")
    }).description("分层记忆设置"),
    import_koishi10.Schema.object({
      max_usage: import_koishi10.Schema.tuple([Number, Number, Number, Number, Number]).default([40, 240, 3e3, 9999, 0]).description("每日最大使用次数(对应用户level0~level4)(0为不限制)"),
      private: import_koishi10.Schema.boolean().default(false).description("开启后私聊AI可触发对话, 不需要使用指令"),
      nick_name: import_koishi10.Schema.boolean().default(true).description("是否使用昵称触发对话（发言中含有昵称时）（把qq号加入昵称可以被at和戳一戳触发）"),
      nick_name_list: import_koishi10.Schema.array(String).default(["昵称1"]).description("昵称列表"),
      nick_name_block_words: import_koishi10.Schema.array(String).default(["屏蔽词1"]).description("昵称屏蔽词(含有屏蔽词的消息不会触发昵称对话)"),
      reasoner_filter: import_koishi10.Schema.boolean().default(true).description("是否启用返回内容过滤,开启后在对话时会过滤掉在括号内且含有过滤词的那一句,用于缓解思维链溢出问题"),
      reasoner_filter_word: import_koishi10.Schema.string().role("textarea").default("系统-提示-用户-设定-回复").description("返回内容过滤词，使用“-”分隔，在括号内且含有过滤词的那一句会被过滤，用于缓解思维链溢出问题"),
      duplicateDialogueCheck: import_koishi10.Schema.boolean().default(true).description("是否检查重复对话"),
      enable_online_user_check: import_koishi10.Schema.boolean().default(true).description("在未回答而再次提问时是否提示用户有未完成的对话"),
      random_min_tokens: import_koishi10.Schema.number().default(20).description("随机触发对话的最小长度"),
      enable_random_without_favorability: import_koishi10.Schema.boolean().default(true).description("是否启用随机触发对话无视高好感度（即使用户好感度很高也会最多视为朋友）"),
      randnum: import_koishi10.Schema.number().role("slider").min(0).max(1).step(0.01).default(0).description("在群聊中随机触发对话的概率，如需关闭可设置为 0"),
      sentences_divide: import_koishi10.Schema.boolean().default(true).description("是否分句发送"),
      min_sentences_length: import_koishi10.Schema.number().default(10).description("每个分句的最小长度"),
      max_sentences_length: import_koishi10.Schema.number().default(20).description("每个分句的最大长度"),
      time_interval: import_koishi10.Schema.number().default(1e3).description("每句话的时间间隔"),
      reply_pointing: import_koishi10.Schema.boolean().default(true).description("是否在与多人同时对话时显示回复指向"),
      enable_emoji: import_koishi10.Schema.boolean().default(false).description("是否启用表情包功能（表情包文件按类命名分成文件夹放在数据路径下的emojis文件夹，最好是gif）"),
      emoji_probability: import_koishi10.Schema.number().role("slider").min(0).max(1).step(0.01).default(0.1).description("在对话中发送表情包的概率")
    }).description("对话设置"),
    import_koishi10.Schema.object({
      enable_weather_perception: import_koishi10.Schema.boolean().default(false).description("是否开启天气感知（JWT 配置可选，若同时配置私钥/kid/sub 则优先使用 JWT）"),
      Location_search_API_URL: import_koishi10.Schema.string().default("https://api.example.com/location/search.json?").description("位置搜索API地址（请至少填写到“?”）"),
      location_param_name: import_koishi10.Schema.string().default("location").description("位置参数名称"),
      weather_api_URL: import_koishi10.Schema.string().default("https://api.example.com/weather/now.json?").description("天气API地址（请至少填写到“?”）"),
      weather_param_name: import_koishi10.Schema.string().default("location").description("天气位置参数名称"),
      weather_api_key: import_koishi10.Schema.string().role("secret").default("").description("天气API Key"),
      weather_cd_time: import_koishi10.Schema.number().default(60).description("天气更新请求的最小间隔（分钟）（在对话时检查更新）"),
      // JWT 配置（可选，若同时配置私钥/kid/sub 则优先使用 JWT）
      weather_jwt_private_key_pem: import_koishi10.Schema.string().role("secret").default("").description("Ed25519 私钥 PEM（包含 -----BEGIN PRIVATE KEY----- 和 -----END PRIVATE KEY-----）"),
      weather_jwt_kid: import_koishi10.Schema.string().default("").description("JWT 凭据 ID (kid)，来自控制台凭据页面"),
      weather_jwt_sub: import_koishi10.Schema.string().default("").description("JWT 的 sub（项目 ID）"),
      weather_jwt_exp_seconds: import_koishi10.Schema.number().default(300).description("JWT 有效期（秒），最大 86400（24 小时）")
    }).description("天气感知设置"),
    import_koishi10.Schema.object({
      enable_favorability: import_koishi10.Schema.boolean().default(false).description("是否开启好感度系统(每次对话默认+1好感度)"),
      max_favorability_perday: import_koishi10.Schema.number().default(100).description("每日有效(引发好感度增长)对话次数上限"),
      input_censor_favorability: import_koishi10.Schema.boolean().default(false).description("是否开启好感度审查(通过输入屏蔽词扣除好感)"),
      value_of_input_favorability: import_koishi10.Schema.number().default(15).description("输入触发输入屏蔽词每次扣除的好感度"),
      output_censor_favorability: import_koishi10.Schema.boolean().default(false).description("通过输出屏蔽词扣除好感,在dataDir中的output_censor.txt修改)"),
      value_of_output_favorability: import_koishi10.Schema.number().default(15).description("输出触发输出屏蔽词每次扣除的好感度"),
      enable_auxiliary_LLM: import_koishi10.Schema.boolean().default(false).description("是否使用辅助大模型判断好感度增减(量与输入屏蔽词每次扣除的好感度相关,不稳定，慎用)"),
      offset_of_fafavorability: import_koishi10.Schema.number().default(3.5).description("辅助大模型好感度偏移量(越大越容易扣好感度)"),
      visible_favorability: import_koishi10.Schema.boolean().default(true).description("是否开启好感度升降显示"),
      enable_user_portrait: import_koishi10.Schema.boolean().default(true).description("旧画像开关：与“分层记忆设置”的 profile_enabled 同时开启才生效"),
      portrait_usage: import_koishi10.Schema.number().default(2).description("已废弃：画像改由日总结驱动更新"),
      max_portrait_dialogues: import_koishi10.Schema.number().default(100).description("已废弃：画像改由日总结驱动更新"),
      portrait_min_favorability: import_koishi10.Schema.number().default(100).description("已废弃：画像改由日总结驱动更新"),
      prompt_0: import_koishi10.Schema.string().role("textarea").description("厌恶好感补充设定"),
      favorability_div_1: import_koishi10.Schema.number().default(15).description("厌恶-陌生分界线"),
      prompt_1: import_koishi10.Schema.string().role("textarea").description("陌生好感补充设定"),
      favorability_div_2: import_koishi10.Schema.number().default(150).description("陌生-朋友分界线"),
      prompt_2: import_koishi10.Schema.string().role("textarea").description("朋友好感补充设定"),
      favorability_div_3: import_koishi10.Schema.number().default(500).description("朋友-思慕分界线"),
      prompt_3: import_koishi10.Schema.string().role("textarea").description("思慕好感补充设定"),
      favorability_div_4: import_koishi10.Schema.number().default(1e3).description("思慕-恋慕分界线"),
      prompt_4: import_koishi10.Schema.string().role("textarea").description("恋慕好感补充设定"),
      prompt_5: import_koishi10.Schema.string().role("textarea").default("一般此配置项无效").description("夫妻好感补充设定"),
      enable_warning: import_koishi10.Schema.boolean().default(false).description("是否开启打小报告（当有人好感度下降时会在主群里打小报告）"),
      warning_group: import_koishi10.Schema.string().default("").description("打小报告的群号"),
      warning_admin_id: import_koishi10.Schema.string().default("").description("打小报告艾特的管理员id")
    }).description("好感度设置"),
    import_koishi10.Schema.object({
      enable_mood: import_koishi10.Schema.boolean().default(false).description("是否开启心情系统（通过屏蔽词降低心情，正常聊天心情+1，每天重置为mood_div_1 + value_of_output_mood）"),
      max_mood: import_koishi10.Schema.number().default(10).description("心情上限"),
      value_of_input_mood: import_koishi10.Schema.number().default(10).description("输入触发屏蔽词每次扣除的心情"),
      value_of_output_mood: import_koishi10.Schema.number().default(5).description("输出触发屏蔽词每次扣除的心情,若当时心情大于0,此次不扣好感度,会根据好感度等级调整数值"),
      visible_mood: import_koishi10.Schema.boolean().default(false).description("是否开启心情状态显示"),
      mood_prompt_2: import_koishi10.Schema.string().role("textarea").default("你现在的心情十分愉悦").description("心情达到最高补充设定"),
      mood_div_1: import_koishi10.Schema.number().default(-1).description("心情正常-烦躁分界线"),
      mood_prompt_0: import_koishi10.Schema.string().role("textarea").default("你现在的心情是：有点烦躁").description("烦躁心情补充设定"),
      mood_div_2: import_koishi10.Schema.number().default(-15).description("烦躁-生气分界线"),
      mood_prompt_1: import_koishi10.Schema.string().role("textarea").default("你现在的心情是：非常生气").description("生气心情补充设定"),
      enable_pocket_money: import_koishi10.Schema.boolean().default(false).description("开启要零花钱指令（通过消耗心情换随机数量p点）"),
      min_pocket_money: import_koishi10.Schema.number().default(100).description("随机p点最小值"),
      max_pocket_money: import_koishi10.Schema.number().default(400).description("随机p点最大值"),
      pocket_money_cost: import_koishi10.Schema.number().default(2).description("消耗心情换p点的心情值")
    }).description("好感度拓展：心情设置（需要开启好感度模块才能生效）"),
    import_koishi10.Schema.object({
      enable_galgame: import_koishi10.Schema.boolean().default(true).description("是否启用 galgame 模块")
    }).description("galgame 设置，详细功能请开启后进行默认事件体验"),
    import_koishi10.Schema.object({
      Broadcast_block_channel: import_koishi10.Schema.array(String).description("不提供广播的频道id"),
      waiting_time: import_koishi10.Schema.number().default(1440).description("广播在缓存中等待的最大时间（分钟）（超过时间后没有触发会不再推送）")
    }).description("广播设置（发出后在每个生效群收到首条消息时会推送）"),
    import_koishi10.Schema.object({
      enable_game: import_koishi10.Schema.boolean().default(false).description("是否开启游戏模块"),
      game_block_channel: import_koishi10.Schema.array(String).description("不提供游戏的频道id"),
      enable_OneTouch: import_koishi10.Schema.boolean().default(false).description("是否开启一碰一游戏（需要puppeteer支持）"),
      cd_for_OneTouch: import_koishi10.Schema.number().default(600).description("每人一碰一游戏cd时间（秒）"),
      enable_fencing: import_koishi10.Schema.boolean().default(false).description("是否开启击剑游戏(无效，开发中)")
    }).description("拓展模块-游戏设置")
  ]);
})(Sat || (Sat = {}));

// src/mood.ts
var import_koishi11 = require("koishi");
var import_crypto = require("crypto");
var logger10 = new import_koishi11.Logger("satori-ai-mood");
var MoodManager = class {
  static {
    __name(this, "MoodManager");
  }
  ctx;
  config;
  moodMap = /* @__PURE__ */ new Map();
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  // 初始化用户心情
  initUser(userId) {
    this.moodMap.set(userId, {
      mood: this.config.mood_div_1 + this.config.value_of_output_mood,
      lastUpdate: Date.now()
    });
  }
  // 每日重置检查
  async checkDailyReset(userId) {
    const data = this.moodMap.get(userId);
    if (!data)
      return;
    const user = await getUser(this.ctx, userId);
    if (user?.items?.["点心盒"]) {
      delete user.items["点心盒"];
      await updateUserItems(this.ctx, user);
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() });
    }
    const lastDate = new Date(data.lastUpdate);
    const now = /* @__PURE__ */ new Date();
    if (lastDate.getDate() !== now.getDate() || lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear()) {
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() });
    }
  }
  // 处理输入内容心情变化
  async handleInputMoodChange(user, favorabilityLevel) {
    if (!this.config.enable_mood)
      return;
    const userId = user.userid;
    if (!this.moodMap.has(userId))
      this.initUser(userId);
    let effect = this.config.value_of_input_mood;
    switch (favorabilityLevel) {
      case "厌恶":
        effect = effect * 1.5;
        break;
      case "陌生":
        effect = effect * 1;
        break;
      case "朋友":
        effect = effect * 0.9;
        break;
      case "暧昧":
        effect = effect * 0.8;
        break;
      case "恋人":
        effect = effect * 0.6;
        break;
      case "夫妻":
        effect = effect * 0.4;
        break;
      default:
        effect = 0;
        break;
    }
    effect = Math.round(effect) + 1;
    this.applyMoodChange(user, -effect);
    return;
  }
  // 处理输出内容心情变化
  async handleOutputMoodChange(user, favorabilityLevel) {
    if (!this.config.enable_mood)
      return;
    const userId = user.userid;
    if (!this.moodMap.has(userId))
      this.initUser(userId);
    let effect = this.config.value_of_output_mood;
    switch (favorabilityLevel) {
      case "厌恶":
        effect = effect * 1.5;
        break;
      case "陌生":
        effect = effect * 1;
        break;
      case "朋友":
        effect = effect * 0.9;
        break;
      case "暧昧":
        effect = effect * 0.8;
        break;
      case "恋人":
        effect = effect * 0.6;
        break;
      case "夫妻":
        effect = effect * 0.4;
        break;
      default:
        effect = 0;
        break;
    }
    effect = Math.round(effect) + 1;
    this.applyMoodChange(user, -effect);
    return;
  }
  // 应用心情变化
  async applyMoodChange(user, delta) {
    if (!this.config.enable_mood)
      return;
    const userId = user.userid;
    let data = this.moodMap.get(userId);
    if (!data) {
      this.initUser(userId);
      data = this.moodMap.get(userId);
    }
    const newMood = Math.min(this.config.max_mood, data.mood + delta);
    this.moodMap.set(userId, {
      mood: newMood,
      lastUpdate: Date.now()
    });
    await this.checkDailyReset(userId);
    return;
  }
  // 获取心情等级
  getMoodLevel(userId) {
    if (!this.config.enable_mood)
      return "normal";
    const data = this.moodMap.get(userId);
    if (!data) {
      this.initUser(userId);
      return "normal";
    }
    if (data.mood == this.config.max_mood)
      return "happy";
    if (data.mood <= this.config.mood_div_2)
      return "angry";
    if (data.mood <= this.config.mood_div_1)
      return "upset";
    return "normal";
  }
  // 获取心情值
  getMoodValue(userId) {
    if (!this.config.enable_mood)
      return 0;
    const data = this.moodMap.get(userId);
    if (!data) {
      this.initUser(userId);
      return 0;
    }
    return data.mood;
  }
  // 生成心情提示
  generateMoodPrompt(userId) {
    const level = this.getMoodLevel(userId);
    return {
      "upset": `
${this.config.mood_prompt_0}
`,
      "angry": `
${this.config.mood_prompt_1}
`,
      "happy": `
${this.config.mood_prompt_2}
`,
      "normal": "你现在的心情很平淡"
    }[level];
  }
  async handlePocketMoney(session) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const mood = this.getMoodValue(user.userid);
    if (mood < this.config.max_mood / 2) {
      updateFavorability(this.ctx, user, -this.config.value_of_output_favorability);
      return session.text("commands.sat.messages.not_good_mood");
    }
    this.applyMoodChange(user, -this.config.pocket_money_cost);
    const pocketMoney = (0, import_crypto.randomInt)(this.config.min_pocket_money, this.config.max_pocket_money + 1);
    updateUserP(this.ctx, user, pocketMoney);
    return session.text("commands.sat.messages.pocket_money", [pocketMoney]);
  }
  setMood(id, mood) {
    this.moodMap.set(id, {
      mood: Math.min(this.config.max_mood, mood),
      lastUpdate: Date.now()
    });
    return "已设置" + id + "心情值为" + mood;
  }
  viewMood(session, id) {
    if (!this.config.enable_mood)
      return "normal";
    const level = this.getMoodLevel(id);
    if (id === session.userId) {
      switch (level) {
        case "upset":
          return `！`;
        case "angry":
          return `滚`;
        case "happy":
          return `♥`;
        case "normal":
          return `~`;
        default:
          return `你的心情等级为 ${level}`;
      }
    } else
      return `用户 ${id} 的心情等级为 ${level}`;
  }
};

// src/game.ts
var import_koishi15 = require("koishi");

// src/gamefencing.ts
var import_koishi13 = require("koishi");

// src/abstractGame.ts
var import_koishi12 = require("koishi");
var logger11 = new import_koishi12.Logger("satori-game");
var abstractGameSingleGame = class {
  static {
    __name(this, "abstractGameSingleGame");
  }
  session;
  disposeListener;
  // 清理监听器的函数
  lastActionTime = 0;
  // 上次操作时间戳
  constructor(disposeListener, session) {
    this.session = session;
    this.disposeListener = disposeListener;
  }
  // 开始游戏，返回初始提示
  async startGame() {
    this.lastActionTime = Date.now();
    return "游戏开始";
  }
  // 结束游戏，清理资源并返回结果
  async endGame() {
    this.disposeListener();
    return { message: "游戏结束", gameName: "null", playerID: this.session.userId };
  }
  getPlayerID() {
    return this.session.userId;
  }
  getLastActionTime() {
    return this.lastActionTime;
  }
  // 处理玩家输入，需子类实现
  async processInput(str) {
    this.lastActionTime = Date.now();
    return "";
  }
};
var abstractGame = class {
  static {
    __name(this, "abstractGame");
  }
  gameClass;
  // 具体游戏类（如五子棋）
  channelGames = /* @__PURE__ */ new Map();
  // 频道ID到游戏实例的映射
  constructor(GameClass) {
    this.gameClass = GameClass;
  }
  /**
   * 生成消息监听器，用于处理玩家输入
   * @param userID 玩家ID
   * @param guildID 服务器ID
   * @returns 监听函数，将输入转发给对应频道的游戏实例
   */
  listener = (userID, guildID) => {
    return async (session) => {
      if (session.userId === userID && session.guildId === guildID) {
        const game = this.channelGames.get(session.channelId);
        if (game) {
          session.send(await game.processInput(session.content));
        }
      }
    };
  };
  /**
   * 启动游戏实例
   * @param session 会话上下文
   * @param ctx Koishi 上下文
   * @param args 启动参数（如难度等级）
   */
  async startGame(session, ctx, args) {
    if (this.channelGames.has(session.channelId))
      return null;
    const dispose = ctx.on("message", this.listener(session.userId, session.guildId));
    const game = new this.gameClass(dispose, session);
    this.channelGames.set(session.channelId, game);
    session.send(await game.startGame());
    return game;
  }
  /**
   * 结束游戏实例，触发结果事件
   */
  async endGame(session, ctx) {
    const game = this.channelGames.get(session.channelId);
    if (!game)
      return false;
    session.observeUser(["authority"]);
    logger11.info(`时间：${session.timestamp}，用户${session.userId}试图结束用户${game.getPlayerID()}开启的游戏，上次互动时间${game.getLastActionTime()}`);
    if (game.getPlayerID() == session.userId || session.timestamp - game.getLastActionTime() > 1e3 * 60 * 10 || session.user.authority >= 3) {
      const gameRes = await game.endGame();
      ctx.emit("game-result", session, gameRes);
      this.channelGames.delete(session.channelId);
      logger11.info(`游戏已结束`);
      return true;
    }
    session.send("你不是游戏的参与者，无法结束游戏");
    return false;
  }
};

// src/gamefencing.ts
var logger12 = new import_koishi13.Logger("satori-game-fencing");
var fencingSingleGame = class _fencingSingleGame extends abstractGameSingleGame {
  static {
    __name(this, "fencingSingleGame");
  }
  winningFlag = 4 /* pending */;
  playerPosition;
  enemyPosition;
  availablePlayerActions;
  static fencingActionHint = /* @__PURE__ */ new Map([
    [1 /* attack */, "攻击！"],
    [2 /* defence */, "防御"]
  ]);
  constructor(disposeListener, session) {
    super(disposeListener, session);
    this.playerPosition = 3;
    this.enemyPosition = 7;
    this.availablePlayerActions = [];
  }
  render(characters) {
    let res = "";
    for (let i = 0; i < 11; i++) {
      res += characters[i] || "⬜️";
    }
    return res;
  }
  startGame = async () => {
    this.availablePlayerActions.push(1 /* attack */);
    this.availablePlayerActions.push(2 /* defence */);
    let res = "";
    res += this.render({ [this.playerPosition]: "🟦", [this.enemyPosition]: "🟨" }) + "\n";
    res += "选择很多……\n";
    for (let i = 0; i < this.availablePlayerActions.length; i++) {
      res += "/ " + _fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i]);
    }
    return res;
  };
  endGame = async () => {
    super.endGame();
    return { message: "击剑游戏结束", win: this.winningFlag, gameName: "击剑", playerID: this.session.userId };
  };
  enemyDecision(playerPosition, enemyPosition) {
    if (enemyPosition - playerPosition > 2) {
      return 1 /* attack */;
    } else {
      const a = Math.random();
      if (a > 0.5) {
        return 1 /* attack */;
      } else {
        return 2 /* defence */;
      }
    }
  }
  async processInput(str) {
    let playerAttack;
    let enemyAttack;
    let playerDefence;
    let enemyDefence;
    let playerPreviosPosition;
    let enemyPreviosPosition;
    let playerAction;
    let enemyAction;
    const directionPlayerToEnemy = this.enemyPosition - this.playerPosition > 0 ? 1 : -1;
    for (let i = 0; i < this.availablePlayerActions.length; i++) {
      if (str == _fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i])) {
        playerAction = this.availablePlayerActions[i];
        break;
      }
    }
    if (playerAction == void 0) {
      return;
    }
    if (this.winningFlag != 4 /* pending */) {
      return "游戏已结束";
    }
    enemyAction = this.enemyDecision(this.playerPosition, this.enemyPosition);
    let res = "";
    switch (playerAction) {
      case 1 /* attack */:
        playerAttack = this.playerPosition + directionPlayerToEnemy;
        break;
      case 2 /* defence */:
        playerDefence = this.playerPosition;
        break;
    }
    switch (enemyAction) {
      case 1 /* attack */:
        enemyAttack = this.enemyPosition - directionPlayerToEnemy;
        break;
      case 2 /* defence */:
        enemyDefence = this.enemyPosition;
        break;
    }
    const renderAndJudge = /* @__PURE__ */ __name(() => {
      if (this.playerPosition == this.enemyPosition) {
        const i = Math.random();
        if (i > 0.5) {
          this.playerPosition -= directionPlayerToEnemy;
          if (playerDefence) {
            playerDefence -= directionPlayerToEnemy;
          }
        } else {
          this.enemyPosition += directionPlayerToEnemy;
          if (enemyDefence) {
            enemyDefence += directionPlayerToEnemy;
          }
        }
      }
      if (this.playerPosition == enemyAttack && this.enemyPosition == playerAttack) {
        res += this.render({ [playerAttack]: "⚔️", [playerDefence]: "🛡️" }) + "\n";
        res += this.render({ [playerPreviosPosition]: "▫️", [enemyPreviosPosition]: "▫️", [this.playerPosition]: "🟦", [this.enemyPosition]: "🟨" }) + "\n";
        res += this.render({ [enemyAttack]: "⚔️", [enemyDefence]: "🛡️" }) + "\n";
      } else {
        res += this.render({ [playerAttack]: "🗡️", [playerDefence]: "🛡️" }) + "\n";
        res += this.render({ [playerPreviosPosition]: "▫️", [enemyPreviosPosition]: "▫️", [this.playerPosition]: "🟦", [this.enemyPosition]: "🟨" }) + "\n";
        res += this.render({ [enemyAttack]: "🗡️", [enemyDefence]: "🛡️" }) + "\n";
      }
      if (playerAttack == this.enemyPosition && enemyDefence != this.enemyPosition && enemyAttack != this.playerPosition) {
        this.winningFlag = 1 /* win */;
        res += "你击中了对手！";
      } else if (enemyAttack == this.playerPosition && playerDefence != this.playerPosition && playerAttack != this.enemyPosition) {
        this.winningFlag = 2 /* lose */;
        res += "对手击中了你！";
      }
      if (this.playerPosition < 0 || this.playerPosition > 10) {
        this.winningFlag = 2 /* lose */;
        res += "你走出了场地！";
      }
      if (this.enemyPosition < 0 || this.enemyPosition > 10) {
        this.winningFlag = 1 /* win */;
        res += "对手走出了场地！";
      }
      if (this.winningFlag != 4 /* pending */) {
        return res;
      }
    }, "renderAndJudge");
    renderAndJudge();
    res += "------------------------------\n";
    playerAttack = void 0;
    enemyAttack = void 0;
    playerDefence = void 0;
    enemyDefence = void 0;
    switch (playerAction) {
      case 1 /* attack */:
        playerPreviosPosition = this.playerPosition;
        this.playerPosition += directionPlayerToEnemy;
        playerDefence = this.playerPosition;
        break;
      case 2 /* defence */:
        playerPreviosPosition = this.playerPosition;
        this.playerPosition -= directionPlayerToEnemy;
        break;
    }
    switch (enemyAction) {
      case 1 /* attack */:
        enemyPreviosPosition = this.enemyPosition;
        this.enemyPosition -= directionPlayerToEnemy;
        enemyDefence = this.enemyPosition;
        break;
      case 2 /* defence */:
        enemyPreviosPosition = this.enemyPosition;
        this.enemyPosition += directionPlayerToEnemy;
        break;
    }
    renderAndJudge();
    res += "选择很多……\n";
    for (let i = 0; i < this.availablePlayerActions.length; i++) {
      res += "/ " + _fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i]);
    }
    return res;
  }
};
var fencing = class extends abstractGame {
  static {
    __name(this, "fencing");
  }
  constructor() {
    super(fencingSingleGame);
  }
};

// src/gameOneTouch.ts
var import_koishi14 = require("koishi");
var logger13 = new import_koishi14.Logger("satori-game-onetouch");
var SKILL_MAP = {
  // 基础技能
  "-1": {},
  "1": { pierceDamage: 1, bleed: 3, name: "锥刺" },
  //特性：流血
  "2": { pierceDamage: 1, stun: true, name: "点穴" },
  //特性：眩晕
  "3": { damage: 6, counterAttack: 3, name: "爪击" },
  //特性：反击
  "4": { shield: 1, name: "护盾" },
  //特性：护盾
  "5": { damage: 4, weakStun: true, name: "巴掌" },
  //特性：普通伤害+弱眩晕
  "6": { heal: 6, selfbleed: -2, name: "酒" },
  //特性：回血
  "7": { pierceDamage: 1, destroyShield: 2, name: "钻击" },
  //特性：破盾
  "8": { damage: 13, selfStun: true, name: "枪击" },
  //特性：高伤+自眩晕
  "9": { pierceDamage: 1, bleed: 2, strengthChange: -1, name: "钩" },
  //特性：削弱
  "0": { selfstrengthChange: 2, name: "蓄力" },
  //特性：蓄力
  // 组合技
  "1+8": { damage: 15, bleed: 3, selfStun: true, name: "空尖弹" },
  "5+5": { damage: 5, stun: true, name: "镇压" },
  "0+5": { selfstrengthChange: 5, name: "拜师学艺", addSelfLeft: 1, addSelfRight: 2 },
  "6+6": { heal: 15, selfstrengthChange: 1, selfbleed: -3, name: "狂宴" },
  "5+6": { name: "包扎", heal: 6, selfbleed: -5 },
  "1+9": { pierceDamage: 3, bleed: 5, strengthChange: -2, name: "收割" },
  "4+4": { shield: 4, heal: 5, name: "壁垒" },
  "4+6": { shield: 2, heal: 5, selfbleed: -3, name: "固守" },
  "8+8": { damage: 13, damageTimes: 2, selfStun: true, name: "双持" },
  "1+2": { pierceDamage: 3, vulnerablility: 3, stun: true, name: "弱点刺击" },
  "2+8": { damage: 12, stun: true, selfStun: true, addLeft: 1, addRight: 9, name: "点射" },
  "3+4": { name: "防御反击", shield: 1, counterAttack: 15 },
  "7+7": { pierceDamage: 7, destroyShield: 5, name: "穿龙枪" },
  "7+8": { pierceDamage: 13, destroyShield: 3, selfStun: true, name: "穿甲弹" },
  "2+6": { damage: 5, heal: 6, selfbleed: -1, selfstrengthChange: 1, stun: true, name: "点辰" },
  "3+7": { name: "混沌", counterAttack: 7, destroyShield: 2, addLeft: 9, addRight: 1 },
  "0+9": { name: "将大局逆转吧", revwersalOfStrength: true, selfstrengthChange: 2, strengthChange: -1 },
  "0+0": { name: "华丽收场", bleed: 5, selfstrengthChange: -99, magnificentEnd: true }
};
var OneTouchSingleGame = class extends abstractGameSingleGame {
  static {
    __name(this, "OneTouchSingleGame");
  }
  player;
  ai;
  level;
  winningFlag = 4 /* pending */;
  // 当前胜负状态
  turnCount;
  // 当前回合数
  baseHP = 40;
  // 初始血量
  playerLevelHP = 10;
  // 每级增加的血量
  aiLevelHp = 10;
  // AI每级增加的血量
  lastScore = 0;
  // 上一回合的分数
  bonus = 0;
  // 奖励分数
  singleBonus = 0;
  // 单回合的分数
  singleBonusMultiplier = 1;
  // 单回合的分数倍率
  comboCombos = 0;
  // 组合技连击次数
  constructor(disposeListener, session) {
    super(disposeListener, session);
  }
  async startGame() {
    super.startGame();
    this.turnCount = 0;
    this.bonus = 0;
    this.comboCombos = 0;
    this.player = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      status: 0 /* Normal */
    };
    this.ai = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      status: 0 /* Normal */
    };
    return await wrapInHTML2(`游戏开始！
对方的手势：左${this.ai.left} 右${this.ai.right}
你的手势：左${this.player.left} 右${this.player.right}
输入格式"左 右"选择要触碰的手
例如"左 右"表示用你的左手触碰对方的右手
注：
发送"游戏规则"查看游戏规则
发送"技能列表"查看技能列表
发送"结束游戏"退出游戏`);
  }
  // 结束游戏，返回结果
  endGame = async () => {
    if (this.winningFlag === 4 /* pending */ || this.winningFlag === 2 /* lose */) {
      this.bonus = Math.abs(Math.floor(this.level * 0.2 * this.bonus));
      this.bonus -= Math.floor(this.level * this.level * (Math.random() * 2 + 2) + 50);
      this.bonus = Math.min(this.bonus, 0);
    }
    if (this.winningFlag === 1 /* win */) {
      this.bonus = Math.floor(this.level * this.bonus * 0.1 * (Math.random() * 1 + 1));
    }
    const finalBonus = this.bonus;
    super.endGame();
    return { win: this.winningFlag, gameName: "一碰一", playerID: this.session.userId, bonus: finalBonus, message: this.level.toString() };
  };
  initState(level) {
    this.player = {
      left: this.player.left,
      right: this.player.right,
      hp: this.baseHP + level * this.playerLevelHP,
      shield: Math.round(6 - level / 2),
      strength: 0,
      bleed: 0,
      counterAttack: 0,
      vulnerablility: 0,
      status: 0 /* Normal */
    };
    this.ai = {
      left: this.ai.left,
      right: this.ai.right,
      hp: this.baseHP + level * this.aiLevelHp,
      shield: 0,
      strength: 0,
      bleed: 0,
      counterAttack: 0,
      vulnerablility: 0,
      status: 0 /* Normal */
    };
  }
  async processInput(input) {
    if (input === "游戏规则")
      return await wrapInHTML2(this.instuction);
    if (input === "技能列表")
      return await wrapInHTML2(this.skillList);
    if (this.turnCount === 0)
      this.initState(this.level);
    this.turnCount++;
    const [handA, handB] = input.split(" ");
    if (handA !== "左" && handA !== "右" || handB !== "左" && handB !== "右")
      return;
    if (this.winningFlag !== 4 /* pending */)
      return "游戏已结束";
    const numberA = this.player[handA === "左" ? "left" : "right"];
    const numberB = this.ai[handB === "左" ? "left" : "right"];
    const result = this.processPlayerTurn(numberA, numberB);
    const bestMove = this.ai.status === 1 /* Stunned */ ? [0, 0] : this.aiSearchEntrance();
    const aiResult = this.processAiTurn(bestMove[0], bestMove[1]);
    if (this.player.status === 1 /* Stunned */ && this.player.hp > 0 && this.ai.hp > 0)
      setTimeout(async () => {
        this.session.send(await this.processInput(input));
      }, 1e3);
    return await this.buildTurnResult(result, aiResult);
  }
  async buildTurnResult(result, aiResult) {
    const createStatusBar = /* @__PURE__ */ __name((value, max, width) => `[${"■".repeat(Math.max(Math.ceil(value / max * width), 0))}${"□".repeat(width - Math.max(Math.ceil(value / max * width)))}]`, "createStatusBar");
    const statusIcon = /* @__PURE__ */ __name((value, icon) => value != 0 ? `${icon}×${value}` : "", "statusIcon");
    const aiStatusDisplay = [
      `❤️${createStatusBar(this.ai.hp, Math.max(this.baseHP + this.level * this.aiLevelHp, this.ai.hp), Math.round(this.baseHP / 8 + this.level * this.aiLevelHp / this.playerLevelHP))} ${this.ai.hp}HP`,
      `🛡️${this.ai.shield}`,
      statusIcon(this.ai.bleed, "🩸"),
      statusIcon(this.ai.strength, "💪"),
      statusIcon(this.ai.counterAttack, "🗡️"),
      statusIcon(this.ai.vulnerablility, "💔"),
      this.ai.status === 1 /* Stunned */ ? "💫 眩晕" : ""
    ].filter(Boolean).join(" | ");
    const playerStatusDisplay = [
      `❤️${createStatusBar(this.player.hp, Math.max(this.baseHP + this.level * this.playerLevelHP, this.player.hp), Math.round(this.baseHP / 8 + this.level))} ${this.player.hp}HP`,
      `🛡️${this.player.shield}`,
      statusIcon(this.player.bleed, "🩸"),
      statusIcon(this.player.strength, "💪"),
      statusIcon(this.player.counterAttack, "🗡️"),
      statusIcon(this.player.vulnerablility, "💔"),
      this.player.status === 1 /* Stunned */ ? "💫 眩晕" : ""
    ].filter(Boolean).join(" | ");
    return wrapInHTML2(`▶️你的行动：${result}

▶️我的行动：${aiResult}

  我的当前手势：左${this.ai.left} 右${this.ai.right}
  你的当前手势：左${this.player.left} 右${this.player.right}

  图例：❤️ 生命值 | 🛡️ 护盾 | 🩸 流血 | 💪 力量 | 🗡️ 反击 | 💔 易伤 | 💫 眩晕
  ——————————————————我的状态———————————————————
  |${aiStatusDisplay}
  —————————————————————————————————————————

  ——————————————————你的状态———————————————————
  |${playerStatusDisplay}
  —————————————————————————————————————————
  ${this.judgeEnd() || ""}`);
  }
  judgeEnd() {
    if (this.ai.hp <= 0) {
      this.winningFlag = 1 /* win */;
      return `你赢了！发送"结束游戏"退出`;
    }
    if (this.player.hp <= 0) {
      this.winningFlag = 2 /* lose */;
      return `你输了！发送"结束游戏"退出`;
    }
  }
  processPlayerTurn(handA, handB) {
    if (this.player.status === 2 /* lastStunned */) {
      this.player.status = 0 /* Normal */;
    }
    if (this.player.status === 1 /* Stunned */) {
      this.player.status = 2 /* lastStunned */;
      this.applyEffect(this.player, this.ai, SKILL_MAP["-1"], false);
      return "你被眩晕，跳过回合" + this.buildResultMessage(SKILL_MAP["-1"], false, this.player, this.ai);
    }
    const sum = (handA + handB) % 10;
    this.player[handA === this.player.left ? "left" : "right"] = sum;
    let effect = SKILL_MAP[sum.toString()] || {};
    let isCombo = false;
    const combo = this.checkCombo(this.player["left"], this.player["right"]);
    if (combo) {
      isCombo = true;
      this.comboCombos++;
      effect = { ...combo };
    } else {
      this.comboCombos = 0;
    }
    const bonusMessage = this.buildMyTurnBonusMessage(effect, isCombo);
    this.applyEffect(this.player, this.ai, effect, !!combo);
    return this.buildResultMessage(effect, isCombo, this.player, this.ai) + (bonusMessage ? `

${bonusMessage}` : "");
  }
  // 生成玩家回合奖励信息
  buildMyTurnBonusMessage(effect, isCombo) {
    let bonusMessage = "";
    this.singleBonus = 0;
    this.singleBonusMultiplier = 1;
    if (isCombo) {
      this.singleBonus += 10;
      bonusMessage += `触发组合技，获得10点分数!
`;
    }
    if ((effect.damage || 0) * (effect.damageTimes || 1) >= 20 && this.ai.shield === 0) {
      const effectBonus = Math.round((effect.damage || 0) * (effect.damageTimes || 1) * 0.8);
      this.singleBonus += effectBonus;
      bonusMessage += `沉重一击！获得${effectBonus}点分数!
`;
    }
    if ((effect.pierceDamage || 0) >= 15) {
      const effectBonus = Math.round(effect.pierceDamage * 0.5);
      this.singleBonus += effectBonus;
      bonusMessage += `穿刺一击！获得${effectBonus}点分数!
`;
    }
    if ((effect.destroyShield || 0) >= Math.min(this.ai.shield, 3) && this.ai.shield > 1) {
      const effectBonus = Math.round(this.ai.shield * 5);
      this.singleBonus += effectBonus;
      bonusMessage += `快速破盾！获得${effectBonus}点分数!
`;
    }
    if ((effect.bleed || 0) + this.ai.bleed > 9) {
      const effectBonus = Math.round(this.ai.bleed);
      this.singleBonus += effectBonus;
      bonusMessage += `流血打击！获得${effectBonus}点分数!
`;
    }
    if (effect.shield && (effect.shield || 0) + this.player.shield >= 5) {
      const effectBonus = Math.round(((effect.shield || 0) + this.player.shield) * 2);
      this.singleBonus += effectBonus;
      bonusMessage += `强效护盾！获得${effectBonus}点分数!
`;
    }
    if ((effect.selfbleed || 0) < -2 && this.player.bleed > -effect.selfbleed) {
      const effectBonus = Math.round(this.player.bleed * 2);
      this.singleBonus += effectBonus;
      bonusMessage += `关键治疗！获得${effectBonus}点分数!
`;
    }
    if ((effect.stun || effect.weakStun && this.ai.shield === 0) && this.ai.status === 0 /* Normal */ && this.ai.bleed > 5) {
      const effectBonus = Math.round(this.ai.bleed * 2);
      this.singleBonus += effectBonus;
      bonusMessage += `流血眩晕！获得${effectBonus}点分数!
`;
    }
    if ((effect.strengthChange || 0) < -1 && this.ai.strength < 0) {
      const effectBonus = Math.round(effect.strengthChange * -5);
      this.singleBonus += effectBonus;
      bonusMessage += `强效削弱！获得${effectBonus}点分数!
`;
    }
    if (this.ai.counterAttack > 0 && !effect.damage && !effect.pierceDamage) {
      const effectBonus = Math.round(this.ai.counterAttack);
      this.singleBonus += effectBonus;
      bonusMessage += `反击规避！获得${effectBonus}点分数!
`;
    }
    if (this.player.hp < 10 && !this.player.shield && (effect.damage || effect.pierceDamage)) {
      const effectBonus = (10 - this.player.hp) * 2;
      this.singleBonus += effectBonus;
      bonusMessage += `濒死反击！获得${effectBonus}点分数!
`;
    }
    if (effect.revwersalOfStrength && this.player.strength <= this.ai.strength - 5) {
      const effectBonus = Math.min((this.ai.strength - this.player.strength) * 3, 100);
      this.singleBonus += effectBonus;
      bonusMessage += `逆转大局！获得${effectBonus}点分数!
`;
    }
    if ((effect.damage || 0) + (effect.pierceDamage || 0) >= 10 && this.ai.vulnerablility > 0) {
      const effectBonus = this.ai.vulnerablility * 0.1;
      this.singleBonusMultiplier += effectBonus;
      bonusMessage += `易伤打击！本回合分数增加${100 * effectBonus}%!
`;
    }
    if (this.turnCount === 4 + Math.round(this.level / 3) && this.player.hp > this.ai.hp * 1.2 && this.player.shield > this.ai.shield && this.player.strength > this.ai.strength && this.player.bleed < this.ai.bleed) {
      const effectBonus = Math.round(this.player.hp * 0.1 + this.player.shield + this.player.strength * 0.5);
      this.singleBonus += effectBonus;
      this.singleBonusMultiplier *= 2;
      bonusMessage += `压倒性的优势！获得${effectBonus}点分数！本回合分数*2！
`;
    }
    if (effect.magnificentEnd && this.ai.bleed > 1) {
      const effectBonus = Math.round(this.ai.bleed * 1.5);
      this.singleBonusMultiplier *= effectBonus;
      this.bonus *= 2;
      bonusMessage += `华丽收场！当前总分数*2，本回合分数*${effectBonus}!
`;
    }
    if (this.comboCombos >= 1) {
      this.singleBonusMultiplier += this.comboCombos / 5;
      bonusMessage += `组合技连击${this.comboCombos}次！本回合分数+${20 * this.comboCombos}%！`;
    }
    return bonusMessage;
  }
  processAiTurn(handA, handB) {
    if (this.ai.hp <= 0)
      return `已经结束游戏

` + this.buildAiTurnBonusMessage(SKILL_MAP["-1"]);
    if (this.ai.status === 2 /* lastStunned */) {
      this.ai.status = 0 /* Normal */;
    }
    if (this.ai.status === 1 /* Stunned */) {
      this.ai.status = 2 /* lastStunned */;
      this.applyEffect(this.ai, this.player, SKILL_MAP["-1"], false);
      return "被眩晕，跳过回合，本回合分数奖励继承到下一回合" + this.buildResultMessage(SKILL_MAP["-1"], false, this.ai, this.player);
    }
    const sum = (handA + handB) % 10;
    this.ai[handA === this.ai.left ? "left" : "right"] = sum;
    let effect = SKILL_MAP[sum.toString()] || {};
    let isCombo = false;
    const combo = this.checkCombo(this.ai["left"], this.ai["right"]);
    if (combo) {
      isCombo = true;
      effect = { ...combo };
    }
    const bonusMessage = this.buildAiTurnBonusMessage(effect);
    this.applyEffect(this.ai, this.player, effect, !!combo);
    return handA + "碰" + handB + "，" + this.buildResultMessage(effect, isCombo, this.ai, this.player) + (bonusMessage ? `

${bonusMessage}` : "");
  }
  buildAiTurnBonusMessage(effect) {
    let bonusMessage = "";
    if ((effect.damage || effect.pierceDamage) && this.player.counterAttack > 0) {
      const effectBonus = Math.max(this.player.counterAttack + this.player.strength, 0);
      this.singleBonus += effectBonus;
      bonusMessage += `反击！获得${effectBonus}点分数!
`;
    }
    if ((effect.damage || 0) > 12 && this.player.shield > 0) {
      const effectBonus = Math.round(effect.damage);
      this.singleBonus += effectBonus;
      bonusMessage += `关键格挡！获得${effectBonus}点分数!
`;
    }
    if (this.player.shield > 0 && effect.damage && this.player.counterAttack > 0) {
      const effectBonus = Math.round(this.player.shield * 2 + this.player.counterAttack);
      this.singleBonus += effectBonus;
      bonusMessage += `盾反！获得${effectBonus}点分数!
`;
    }
    if (effect.damage && this.player.vulnerablility > 0 && this.player.shield > 0) {
      const effectBonus = 0.5;
      this.singleBonusMultiplier += effectBonus;
      bonusMessage += `易伤保护！本回合分数增加${100 * effectBonus}%!
`;
    }
    if (effect.weakStun && this.player.shield > 0) {
      const effectBonus = 0.3;
      this.singleBonusMultiplier += effectBonus;
      bonusMessage += `眩晕格挡！本回合分数增加${100 * effectBonus}%!
`;
    }
    const turnBonus = Math.round(this.singleBonus * this.singleBonusMultiplier);
    this.bonus += turnBonus;
    bonusMessage += `本回合总计获得${this.singleBonus}*${this.singleBonusMultiplier}=${turnBonus}点分数
当前总分数：${this.bonus}`;
    this.singleBonus = 0;
    this.singleBonusMultiplier = 1;
    return bonusMessage;
  }
  // damage?: number // 普通伤害
  // damageTimes?: number // 伤害次数
  // pierceDamage?: number // 穿刺伤害
  // bleed?: number // 流血
  // stun?: boolean // 眩晕
  // destroyShield?: number // 破坏护盾
  // weakStun?: boolean // 弱眩晕
  // strengthChange?: number // 力量变化
  // heal?: number // 治疗
  // shield?: number // 护盾
  // selfbleed?: number // 自身流血
  // selfStun?: boolean // 自身眩晕
  // selfstrengthChange?: number // 自身力量变化
  applyEffect(self, enemy, effect, isCombo) {
    if (effect.revwersalOfStrength) {
      const temp = self.strength;
      self.strength = enemy.strength;
      enemy.strength = temp;
    }
    if (effect.pierceDamage)
      enemy.hp -= Math.max(effect.pierceDamage + (self.strength || 0), 0);
    if (effect.destroyShield)
      enemy.shield = Math.max(0, enemy.shield - effect.destroyShield);
    if (effect.bleed)
      enemy.bleed += effect.bleed;
    if (effect.strengthChange)
      enemy.strength = enemy.strength + effect.strengthChange;
    if (effect.addLeft)
      enemy.left = (enemy.left + effect.addLeft) % 10;
    if (effect.addRight)
      enemy.right = (enemy.right + effect.addRight) % 10;
    if (effect.vulnerablility)
      enemy.vulnerablility = (enemy.vulnerablility || 0) + effect.vulnerablility;
    if (effect.heal)
      self.hp += effect.heal;
    if (effect.shield)
      self.shield = Math.min(self.shield + effect.shield, 5);
    if (effect.selfstrengthChange)
      self.strength = self.strength + effect.selfstrengthChange;
    if (effect.addSelfLeft)
      self.left = (self.left + effect.addSelfLeft) % 10;
    if (effect.addSelfRight)
      self.right = (self.right + effect.addSelfRight) % 10;
    if (effect.damage) {
      effect.damageTimes = effect.damageTimes || 1;
      for (let i = 0; i < effect.damageTimes; i++) {
        const blocked = enemy.shield > 0;
        enemy.shield = Math.max(0, enemy.shield - (isCombo ? 2 : 1));
        if (!blocked) {
          enemy.hp -= Math.round(Math.max(0, effect.damage + (self.strength || 0)) * (enemy.vulnerablility ? 1.5 : 1));
          if (effect.weakStun && enemy.status !== 2 /* lastStunned */) {
            enemy.status = 1 /* Stunned */;
          }
        }
      }
    }
    if (self.counterAttack)
      self.counterAttack = 0;
    if (effect.counterAttack)
      self.counterAttack = effect.counterAttack;
    if (enemy.counterAttack > 0 && (effect.damage > 0 || effect.pierceDamage > 0))
      self.hp -= Math.max(enemy.counterAttack + (enemy.strength || 0), 0);
    if (effect.selfbleed)
      self.bleed += effect.selfbleed;
    if (self.bleed > 0)
      self.hp -= self.bleed;
    self.bleed = Math.max(0, self.bleed - 1);
    if (effect.magnificentEnd) {
      enemy.hp -= enemy.bleed * (enemy.bleed + 1) / 2;
      enemy.bleed = 0;
    }
    if (self.vulnerablility)
      self.vulnerablility = Math.max(0, self.vulnerablility - 1);
    if (effect.stun && enemy.status !== 2 /* lastStunned */)
      enemy.status = 1 /* Stunned */;
    if (effect.selfStun && self.status !== 2 /* lastStunned */)
      self.status = 1 /* Stunned */;
    return;
  }
  checkCombo(a, b) {
    const key = `${Math.min(a, b)}+${Math.max(a, b)}`;
    return SKILL_MAP[key] || null;
  }
  buildResultMessage(effect, isCombo, self, enemy) {
    let msg = [];
    if (effect.name)
      msg.push(`${effect.name}!`);
    if (effect.revwersalOfStrength)
      msg.push(`双方力量反转！`);
    if (effect.pierceDamage)
      msg.push(`对对方造成穿刺伤害${Math.max(0, effect.pierceDamage + (self.strength || 0))}`);
    if (effect.damage)
      msg.push(`对对方造成${Math.round(Math.max(0, effect.damage + (self.strength || 0)) * (enemy.vulnerablility ? 1.5 : 1))}伤害`);
    if (effect.damageTimes)
      msg.push(`${effect.damageTimes}次`);
    if (effect.heal)
      msg.push(`自身恢复${effect.heal}生命`);
    if (effect.selfbleed)
      msg.push(`自身流血${effect.selfbleed > 0 ? "增加" : "减少"}${Math.abs(effect.selfbleed)}`);
    if (effect.bleed)
      msg.push(`对方叠加${effect.bleed}层流血`);
    if (effect.shield)
      msg.push(`自身获得${effect.shield}层护盾`);
    if (effect.destroyShield)
      msg.push(`破坏对方${effect.destroyShield}层护盾`);
    if (effect.vulnerablility)
      msg.push(`给予对方易伤${effect.vulnerablility}层`);
    if (effect.strengthChange)
      msg.push(`对方力量${effect.strengthChange > 0 ? "增加" : "减少"}${Math.abs(effect.strengthChange)}`);
    if (effect.selfstrengthChange)
      msg.push(`自身力量${effect.selfstrengthChange > 0 ? "增加" : "减少"}${Math.abs(effect.selfstrengthChange)}`);
    if (effect.counterAttack)
      msg.push(`获得${effect.counterAttack}层反击`);
    if (effect.addSelfLeft)
      msg.push(`自身左手增加${effect.addSelfLeft}`);
    if (effect.addSelfRight)
      msg.push(`自身右手增加${effect.addSelfRight}`);
    if (effect.addLeft)
      msg.push(`对方左手增加${effect.addLeft}`);
    if (effect.addRight)
      msg.push(`对方右手增加${effect.addRight}`);
    if (effect.magnificentEnd)
      msg.push(`结算对方所有流血`);
    if (enemy.status !== 2 /* lastStunned */) {
      if (effect.stun)
        msg.push(`眩晕对方`);
      if (effect.weakStun && enemy.shield === 0)
        msg.push(`弱眩晕对方`);
    }
    if (effect.selfStun)
      msg.push(`眩晕自己`);
    if (enemy.counterAttack > 0 && (effect.damage > 0 || effect.pierceDamage > 0))
      msg.push(`被反击${enemy.counterAttack + (enemy.strength || 0)}穿刺伤害`);
    if (self.bleed > 0)
      msg.push(`自身受到流血伤害${self.bleed + 1}`);
    if (isCombo)
      msg.unshift("触发组合技！\n");
    return msg.join(" ");
  }
  aiSearchEntrance() {
    let bestScore = -Infinity;
    let bestMove = [0, 0];
    const possibleMoves = this.generatePossibleMoves(this.ai, this.player);
    for (const move of possibleMoves) {
      const simulatedState = [
        this.cloneState(this.player),
        this.cloneState(this.ai)
      ];
      const newState = this.simulateMove(move, simulatedState, 1);
      const score = this.aiSearch(
        Math.round(this.level / 2),
        false,
        newState,
        -Infinity,
        Infinity
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    logger13.info(`AI选择的动作：${bestMove[0]}碰${bestMove[1]}, 分数：${bestScore}`);
    if (this.turnCount > 5)
      this.session.sendQueued(this.generateChat(bestScore), 1e3);
    this.lastScore = bestScore;
    return bestMove;
  }
  aiSearch(depth, isMaximizing, currentState, alpha, beta) {
    if (depth === 0 || currentState[0].hp <= 0 || currentState[1].hp <= 0) {
      return this.evaluateState(currentState);
    }
    const possibleMoves = this.generatePossibleMoves(currentState[isMaximizing ? 1 : 0], currentState[isMaximizing ? 0 : 1]);
    let value = isMaximizing ? -Infinity : Infinity;
    for (const move of possibleMoves) {
      const nowState = [
        this.cloneState(currentState[0]),
        this.cloneState(currentState[1])
      ];
      const newState = this.simulateMove(move, nowState, isMaximizing ? 1 : 0);
      const evalResult = this.aiSearch(
        depth - 1,
        !isMaximizing,
        newState,
        alpha,
        beta
      );
      if (isMaximizing) {
        value = Math.max(value, evalResult);
        alpha = Math.max(alpha, evalResult);
        if (alpha >= beta)
          break;
      } else {
        value = Math.min(value, evalResult);
        beta = Math.min(beta, evalResult);
        if (beta <= alpha)
          break;
      }
    }
    return value;
  }
  // 生成所有合法动作（左手/右手触碰对方左右手）
  generatePossibleMoves(attacker, defender) {
    let moves = [];
    for (const targetHand of [0, 1]) {
      moves.push([attacker.left, defender[targetHand ? "right" : "left"]]);
      moves.push([attacker.right, defender[targetHand ? "right" : "left"]]);
    }
    return moves;
  }
  // 克隆玩家状态
  cloneState(state) {
    return {
      left: state.left,
      right: state.right,
      hp: state.hp,
      shield: state.shield,
      strength: state.strength,
      bleed: state.bleed,
      counterAttack: state.counterAttack,
      vulnerablility: state.vulnerablility,
      status: state.status
    };
  }
  // 模拟执行动作并更新状态
  simulateMove(move, state, attackerIndex) {
    const [handA, handB] = move;
    let attacker = state[attackerIndex];
    let defender = state[1 - attackerIndex];
    if (attacker.status === 2 /* lastStunned */)
      attacker.status = 0 /* Normal */;
    if (attacker.status === 1 /* Stunned */) {
      attacker.status = 2 /* lastStunned */;
      this.applyEffect(attacker, defender, SKILL_MAP["-1"], false);
    } else {
      const sum = (handA + handB) % 10;
      attacker[handA === attacker.left ? "left" : "right"] = sum;
      const combo = this.checkCombo(attacker.left, attacker.right);
      const effect = combo ? combo : SKILL_MAP[sum.toString()] || {};
      this.applyEffect(attacker, defender, effect, !!combo);
    }
    if (attackerIndex === 1) {
      const temp = attacker;
      attacker = defender;
      defender = temp;
    }
    const result = [attacker, defender];
    return result;
  }
  // 增强版局面评估函数
  evaluateState(state) {
    const ai = state[1];
    const player = state[0];
    const aiBaseHP = this.baseHP + this.level * this.aiLevelHp;
    const playerBaseHP = this.baseHP + this.level * this.playerLevelHP;
    let score = ai.hp - player.hp;
    if (ai.hp < aiBaseHP / 2)
      score -= Math.round(aiBaseHP / 4);
    if (player.hp < playerBaseHP / 2)
      score += Math.round(playerBaseHP / 4);
    if (ai.hp < aiBaseHP / 4)
      score -= Math.round(aiBaseHP / 4);
    if (player.hp < playerBaseHP / 4)
      score += Math.round(playerBaseHP / 4);
    if (ai.hp < aiBaseHP / 8)
      score -= Math.round(aiBaseHP / 4);
    if (player.hp < playerBaseHP / 8)
      score += Math.round(playerBaseHP / 4);
    score += Math.min(ai.strength * 5, 100);
    score -= Math.max(player.strength * 5, -100);
    score += ai.shield * 8;
    score -= player.shield * 8;
    score -= Math.min(Math.round(ai.bleed * ai.bleed / 2.5));
    score += Math.min(Math.round(player.bleed * player.bleed / 2.5));
    if (ai.status === 1 /* Stunned */)
      score -= 10;
    if (player.status === 1 /* Stunned */)
      score += 10;
    if (ai.counterAttack > 0)
      score += Math.max(ai.counterAttack + (ai.strength || 0), 0);
    if (player.counterAttack > 0)
      score -= Math.max(player.counterAttack + (player.strength || 0), 0);
    if (ai.vulnerablility > 0)
      score -= Math.round(ai.vulnerablility * 4);
    if (player.vulnerablility > 0)
      score += Math.round(player.vulnerablility * 4);
    if (player.hp <= 0)
      score += 1e5;
    if (ai.hp <= 0)
      score -= 1e6;
    return score;
  }
  generateChat(Score) {
    if (this.lastScore < 9e4 && Score > 9e4) {
      return "我觉得你要输了哦~";
    }
    if (this.lastScore < 0 && Score > 0 && Math.random() > 0.5) {
      return "局势发生变化了呢~";
    }
    if (Score - this.lastScore > 10 && Math.random() > 0.8)
      return "看招！";
  }
  instuction = `游戏说明：
  这个游戏的基本玩法是：
  两个人玩，两只手分别可以做出"一到十"的手势，每一种手势代表一个招式。
  例如"三"是${SKILL_MAP["3"].name}，"四"是${SKILL_MAP["4"].name}等；当两只手符合特定组合时还可以触发组合技；
  每个人在自己的回合可以选择用自己的一只手碰对方的另一只手，两者数值相加，如果超过十仅保留个位。
  例如自己的"一"碰对方的"二"变成"三"同时触发技能"${SKILL_MAP["3"].name}"对对方造成伤害。
  每次开局两人初始手势随机，由玩家先手，双方轮流行动。
  当自身两手手势相同时，无论选择左手还是右手最终发生变化的都是左手。
  玩家初始有"${this.baseHP} + ${this.playerLevelHP} * 难度"血量。
  ai初始有"${this.baseHP} + ${this.aiLevelHp} * 难度"血量。
  玩家初始有"6 - 难度 / 2"护盾，四舍五入取整。
  血量没有上限，率先将对方血量减到零的人获胜：

  游戏名称说明：
  流血效果：每次到自己回合结束时，收到流血层数点伤害，不可被护盾阻挡，然后流血层数减1;
  护盾效果：每一层护盾可阻挡下一次受到的普通伤害，如果伤害来源是组合技则消耗两层护盾(若仅有一层则消耗一层)。护盾上限为五层。
  眩晕效果：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（即不可被连续眩晕）
  弱眩晕效果：若对方没有护盾，则眩晕对方一回合
  反击：下一回合若对方行动中有攻击，则对方攻击前受到反击层数点穿刺伤害，此效果受力量加成，且仅持续一回合
  穿刺伤害：不被护盾影响的伤害（不会消耗护盾）
  力量效果：每有一点力量，每次造成的伤害+1，若为负数则减一
  易伤效果：受到的普通伤害+50%，自己的回合结束时减少一层
  组合技：在触碰完成后，若你的两只手手势符合组合技条件，则触发组合技，组合技的效果会覆盖普通技能的效果，组合无序
  bonus: 当行动导致关键效果时，获得额外奖励，在ai回合结束时结算，若ai被眩晕则奖励继承到下一回合
  `;
  skillList = `
  具体的技能设计如下：
  一：${SKILL_MAP["1"].name}：造成${SKILL_MAP["1"].pierceDamage}穿刺伤害，${SKILL_MAP["1"].bleed}流血;
  二：${SKILL_MAP["2"].name}：造成${SKILL_MAP["2"].pierceDamage}穿刺伤害，眩晕对方；
  三：${SKILL_MAP["3"].name}：造成${SKILL_MAP["3"].damage}伤害，获得${SKILL_MAP["3"].counterAttack}层反击；
  四：${SKILL_MAP["4"].name}：获得${SKILL_MAP["4"].shield}层护盾；
  五：${SKILL_MAP["5"].name}：造成${SKILL_MAP["5"].damage}伤害，弱眩晕对方；
  六：${SKILL_MAP["6"].name}：恢复${SKILL_MAP["6"].heal}生命，若有流血则自身${SKILL_MAP["6"].selfbleed}流血；
  七：${SKILL_MAP["7"].name}：造成${SKILL_MAP["7"].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP["7"].destroyShield}层护盾；
  八：${SKILL_MAP["8"].name}：造成${SKILL_MAP["8"].damage}伤害，眩晕自己；
  九：${SKILL_MAP["9"].name}：造成${SKILL_MAP["9"].pierceDamage}穿刺伤害，${SKILL_MAP["9"].bleed}流血，对方${SKILL_MAP["9"].strengthChange}力量；
  十：${SKILL_MAP["0"].name}：增加自身${SKILL_MAP["0"].selfstrengthChange}力量；
  组合技：
  一+八：${SKILL_MAP["1+8"].name}：对对方造成${SKILL_MAP["1+8"].damage}伤害，${SKILL_MAP["1+8"].bleed}流血，眩晕自己
  五+五：${SKILL_MAP["5+5"].name}：对对方造成${SKILL_MAP["5+5"].damage}伤害，眩晕对方
  五+十：${SKILL_MAP["0+5"].name}：自身增加${SKILL_MAP["0+5"].selfstrengthChange}力量，左手数值增加${SKILL_MAP["0+5"].addSelfLeft}，右手数值增加${SKILL_MAP["0+5"].addSelfRight}
  六+六：${SKILL_MAP["6+6"].name}：恢复${SKILL_MAP["6+6"].heal}生命，增加自身${SKILL_MAP["6+6"].selfstrengthChange}力量，自身${SKILL_MAP["6+6"].selfbleed}流血
  五+六：${SKILL_MAP["5+6"].name}：恢复${SKILL_MAP["5+6"].heal}生命，自身${SKILL_MAP["5+6"].selfbleed}流血
  一+九：${SKILL_MAP["1+9"].name}：对对方造成${SKILL_MAP["1+9"].pierceDamage}穿刺伤害，${SKILL_MAP["1+9"].bleed}流血，对方${SKILL_MAP["1+9"].strengthChange}力量
  四+四：${SKILL_MAP["4+4"].name}：获得${SKILL_MAP["4+4"].shield}层护盾，恢复${SKILL_MAP["4+4"].heal}生命
  四+六：${SKILL_MAP["4+6"].name}：获得${SKILL_MAP["4+6"].shield}层护盾，自身${SKILL_MAP["4+6"].selfbleed}流血，恢复${SKILL_MAP["4+6"].heal}生命
  八+八：${SKILL_MAP["8+8"].name}：造成${SKILL_MAP["8+8"].damage}伤害${SKILL_MAP["8+8"].damageTimes}次，眩晕自己
  一+二：${SKILL_MAP["1+2"].name}：给于对方${SKILL_MAP["1+2"].vulnerablility}易伤，造成${SKILL_MAP["1+2"].pierceDamage}穿刺伤害，眩晕对方
  二+八：${SKILL_MAP["2+8"].name}：造成${SKILL_MAP["2+8"].damage}伤害，对方左手数值增加${SKILL_MAP["2+8"].addLeft}，右手数值增加${SKILL_MAP["2+8"].addRight}，眩晕对方，眩晕自己
  三+四：${SKILL_MAP["3+4"].name}：获得${SKILL_MAP["3+4"].shield}层护盾，获得${SKILL_MAP["3+4"].counterAttack}层反击。
  七+七：${SKILL_MAP["7+7"].name}：造成${SKILL_MAP["7+7"].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP["7+7"].destroyShield}层护盾
  七+八：${SKILL_MAP["7+8"].name}：造成${SKILL_MAP["7+8"].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP["7+8"].destroyShield}层护盾，眩晕自己
  六+二：${SKILL_MAP["2+6"].name}：造成${SKILL_MAP["2+6"].damage}伤害，恢复${SKILL_MAP["2+6"].heal}生命，自身${SKILL_MAP["2+6"].selfbleed}流血，自身增加${SKILL_MAP["2+6"].selfstrengthChange}力量，眩晕对方
  三+七：${SKILL_MAP["3+7"].name}：获得${SKILL_MAP["3+7"].counterAttack}层反击，破坏对方${SKILL_MAP["3+7"].destroyShield}层护盾，对方左手数值增加${SKILL_MAP["3+7"].addLeft}，右手数值增加${SKILL_MAP["3+7"].addRight}
  九+十：${SKILL_MAP["0+9"].name}：逆转双方力量，然后增加自身${SKILL_MAP["0+9"].selfstrengthChange}力量，对方${SKILL_MAP["0+9"].strengthChange}力量
  十+十：${SKILL_MAP["0+0"].name}：对对方造成${SKILL_MAP["0+0"].bleed}流血，自身${SKILL_MAP["0+0"].selfstrengthChange}力量，然后立即结算对方全部流血
  `;
};
var OneTouchGame = class extends abstractGame {
  static {
    __name(this, "OneTouchGame");
  }
  constructor() {
    super(OneTouchSingleGame);
  }
  async startGame(session, ctx, args) {
    let level;
    if (!isNaN(parseInt(args[0])))
      level = parseInt(args[0]);
    else {
      setTimeout(() => {
        session.send("未输入难度等级(2-10)，默认设为3");
      }, 500);
      level = 3;
    }
    if (level < 2 || level > 10) {
      level = level < 2 ? 2 : 10;
      setTimeout(() => {
        session.send("难度等级必须在2到10之间,已调整为" + level);
      }, 500);
    }
    const game = await super.startGame(session, ctx, args);
    game.level = level;
    return game;
  }
};
async function wrapInHTML2(str) {
  if (!puppeteer) {
    logger13.warn("puppeteer未就绪");
    return "出现错误，请联系管理员";
  }
  return puppeteer.render(`<html><body>${str.replaceAll(/\n/g, "<BR>")}</body>
          <style>
          body {
            padding: 10px;
            display: inline-block;
           }
          </style>
          </html>`);
}
__name(wrapInHTML2, "wrapInHTML");

// src/game.ts
var logger14 = new import_koishi15.Logger("satori-game");
var Game = class {
  static {
    __name(this, "Game");
  }
  GAMES = ["一碰一"];
  // 支持的游戏列表
  channelGames = /* @__PURE__ */ new Map();
  // 频道ID到游戏名称的映射
  availableGames = /* @__PURE__ */ new Map();
  // 游戏名称到实例的映射
  userUsage = /* @__PURE__ */ new Map();
  context;
  config;
  sat;
  constructor(ctx, cfg, sat) {
    this.context = ctx;
    this.config = cfg;
    this.sat = sat;
    if (this.config.enable_fencing) {
      this.availableGames.set("击剑", new fencing());
    }
    if (this.config.enable_OneTouch) {
      this.availableGames.set("一碰一", new OneTouchGame());
    }
    this.registerCommands(ctx);
    ctx.on("game-result", async (session, result) => {
      this.resultJudge(result, ctx, session);
    });
  }
  // 注册 Koishi 命令
  registerCommands(ctx) {
    ctx.command("sat.game [gameName] [...args]", "开始游戏").alias("开始游戏").action(async ({ session }, gameName, ...args) => this.startGame(session, gameName || "", args));
    ctx.command("sat.endgame", "结束游戏").alias("结束游戏").action(async ({ session }) => this.endGame(session));
  }
  // 启动指定游戏
  async startGame(session, gameName, args) {
    if (this.channelGames.get(session.channelId))
      return "当前频道已经有游戏在进行中";
    if (gameName == "")
      return this.getGameList();
    if (!this.GAMES.includes(gameName))
      return "没有这个游戏哦";
    const game = this.availableGames.get(gameName);
    if (!game)
      return "没有这个游戏哦";
    const user = await ensureUserExists(this.context, session.userId, session.username);
    const lastUsage = this.userUsage.get(`${session.userId}-${gameName}`);
    if (lastUsage && user.userlevel < 4) {
      const elapsed = Date.now() - lastUsage;
      const cooldown = this.getGameCd(gameName) * 1e3;
      if (elapsed < cooldown) {
        const remains = Math.ceil((cooldown - elapsed) / 1e3);
        return `游戏冷却中，还有 ${remains} 秒`;
      }
    }
    this.userUsage.set(`${session.userId}-${gameName}`, Date.now());
    refreshPuppeteer(this.context);
    game.startGame(session, this.context, args);
    this.channelGames.set(session.channelId, gameName);
    logger14.info(`游戏${gameName}已开始于${session.channelId}`);
  }
  // 结束当前游戏
  async endGame(session) {
    const gameName = this.channelGames.get(session.channelId);
    if (!gameName)
      return "当前频道没有游戏在进行中";
    if (await this.availableGames.get(gameName).endGame(session, this.context)) {
      this.channelGames.delete(session.channelId);
      logger14.info(`${session.channelId}的游戏已结束`);
    }
  }
  async chat(session, gameName, prompt) {
    switch (gameName) {
      case "五子棋":
        const response = (await this.sat.generateResponse(session, "")).content;
      default:
        return "没有这个游戏哦";
    }
  }
  getGameCd(gameName) {
    switch (gameName) {
      case "一碰一":
        return this.config.cd_for_OneTouch;
      default:
        return 0;
    }
  }
  getGameList() {
    let list = "游戏列表：\n";
    this.GAMES.forEach((game) => {
      list += game + "\n";
    });
    logger14.info(list);
    return list;
  }
  async resultJudge(result, ctx, session) {
    const user = await getUser(ctx, result.playerID);
    switch (result.gameName) {
      case "五子棋":
        const goBangResult = result;
        const goBanglevel = parseInt(goBangResult.message);
        const goBangbonus = Math.floor(goBanglevel * goBanglevel * goBanglevel * (Math.random() * 2 + 2));
        if (goBangResult.win === 1 /* win */) {
          updateUserP(ctx, user, goBangbonus * 2);
          updateFavorability(ctx, user, goBanglevel * 2);
          session.send("真厉害，奖励你" + goBangbonus * 2 + "p点,好感度+" + goBanglevel * 2);
        } else if (goBangResult.win === 2 /* lose */) {
          updateUserP(ctx, user, -goBangbonus);
          session.send("真可惜，你输了" + goBangbonus + "p点");
        } else if (goBangResult.win === 3 /* draw */)
          session.send("平局，稍后再战吧");
        else {
          updateUserP(ctx, user, -goBangbonus);
          session.send("游戏中断，你输了" + goBangbonus + "p点");
        }
        return;
      case "一碰一":
        const oneTouchResult = result;
        const oneTouchBonus = oneTouchResult.bonus;
        if (oneTouchResult.win === 1 /* win */) {
          updateUserP(ctx, user, oneTouchBonus);
          updateFavorability(ctx, user, Math.round(oneTouchBonus * 0.02));
          session.send("真厉害，奖励你" + oneTouchBonus + "p点,好感度+" + Math.round(oneTouchBonus * 0.02));
        } else if (oneTouchResult.win === 2 /* lose */) {
          updateUserP(ctx, user, oneTouchBonus);
          session.send("真可惜，你输了" + -oneTouchBonus + "p点");
        } else {
          updateUserP(ctx, user, oneTouchBonus);
          session.send("游戏中断，你输了" + -oneTouchBonus + "p点");
        }
        return;
      default:
        return;
    }
  }
};

// src/broadcast.ts
var import_koishi16 = require("koishi");
var logger15 = new import_koishi16.Logger("satori-ai-broadcast");
var BroadcastManager = class {
  static {
    __name(this, "BroadcastManager");
  }
  ctx;
  config;
  idCounter = 0;
  broadcastMessages = /* @__PURE__ */ new Map();
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.config = cfg;
    this.idCounter = 0;
    ctx.command("sat.broadcast <text:text>", "推送广播", { authority: 4 }).alias("广播").option("delete", "-d <id:string>", { authority: 4 }).option("list", "-l", { authority: 4 }).option("img", "-i", { authority: 4 }).action(async ({ options }, prompt) => {
      refreshPuppeteer(this.ctx);
      if (options.list) {
        const list = this.broadcastMessages.size > 0 ? await this.getBroadcastList() : null;
        return list ? `${list}` : "当前没有广播";
      }
      if (options.delete) {
        return await this.deleteBroadcast(options.delete);
      } else {
        return await this.createBroadcast(prompt, options.img);
      }
    });
  }
  async createBroadcast(message, img) {
    const id = `broadcast-${this.idCounter++}`;
    const broadcast = new broadcastMessage(this.ctx, this.config, message, img);
    this.broadcastMessages.set(id, broadcast);
    logger15.info(`广播已创建 ID: ${id}`);
    return `广播已创建 ID: ${id}`;
  }
  async deleteBroadcast(id) {
    if (this.broadcastMessages.has(id)) {
      this.broadcastMessages.delete(id);
      logger15.info(`广播已删除 ID: ${id}`);
      return "已删除广播：" + id;
    } else {
      logger15.warn(`未找到广播 ID: ${id}`);
      return "未找到该广播";
    }
  }
  async seedBroadcast(session) {
    for (const [id, broadcast] of this.broadcastMessages.entries()) {
      if (broadcast.setTime.getTime() + 1e3 * 60 * this.config.waiting_time < Date.now()) {
        this.broadcastMessages.delete(id);
        logger15.info(`广播已过期 ID: ${id}`);
        continue;
      }
      await broadcast.sendMessage(session);
    }
    return;
  }
  async getBroadcastList() {
    const idList = Array.from(this.broadcastMessages.keys());
    const list = [];
    list.push("当前广播列表:");
    for (const id of idList) {
      const broadcast = this.broadcastMessages.get(id);
      if (broadcast) {
        const time = broadcast.setTime.toLocaleString("zh-CN", { hour12: false });
        const ddl = new Date(broadcast.setTime.getTime() + 1e3 * 60 * this.config.waiting_time).toLocaleString("zh-CN", { hour12: false });
        const message = broadcast.message;
        const alreadySentChannels = broadcast.getAlreadySentChannels();
        list.push(`ID: ${id}
消息: ${message}
已发送频道: 
${alreadySentChannels}
创建时间: ${time}
过期时间: ${ddl}
`);
      }
    }
    const result = list.length > 0 ? list.join("\n") : null;
    return result ? wrapInHTML3(result) : null;
  }
};
var broadcastMessage = class {
  static {
    __name(this, "broadcastMessage");
  }
  ctx;
  config;
  message;
  alreadySentChannels = /* @__PURE__ */ new Set();
  setTime;
  img;
  constructor(ctx, cfg, message, img) {
    this.message = message;
    this.alreadySentChannels = /* @__PURE__ */ new Set();
    this.ctx = ctx;
    this.config = cfg;
    this.img = img;
    this.setTime = /* @__PURE__ */ new Date();
    for (const channelId of this.config.Broadcast_block_channel) {
      this.alreadySentChannels.add(channelId);
    }
  }
  async sendMessage(session) {
    const channelId = session.channelId;
    if (this.alreadySentChannels.has(channelId))
      return;
    try {
      this.alreadySentChannels.add(channelId);
      if (this.img) {
        session.send(await wrapInHTML3(this.message));
      } else {
        session.send(this.message);
      }
      logger15.info(`向群 ${channelId} 广播: ${this.message}`);
    } catch (error) {
      logger15.error(`广播失败 ${channelId}: ${error}`);
    }
  }
  getAlreadySentChannels() {
    const alreadySentChannels = Array.from(this.alreadySentChannels).filter((channelId) => !this.config.Broadcast_block_channel.includes(channelId));
    return alreadySentChannels.length > 0 ? alreadySentChannels.join("\n") : "无";
  }
};
async function wrapInHTML3(str) {
  if (!puppeteer) {
    logger15.warn("puppeteer未就绪");
    return str;
  }
  return puppeteer.render(`<html><body>${str.replaceAll(/\n/g, "<BR>")}</body>
          <style>
          body {
            padding: 10px;
            display: inline-block;
           }
          </style>
          </html>`);
}
__name(wrapInHTML3, "wrapInHTML");

// src/weather.ts
var import_koishi17 = require("koishi");
var import_zlib = require("zlib");
var logger16 = new import_koishi17.Logger("satori-weather");
var WeatherManager = class {
  constructor(ctx, config, lastFetchTime = /* @__PURE__ */ new Map(), weatherCache = /* @__PURE__ */ new Map()) {
    this.ctx = ctx;
    this.config = config;
    this.lastFetchTime = lastFetchTime;
    this.weatherCache = weatherCache;
  }
  static {
    __name(this, "WeatherManager");
  }
  // 生成 JWT (Ed25519)，返回 null 表示未配置 JWT
  async generateJWT() {
    const kid = this.config.weather_jwt_kid;
    const sub = this.config.weather_jwt_sub;
    const privateKeyPem = this.config.weather_jwt_private_key_pem;
    if (!kid || !sub || !privateKeyPem)
      return null;
    try {
      const header = {
        alg: "EdDSA",
        kid
      };
      const now = Math.floor(Date.now() / 1e3);
      const iat = Math.max(0, now - 30);
      const expSeconds = this.config.weather_jwt_exp_seconds || 300;
      const maxExp = Math.min(expSeconds, 86400);
      const exp = iat + maxExp;
      const payload = {
        sub,
        iat,
        exp
      };
      const base64url = /* @__PURE__ */ __name((input) => {
        let buf;
        if (typeof input === "string")
          buf = Buffer.from(input);
        else if (Buffer.isBuffer(input))
          buf = input;
        else
          buf = Buffer.from(input);
        return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      }, "base64url");
      const encodedHeader = base64url(JSON.stringify(header));
      const encodedPayload = base64url(JSON.stringify(payload));
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const pemToDer = /* @__PURE__ */ __name((pem) => {
        const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
        return Buffer.from(b64, "base64");
      }, "pemToDer");
      let subtle = globalThis.crypto?.subtle;
      if (!subtle) {
        const cryptoModule = await import("crypto");
        subtle = cryptoModule.webcrypto.subtle;
      }
      if (!subtle)
        throw new Error("Web Crypto 不可用，无法生成 JWT");
      const pkcs8 = pemToDer(privateKeyPem);
      const pkcs8ArrayBuffer = pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength);
      const cryptoKey = await subtle.importKey("pkcs8", pkcs8ArrayBuffer, { name: "Ed25519" }, false, ["sign"]);
      const data = new TextEncoder().encode(signingInput);
      const sig = await subtle.sign({ name: "Ed25519" }, cryptoKey, data);
      const signature = base64url(new Uint8Array(sig));
      return `${signingInput}.${signature}`;
    } catch (error) {
      logger16.error("生成 JWT 失败: " + (error.message || error.status || error));
      return null;
    }
  }
  // 发起 HTTP 请求并兼容 gzip 压缩的 JSON 响应
  async fetchJson(url, headers = {}) {
    try {
      const response = await this.ctx.http.get(url, { headers, responseType: "arraybuffer" });
      let buf;
      if (response instanceof ArrayBuffer) {
        buf = Buffer.from(response);
      } else if (response && response.data instanceof ArrayBuffer) {
        buf = Buffer.from(response.data);
      } else if (Buffer.isBuffer(response)) {
        buf = response;
      } else if (response && typeof response === "object") {
        return response;
      } else {
        buf = Buffer.from(String(response));
      }
      if (buf.length >= 2 && buf[0] === 31 && buf[1] === 139) {
        try {
          buf = (0, import_zlib.gunzipSync)(buf);
        } catch (e) {
          logger16.warn("Gzip 解压失败，尝试按文本解析: " + (e.message || e));
        }
      }
      const text = buf.toString("utf8");
      try {
        return JSON.parse(text);
      } catch {
        try {
          return response;
        } catch {
          return text;
        }
      }
    } catch (error) {
      logger16.error("fetchJson 请求失败: " + (error.message || error.status || error));
      throw error;
    }
  }
  // 更新用户位置信息
  async updateLocation(session, location) {
    if (!this.config.enable_weather_perception)
      return null;
    if (!location || location.trim() === "") {
      return "位置不能为空，请提供有效的位置名称。";
    }
    const user = await getUser(this.ctx, session.userId);
    const useJwt = !!(this.config.weather_jwt_kid && this.config.weather_jwt_sub && this.config.weather_jwt_private_key_pem);
    const jwt = useJwt ? await this.generateJWT() : null;
    const baseURL = this.config.Location_search_API_URL;
    const searchURL = useJwt ? `${baseURL}${this.config.location_param_name}=${encodeURIComponent(location)}` : `${baseURL}${this.config.location_param_name}=${encodeURIComponent(location)}&key=${this.config.weather_api_key}`;
    const headers = {};
    if (jwt)
      headers["Authorization"] = `Bearer ${jwt}`;
    try {
      const response = await this.fetchJson(searchURL, headers);
      const results = response?.results ?? response?.location ?? response;
      if (Array.isArray(results) && results.length > 0) {
        const city = results[0];
        const fullLocation = city.path ?? `${city.adm1 || ""}${city.adm2 || ""}${city.name || ""}`;
        logger16.info(`用户 ${session.userId} 的位置已更新为 ${fullLocation}`);
        location = city.id || location;
        await updateUserLocation(this.ctx, user, location);
        return `${session.username} 的位置已更新为 ${fullLocation}。`;
      } else if (results && results.name) {
        const city = results;
        const fullLocation = city.path ?? `${city.adm1 || ""}${city.adm2 || ""}${city.name || ""}`;
        logger16.info(`用户 ${session.userId} 的位置已更新为 ${fullLocation}`);
        location = city.id || location;
        await updateUserLocation(this.ctx, user, location);
        return `${session.username} 的位置已更新为 ${fullLocation}。`;
      } else {
        logger16.warn(`未找到用户 ${session.userId} 的位置，输入为 "${location}"`);
        return "未能找到该位置，请确认输入是否正确。";
      }
    } catch (error) {
      logger16.error(`未能更新用户 ${session.userId} 的位置: ${error.message || error.status}`);
      return "无法更新位置，错误: " + error.message || error.status + "。";
    }
  }
  // 获取用户位置信息并调用天气API获取天气信息
  async getWeatherInfo(session) {
    if (!this.config.enable_weather_perception)
      return null;
    const user = await getUser(this.ctx, session.userId);
    const location = user.location;
    if (!location)
      return "未设置位置信息，请先使用“更新位置”命令设置位置。";
    const useJwt = !!(this.config.weather_jwt_kid && this.config.weather_jwt_sub && this.config.weather_jwt_private_key_pem);
    const jwt = useJwt ? await this.generateJWT() : null;
    const baseURL = this.config.weather_api_URL;
    const weatherURL = useJwt ? `${baseURL}${this.config.weather_param_name}=${encodeURIComponent(location)}` : `${baseURL}${this.config.weather_param_name}=${encodeURIComponent(location)}&key=${this.config.weather_api_key}`;
    const headers = {};
    if (jwt)
      headers["Authorization"] = `Bearer ${jwt}`;
    const currentTime = Date.now();
    const lastFetch = this.lastFetchTime.get(session.userId) || 0;
    if (currentTime - lastFetch < this.config.weather_cd_time * 60 * 1e3) {
      const cachedWeather = this.weatherCache.get(session.userId);
      if (cachedWeather) {
        return cachedWeather;
      }
    }
    try {
      const response = await this.fetchJson(weatherURL, headers);
      const results = response?.results ?? response?.now ?? response;
      let weatherData = null;
      if (Array.isArray(results) && results.length > 0) {
        weatherData = results[0]?.now ?? results[0];
      } else if (results && results.now) {
        weatherData = results.now;
      } else if (results && (results.text || results.temperature)) {
        weatherData = results;
      }
      if (weatherData) {
        const weatherInfo = `当前天气：${weatherData.text ?? weatherData.description ?? "未知"}，温度：${weatherData.temperature ?? weatherData.temp ?? "未知"}°C`;
        this.lastFetchTime.set(session.userId, currentTime);
        this.weatherCache.set(session.userId, weatherInfo);
        logger16.info(`为用户 ${session.userId} 获取了最新的天气信息`);
        return weatherInfo;
      } else {
        logger16.warn(`未能获取用户 ${session.userId} 的天气信息，位置ID为 "${location}"`);
        return "未能获取天气信息，请稍后再试。";
      }
    } catch (error) {
      logger16.error(`未能获取用户 ${session.userId} 的天气信息: ${error.message || error.status}`);
      return "无法获取天气信息，错误: " + error.message || error.status || error.status + "。";
    }
  }
  // 构建天气提示词
  async buildWeatherPrompt(session) {
    if (!this.config.enable_weather_perception)
      return null;
    const weatherInfo = await this.getWeatherInfo(session);
    if (weatherInfo === "未设置位置信息，请先使用“更新位置”命令设置位置。")
      return null;
    return `当前我这里的天气是${weatherInfo}，你是明确知道这一点的。`;
  }
};

// src/galgame.ts
var import_koishi18 = require("koishi");
var fs6 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var Galgame = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.initialize();
  }
  static {
    __name(this, "Galgame");
  }
  ongoingEvents = {};
  waitingForOptions = {};
  completedEvents = {};
  currentId = {};
  loadEvent(eventName) {
    const filePath = path6.resolve(this.config.dataDir, "event", `${eventName}.json`);
    if (!fs6.existsSync(filePath))
      return null;
    return JSON.parse(fs6.readFileSync(filePath, "utf-8"));
  }
  async sendStoryContent(session, content) {
    const username = session.username || "你";
    const storyText = String(content.text).replace(/\{?_USERNAME_\}?/g, username);
    if (content.isNarration) {
      const wrappedText = await wrapInHTML(storyText, 25);
      await session.send(wrappedText);
    } else {
      await session.send(storyText);
    }
    if (content.imageName) {
      const imagePath = path6.resolve(this.config.dataDir, "event", content.imageName);
      if (fs6.existsSync(imagePath)) {
        const buffer = fs6.readFileSync(imagePath);
        const ext = path6.extname(imagePath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        await new Promise((resolve4) => setTimeout(resolve4, 1e3));
        await session.send(import_koishi18.h.image(buffer, mime));
      }
    }
  }
  // 根据文本估算自动推进的延迟（毫秒）
  // 规则：使用平均阅读速度 200 wpm（可调整）来估算阅读时间（秒），
  // 然后在阅读时间上加上额外 3 秒缓冲，最终向上取整并转为毫秒。
  // 对中英文混合文本：中文按汉字计数，拉丁文按空格分词计数。
  computeAutoAdvanceDelay(text) {
    const readingWpm = 500;
    if (!text)
      return 1e3;
    const cjkMatch = text.match(/[\u4e00-\u9fff]/g) || [];
    const cjkCount = cjkMatch.length;
    const withoutCjk = text.replace(/[\u4e00-\u9fff]/g, "");
    const latinWords = withoutCjk.trim().length === 0 ? 0 : withoutCjk.trim().split(/\s+/).filter(Boolean).length;
    const effectiveWords = cjkCount + latinWords;
    const wordsPerSecond = readingWpm / 60;
    const readingSeconds = effectiveWords / Math.max(wordsPerSecond, 1e-3);
    const delaySeconds = Math.max(1, Math.ceil(readingSeconds) + 2);
    return delaySeconds * 1e3;
  }
  async handleEventProgress(session, event) {
    const userId = session.userId;
    const currentId = this.currentId[userId];
    const content = event.story.find((item) => item.id === currentId);
    if (!content)
      return;
    await this.sendStoryContent(session, content);
    if (content.isEnding) {
      const ending = event.endings.find((end) => end.id === currentId);
      if (ending) {
        await this.handleEnding(session, ending);
      }
      delete this.ongoingEvents[userId];
      delete this.currentId[userId];
      this.completedEvents[userId] = event.eventName;
      try {
        const portraitPath = path6.join(this.config.dataDir, "UserPortrait", `${userId}.txt`);
        if (fs6.existsSync(portraitPath)) {
          const appendText = `
近期你和他进行了约会：${event.eventName}`;
          fs6.appendFileSync(portraitPath, appendText, "utf-8");
        }
      } catch (e) {
      }
      return;
    }
    if (content.options) {
      await new Promise((resolve4) => setTimeout(resolve4, 1e3));
      const optionsText = content.options.map((opt, idx) => `选项 ${idx + 1}: ${opt.text}`).join("\n");
      await session.send(optionsText + '\n发送格式类似 "选项 1" 来进行选择');
      delete this.ongoingEvents[userId];
      this.waitingForOptions[userId] = event.eventName;
    } else {
      const delay = this.computeAutoAdvanceDelay(content.text);
      setTimeout(() => {
        this.currentId[userId] = (this.currentId[userId] ?? currentId) + 1;
        this.handleEventProgress(session, event);
      }, delay);
    }
  }
  async handleEnding(session, ending) {
    const rewardParts = [];
    if (ending.favorabilityReward) {
      rewardParts.push(`好感度 ${ending.favorabilityReward}`);
    }
    if (ending.pReward) {
      rewardParts.push(`P点 ${ending.pReward}`);
    }
    if (ending.itemRewards) {
      for (const [name, qty] of Object.entries(ending.itemRewards)) {
        rewardParts.push(`${name} x${qty}`);
      }
    }
    const rewardText = rewardParts.length ? `

获得奖励：
${rewardParts.join("\n")}` : "";
    await new Promise((resolve4) => setTimeout(resolve4, 1e3));
    await session.send(ending.text + rewardText);
    if (ending.image) {
      const imagePath = path6.resolve(this.config.dataDir, "event", ending.image);
      if (fs6.existsSync(imagePath)) {
        const buffer = fs6.readFileSync(imagePath);
        const ext = path6.extname(imagePath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        await new Promise((resolve4) => setTimeout(resolve4, 1e3));
        await session.send(import_koishi18.h.image(buffer, mime));
      }
    }
    if (ending.favorabilityReward) {
      await this.updateFavorability(session, ending.favorabilityReward);
    }
    if (ending.pReward) {
      await this.updatePPoints(session, ending.pReward);
    }
    if (ending.itemRewards) {
      await this.updateItemRewards(session, ending.itemRewards);
    }
  }
  async updateFavorability(session, adjustment) {
    const user = await getUser(this.ctx, session.userId);
    if (!user)
      return;
    await updateFavorability(this.ctx, user, adjustment);
  }
  async updatePPoints(session, adjustment) {
    const user = await getUser(this.ctx, session.userId);
    if (!user)
      return;
    await updateUserP(this.ctx, user, adjustment);
  }
  async updateItemRewards(session, rewards) {
    const user = await getUser(this.ctx, session.userId);
    if (!user)
      return;
    for (const [itemName, quantity] of Object.entries(rewards)) {
      if (!user.items[itemName]) {
        user.items[itemName] = { id: itemName, count: 0 };
      }
      user.items[itemName].count += quantity;
    }
    await updateUserItems(this.ctx, user);
  }
  async startEvent(session, eventName) {
    const user = await getUser(this.ctx, session.userId);
    if (this.completedEvents[session.userId]) {
      await session.send("今天已经进行过约会了，请明天再来吧！");
      return;
    }
    if (!eventName) {
      const eventDir = path6.join(this.config.dataDir, "event");
      if (!fs6.existsSync(eventDir)) {
        await this.initialize();
      }
      const events = fs6.readdirSync(eventDir).filter((file) => file.endsWith(".json")).map((file) => this.loadEvent(file.replace(".json", ""))).filter((event2) => event2 && user.favorability >= event2.favorabilityThreshold).map((event2) => event2.eventName);
      const result = "当前可用的约会事件有：\n" + events.join("\n") + "\n请输入命令：约会 [事件名] 来开始对应的事件。";
      const wrappedText = await wrapInHTML(result, 25);
      await session.send(wrappedText);
      return;
    }
    const event = this.loadEvent(eventName);
    if (!event) {
      await session.send("未找到指定事件。");
      return;
    }
    if (user.favorability < event.favorabilityThreshold) {
      await session.send("好感度不足，无法解锁此事件。");
      return;
    }
    this.ongoingEvents[session.userId] = eventName;
    this.currentId[session.userId] = 1;
    await this.handleEventProgress(session, event);
  }
  async handleOption(session, optionId) {
    const userId = session.userId;
    const eventName = this.waitingForOptions[userId];
    if (!eventName) {
      await session.send("未开始事件或当前没有可选的选项。");
      return;
    }
    const event = this.loadEvent(eventName);
    if (!event)
      return;
    const currentId = this.currentId[userId];
    if (currentId === void 0) {
      await session.send("无法确定当前进度。");
      return;
    }
    const currentContent = event.story.find((item) => item.id === currentId);
    if (!currentContent || !currentContent.options) {
      await session.send("当前项没有可选项。");
      return;
    }
    const index = optionId - 1;
    const selectedOption = currentContent.options[index];
    if (!selectedOption) {
      await session.send("无效选项，请发送例如：选项 1");
      return;
    }
    delete this.waitingForOptions[userId];
    this.ongoingEvents[userId] = eventName;
    this.currentId[userId] = selectedOption.targetId;
    await this.handleEventProgress(session, event);
  }
  async initialize() {
    const eventDir = path6.join(this.config.dataDir, "event");
    if (!fs6.existsSync(eventDir)) {
      fs6.mkdirSync(eventDir, { recursive: true });
    }
    const files = fs6.readdirSync(eventDir);
    if (files.length === 0) {
      const exampleEvent = {
        eventName: "示例事件",
        favorabilityThreshold: 0,
        story: [
          {
            id: 1,
            isNarration: true,
            text: `这是示例事件（文件位置：data/event/示例事件.json）。

打开工作区的 data/event 文件夹，找到并打开此文件，你会看到一个 JSON 描述的事件对象。字段说明（常用）：
- eventName: 事件名（字符串）
- favorabilityThreshold: 解锁本事件所需的好感度阈值（数字）
- story: 段落数组，按 id 查找并推进，每项字段：id, type, text, options, imageName, isEnding, isNarration。

本示例展示两种机制：
1) 无选项自动推进：某段没有 options，会在若干秒后自动推进到下一段（由代码中 setTimeout 控制，默认 5 秒）；
2) 分支效果：某段含有 options，用户选择后跳转到对应的 targetId 导致不同的结局。

下面开始演示，发送“开始”或选择下方的继续按钮（示例内也会提示如何选择）。`,
            options: [
              { text: "开始示例", targetId: 2 }
            ]
          },
          {
            id: 2,
            text: `这是一个无选项段落，演示自动推进；几秒后会自动进入下一段（时间根据文本长度）。`
          },
          {
            id: 3,
            isNarration: true,
            text: `在事件json中，有多个字段，我们从头开始说明。
eventName: 事件名（字符串），此字段要与文件名一致
favorabilityThreshold: 解锁本事件所需的好感度阈值（数字）
story 为有序的段落数组，每项至少需要 id 和 text。
支持字段：
 - id: 唯一数字 id，用于跳转定位
 - text: 要显示的文本
 - options: 可选，数组，每项 { text, targetId }，如果存在则等待用户选择，用户选择后跳转到对应 targetId 的段落
 - imageName: 可选，指向 data/event 下的图片文件名然后发送
 - isEnding: 可选，标记该段落为结局（会触发结束+奖励）
 - isNarration: 可选，指示用图片渲染（用于旁白会比较好）
 此段即演示isNarration和imageName效果`,
            imageName: "example.png"
          },
          {
            id: 4,
            text: "此段展示分支和用户名占位，现在进入分支环节：请选择_USERNAME_的回应。\n发送格式：选项 1 或 选项 2。",
            options: [
              { text: "友好回应", targetId: 5 },
              { text: "冷淡回应", targetId: 6 }
            ]
          },
          {
            id: 5,
            text: "你选择了友好回应，达成友好分支。此时会跳转到与当前段落 id 相同的结局。",
            isEnding: true
          },
          {
            id: 6,
            text: "你选择了冷淡回应，达成冷淡分支。此时会跳转到与当前段落 id 相同的结局。",
            isEnding: true
          }
        ],
        endings: [
          {
            id: 5,
            text: "endings 列表用于将结局 id 与奖励、图片等信息关联，在友好分支结局：你获得了好感和奖励。\n现在你可以根据需要设计自己的事件。",
            favorabilityReward: 1,
            pReward: 5,
            itemRewards: { "垃圾符卡": 1 },
            imageName: "example.png"
          },
          {
            id: 6,
            text: "endings 列表用于将结局 id 与奖励、图片等信息关联，在冷淡分支结局：好感略微下降。\n现在你可以根据需要设计自己的事件。",
            favorabilityReward: -1
          }
        ]
      };
      const exampleFilePath = path6.resolve(eventDir, "示例事件.json");
      fs6.writeFileSync(exampleFilePath, JSON.stringify(exampleEvent, null, 2), "utf-8");
      const exampleImagePath = path6.resolve(eventDir, "example.png");
      try {
        if (!fs6.existsSync(exampleImagePath)) {
          const imageBuffer = Buffer.from(exampleimg, "base64");
          fs6.writeFileSync(exampleImagePath, imageBuffer);
        }
      } catch (e) {
      }
    }
  }
};
var exampleimg = `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`;

// src/index.tsx
var logger17 = new import_koishi19.Logger("satori-ai");
var randomPrompt = "根据群聊内最近的包括所有人的聊天记录，现在请你参与一下群聊中的话题";
var puppeteer = null;
function refreshPuppeteer(ctx) {
  if (ctx.puppeteer) {
    puppeteer = ctx.puppeteer;
  } else {
    logger17.warn("puppeteer未就绪");
  }
}
__name(refreshPuppeteer, "refreshPuppeteer");
var SAT = class extends Sat {
  // 重写构造函数
  constructor(ctx, config) {
    super(ctx, config);
    this.config = config;
    ctx.i18n.define("zh", require_zh());
    puppeteer = ctx.puppeteer;
    extendDatabase(ctx);
    this.apiClient = new APIClient(ctx, this.getAPIConfig());
    this.memoryService = new MemoryService(ctx, this.getMemoryConfig(), this.apiClient);
    this.moodManager = new MoodManager(ctx, config);
    this.broadcastManager = new BroadcastManager(ctx, config);
    this.weatherManager = new WeatherManager(ctx, config);
    this.emojiManager = new EmojiManager(ctx, config);
    ensureCensorFileExists(this.config.dataDir);
    refreshPuppeteer(ctx);
    void this.waitForPuppeteer(ctx, 30, 1e3);
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()));
    this.registerCommands(ctx);
    this.memoryService.start();
    if (this.config.enable_game)
      this.game = new Game(ctx, config, this);
    if (config.enable_galgame) {
      this.galgame = new Galgame(ctx, config);
      this.registerGalgameCommands(ctx);
    }
    process.on("exit", () => {
      void this.dispose();
    });
    process.on("SIGINT", () => {
      void this.dispose();
      process.exit();
    });
    process.on("SIGTERM", () => {
      void this.dispose();
      process.exit();
    });
  }
  static {
    __name(this, "SAT");
  }
  apiClient;
  memoryService;
  ChannelParallelCount = /* @__PURE__ */ new Map();
  onlineUsers = [];
  moodManager;
  broadcastManager;
  weatherManager;
  usersToWarn = /* @__PURE__ */ new Map();
  puppeteer;
  game;
  galgame;
  emojiManager;
  setPuppeteer(puppeteer2) {
    this.puppeteer = puppeteer2;
    try {
      exports.puppeteer = puppeteer2;
    } catch (e) {
      global.puppeteer = puppeteer2;
    }
    logger17.info("Puppeteer 已设置");
  }
  // 等待 ctx.puppeteer 异步就绪并设置到实例的非阻塞重试函数
  async waitForPuppeteer(ctx, retries = 20, intervalMs = 1e3) {
    for (let i = 0; i < retries; i++) {
      if (ctx.puppeteer) {
        this.setPuppeteer(ctx.puppeteer);
        refreshPuppeteer(ctx);
        logger17.info(`Puppeteer 在尝试 ${i + 1}/${retries} 中就绪`);
        return true;
      }
      await new Promise((resolve4) => setTimeout(resolve4, intervalMs));
    }
    logger17.warn("等待 Puppeteer 超时，未能在指定重试次数内初始化");
    return false;
  }
  // （原先的 puppeteerReady 方法保留在文件顶部）
  puppeteerReady() {
    return !!this.puppeteer;
  }
  getAPIConfig() {
    return {
      baseURL: this.config.baseURL,
      keys: this.config.key,
      appointModel: this.config.appointModel,
      not_reasoner_LLM_URL: this.config.not_reasoner_LLM_URL,
      not_reasoner_LLM: this.config.not_reasoner_LLM,
      not_reasoner_LLM_key: this.config.not_reasoner_LLM_key,
      use_not_reasoner_LLM_length: this.config.use_not_reasoner_LLM_length,
      auxiliary_LLM_URL: this.config.auxiliary_LLM_URL,
      auxiliary_LLM: this.config.auxiliary_LLM,
      auxiliary_LLM_key: this.config.auxiliary_LLM_key,
      maxRetryTimes: this.config.maxRetryTimes,
      retry_delay_time: this.config.retry_delay_time,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty,
      reasoning_content: this.config.log_reasoning_content,
      max_output_tokens: this.config.max_output_tokens
    };
  }
  getMemoryConfig() {
    return {
      dataDir: this.config.dataDir,
      bracket_filter: this.config.bracket_filter,
      memory_filter: this.config.memory_filter,
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      personal_memory: this.config.personal_memory,
      channel_dialogues: this.config.channel_dialogues,
      channel_dialogues_max_length: this.config.channel_dialogues_max_length,
      remember_min_length: this.config.remember_min_length,
      common_topN: this.config.common_topN,
      dailogues_topN: this.config.dailogues_topN,
      enhanceReasoningProtection: this.config.enhanceReasoningProtection,
      enable_layered_memory: this.config.enable_layered_memory,
      memory_timezone_offset: this.config.memory_timezone_offset,
      memory_day_boundary_hour: this.config.memory_day_boundary_hour,
      topic_switch_check: this.config.topic_switch_check,
      summary_heartbeat_minutes: this.config.summary_heartbeat_minutes,
      summary_dry_run: this.config.summary_dry_run,
      summary_max_scopes_per_tick: this.config.summary_max_scopes_per_tick,
      summary_max_calls_per_tick: this.config.summary_max_calls_per_tick,
      summary_concurrency: this.config.summary_concurrency,
      memory_active_window_days: this.config.memory_active_window_days,
      memory_retention_days: this.config.memory_retention_days,
      memory_context_max_chars: this.config.memory_context_max_chars,
      memory_recall_topN: this.config.memory_recall_topN,
      profile_enabled: this.config.profile_enabled && this.config.enable_user_portrait,
      profile_max_entries: this.config.profile_max_entries,
      profile_context_entries: this.config.profile_context_entries
    };
  }
  getMiddlewareConfig() {
    return {
      private: this.config.private,
      nick_name: this.config.nick_name,
      nick_name_list: this.config.nick_name_list,
      nick_name_block_words: this.config.nick_name_block_words,
      max_favorability_perday: this.config.max_favorability_perday,
      random_min_tokens: this.config.random_min_tokens,
      randnum: this.config.randnum,
      max_tokens: this.config.max_tokens,
      enable_favorability: this.config.enable_favorability,
      dataDir: this.config.dataDir,
      input_censor_favorability: this.config.input_censor_favorability,
      value_of_input_favorability: this.config.value_of_input_favorability,
      output_censor_favorability: this.config.output_censor_favorability,
      value_of_output_favorability: this.config.value_of_output_favorability,
      enable_auxiliary_LLM: this.config.enable_auxiliary_LLM,
      offset_of_fafavorability: this.config.offset_of_fafavorability,
      prompt_0: this.config.prompt_0,
      favorability_div_1: this.config.favorability_div_1,
      prompt_1: this.config.prompt_1,
      favorability_div_2: this.config.favorability_div_2,
      prompt_2: this.config.prompt_2,
      favorability_div_3: this.config.favorability_div_3,
      prompt_3: this.config.prompt_3,
      favorability_div_4: this.config.favorability_div_4,
      prompt_4: this.config.prompt_4,
      prompt_5: this.config.prompt_5,
      enable_warning: this.config.enable_warning,
      warning_group: this.config.warning_group
    };
  }
  getFavorabilityConfig() {
    return {
      enable_favorability: this.config.enable_favorability,
      dataDir: this.config.dataDir,
      max_favorability_perday: this.config.max_favorability_perday,
      input_censor_favorability: this.config.input_censor_favorability,
      value_of_input_favorability: this.config.value_of_input_favorability,
      output_censor_favorability: this.config.output_censor_favorability,
      value_of_output_favorability: this.config.value_of_output_favorability,
      enable_auxiliary_LLM: this.config.enable_auxiliary_LLM,
      offset_of_fafavorability: this.config.offset_of_fafavorability,
      prompt_0: this.config.prompt_0,
      favorability_div_1: this.config.favorability_div_1,
      prompt_1: this.config.prompt_1,
      favorability_div_2: this.config.favorability_div_2,
      prompt_2: this.config.prompt_2,
      favorability_div_3: this.config.favorability_div_3,
      prompt_3: this.config.prompt_3,
      favorability_div_4: this.config.favorability_div_4,
      prompt_4: this.config.prompt_4,
      prompt_5: this.config.prompt_5
    };
  }
  registerCommands(ctx) {
    ctx.command("sat [...args]", { authority: this.config.authority }).alias(...this.config.alias).action(async ({ session }, ...prompts) => this.handleSatCommand(session, prompts.join(" ")));
    ctx.command("sat.clear", "清空会话").option("global", "-g").action(({ session, options }) => this.clearSession(session, options.global));
    ctx.command("sat.common_sense <text:text>", "添加常识", { authority: 4 }).alias("添加常识").action(async ({ session }, prompt) => this.addCommonSense(session, prompt));
    ctx.command("sat.group_sense <text:text>", "添加群常识", { authority: 3 }).alias("添加群常识").option("id", "-i <id:string>", { authority: 3 }).action(async ({ session, options }, prompt) => this.addGroupCommonSense(session, prompt, options.id));
    ctx.command("sat.update_user_level", "更新用户等级", { authority: 2 }).alias("更新用户").option("id", "-i <id:string>", { authority: 4 }).option("level", "-l <level:number>", { authority: 4 }).action(async ({ session, options }) => this.handleUserLevel(session, options));
    ctx.command("sat.user_usage", "查看用户使用次数").alias("查询次数").action(async ({ session }) => this.handleUserUsage(session));
    ctx.command("sat.add_output_censor <text:text>", "添加输出敏感词", { authority: 4 }).alias("添加输出屏蔽词").action(async ({ session }, word) => addOutputCensor(session, word, this.config.dataDir));
    ctx.command("sat.get_user_portrait <text:text>", "查看用户画像", { authority: 4 }).alias("查看画像").action(async ({}, userId) => this.memoryService.getProfileById(userId));
    ctx.command("sat.memory.view [scopeId:text]", "查看分层记忆", { authority: 4 }).alias("查看记忆").action(async ({ session }, scopeId) => this.memoryService.view(scopeId || session.userId));
    ctx.command("sat.memory.migrate", "重新迁移旧版记忆文件", { authority: 4 }).option("force", "-f").action(async ({ options }) => {
      const result = await this.memoryService.migrate(!!options.force);
      return `迁移完成：对话 ${result.dialogues} 条（跳过 ${result.skippedDialogues}），画像 ${result.portraits} 份，知识 ${result.knowledge} 条`;
    });
    ctx.command("sat.memory.clear [scopeId:text]", "清空分层记忆", { authority: 4 }).option("all", "-a").action(async ({ session, options }, scopeId) => {
      const target = options.all ? void 0 : scopeId || session.userId;
      await this.memoryService.clearPersistent(target);
      return target ? `已清空 ${target} 的分层记忆` : "已清空所有分层记忆";
    });
    ctx.command("sat.get_warning_list", "查看警告列表", { authority: 4 }).alias("查看警告").action(async ({ session }) => this.getWarningList(session));
    if (this.config.enable_weather_perception) {
      ctx.command("sat.update_location <text:text>", "更新用户天气位置信息", { authority: 0 }).alias("更新位置").action(async ({ session }, location) => this.weatherManager.updateLocation(session, location));
      ctx.command("sat.get_weather", "获取当前天气信息", { authority: 0 }).alias("查看天气").action(async ({ session }) => this.weatherManager.getWeatherInfo(session));
    }
    if (this.config.enable_mood && this.config.enable_favorability && this.config.enable_pocket_money) {
      ctx.command("sat.pocket_money", "消耗心情值换取p点").alias("要零花钱").action(async ({ session }) => this.moodManager.handlePocketMoney(session));
      ctx.command("sat.set_mood", "设置心情值", { authority: 4 }).alias("设置心情").option("id", "-i <id:string>", { authority: 4 }).option("value", "-v <value:number>", { authority: 4 }).action(async ({ session, options }) => this.moodManager.setMood(options.id || session.userId, options.value || 0));
      ctx.command("sat.get_mood", "查看心情状态").alias("查看心情").option("id", "-i <id:string>", { authority: 4 }).action(async ({ session, options }) => this.moodManager.viewMood(session, options.id || session.userId));
    }
  }
  registerGalgameCommands(ctx) {
    ctx.command("sat.galgame_start [eventName:text]", "开始约会事件").alias("约会").action(async ({ session }, eventName) => {
      if (!session)
        return;
      await this.galgame.startEvent(session, eventName);
    });
    ctx.command("sat.galgame_option <optionId:number>", "选择事件选项").alias("选项").action(async ({ session }, optionId) => {
      if (!session)
        return;
      await this.galgame.handleOption(session, optionId);
    });
  }
  async handleSatCommand(session, prompt) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const processedPrompt = await this.processInput(session, prompt);
    const favorabilityBlock = await this.checkFavorabilityBlock(session);
    if (favorabilityBlock)
      return favorabilityBlock;
    const preCheckResult = this.performPreChecks(session, processedPrompt);
    if (preCheckResult)
      return preCheckResult;
    const channelId = this.memoryService.getScopeId(session);
    const recentDialogues = this.memoryService.getChannelMemory(channelId).slice(-10);
    const duplicateCheck = await this.checkDuplicateDialogue(session, processedPrompt, recentDialogues, user);
    if (duplicateCheck)
      return duplicateCheck;
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user, processedPrompt);
    if (fixedResponse)
      return fixedResponse;
    const dialogueCountCheck = await this.checkUserDialogueCount(session, user);
    if (dialogueCountCheck)
      return dialogueCountCheck;
    const response = await this.generateResponse(session, processedPrompt);
    const auxiliaryResult = await this.handleAuxiliaryDialogue(session, processedPrompt, response);
    await this.memoryService.recordTurn(session, processedPrompt, response);
    if (!response.error)
      await updateUserPWithTicket(this.ctx, user, 10);
    if (this.emojiManager.shouldSendEmoji()) {
      try {
        const memories = this.memoryService.getChannelMemory(channelId);
        const emojiPath = await this.emojiManager.getEmoji(session, user, memories);
        if (emojiPath) {
          const buffer = await import_fs2.promises.readFile(emojiPath);
          const ext = path7.extname(emojiPath).slice(1) || "gif";
          await session.send(import_koishi19.h.image(buffer, "image/" + ext));
        }
        logger17.info(`发送表情包: ${emojiPath} 给用户: ${session.username} (${session.userId})`);
      } catch (e) {
        logger17.error("Failed to send emoji:", e);
      }
    }
    return await this.formatResponse(session, response.content, auxiliaryResult, response.reasoning_content);
  }
  // 处理辅助判断
  async handleAuxiliaryDialogue(session, prompt, response) {
    if (response.error || !this.config.enable_favorability)
      return null;
    const user = await getUser(this.ctx, session.userId);
    const outputCheck = await outputContentCheck(this.ctx, response, session.userId, this.getFavorabilityConfig(), session, this.moodManager);
    const regex = /\*\*/g;
    const inputCensor = prompt.match(regex)?.length;
    const outputCensor = outputCheck < 0;
    if (inputCensor)
      return "(好感↓↓)";
    if (outputCensor)
      return "(好感↓)";
    if (this.config.enable_auxiliary_LLM && !response.error && response.content) {
      const messages = generateAuxiliaryPrompt(prompt, response.content, user, this.getFavorabilityConfig());
      const result = await this.apiClient.auxiliaryChat(messages, user);
      if (result.error) {
        logger17.error(`辅助判断失败：${result.content}`);
      } else {
        logger17.info(`辅助判断：${result.content}`);
        return handleAuxiliaryResult(this.ctx, session, this.getFavorabilityConfig(), result.content);
      }
    }
    return null;
  }
  // 好感度阻断检查
  async checkFavorabilityBlock(session) {
    if (!this.config.enable_favorability)
      return null;
    return await handleFavorabilitySystem(this.ctx, session, this.getFavorabilityConfig());
  }
  // 前置检查
  performPreChecks(session, prompt) {
    if (!prompt || prompt.length == 0)
      return session.text("commands.sat.messages.no-prompt");
    if (prompt.length > this.config.max_tokens)
      return session.text("commands.sat.messages.tooLong");
    if (this.onlineUsers.includes(session.userId) && this.config.enable_online_user_check)
      return session.text("commands.sat.messages.online");
    return null;
  }
  // 重复对话检查
  async checkDuplicateDialogue(session, prompt, recentDialogues, user) {
    if (!this.config.duplicateDialogueCheck)
      return null;
    if (session.content == "戳戳")
      return null;
    let duplicateDialogue = recentDialogues.find((msg) => msg.content == prompt);
    if (!duplicateDialogue)
      return null;
    if (this.config.enable_favorability) {
      updateFavorability(this.ctx, user, -5);
      return session.text("commands.sat.messages.duplicate-dialogue") + " (好感↓)";
    }
    return session.text("commands.sat.messages.duplicate-dialogue");
  }
  // 处理固定对话
  async handleFixedDialoguesCheck(session, user, prompt) {
    const fixedDialogues = await handleFixedDialogues(
      this.ctx,
      session,
      user,
      prompt,
      {
        dataDir: this.config.dataDir,
        enable_favorability: this.config.enable_favorability,
        enable_fixed_dialogues: this.config.enable_fixed_dialogues
      }
    );
    if (fixedDialogues) {
      return fixedDialogues;
    }
    return null;
  }
  // 对话次数检查
  async checkUserDialogueCount(session, user, adjustment = 1) {
    const usage = await updateUserUsage(this.ctx, user, adjustment);
    if (user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on")
      return null;
    const level = user.userlevel < 5 ? user.userlevel : 4;
    const usageLimit = this.config.max_usage[level] || 0;
    if (usage && usageLimit != 0 && usage > usageLimit) {
      return session.text("commands.sat.messages.exceeds");
    }
    return null;
  }
  // 更新频道并发数
  async updateChannelParallelCount(session, value) {
    if (value > 0 && !this.onlineUsers.includes(session.userId))
      this.onlineUsers.push(session.userId);
    this.ChannelParallelCount.set(session.channelId, (this.ChannelParallelCount.get(session.channelId) || 0) + value);
  }
  // 获取频道并发数
  getChannelParallelCount(session) {
    return this.ChannelParallelCount.get(session.channelId) || 0;
  }
  // 处理输入
  async processInput(session, prompt) {
    const processedPrompt = processPrompt(prompt, this.config.nick_name_list, [session.selfId]);
    let censored = processedPrompt;
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(processedPrompt, session);
    }
    if (this.config.enable_favorability) {
      await inputContentCheck(this.ctx, censored, session.userId, this.getFavorabilityConfig(), session, this.moodManager);
    }
    if (this.config.log_ask_response)
      logger17.info(`用户 ${session.username}：${processedPrompt}`);
    return censored;
  }
  // 生成回复
  async generateResponse(session, prompt) {
    if (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      logger17.info(`频道 ${session.channelId} 并发数过高(${this.getChannelParallelCount(session)})，${session.username}等待中...`);
    }
    let waitTimes = 0;
    while (this.getChannelParallelCount(session) >= this.config.max_parallel_count) {
      waitTimes++;
      if (waitTimes > 60) {
        logger17.error(`并发等待超时：channel=${session.channelId}`);
        return { content: "系统繁忙，请稍后再试", error: true };
      }
      await new Promise((resolve4) => setTimeout(resolve4, 1e3));
    }
    await this.updateChannelParallelCount(session, 1);
    try {
      logger17.info(`频道 ${session.channelId} 处理：${session.userId},剩余${this.getChannelParallelCount(session)}并发`);
      const messages = await this.buildMessages(session, prompt);
      const user = await getUser(this.ctx, session.userId);
      let response = await this.getChatResponse(user, messages, prompt);
      if (response.error)
        response = await this.getChatResponse(user, messages, prompt);
      if (response.error)
        updateUserUsage(this.ctx, user, -1);
      return response;
    } finally {
      this.onlineUsers = this.onlineUsers.filter((id) => id !== session.userId);
      await this.updateChannelParallelCount(session, -1);
    }
  }
  // 获取聊天回复
  async getChatResponse(user, messages, prompt) {
    const hasTicket = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on";
    const maxLength = hasTicket ? user?.items?.["地灵殿通行证"]?.metadata?.use_not_reasoner_LLM_length : this.config.use_not_reasoner_LLM_length;
    const useNoReasoner = prompt.length <= maxLength && this.config.enable_reasoner_like;
    const startTime = Date.now();
    let response = await this.apiClient.chat(user, messages);
    logger17.info(`API 调用耗时: ${Date.now() - startTime}ms`);
    if (this.config.log_ask_response) {
      if (this.config.enable_favorability && this.config.enable_mood)
        logger17.info(`Satori AI：（心情值：${this.moodManager.getMoodValue(user.userid)}）${response.content}`);
      else
        logger17.info(`Satori AI：${response.content}`);
    }
    if (!response.error) {
      const filterStartTime = Date.now();
      response.content = filterResponse(response.content, this.config.reasoner_filter_word.split("-"), {
        applyBracketFilter: this.config.reasoner_filter,
        applyTagFilter: useNoReasoner || this.config.enhanceReasoningProtection
      }).content;
      const filterTime = Date.now() - filterStartTime;
      if (filterTime > 1e3) {
        logger17.warn(`filterResponse 耗时异常: ${filterTime}ms, 内容长度: ${response.content?.length || 0}`);
      }
    }
    return response;
  }
  // 构建消息
  async buildMessages(session, prompt) {
    const messages = [];
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const hasTicket = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on";
    const maxLength = hasTicket ? user?.items?.["地灵殿通行证"]?.metadata?.use_not_reasoner_LLM_length : this.config.use_not_reasoner_LLM_length;
    const useNoReasoner = prompt.length <= maxLength && this.config.enable_reasoner_like;
    const exampleWithoutReasoner = `<think>
好的，我会尽量做到的
</think>
<p>已明确对话要求</p>`;
    const exampleWithTag = `<p>已明确对话要求</p>`;
    const exampleWithoutTag = `已明确对话要求`;
    const example = useNoReasoner ? exampleWithoutReasoner : this.config.enhanceReasoningProtection ? exampleWithTag : exampleWithoutTag;
    if (this.config.no_system_prompt) {
      messages.push({ role: "user", content: await this.buildSystemPrompt(session, prompt) });
      messages.push({ role: "assistant", content: example });
    } else {
      messages.push({ role: "system", content: await this.buildSystemPrompt(session, prompt) });
    }
    if (prompt != randomPrompt) {
      const userMemory = this.memoryService.getChannelContext(this.config.personal_memory ? session.userId : session.channelId);
      messages.push(...userMemory);
    }
    messages.push({ role: "user", content: prompt });
    let payload = messages.map((msg) => msg.role + ":" + msg.content).join("\n");
    if (this.config.log_system_prompt)
      logger17.info(`系统提示：
${payload}`);
    return messages;
  }
  // 构建系统提示
  async buildSystemPrompt(session, prompt) {
    const memoryContext = await this.memoryService.getPromptContext(session, prompt);
    const weatherPrompt = await this.weatherManager.buildWeatherPrompt(session);
    const user = await getUser(this.ctx, session.userId);
    const moodLevel = this.moodManager.getMoodLevel(user.userid);
    let systemPrompt = "";
    if (prompt == randomPrompt) {
      systemPrompt += "#首先明确一些参考信息\n";
      systemPrompt += "\n##" + memoryContext.ambient;
      systemPrompt += this.getThinkingPrompt(user, prompt);
      systemPrompt += this.config.prompt;
      if (this.config.enhanceReasoningProtection) {
        systemPrompt += `
#注意：你最终的回复内容必须使用“<p>”开头，使用“</p>”结尾
`;
        if (this.config.no_system_prompt)
          systemPrompt += "\n#如果你明白以上内容，请回复“<p>已明确对话要求</p>”";
      }
      return systemPrompt;
    }
    systemPrompt += "#首先明确一些参考信息\n";
    systemPrompt += "\n##" + memoryContext.common;
    systemPrompt += "\n##" + memoryContext.group;
    if (weatherPrompt)
      systemPrompt += `
##${weatherPrompt}
`;
    systemPrompt += "\n##" + memoryContext.ambient;
    if (memoryContext.pyramid)
      systemPrompt += "\n##" + memoryContext.pyramid + "\n";
    if (memoryContext.recalled)
      systemPrompt += "\n##" + memoryContext.recalled;
    if ((moodLevel == "normal" || moodLevel == "happy") && memoryContext.profile)
      systemPrompt += "\n##" + memoryContext.profile;
    systemPrompt += this.getThinkingPrompt(user, prompt);
    systemPrompt += this.config.prompt;
    if (user?.items?.["觉的衣柜"]?.count && (moodLevel == "normal" || moodLevel == "happy")) {
      const clothes = user?.items?.["觉的衣柜"]?.metadata?.clothes;
      if (clothes)
        systemPrompt += `
##你当前的穿着(你可以根据穿着进行对应的行为)：${clothes}
`;
    }
    if (this.config.enable_favorability) {
      const favorabilityLevel = getFavorabilityLevel(user, this.getFavorabilityConfig());
      if (this.config.enable_mood) {
        if (moodLevel == "normal" || moodLevel == "happy" || favorabilityLevel == "厌恶")
          systemPrompt += "\n##" + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user);
        const moodPrompt = this.moodManager.generateMoodPrompt(user.userid);
        systemPrompt += `
##${moodPrompt}
`;
      } else {
        systemPrompt += "\n##" + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user);
      }
    }
    systemPrompt += `
##用户的名字是：${session.username}`;
    const nickName = user.items["情侣合照"]?.metadata?.userNickName;
    if (nickName)
      systemPrompt += `, 昵称是：${nickName},称呼用户时请优先使用昵称
`;
    if (this.config.enhanceReasoningProtection) {
      systemPrompt += `
#注意：你最终的回复内容必须使用“<p>”开头，使用“</p>”结尾
`;
      if (this.config.no_system_prompt)
        systemPrompt += "\n#如果你明白以上内容，请回复“<p>已明确对话要求</p>”";
    }
    return systemPrompt;
  }
  // 思考提示
  getThinkingPrompt(user, prompt) {
    const reasonerPrompt = this.config.reasoner_prompt;
    const promptForNoReasoner = `
#参考信息到此为止，接下来是思考要求
#请你在回复时先进行分析思考，并且模仿思维链的模式输出思考内容，${reasonerPrompt};
#你在思考时必须以 "<think>" 开头, "</think>" 结尾。仔细揣摩用户意图，**完整输出思考内容后**再输出正式的回复内容;
#注意：你的正式回复内容必须使用“<p>”开头，在输出全部回复后使用“</p>”结尾（即最终回答只允许有一组标签），并且无论如何都要把标签输出完整。
例子格式如下：
<think>你的思考内容</think><p>你的正式回复内容</p>
#接下来是对话要求，以下要求仅对最终的回复内容生效，不限制思考过程
`;
    const promptForReasoner = this.config.enhanceReasoningProtection ? `
#参考信息到此为止，接下来是思考要求
#你在思考时必须以 "嗯" 开头。仔细揣摩用户意图，思考结束后返回符合要求的回复。
#注意：你的回复内容必须使用“<p>”开头，在输出全部回复后使用“</p>”结尾（即最终回答只允许有一组标签）
#接下来是对话要求，以下要求仅对最终的回复内容生效，不限制思考过程
` : "";
    const hasTicket = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on";
    const maxLength = hasTicket ? user?.items?.["地灵殿通行证"]?.metadata?.use_not_reasoner_LLM_length : this.config.use_not_reasoner_LLM_length;
    const useNoReasoner = prompt.length <= maxLength;
    if (!this.config.enable_reasoner_like && useNoReasoner)
      return "";
    const reasonerText = `
${useNoReasoner ? promptForNoReasoner : promptForReasoner}
`;
    return reasonerText;
  }
  // 处理回复
  async formatResponse(session, response, auxiliaryResult, reasoningContent) {
    const user = await getUser(this.ctx, session.userId);
    if (!response)
      return session.text("commands.sat.messages.no-response");
    const catEar = user?.items?.["猫耳发饰"]?.description && user.items["猫耳发饰"].description == "on";
    const fumo = user?.items?.["觉fumo"]?.description && user.items["觉fumo"].description == "on";
    const ring = user?.items?.["订婚戒指"]?.description && user.items["订婚戒指"].description == "已使用";
    const eye = false;
    const replyPointing = this.config.reply_pointing && (this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1);
    let firstReasoning = "";
    if (eye && reasoningContent) {
      try {
        const extractFirstBalanced = /* @__PURE__ */ __name((text) => {
          if (!text)
            return null;
          const pairs = [{ left: "(", right: ")" }, { left: "（", right: "）" }];
          for (const pair of pairs) {
            const { left, right } = pair;
            const start = text.indexOf(left);
            if (start === -1)
              continue;
            let depth = 0;
            for (let i = start; i < text.length; i++) {
              const ch = text[i];
              if (ch === left) {
                depth++;
              } else if (ch === right) {
                depth--;
                if (depth === 0) {
                  return text.slice(start, i + 1);
                }
              }
            }
          }
          return null;
        }, "extractFirstBalanced");
        const extracted = extractFirstBalanced(reasoningContent);
        if (extracted)
          firstReasoning = extracted;
      } catch (e) {
        logger17.warn("解析 reasoningContent 时出错：" + e.message);
      }
    }
    if (catEar)
      response += " 喵~";
    if (fumo)
      response += "\nfumofumo";
    if (this.config.enable_mood && this.config.enable_favorability && this.config.visible_mood) {
      const moodLevel = this.moodManager.getMoodLevel(user.userid);
      if (moodLevel == "angry")
        response += "（怒）";
      if (moodLevel == "upset")
        response += "（烦躁）";
    }
    if (auxiliaryResult && this.config.visible_favorability && !ring) {
      response += auxiliaryResult;
      this.addUserToWarnList(session, auxiliaryResult);
    }
    if (replyPointing) {
      response = `@${session.username} ` + response;
    }
    if (this.ctx.puppeteer && !this.puppeteerReady()) {
      logger17.info("Puppeteer 未就绪，正在重新初始化 Puppeteer...");
      this.setPuppeteer(this.ctx.puppeteer);
    }
    if (firstReasoning.length > 15) {
      const renderStartTime = Date.now();
      try {
        await session.send(await wrapInHTML(firstReasoning));
        const renderTime = Date.now() - renderStartTime;
        if (renderTime > 5e3) {
          logger17.warn(`wrapInHTML 渲染耗时异常: ${renderTime}ms, 内容长度: ${firstReasoning.length}`);
        }
      } catch (error) {
        logger17.error(`wrapInHTML 渲染失败: ${error}`);
      }
    }
    if (this.config.sentences_divide && response.length > 10) {
      const sentences = splitSentences(response, this.config.min_sentences_length, this.config.max_sentences_length).map((text) => import_koishi19.h.text(text));
      for (const sentence of sentences) {
        await session.send(sentence);
        await new Promise((resolve4) => setTimeout(resolve4, this.config.time_interval));
      }
      return null;
    }
    return response;
  }
  addUserToWarnList(session, auxiliaryResult) {
    if (!this.config.enable_warning)
      return;
    if (auxiliaryResult.includes("好感↓")) {
      logger17.info(`在群${session.channelId}中，${session.username}骚扰我！`);
      this.usersToWarn.set(session.channelId, session.username);
    }
  }
  async getWarningList(session) {
    let result = "";
    for (const [channelId, username] of this.usersToWarn.entries()) {
      if (channelId) {
        result += `在群${channelId}中，${username}骚扰我！
`;
      }
    }
    if (result.length == 0)
      return;
    if (this.config.warning_admin_id)
      session.send(session.text("commands.sat.messages.warning", [this.config.warning_admin_id]) + result);
    else
      session.send(result);
    this.usersToWarn.clear();
    return;
  }
  // 清空会话
  clearSession(session, global2) {
    if (global2) {
      this.memoryService.clearAllMemories();
      return session.text("commands.sat.clear.messages.Allclean");
    } else {
      if (this.config.personal_memory) {
        this.memoryService.clearChannelMemory(session.userId);
      } else {
        this.memoryService.clearChannelMemory(session.channelId);
      }
      this.memoryService.clearChannelDialogue(session.channelId);
    }
    return session.text("commands.sat.clear.messages.clean");
  }
  // 添加常识
  async addCommonSense(session, content) {
    if (!content)
      return session.text("commands.sat.common_sense.messages.no-prompt");
    await this.memoryService.addCommonSense(content.replace(/\"/g, "'").trim());
    return session.text("commands.sat.common_sense.messages.succeed", [content]);
  }
  // 添加群常识
  async addGroupCommonSense(session, content, groupId) {
    if (!content)
      return session.text("commands.sat.common_sense.messages.no-prompt");
    const id = groupId || session.channelId;
    await this.memoryService.addGroupCommonSense(content.replace(/\"/g, "'").trim(), id);
    return session.text("commands.sat.common_sense.messages.succeed", [`群${id}中：` + content]);
  }
  // 更新用户等级
  async handleUserLevel(session, options) {
    const userId = options.id || session.userId;
    const user = await ensureUserExists(this.ctx, userId, session.username);
    const level = options.level || (user.userlevel > 1 ? user.userlevel : 1);
    await updateUserLevel(this.ctx, user, level);
    return session.text("commands.sat.messages.update_level_succeed", [level]);
  }
  // 处理查询用户使用次数
  async handleUserUsage(session) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const userUsage = user.usage || 0;
    const maxUsage = this.config.max_usage[user.userlevel || 0] || 0;
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description == "on";
    let result = "";
    result += "用户等级：" + user.userlevel + "\n";
    if (enableUserKey)
      result += session.text("commands.sat.messages.usage", [userUsage, "∞"]) + "\n地灵殿通行证生效中\n";
    else
      result += session.text("commands.sat.messages.usage", [userUsage, maxUsage]) + "\n";
    if (await this.memoryService.hasProfile(this.memoryService.getScopeId(session)))
      result += "用户画像生效中\n";
    return result;
  }
  // 随机中间件转接
  async handleRandomMiddleware(session) {
    const response = await this.generateResponse(session, randomPrompt);
    return await this.formatResponse(session, response.content, null);
  }
  // 昵称中间件转接
  async handleNickNameMiddleware(session, prompt) {
    const user = await getUser(this.ctx, session.userId);
    if (await this.checkUserDialogueCount(session, user, 0))
      return null;
    if (await this.checkFavorabilityBlock(session))
      return null;
    return this.handleSatCommand(session, prompt);
  }
  // 频道记忆中间件转接
  async handleChannelMemoryManager(session) {
    const processedPrompt = processPrompt(session.content, this.config.nick_name_list, [session.selfId]);
    if (this.performPreChecks(session, processedPrompt))
      return null;
    let censored = processedPrompt;
    if (this.ctx.censor)
      censored = await this.ctx.censor.transform(processedPrompt, session);
    this.memoryService.updateChannelDialogue(session, censored, session.username);
    return null;
  }
  async dispose() {
    this.memoryService.stop();
    if (this.puppeteer) {
      try {
        await this.puppeteer.stop();
        logger17.info("Puppeteer 已成功释放");
      } catch (error) {
        logger17.warn("释放 Puppeteer 时出错", error);
      } finally {
        this.puppeteer = null;
      }
    }
  }
};
var src_default = SAT;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SAT,
  puppeteer,
  refreshPuppeteer
});
