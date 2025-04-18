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
  "src/locales/zh.yml"(exports, module2) {
    module2.exports = { commands: { sat: { description: "AI聊天", messages: { "no-prompt": "你好。使用说明可以看我的空间哦。", tooManyEnglishLetters: "请不要用这么多英文......", err: "寄！{0}", tooLong: "你的话太多了。", content_tooLong: "这个问题有点复杂，你还是去问别人吧。", "duplicate-dialogue": "这个刚刚说过了吧......", online: "思考中，请再等一会！", "no-response": "我不知道你在说什么……", update_level_succeed: "用户等级已更新为{0}", exceeds: "已经差不多够了吧？请明天再来。", usage: "今日次数{0}/{1}", hatMan: "叮！帽子先生保护了你的好感度，快说谢谢帽子先生吧！", rockBottom: "叮！谷底小石保护了你的好感度，快说谢谢谷底小石吧！", not_good_mood: "别得寸进尺……（好感↓）", pocket_money: "心情不错，给你点零花钱吧~（获得了{0}p点）", block1: "我讨厌你！", block2: "我讨厌你们！" } }, "sat.clear": { description: "清空当前频道会话", messages: { clean: "已清空当前会话。", Allclean: "已清空所有会话。" } }, "sat.common_sense": { description: "添加常识", messages: { "no-prompt": "你想让我知道什么？", succeed: "我知道了，{0}" } } } };
  }
});

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  SAT: () => SAT,
  default: () => src_default,
  puppeteer: () => puppeteer
});
module.exports = __toCommonJS(src_exports);
var import_koishi12 = require("koishi");
var path7 = __toESM(require("path"));

// src/api.ts
var import_koishi2 = require("koishi");

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
function processPrompt(prompt) {
  if (!prompt)
    return "";
  if (prompt.includes(":poke"))
    return "戳戳";
  prompt = prompt.replace(/<[^>]*?avatar[^>]*>/g, "。回复：");
  prompt = prompt.replace(/<[^>]*?img[^>]*>/g, "[图片]");
  prompt = prompt.replace(/<[^>]*?name="([^\"]*)"[^>]*>/g, (_, name) => `@${name}`);
  prompt = prompt.replace(/\*\*/g, "");
  if (!prompt)
    return "**";
  return prompt;
}
__name(processPrompt, "processPrompt");
function filterResponse(prompt, words) {
  const parts = prompt.split(/([（\[【《(][^）)]*[）\]】》)])/g);
  const filtered = parts.map((part) => {
    if (part.startsWith("（") && part.endsWith("）") || part.startsWith("(") && part.endsWith(")") || part.startsWith("[") && part.endsWith("]") || part.startsWith("【") && part.endsWith("】") || part.startsWith("《") && part.endsWith("》")) {
      return words.some((word) => part.includes(word)) ? "" : part;
    }
    return part;
  }).join("");
  const cleaned = filtered.replace(/\s+/g, "");
  const answerRegex = /<answer>[\s\S]*?<\/answer>/g;
  const answerRegex2 = /<doubaothinking>[\s\S]*?<\/answer>/g;
  const answerMatches = cleaned.match(answerRegex);
  const answerMatches2 = cleaned.match(answerRegex2);
  if (!answerMatches && !answerMatches2) {
    return { content: "有点问题，稍后再来吧", error: true };
  }
  const answerContent = answerMatches ? answerMatches[answerMatches.length - 1] : answerMatches2[answerMatches2.length - 1];
  const regex = /<answer>|<\/answer>|<doubaothinking>|<\/doubaothinking>/g;
  const cleanedContent = answerContent.replace(regex, "");
  return cleanedContent === "" ? { content: "有点问题，稍后再来吧", error: true } : { content: cleanedContent, error: false };
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

// src/api.ts
var logger2 = new import_koishi2.Logger("satori-api");
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
  // 发送聊天请求
  async chat(user, messages) {
    if (user.userid == "Alice")
      return { content: "(系统)这是一个测试句子。这个句子稍长一些，包含多个标点符号！这是一个特别长的句子，需要超过最大长度限制的句子应该被保留原样，但这种情况在实际使用中应该尽量避免。最后？这是一个需要合并的短句！;", error: false };
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description == "on";
    let keys;
    let modle;
    let baseURL;
    if (enableUserKey) {
      const ticket = user.items["地灵殿通行证"].metadata;
      keys = [ticket?.key];
      modle = ticket?.model;
      baseURL = ticket?.baseURL;
      const not_reasoner_model = ticket?.not_reasoner_model;
      const length = ticket?.use_not_reasoner_LLM_length;
      if (not_reasoner_model && length && messages[messages.length - 1].content.length <= length)
        modle = not_reasoner_model;
    } else {
      const config = this.config;
      const useNotReasoner = messages[messages.length - 1].content.length <= config.use_not_reasoner_LLM_length;
      keys = useNotReasoner ? config.not_reasoner_LLM_key : config.keys;
      modle = useNotReasoner ? config.not_reasoner_LLM : config.appointModel;
      baseURL = useNotReasoner ? config.not_reasoner_LLM_URL : config.baseURL;
    }
    const payload = this.createPayload(messages, modle);
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
  async auxiliaryChat(messages) {
    const AuxiliaryPayload = this.createAuxiliaryPayload(messages, this.config.auxiliary_LLM);
    const url = `${trimSlash(this.config.auxiliary_LLM_URL)}/chat/completions`;
    const headers = this.createHeaders(this.config.auxiliary_LLM_key);
    let content;
    for (let i = 1; i <= this.config.maxRetryTimes; i++) {
      try {
        const response = await this.ctx.http.post(url, AuxiliaryPayload, { headers, timeout: 36e5 });
        content = response.choices[0].message.content;
        return { content, error: false };
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error);
        }
        logger2.warn(`辅助模型API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    return { content: "unreachable", error: true };
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
        await new Promise((resolve3) => setTimeout(resolve3, this.config.retry_delay_time || 5e3));
        logger2.warn(`生成画像时API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    return { content: "unreachable", error: true };
  }
  // 生成请求体
  createPayload(messages, model) {
    return {
      model,
      messages,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty
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
        logger2.info(`APIID: ${response.id}, 输入token: ${response.usage.prompt_tokens}, 输出token: ${response.usage.completion_tokens}, 总token: ${response.usage.total_tokens}`);
        content = response.choices[0].message.content;
        const reasoning_content = response.choices[0].message.reasoning_content || "无";
        if (this.config.reasoning_content)
          logger2.info(`思维链: ${reasoning_content}`);
        if (!content && reasoning_content) {
          logger2.warn("返回内容为空,但存在推理内容");
          content = response.choices[0].message.reasoning_content;
        }
        const responseMsg = { role: "assistant", content };
        if (payload.messages.some((msg) => msg === responseMsg) && content.length > 5) {
          const lastMsg = payload.messages[payload.messages.length - 1];
          payload.messages[payload.messages.length - 1].content = lastMsg.content + "(注意不要重复之前的内容)";
          logger2.warn(`返回内容与之前内容相同，重试(第${i}次)中...`);
          continue;
        }
        return { content, error: false };
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error);
        }
        await new Promise((resolve3) => setTimeout(resolve3, this.config.retry_delay_time || 5e3));
        logger2.warn(`API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    return { content: "模型发生复读行为，建议重置对话", error: true };
  }
  // 生成请求头
  createHeaders(keys) {
    return {
      Authorization: `Bearer ${keys[this.currentKeyIndex]}`,
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
    logger2.error(`API Error [${status}]: ${errorCode} - ${message}`);
    switch (status) {
      case 400:
        return { content: "请求体格式错误", error: true };
      case 401:
        return { content: "API key 错误，认证失败", error: true };
      case 402:
        return { content: "账号余额不足", error: true };
      case 422:
        return { content: "请求体参数错误", error: true };
      case 429:
        return { content: "请求速率（TPM 或 RPM）达到上限", error: true };
      case 500:
        return { content: `api服务器内部故障`, error: true };
      case 503:
        return { content: "api服务器负载过高", error: true };
      default:
        return { content: message, error: true };
    }
  }
  // 切换API密钥
  rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length;
    logger2.debug(`Switched to API key index: ${this.currentKeyIndex}`);
  }
  // 测试连接
  async testConnection() {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders(this.config.keys) });
      logger2.info("API connection test succeeded");
      return true;
    } catch (error) {
      logger2.error("API connection test failed");
      return false;
    }
  }
};

// src/memory.ts
var import_koishi3 = require("koishi");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var logger3 = new import_koishi3.Logger("satori-memory");
var MemoryManager = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  static {
    __name(this, "MemoryManager");
  }
  channelMemories = /* @__PURE__ */ new Map();
  channelDialogues = /* @__PURE__ */ new Map();
  charactersToRemove = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  MAX_MEMORY_LENGTH = 5e3;
  // 更新记忆
  async updateMemories(session, prompt, config, response) {
    if (response.error)
      return;
    this.updateChannelMemory(session, prompt, config, response.content);
    const date = ` (对话日期和时间：${(/* @__PURE__ */ new Date()).toLocaleString()})`;
    const userFavourbility = (await getUser(this.ctx, session.userId)).favorability;
    if (this.shouldRemember(prompt, userFavourbility)) {
      await this.saveLongTermMemory(session, [{
        role: date,
        content: prompt
      }]);
    }
  }
  // 是否应当记忆
  shouldRemember(content, userFavourbility) {
    return (content.length >= this.config.remember_min_length || content.includes("记住") && userFavourbility >= 50) && !this.config.memory_block_words.some((word) => content.includes(word));
  }
  // 更新频道对话
  async updateChannelDialogue(session, prompt, name) {
    if (!this.config.channel_dialogues)
      return "";
    if (!this.channelDialogues[session.channelId])
      this.channelDialogues[session.channelId] = [];
    this.channelDialogues[session.channelId].push('"' + name + '" 说: ' + prompt);
    if (this.channelDialogues[session.channelId]?.length > this.config.channel_dialogues_max_length) {
      this.channelDialogues = this.channelDialogues[session.channelId].slice(-this.config.channel_dialogues_max_length);
    }
  }
  async getChannelDialogue(session) {
    if (!this.config.channel_dialogues)
      return "";
    const Dialogue = this.channelDialogues[session.channelId]?.join("\n") || "";
    const result = "以下是群聊内群友最近的聊天记录，当用户话题涉及其中内容时你可以参考这些信息：{\n" + Dialogue + "\n}\n";
    return result;
  }
  // 括号引号过滤
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
  // 内容过滤
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
    const result = filtered.replace(/([，、])\1+/g, "$1").replace(/^[，。！？;,.!?]+/, "").trim();
    return result || content;
  }
  // 更新短期记忆
  updateChannelMemory(session, prompt, config, response) {
    if (response) {
      response = this.bracketFilter(response, config);
      response = this.memoryFilter(response, config);
    }
    let channelId = session.channelId;
    if (config.personal_memory)
      channelId = session.userId;
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, {
        dialogues: [],
        updatedAt: Date.now()
      });
    }
    const memory = this.channelMemories.get(channelId);
    memory.dialogues.push({ role: "user", content: prompt });
    this.updateChannelDialogue(session, prompt, session.username);
    if (this.config.enable_self_memory && response) {
      memory.dialogues.push({ role: "assistant", content: "<answer>" + response + "</answer>" });
    } else {
      memory.dialogues.push({ role: "assistant", content: "<answer>…</answer>" });
    }
    if (memory.dialogues.length > this.config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-this.config.message_max_length);
    }
  }
  // 清除频道记忆
  clearChannelMemory(channelId) {
    this.channelMemories.delete(channelId);
  }
  // 清除频道对话
  clearChannelDialogue(channelId) {
    this.channelDialogues[channelId] = [];
  }
  // 清除全部记忆
  clearAllMemories() {
    this.channelMemories.clear();
    this.channelDialogues = /* @__PURE__ */ new Map();
  }
  // 返回频道记忆
  getChannelMemory(channelId) {
    return this.channelMemories.get(channelId)?.dialogues || [];
  }
  // 长期记忆存储
  async saveLongTermMemory(session, dialogues, filePath = "") {
    if (filePath === "")
      filePath = this.getUserMemoryPath(session.userId);
    await this.ensureMemoryFile(filePath);
    const filtered = dialogues.filter((entry) => !this.config.memory_block_words.some((word) => entry.content.includes(word)));
    if (filtered.length === 0)
      return;
    const existing = await this.loadMemoryFile(filePath);
    let updated = [...existing, ...filtered];
    if (updated.length > this.MAX_MEMORY_LENGTH) {
      updated = updated.slice(-this.MAX_MEMORY_LENGTH);
    }
    fs2.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  }
  // 记忆检索
  async searchMemories(session, prompt, type = "user") {
    const filePathMap = {
      "user": this.getUserMemoryPath(session.userId),
      "common": path2.join(this.config.dataDir, "common_sense.txt")
    };
    const topNMap = {
      "user": this.config.dailogues_topN,
      "common": this.config.common_topN
    };
    const filePath = filePathMap[type];
    if (!fs2.existsSync(filePath)) {
      return "";
    }
    const keywords = prompt.split("").filter((word) => !this.charactersToRemove.includes(word));
    let entries = await this.loadMemoryFile(filePath);
    const matched = this.findBestMatches(entries, keywords).slice(0, topNMap[type] * 5);
    if (type === "user") {
      const remainingEntries = entries.filter((entry) => !matched.includes(entry));
      let updatedEntries = [...remainingEntries, ...matched];
      fs2.writeFileSync(filePath, JSON.stringify(updatedEntries, null, 2));
    }
    const result = this.formatMatches(matched, type, topNMap[type]);
    return result;
  }
  // 记忆检索
  findBestMatches(entries, keywords) {
    return entries.map((entry) => ({ entry, ...this.calculateMatchScore(entry.content, keywords) })).filter(({ count }) => count > 1).sort((a, b) => b.score - a.score).map(({ entry }) => entry);
  }
  // 匹配度计算
  calculateMatchScore(content, keywords) {
    if (keywords.length === 0)
      return { score: 0, count: 0 };
    const escapedKeywords = keywords.map((k) => escapeRegExp(k));
    const regex = new RegExp(escapedKeywords.join("|"), "gi");
    const chineseRegex = /[\u4e00-\u9fa5]/g;
    const regex2 = new RegExp(`[${this.charactersToRemove.join("")}]`, "g");
    content = content.replace(regex2, "");
    const matches = content.match(regex) || [];
    let count = 0;
    matches.forEach((match) => {
      const chineseCount = (match.match(chineseRegex) || []).length;
      const englishCount = match.length - chineseCount;
      count += chineseCount * 2 + englishCount;
    });
    const totalChinese = (content.match(chineseRegex) || []).length;
    const totalEnglish = content.length - totalChinese;
    const totalWeight = totalChinese * 2 + totalEnglish;
    const ratio = totalWeight > 0 ? count / totalWeight : 0;
    return { score: ratio, count };
  }
  // 格式化匹配结果
  formatMatches(matched, type, topN = 5) {
    const prefixMap = {
      "common": "\n这是你可能用到的信息：",
      "user": "\n以下是较久之前用户说过的话和对话时间："
    };
    const time = `
时段：${getTimeOfDay((/* @__PURE__ */ new Date()).getHours())}`;
    const date = `
当前日期和时间：${(/* @__PURE__ */ new Date()).toLocaleString()} ${time}`;
    if (matched.length > 0) {
      matched = matched.slice(0, topN < matched.length ? topN : matched.length);
      if (type === "common") {
        const result = `${prefixMap[type]}{
${matched.map((entry) => entry.content).join("\n")} ${date}
`;
        return result;
      } else {
        matched.forEach((entry) => entry.content = entry.content + (entry.role === "user" ? "(未记录时间)" : entry.role));
        const result = `${prefixMap[type]}{
${matched.map((entry) => entry.content).join("\n")}
}
`;
        return result;
      }
    } else {
      if (type === "common") {
        return date;
      } else {
        return "";
      }
    }
  }
  // 获取用户记忆文件路径
  getUserMemoryPath(userId) {
    return path2.join(this.config.dataDir, "dialogues", `${userId}.txt`);
  }
  // 确保记忆文件存在
  async ensureMemoryFile(filePath) {
    fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
    if (!fs2.existsSync(filePath)) {
      fs2.writeFileSync(filePath, "[]", "utf-8");
    }
  }
  // 加载记忆文件
  async loadMemoryFile(filePath) {
    try {
      return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }
  // 获取频道上下文
  getChannelContext(channelId) {
    return this.channelMemories.get(channelId)?.dialogues || [];
  }
};

// src/fixed-dialogues.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
async function handleFixedDialogues(ctx, session, user, prompt, config) {
  if (!config.enable_fixed_dialogues)
    return null;
  const filePath = path3.join(config.dataDir, "fixed_dialogues.json");
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
  if (!fs3.existsSync(filePath)) {
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
    fs3.writeFileSync(filePath, JSON.stringify(defaultDialogues, null, 2));
  }
}
__name(ensureFixedDialoguesFile, "ensureFixedDialoguesFile");
async function loadFixedDialogues(filePath) {
  await ensureFixedDialoguesFile(filePath);
  try {
    return JSON.parse(fs3.readFileSync(filePath, "utf-8"));
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
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
async function handleFavorabilitySystem(ctx, session, config) {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  const level = getFavorabilityLevel(user, config);
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900 && level !== "夫妻") {
    return session.text("commands.sat.messages.block1");
  }
  const englishCount = (session.content.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8 && level !== "夫妻") {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  return;
}
__name(handleFavorabilitySystem, "handleFavorabilitySystem");
function getFavorabilityLevel(user, config) {
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
  return `
${prompts[level]}
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
    moodManager.handleInputMoodChange(user);
    await applyFavorabilityEffect(ctx, user, -1 * config.value_of_input_favorability, session);
    return -1 * config.value_of_input_favorability;
  }
  moodManager.applyMoodChange(user, 1);
  if (config.enable_auxiliary_LLM || user.usage > config.max_favorability_perday)
    return 0;
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
    const filePath = path4.join(config.dataDir, "output_censor.txt");
    if (!fs4.existsSync(filePath)) {
      return 0;
    }
    const censorWords = fs4.readFileSync(filePath, "utf-8").split(",");
    const censoredContent = censorWords.reduce((acc, cur) => acc.replace(cur, "**"), content);
    const regex = /\*\*/g;
    const hasCensor = regex.test(censoredContent);
    const moodLevel = moodManager.getMoodLevel(user.userid);
    if (hasCensor) {
      const mood = moodManager.getMoodValue(user.userid);
      moodManager.handleOutputMoodChange(user);
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
  const filePath = path4.join(basePath, "output_censor.txt");
  fs4.mkdirSync(path4.dirname(filePath), { recursive: true });
  if (!fs4.existsSync(filePath)) {
    fs4.writeFileSync(filePath, "示例屏蔽词1,示例屏蔽词2,示例屏蔽词3", "utf-8");
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
var import_koishi4 = require("koishi");
var logger4 = new import_koishi4.Logger("satori-ai-middleware");
function createMiddleware(ctx, sat, config) {
  return async (session, next) => {
    if (!isSpecialMessage(session))
      await sat.handleChannelMemoryManager(session);
    if (config.private && isPrivateSession(session)) {
      return await handlePrivateMessage(sat, session);
    }
    if (config.nick_name && await hasNickName(ctx, session, config)) {
      return await handleNickNameMessage(sat, session);
    }
    if (shouldRandomTrigger(session, config)) {
      return await sat.handleRandomMiddleware(session, session.content);
    }
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
var import_koishi5 = require("koishi");
var Sat = class extends import_koishi5.Service {
  static {
    __name(this, "Sat");
  }
  static inject = {
    required: ["console", "database", "puppeteer"],
    optional: ["censor"]
  };
  constructor(ctx, config) {
    super(ctx, "sat", true);
  }
};
((Sat2) => {
  Sat2.Config = import_koishi5.Schema.intersect([
    import_koishi5.Schema.object({
      baseURL: import_koishi5.Schema.string().default("https://api.deepseek.com").description("深度思考模型请求地址"),
      key: import_koishi5.Schema.union([
        import_koishi5.Schema.array(String).role("secret"),
        import_koishi5.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("深度思考模型api_key"),
      appointModel: import_koishi5.Schema.string().default("deepseek-reasoner").description("深度思考模型"),
      not_reasoner_LLM_URL: import_koishi5.Schema.string().default("https://api.deepseek.com").description("非深度思考模型请求地址"),
      not_reasoner_LLM: import_koishi5.Schema.string().default("deepseek-chat").description("非深度思考模型(用于节省成本"),
      not_reasoner_LLM_key: import_koishi5.Schema.union([
        import_koishi5.Schema.array(String).role("secret"),
        import_koishi5.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("非深度思考模型api_key"),
      use_not_reasoner_LLM_length: import_koishi5.Schema.number().default(8).description("触发使用非深度思考模型的字数（输入少于此字数时）,如果你希望始终使用非深度思考模型进行对话，请将此值设置成一个较大的值,反之亦然"),
      enable_reasoner_like: import_koishi5.Schema.boolean().default(true).description("是否启用非深度思考模型模仿思维链（可以在节省成本的同时提高效果）"),
      auxiliary_LLM_URL: import_koishi5.Schema.string().default("https://api.deepseek.com").description("辅助模型请求地址"),
      auxiliary_LLM: import_koishi5.Schema.string().default("deepseek-chat").description("辅助模型(用于好感度调整等功能，如不需要可不填，建议使用低成本模型"),
      auxiliary_LLM_key: import_koishi5.Schema.union([
        import_koishi5.Schema.array(String).role("secret"),
        import_koishi5.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("辅助模型api_key"),
      prompt: import_koishi5.Schema.string().role("textarea").description("人格设定"),
      reasoner_prompt: import_koishi5.Schema.string().role("textarea").description("思考提示词（对于深度思考模型和非深度思考模型模仿思维链时生效）").default("你在思考时应当逐步分析以下内容：1.当前对话的禁止事项；2.是否与群聊中其他人的发言有关联；3.是否与当前用户之前说的话有关联；4.对话的具体要求；5.用户的意图如何；6.最终的发言的主要内容。")
    }).description("基础设置"),
    import_koishi5.Schema.object({
      alias: import_koishi5.Schema.array(String).default(["ai"]).description("触发命令;别名"),
      authority: import_koishi5.Schema.number().role("slider").min(0).max(5).step(1).description("允许使用的最低权限").default(1),
      no_system_prompt: import_koishi5.Schema.boolean().default(false).description("是否将系统提示的system替换为user（用于具有思维链的模型）"),
      max_tokens: import_koishi5.Schema.number().description("最大请求长度（字符数）").default(100),
      message_max_length: import_koishi5.Schema.number().description("最大频道上下文长度（条数）").default(10),
      temperature: import_koishi5.Schema.number().role("slider").min(0).max(2).step(0.01).default(0.5).description("温度"),
      frequency_penalty: import_koishi5.Schema.number().default(0).description("频率惩罚"),
      presence_penalty: import_koishi5.Schema.number().default(0).description("存在惩罚"),
      maxRetryTimes: import_koishi5.Schema.number().default(10).description("报错后最大重试次数"),
      retry_delay_time: import_koishi5.Schema.number().default(5e3).description("每次重试延迟时间"),
      max_parallel_count: import_koishi5.Schema.number().default(2).description("频道最大并行请求数"),
      log_system_prompt: import_koishi5.Schema.boolean().default(false).description("是否在日志中输出系统提示"),
      log_reasoning_content: import_koishi5.Schema.boolean().default(true).description("是否在日志中输出思维链"),
      log_ask_response: import_koishi5.Schema.boolean().default(true).description("是否在日志中输出问答")
    }).description("请求设置"),
    import_koishi5.Schema.object({
      enable_self_memory: import_koishi5.Schema.boolean().default(true).description("是否启用模型自发言记忆（仅短期）"),
      personal_memory: import_koishi5.Schema.boolean().default(true).description("是否启用按人记忆（否则将群内所有人视为同一个用户）"),
      channel_dialogues: import_koishi5.Schema.boolean().default(true).description("是否获取群聊内最近对话（包括不对bot说的）"),
      channel_dialogues_max_length: import_koishi5.Schema.number().default(20).description("群聊内最近对话最大长度(条数)"),
      bracket_filter: import_koishi5.Schema.boolean().default(false).description("是否启用括号过滤，开启后在写入短期记忆时会过滤掉括号内的内容，用于缓解复读问题"),
      memory_filter: import_koishi5.Schema.string().role("textarea").default("示例1-示例2").description("短期记忆过滤词，使用“-”分隔，含有过滤词的那一句不会被记忆，用于缓解复读问题"),
      dataDir: import_koishi5.Schema.string().default("./data/satori_ai").description("聊天记录保存位置（长期记忆）"),
      memory_block_words: import_koishi5.Schema.array(String).default(["好感"]).description("记忆屏蔽词"),
      remember_min_length: import_koishi5.Schema.number().description("触发保存到记忆的长度").default(20),
      common_topN: import_koishi5.Schema.number().default(5).description("常识记忆检索最大匹配数"),
      dailogues_topN: import_koishi5.Schema.number().default(5).description("对话记忆检索最大匹配数"),
      enable_fixed_dialogues: import_koishi5.Schema.boolean().default(false).description("是否启用固定对话（在dataDir中的fixed_dialogues.json修改）")
    }).description("记忆设置"),
    import_koishi5.Schema.object({
      max_usage: import_koishi5.Schema.tuple([Number, Number, Number, Number, Number]).default([40, 240, 3e3, 9999, 0]).description("每日最大使用次数(对应用户level0~level4)(0为不限制)"),
      private: import_koishi5.Schema.boolean().default(false).description("开启后私聊AI可触发对话, 不需要使用指令"),
      nick_name: import_koishi5.Schema.boolean().default(true).description("是否使用昵称触发对话（发言中含有昵称时）（把qq号加入昵称可以被at和戳一戳触发）"),
      nick_name_list: import_koishi5.Schema.array(String).default(["昵称1"]).description("昵称列表"),
      nick_name_block_words: import_koishi5.Schema.array(String).default(["屏蔽词1"]).description("昵称屏蔽词(含有屏蔽词的消息不会触发昵称对话)"),
      reasoner_filter: import_koishi5.Schema.boolean().default(true).description("是否启用返回内容过滤,开启后在对话时会过滤掉在括号内且含有过滤词的那一句,用于缓解思维链溢出问题"),
      reasoner_filter_word: import_koishi5.Schema.string().role("textarea").default("系统-提示-用户-设定-回复").description("返回内容过滤词，使用“-”分隔，在括号内且含有过滤词的那一句会被过滤，用于缓解思维链溢出问题"),
      duplicateDialogueCheck: import_koishi5.Schema.boolean().default(true).description("是否检查重复对话"),
      enable_online_user_check: import_koishi5.Schema.boolean().default(true).description("在未回答而再次提问时是否提示用户有未完成的对话"),
      random_min_tokens: import_koishi5.Schema.number().default(20).description("随机触发对话的最小长度"),
      randnum: import_koishi5.Schema.number().role("slider").min(0).max(1).step(0.01).default(0).description("在群聊中随机触发对话的概率，如需关闭可设置为 0"),
      sentences_divide: import_koishi5.Schema.boolean().default(true).description("是否分句发送"),
      min_sentences_length: import_koishi5.Schema.number().default(10).description("每个分句的最小长度"),
      max_sentences_length: import_koishi5.Schema.number().default(20).description("每个分句的最大长度"),
      time_interval: import_koishi5.Schema.number().default(1e3).description("每句话的时间间隔"),
      reply_pointing: import_koishi5.Schema.boolean().default(true).description("是否在与多人同时对话时显示回复指向")
    }).description("对话设置"),
    import_koishi5.Schema.object({
      enable_favorability: import_koishi5.Schema.boolean().default(false).description("是否开启好感度系统(每次对话默认+1好感度)"),
      max_favorability_perday: import_koishi5.Schema.number().default(100).description("每日有效(引发好感度增长)对话次数上限"),
      input_censor_favorability: import_koishi5.Schema.boolean().default(false).description("是否开启好感度审查(通过输入屏蔽词扣除好感)"),
      value_of_input_favorability: import_koishi5.Schema.number().default(15).description("输入触发输入屏蔽词每次扣除的好感度"),
      output_censor_favorability: import_koishi5.Schema.boolean().default(false).description("通过输出屏蔽词扣除好感,在dataDir中的output_censor.txt修改)"),
      value_of_output_favorability: import_koishi5.Schema.number().default(15).description("输出触发输出屏蔽词每次扣除的好感度"),
      enable_auxiliary_LLM: import_koishi5.Schema.boolean().default(false).description("是否使用辅助大模型判断好感度增减(量与输入屏蔽词每次扣除的好感度相关,不稳定，慎用)"),
      offset_of_fafavorability: import_koishi5.Schema.number().default(3.5).description("辅助大模型好感度偏移量(越大越容易扣好感度)"),
      visible_favorability: import_koishi5.Schema.boolean().default(true).description("是否开启好感度升降显示"),
      enable_user_portrait: import_koishi5.Schema.boolean().default(true).description("是否启用用户画像功能"),
      portrait_usage: import_koishi5.Schema.number().default(2).description("每天触发第几次对话后触发画像生成（最小为2）"),
      max_portrait_dialogues: import_koishi5.Schema.number().default(100).description("画像生成获取的最大对话条数"),
      portrait_min_favorability: import_koishi5.Schema.number().default(100).description("触发画像生成的最小好感度"),
      prompt_0: import_koishi5.Schema.string().role("textarea").description("厌恶好感补充设定"),
      favorability_div_1: import_koishi5.Schema.number().default(15).description("厌恶-陌生分界线"),
      prompt_1: import_koishi5.Schema.string().role("textarea").description("陌生好感补充设定"),
      favorability_div_2: import_koishi5.Schema.number().default(150).description("陌生-朋友分界线"),
      prompt_2: import_koishi5.Schema.string().role("textarea").description("朋友好感补充设定"),
      favorability_div_3: import_koishi5.Schema.number().default(500).description("朋友-思慕分界线"),
      prompt_3: import_koishi5.Schema.string().role("textarea").description("思慕好感补充设定"),
      favorability_div_4: import_koishi5.Schema.number().default(1e3).description("思慕-恋慕分界线"),
      prompt_4: import_koishi5.Schema.string().role("textarea").description("恋慕好感补充设定"),
      prompt_5: import_koishi5.Schema.string().role("textarea").default("一般此配置项无效").description("夫妻好感补充设定")
    }).description("好感度设置"),
    import_koishi5.Schema.object({
      enable_mood: import_koishi5.Schema.boolean().default(false).description("是否开启心情系统（通过屏蔽词降低心情，正常聊天心情+1，每天重置为mood_div_1 + value_of_output_mood）"),
      max_mood: import_koishi5.Schema.number().default(10).description("心情上限"),
      value_of_input_mood: import_koishi5.Schema.number().default(10).description("输入触发屏蔽词每次扣除的心情"),
      value_of_output_mood: import_koishi5.Schema.number().default(5).description("输出触发屏蔽词每次扣除的心情,若当时心情大于0,此次不扣好感度"),
      visible_mood: import_koishi5.Schema.boolean().default(false).description("是否开启心情状态显示"),
      mood_prompt_2: import_koishi5.Schema.string().role("textarea").default("你现在的心情十分愉悦").description("心情达到最高补充设定"),
      mood_div_1: import_koishi5.Schema.number().default(-1).description("心情正常-烦躁分界线"),
      mood_prompt_0: import_koishi5.Schema.string().role("textarea").default("你现在的心情是：有点烦躁").description("烦躁心情补充设定"),
      mood_div_2: import_koishi5.Schema.number().default(-15).description("烦躁-生气分界线"),
      mood_prompt_1: import_koishi5.Schema.string().role("textarea").default("你现在的心情是：非常生气").description("生气心情补充设定"),
      enable_pocket_money: import_koishi5.Schema.boolean().default(false).description("开启要零花钱指令（通过消耗心情换随机数量p点）"),
      min_pocket_money: import_koishi5.Schema.number().default(100).description("随机p点最小值"),
      max_pocket_money: import_koishi5.Schema.number().default(400).description("随机p点最大值"),
      pocket_money_cost: import_koishi5.Schema.number().default(2).description("消耗心情换p点的心情值")
    }).description("好感度拓展：心情设置（需要开启好感度模块才能生效）"),
    import_koishi5.Schema.object({
      enable_game: import_koishi5.Schema.boolean().default(false).description("是否开启游戏模块"),
      enable_gobang: import_koishi5.Schema.boolean().default(false).description("是否开启五子棋游戏"),
      channel_id_for_gobang: import_koishi5.Schema.array(String).description("启用五子棋的游戏频道id（不建议太多，第一个会被公示）"),
      enable_fencing: import_koishi5.Schema.boolean().default(false).description("是否开启击剑游戏")
    }).description("拓展模块-游戏设置(仅五子棋有效，其他无效，开发中)")
  ]);
})(Sat || (Sat = {}));

// src/userportrait.ts
var import_koishi6 = require("koishi");
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var logger5 = new import_koishi6.Logger("satori-portrait");
var UserPortraitManager = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  static {
    __name(this, "UserPortraitManager");
  }
  // 获取用户印象路径
  getPortraitPath(userId) {
    return path5.join(this.config.dataDir, "UserPortrait", `${userId}.txt`);
  }
  // 检查用户印象文件
  hasPortrait(userId) {
    return fs5.existsSync(this.getPortraitPath(userId));
  }
  // 读取用户印象
  readPortrait(userId) {
    try {
      return fs5.readFileSync(this.getPortraitPath(userId), "utf-8");
    } catch {
      return "";
    }
  }
  // 获取长期记忆对话
  async getDialogues(user) {
    const userId = user.userid;
    const memoryPath = path5.join(this.config.dataDir, "dialogues", `${userId}.txt`);
    if (!fs5.existsSync(memoryPath))
      return [];
    const memoryContent = JSON.parse(fs5.readFileSync(memoryPath, "utf-8"));
    const replacedContent = memoryContent.map((entry) => {
      return {
        ...entry,
        content: entry.content.replace(user.usersname, "我")
      };
    });
    fs5.writeFileSync(memoryPath, JSON.stringify(replacedContent, null, 2));
    const validEntries = replacedContent.filter((entry) => entry.role !== "user").map((entry) => {
      const timeMatch = entry.role.match(/对话日期和时间：(\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2})/);
      if (!timeMatch)
        return null;
      return {
        ...entry,
        timestamp: new Date(timeMatch[1]).getTime()
      };
    }).filter((entry) => entry !== null).sort((a, b) => b.timestamp - a.timestamp);
    const level = user.userlevel < 5 ? user.userlevel : 4;
    const usageLimit = this.config.max_usage[level] === 0 ? this.config.max_portrait_dialogues : this.config.max_usage[level];
    const maxEntries = Math.min(usageLimit, this.config.max_portrait_dialogues);
    return validEntries.slice(0, maxEntries).map((entry) => `${entry.content}${entry.role}`);
  }
  // 生成提示词模板
  buildMessage(level, history, existingPortrait, user) {
    return [{
      role: "user",
      content: `你是一个角色扮演智能体工作流中的一环，请根据以下信息更新用户画像。需包括：
1. 基本信息（性别、年龄、生日等）
2. 生活习惯（作息等）
3. 反感点（如有）
4. 对AI的期望（从对话历史中推断）
5. 用户希望记住的信息（如有）
6. 需要短期记忆的信息（如有）

用户名：${user.usersname}
你与用户的关系：${level}
历史画像：
${existingPortrait ? "无" : existingPortrait}

近期的用户发言记录：
${history}

注意事项：
·用户一定是人类，其他情况是角色扮演
·若有历史画像则需要根据发言修正历史画像内容，以发言为准，但是历史画像中不需要修改的部分必须保留
·除非用户要求，否则不要改动基本信息中的内容
·及时删除历史画像中明确错误或多余的信息
·尤其注意用户说“记住”的部分，可能是用户希望记录的信息
·历史画像中的需要短期记忆的信息不需要保留，只需要删除旧的添加新的
·因为在角色扮演中，用户可能会说出不符合事实的信息，需要根据事实推断，避免盲目相信或主观臆测
·使用尽可能简洁的表达
·保留不确定性的表述（如"可能"、"似乎"、"用户自称"）
·保持中立和客观，避免带有个人情感色彩的描述，不要添加评价或建议
·仅给出画像内容，不要添加额外的描述、建议、评价、注解等任何内容
·不使用markdown等标记语言，直接书写即可`
    }];
  }
  // 执行画像生成
  async generatePortrait(session, user, apiClient) {
    if (!this.config.enable_favorability)
      return;
    if (!this.config.enable_user_portrait)
      return;
    if (user.favorability < this.config.portrait_min_favorability)
      return;
    const dialogues = await this.getDialogues(user);
    const existing = this.readPortrait(user.userid);
    const userlevel = getFavorabilityLevel(user, this.getFavorabilityConfig());
    const messages = this.buildMessage(userlevel, dialogues.join("\n"), existing, user);
    logger5.info(`用户 ${user.userid} 画像生成中...`);
    try {
      const response = await apiClient.generateUserPortrait(user, messages);
      if (response && !response.error) {
        this.savePortrait(user, response.content);
        if (user.usage > this.config.portrait_usage - 1)
          session.send("用户画像更新成功。");
        logger5.success(`用户 ${user.userid} 画像更新成功`);
      }
    } catch (error) {
      logger5.error(`画像生成失败：${error.message}`);
    }
  }
  savePortrait(user, portrait) {
    const filePath = this.getPortraitPath(user.userid);
    this.ensurePortraitFile(user.userid);
    fs5.writeFileSync(filePath, portrait);
  }
  ensurePortraitFile(userId) {
    const filePath = this.getPortraitPath(userId);
    if (!fs5.existsSync(filePath)) {
      fs5.mkdirSync(path5.dirname(filePath), { recursive: true });
      fs5.writeFileSync(filePath, "");
    }
  }
  // 获取用户画像
  getUserPortrait(session) {
    if (!this.config.enable_user_portrait)
      return "";
    const portrait = this.readPortrait(session.userId);
    return portrait ? `
以下是当前用户的补充信息：{${portrait}
}
` : "";
  }
  getUserPortraitById(userId) {
    if (!this.config.enable_favorability)
      return "当前未启用好感度功能";
    if (!this.config.enable_user_portrait)
      return "当前未启用用户画像功能";
    const portrait = this.readPortrait(userId);
    return portrait ? `以下是用户${userId}的画像：{
${portrait}
}` : `用户${userId}没有画像`;
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
};

// src/mood.ts
var import_koishi7 = require("koishi");
var import_crypto = require("crypto");
var logger6 = new import_koishi7.Logger("satori-ai-mood");
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
  checkDailyReset(userId) {
    const data = this.moodMap.get(userId);
    if (!data)
      return;
    const lastDate = new Date(data.lastUpdate);
    const now = /* @__PURE__ */ new Date();
    if (lastDate.getDate() !== now.getDate() || lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear()) {
      this.moodMap.set(userId, { mood: 0, lastUpdate: Date.now() });
    }
  }
  // 处理输入内容心情变化
  async handleInputMoodChange(user) {
    if (!this.config.enable_mood)
      return;
    const userId = user.userid;
    if (!this.moodMap.has(userId))
      this.initUser(userId);
    this.checkDailyReset(userId);
    this.applyMoodChange(user, -this.config.value_of_input_mood);
    return;
  }
  // 处理输出内容心情变化
  async handleOutputMoodChange(user) {
    if (!this.config.enable_mood)
      return;
    const userId = user.userid;
    if (!this.moodMap.has(userId))
      this.initUser(userId);
    this.checkDailyReset(userId);
    this.applyMoodChange(user, -this.config.value_of_output_mood);
    return;
  }
  // 应用心情变化
  applyMoodChange(user, delta) {
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
var import_koishi11 = require("koishi");

// src/gamegobang.ts
var import_koishi9 = require("koishi");

// src/abstractGame.ts
var import_koishi8 = require("koishi");
var logger7 = new import_koishi8.Logger("satori-game");
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
    logger7.info(`时间：${session.timestamp}，用户${session.userId}试图结束用户${game.getPlayerID()}开启的游戏，上次互动时间${game.getLastActionTime()}`);
    if (game.getPlayerID() == session.userId || session.timestamp - game.getLastActionTime() > 1e3 * 60 * 10 || session.user.authority >= 3) {
      const gameRes = await game.endGame();
      ctx.emit("game-result", session, gameRes);
      this.channelGames.delete(session.channelId);
      logger7.info(`游戏已结束`);
      return true;
    }
    session.send("你不是游戏的参与者，无法结束游戏");
    return false;
  }
};

// src/gamegobang.ts
var import_child_process = require("child_process");
var path6 = __toESM(require("path"));
var logger8 = new import_koishi9.Logger("satori-game-gobang");
var BOARD_SIZE = 14;
var inspireSearchLength = 10;
var Coordinate = class {
  static {
    __name(this, "Coordinate");
  }
  x;
  y;
  score;
  constructor(a = 0, b = 0, s = 0) {
    this.x = a;
    this.y = b;
    this.score = s;
  }
};
async function wrapInHTML(str) {
  if (!puppeteer) {
    logger8.warn("puppeteer未就绪");
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
__name(wrapInHTML, "wrapInHTML");
var goBangSingleGame = class extends abstractGameSingleGame {
  static {
    __name(this, "goBangSingleGame");
  }
  playerFlag;
  // 玩家棋子颜色（1: 黑棋，2: 白棋）
  winningFlag = 4 /* pending */;
  // 当前胜负状态
  level;
  // AI 难度等级
  board = [];
  // BOARD_SIZExBOARD_SIZE 棋盘状态
  lastScore = 0;
  // 上次评分
  turnsCount = 0;
  // 回合数
  constructor(disposeListener, session) {
    super(disposeListener, session);
  }
  // 初始化棋盘，随机决定玩家先手
  startGame = () => {
    super.startGame();
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    this.turnsCount = 0;
    this.playerFlag = Math.round(Math.random()) + 1;
    const randomX = Math.round(BOARD_SIZE / 2) - 2 + Math.round(2 * Math.random());
    const randomY = Math.round(BOARD_SIZE / 2) - 2 + Math.round(2 * Math.random());
    if (this.playerFlag === 1) {
      this.board[randomX][randomY] = 1;
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY + (Math.round(Math.random()) ? -1 : 1)] = 2;
      return wrapInHTML("游戏开始，你随机到了先手(黑)\n输入两个数字以下棋，先行后列，例如：“0 13”\n" + this.printBoard());
    } else {
      this.board[randomX][randomY] = 1;
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY + (Math.round(Math.random()) ? -1 : 1)] = 2;
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY] = 1;
      return wrapInHTML("游戏开始，你随机到了后手(白)\n输入两个数字以下棋，先行后列，例如：“0 13”\n" + this.printBoard());
    }
  };
  // 结束游戏，返回结果
  endGame = async () => {
    super.endGame();
    return { message: `${this.level}`, win: this.winningFlag, gameName: "五子棋", playerID: this.session.userId };
  };
  /**
   * 处理玩家输入（落子坐标）
   * @param str 输入内容，格式为 "x y"
   */
  async processInput(str) {
    const [x, y] = str.split(" ").map((a) => {
      return parseInt(a);
    });
    if (isNaN(x) || isNaN(y))
      return;
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE)
      return "坐标超出范围了";
    if (this.board[x][y] !== 0)
      return "这个位置已经有棋子了，别想耍赖";
    if (this.winningFlag !== 4 /* pending */)
      return "游戏已结束";
    this.lastActionTime = Date.now();
    this.board[x][y] = this.playerFlag;
    logger8.info(`level: ${this.level}, player: x: ${x}, y: ${y}`);
    if (this.checkWin(x, y))
      return wrapInHTML(this.printBoard() + "\n游戏已结束，发送结束游戏退出");
    const starttime = Date.now();
    const aiMove = this.getAIMove();
    const endtime = Date.now();
    if (aiMove.x === -1 || aiMove.y === -1) {
      this.winningFlag = 3 /* draw */;
      return "计算失败，视为平局，发送结束游戏退出";
    }
    if (this.turnsCount > 50) {
      this.winningFlag = 3 /* draw */;
      return "平局，发送结束游戏退出";
    }
    logger8.info(`AI 落子坐标: ${aiMove.x} ${aiMove.y}，得分: ${aiMove.score}，AI 落子耗时: ${endtime - starttime}ms`);
    this.board[aiMove.x][aiMove.y] = 3 - this.playerFlag;
    if (this.turnsCount > 5) {
      setTimeout(() => {
        this.session.send(this.generateChat(aiMove.score));
      }, 1e3);
    }
    this.lastScore = aiMove.score;
    this.turnsCount++;
    if (this.checkWin(aiMove.x, aiMove.y))
      return wrapInHTML(this.printBoard() + "\n游戏已结束，发送结束游戏退出");
    return wrapInHTML(this.printBoard() + "\n我这一步下在这里哦(" + aiMove.x + " " + aiMove.y + " 用时" + (endtime - starttime) + "ms)");
  }
  getAIMove() {
    try {
      const boardStr = this.board.map((row) => row.join(" ")).join(" ");
      const exePath = path6.resolve(__dirname, "../lib/gobang_ai.exe");
      const level = this.turnsCount > 3 ? this.level : Math.min(5, this.level);
      const stdout = (0, import_child_process.execSync)(
        `"${exePath}" "${boardStr}" ${this.playerFlag} ${level} ${inspireSearchLength}`,
        { timeout: 12e4 }
        // 设置120秒超时
      ).toString().trim();
      const [x, y, score] = stdout.split(" ").map(Number);
      return new Coordinate(x, y, score);
    } catch (error) {
      logger8.error(`AI计算失败: ${error}`);
    }
    return new Coordinate(-1, -1, -1);
  }
  // 检查是否连成五子
  checkWin(x, y) {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of directions) {
      let count = 1;
      for (let i = 1; i < 5; i++) {
        if (this.checkDirection(x, y, dx, dy, i))
          count++;
        else
          break;
      }
      for (let i = 1; i < 5; i++) {
        if (this.checkDirection(x, y, -dx, -dy, i))
          count++;
        else
          break;
      }
      if (count >= 5) {
        this.winningFlag = this.board[x][y] === this.playerFlag ? 1 /* win */ : 2 /* lose */;
        return true;
      }
    }
    return false;
  }
  // 辅助方法：检查指定方向是否有连续棋子
  checkDirection(x, y, dx, dy, step) {
    const nx = x + dx * step, ny = y + dy * step;
    return nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && this.board[nx][ny] === this.board[x][y];
  }
  // 在指定位置放置棋子
  place(target, player, game) {
    game.board[target.x][target.y] = player;
  }
  // 生成带表情符号的棋盘字符串
  printBoard() {
    const numberEmojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "🔢", "🔢", "🔢"];
    let res = "🟨" + numberEmojis.slice(0, BOARD_SIZE).join("") + "🟨\n";
    for (let i = 0; i < BOARD_SIZE; i++) {
      res += numberEmojis[i];
      for (let j = 0; j < BOARD_SIZE; j++) {
        res += this.board[i][j] === 0 ? "🟨" : this.board[i][j] === 1 ? "⚫" : "⚪";
      }
      res += numberEmojis[i];
      res += "\n";
    }
    res += "🟨" + numberEmojis.slice(0, BOARD_SIZE).join("") + "🟨\n";
    return res;
  }
  generateChat(Score) {
    if (this.lastScore < 5e6 && Score > 5e6 && this.level > 3) {
      return "我觉得你要输了哦~";
    }
    if (this.lastScore < 1e6 && Score > 1e6) {
      return "只能下在这里了~";
    }
    if (4e3 <= Score && Score < 1e4) {
      return "这招怎么样？";
    }
    if (2e3 <= Score && Score < 4e3 && Math.random() < 0.5) {
      return {
        0: "有点意思哦~",
        1: "真是焦灼的局面",
        2: "势均力敌呢~",
        3: "你在想什么呢？",
        4: "走这里会不会太冒险了？"
      }[Math.floor(Math.random() * 5)];
    }
    if (Score < -1e6) {
      return "好猛烈的攻击啊~";
    }
    if (Score < 0 && Math.random() < 0.5) {
      return "你还真是厉害呢~";
    }
    if (Score < 100) {
      return "出乎意料的一手啊";
    }
  }
};
var goBang = class extends abstractGame {
  static {
    __name(this, "goBang");
  }
  constructor() {
    super(goBangSingleGame);
  }
  // 启动游戏时可传入难度参数
  async startGame(session, ctx, args) {
    let level;
    if (!isNaN(parseInt(args[0])))
      level = parseInt(args[0]);
    else {
      setTimeout(() => {
        session.send("未输入难度等级(2-6)，默认设为3");
      }, 500);
      level = 3;
    }
    if (level < 2 || level > 6) {
      level = level < 2 ? 2 : 6;
      setTimeout(() => {
        session.send("难度等级必须在2到6之间,已调整为" + level);
      }, 500);
    }
    const game = await super.startGame(session, ctx, args);
    game.level = level;
    return game;
  }
};

// src/gamefencing.ts
var import_koishi10 = require("koishi");
var logger9 = new import_koishi10.Logger("satori-game-gobang");
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

// src/game.ts
var logger10 = new import_koishi11.Logger("satori-game");
var Game = class {
  static {
    __name(this, "Game");
  }
  GAMES = ["五子棋", "击剑"];
  // 支持的游戏列表
  channelGames = /* @__PURE__ */ new Map();
  // 频道ID到游戏名称的映射
  availableGames = /* @__PURE__ */ new Map();
  // 游戏名称到实例的映射
  context;
  config;
  sat;
  constructor(ctx, cfg, sat) {
    this.context = ctx;
    this.config = cfg;
    this.sat = sat;
    if (this.config.enable_gobang) {
      this.availableGames.set("五子棋", new goBang());
    }
    if (this.config.enable_fencing) {
      this.availableGames.set("击剑", new fencing());
    }
    this.registerCommands(ctx);
    ctx.on("game-result", async (session, result) => {
      switch (result.gameName) {
        case "五子棋":
          const res = result;
          const user = await getUser(ctx, result.playerID);
          const level = parseInt(res.message);
          const bonus = Math.floor(level * level * level * (Math.random() * 2 + 2));
          if (res.win === 1 /* win */) {
            updateUserP(ctx, user, bonus * 2);
            updateFavorability(ctx, user, level * 2);
            session.send("真厉害，奖励你" + bonus * 2 + "p点,好感度+" + level * 2);
          } else if (res.win === 2 /* lose */) {
            updateUserP(ctx, user, -bonus);
            session.send("真可惜，你输了" + bonus + "p点");
          } else if (res.win === 3 /* draw */)
            session.send("平局，稍后再战吧");
          else {
            updateUserP(ctx, user, -bonus);
            session.send("游戏中断，你输了" + bonus + "p点");
          }
          break;
      }
    });
  }
  // 注册 Koishi 命令
  registerCommands(ctx) {
    ctx.command("sat.game <gameName> [...args]", "开始游戏").alias("开始游戏").action(async ({ session }, gameName, ...args) => this.startGame(session, gameName, args));
    ctx.command("sat.endgame", "结束游戏").alias("结束游戏").action(async ({ session }) => this.endGame(session));
  }
  // 启动指定游戏
  async startGame(session, gameName, args) {
    if (this.channelGames.get(session.channelId))
      return "当前频道已经有游戏在进行中";
    if (!this.GAMES.includes(gameName))
      return "没有这个游戏哦";
    const game = this.availableGames.get(gameName);
    if (!game)
      return "没有这个游戏哦";
    if (gameName === "五子棋" && !this.config.channel_id_for_gobang.includes(session.channelId)) {
      return "本群不支持五子棋哦,想玩请加群" + this.config.channel_id_for_gobang[0];
    }
    game.startGame(session, this.context, args);
    this.channelGames.set(session.channelId, gameName);
    logger10.info(`游戏${gameName}已开始于${session.channelId}`);
  }
  // 结束当前游戏
  async endGame(session) {
    const gameName = this.channelGames.get(session.channelId);
    if (!gameName)
      return "当前频道没有游戏在进行中";
    if (await this.availableGames.get(gameName).endGame(session, this.context)) {
      this.channelGames.delete(session.channelId);
      logger10.info(`${session.channelId}的游戏已结束`);
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
};

// src/index.tsx
var logger11 = new import_koishi12.Logger("satori-ai");
var puppeteer = null;
var SAT = class extends Sat {
  // 重写构造函数
  constructor(ctx, config) {
    super(ctx, config);
    this.config = config;
    ctx.i18n.define("zh", require_zh());
    puppeteer = ctx.puppeteer;
    extendDatabase(ctx);
    this.apiClient = new APIClient(ctx, this.getAPIConfig());
    this.memoryManager = new MemoryManager(ctx, this.getMemoryConfig());
    this.portraitManager = new UserPortraitManager(ctx, config);
    this.moodManager = new MoodManager(ctx, config);
    ensureCensorFileExists(this.config.dataDir);
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()));
    this.registerCommands(ctx);
    if (this.config.enable_game)
      this.game = new Game(ctx, config, this);
  }
  static {
    __name(this, "SAT");
  }
  apiClient;
  memoryManager;
  portraitManager;
  ChannelParallelCount = /* @__PURE__ */ new Map();
  onlineUsers = [];
  moodManager;
  game;
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
      reasoning_content: this.config.log_reasoning_content
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
      dailogues_topN: this.config.dailogues_topN
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
      prompt_5: this.config.prompt_5
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
    ctx.command("sat <text:text>", { authority: this.config.authority }).alias(...this.config.alias).action(async ({ session }, prompt) => this.handleSatCommand(session, prompt));
    ctx.command("sat.clear", "清空会话").option("global", "-g").action(({ session, options }) => this.clearSession(session, options.global));
    ctx.command("sat.common_sense <text:text>", "添加常识").action(async ({ session }, prompt) => this.addCommonSense(session, prompt));
    ctx.command("sat.update_user_level", "更新用户等级", { authority: 2 }).alias("更新用户").option("id", "-i <id:string>", { authority: 4 }).option("level", "-l <level:number>", { authority: 4 }).action(async ({ session, options }) => this.handleUserLevel(session, options));
    ctx.command("sat.user_usage", "查看用户使用次数").alias("查询次数").action(async ({ session }) => this.handleUserUsage(session));
    ctx.command("sat.add_output_censor <text:text>", "添加输出敏感词", { authority: 4 }).alias("添加输出屏蔽词").action(async ({ session }, word) => addOutputCensor(session, word, this.config.dataDir));
    ctx.command("sat.get_user_portrait <text:text>", "查看用户画像", { authority: 4 }).alias("查看画像").action(async ({}, userId) => this.portraitManager.getUserPortraitById(userId));
    if (this.config.enable_mood && this.config.enable_favorability && this.config.enable_pocket_money) {
      ctx.command("sat.pocket_money", "消耗心情值换取p点").alias("要零花钱").action(async ({ session }) => this.moodManager.handlePocketMoney(session));
      ctx.command("sat.set_mood", "设置心情值", { authority: 4 }).alias("设置心情").option("id", "-i <id:string>", { authority: 4 }).option("value", "-v <value:number>", { authority: 4 }).action(async ({ session, options }) => this.moodManager.setMood(options.id || session.userId, options.value || 0));
      ctx.command("sat.get_mood", "查看心情状态").alias("查看心情").option("id", "-i <id:string>", { authority: 4 }).action(async ({ session, options }) => this.moodManager.viewMood(session, options.id || session.userId));
    }
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
    const channelId = this.config.enable_self_memory ? session.userId : session.channelId;
    const recentDialogues = this.memoryManager.getChannelMemory(channelId).slice(-10);
    const duplicateCheck = await this.checkDuplicateDialogue(session, processedPrompt, recentDialogues, user);
    if (duplicateCheck)
      return duplicateCheck;
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user, processedPrompt);
    if (fixedResponse)
      return fixedResponse;
    const dialogueCountCheck = await this.checkUserDialogueCount(session, user);
    if (dialogueCountCheck)
      return dialogueCountCheck;
    await this.updateChannelParallelCount(session, 1);
    const response = await this.generateResponse(session, processedPrompt);
    const auxiliaryResult = await this.handleAuxiliaryDialogue(session, processedPrompt, response);
    await this.memoryManager.updateMemories(session, processedPrompt, this.getMemoryConfig(), response);
    if (!response.error)
      await updateUserPWithTicket(this.ctx, user, 10);
    if (user.usage == this.config.portrait_usage - 1)
      this.portraitManager.generatePortrait(session, user, this.apiClient);
    return await this.formatResponse(session, response.content, auxiliaryResult);
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
    if (inputCensor && this.config.visible_favorability)
      return "(好感↓↓)";
    if (outputCensor && this.config.visible_favorability)
      return "(好感↓)";
    if (this.config.enable_auxiliary_LLM && !response.error && response.content) {
      const messages = generateAuxiliaryPrompt(prompt, response.content, user, this.getFavorabilityConfig());
      const result = await this.apiClient.auxiliaryChat(messages);
      if (result.error) {
        logger11.error(`辅助判断失败：${result.content}`);
      } else {
        logger11.info(`辅助判断：${result.content}`);
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
    this.onlineUsers.push(session.userId);
    this.ChannelParallelCount.set(session.channelId, (this.ChannelParallelCount.get(session.channelId) || 0) + value);
  }
  // 获取频道并发数
  getChannelParallelCount(session) {
    return this.ChannelParallelCount.get(session.channelId) || 0;
  }
  // 处理输入
  async processInput(session, prompt) {
    const processedPrompt = processPrompt(prompt);
    let censored = processedPrompt;
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(processedPrompt, session);
    }
    if (this.config.enable_favorability) {
      await inputContentCheck(this.ctx, censored, session.userId, this.getFavorabilityConfig(), session, this.moodManager);
    }
    if (this.config.log_ask_response)
      logger11.info(`用户 ${session.username}：${processedPrompt}`);
    return censored;
  }
  // 生成回复
  async generateResponse(session, prompt) {
    if (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      logger11.info(`频道 ${session.channelId} 并发数过高(${this.getChannelParallelCount(session)})，${session.username}等待中...`);
    }
    while (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      this.updateChannelParallelCount(session, -1);
      await new Promise((resolve3) => setTimeout(resolve3, 1e3));
      this.updateChannelParallelCount(session, 1);
    }
    const messages = await this.buildMessages(session, prompt);
    logger11.info(`频道 ${session.channelId} 处理：${session.userId},剩余${this.getChannelParallelCount(session)}并发`);
    const user = await getUser(this.ctx, session.userId);
    let response = await this.getChatResponse(user, messages);
    if (response.error)
      response = await this.getChatResponse(user, messages);
    if (response.error)
      updateUserUsage(this.ctx, user, -1);
    return response;
  }
  // 获取聊天回复
  async getChatResponse(user, messages) {
    let response = await this.apiClient.chat(user, messages);
    if (this.config.log_ask_response) {
      if (this.config.enable_favorability && this.config.enable_mood)
        logger11.info(`Satori AI：（心情值：${this.moodManager.getMoodValue(user.userid)}）${response.content}`);
      else
        logger11.info(`Satori AI：${response.content}`);
    }
    if (this.config.reasoner_filter)
      response = filterResponse(response.content, this.config.reasoner_filter_word.split("-"));
    return response;
  }
  // 构建消息
  async buildMessages(session, prompt) {
    const messages = [];
    if (this.config.no_system_prompt) {
      messages.push({ role: "user", content: await this.buildSystemPrompt(session, prompt) });
      messages.push({ role: "assistant", content: "<answer>已明确对话要求</answer>" });
    } else {
      messages.push({ role: "system", content: await this.buildSystemPrompt(session, prompt) });
    }
    const userMemory = this.memoryManager.getChannelContext(this.config.personal_memory ? session.userId : session.channelId);
    messages.push(...userMemory);
    messages.push({ role: "user", content: prompt });
    let payload = messages.map((msg) => msg.role + ":" + msg.content).join("\n");
    if (this.config.log_system_prompt)
      logger11.info(`系统提示：
${payload}`);
    return messages;
  }
  // 构建系统提示
  async buildSystemPrompt(session, prompt) {
    const commonSense = await this.memoryManager.searchMemories(session, prompt, "common");
    const channelDialogue = await this.memoryManager.getChannelDialogue(session);
    const userMemory = await this.memoryManager.searchMemories(session, prompt);
    const user = await getUser(this.ctx, session.userId);
    let systemPrompt = this.getThinkingPrompt(user, prompt);
    systemPrompt += "#以下要求仅对最终的回复内容生效，不限制思考过程\n";
    systemPrompt += this.config.prompt;
    if (user?.items?.["觉的衣柜"]?.count) {
      const clothes = user?.items?.["觉的衣柜"]?.metadata?.clothes;
      if (clothes)
        systemPrompt += `
##你当前的穿着(根据穿着进行对应的行为)：${clothes}
`;
    }
    systemPrompt += "##" + commonSense;
    systemPrompt += "##" + channelDialogue;
    systemPrompt += "##" + userMemory;
    systemPrompt += "##" + this.portraitManager.getUserPortrait(session);
    systemPrompt += `##用户的名字是：${session.username}, id是：${session.userId}`;
    const nickName = user.items["情侣合照"]?.metadata?.userNickName;
    if (nickName)
      systemPrompt += `, 昵称是：${nickName},称呼用户时请优先使用昵称`;
    if (this.config.enable_favorability) {
      const favorabilityLevel = getFavorabilityLevel(user, this.getFavorabilityConfig());
      if (this.config.enable_mood) {
        const moodLevel = this.moodManager.getMoodLevel(user.userid);
        if (moodLevel == "normal" || favorabilityLevel == "厌恶")
          systemPrompt += "##" + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user);
        const moodPrompt = this.moodManager.generateMoodPrompt(user.userid);
        systemPrompt += `
##${moodPrompt}
`;
      } else {
        systemPrompt += "##" + generateLevelPrompt(favorabilityLevel, this.getFavorabilityConfig(), user);
      }
    }
    systemPrompt += `#注意：你最终的回复内容必须使用“<answer>”开头，使用“</answer>”结尾
`;
    if (this.config.no_system_prompt)
      systemPrompt += "#如果你明白以上内容，请回复“<answer>已明确对话要求</answer>”";
    return systemPrompt;
  }
  // 思考提示
  getThinkingPrompt(user, prompt) {
    const reasonerPrompt = this.config.reasoner_prompt;
    const promptForNoReasoner = `#请你在回复时先进行分析思考，并且模仿思维链的模式输出思考内容，${reasonerPrompt};
#你在思考时必须以 "嗯" 开头。仔细揣摩用户意图，完整输出思考内容后在输出正式的回复内容;
#注意：你的正式回复内容必须使用“<answer>”开头，使用“</answer>”结尾
`;
    const promptForReasoner = `#你在思考时必须以 "嗯" 开头。仔细揣摩用户意图，思考结束后返回符合要求的回复。
    #注意：你的回复内容必须使用“<answer>”开头，使用“</answer>”结尾
`;
    const hasTicket = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description === "on";
    const maxLength = hasTicket ? user?.items?.["地灵殿通行证"]?.metadata?.use_not_reasoner_LLM_length : this.config.use_not_reasoner_LLM_length;
    const useNoReasoner = prompt.length <= maxLength;
    if (!this.config.enable_reasoner_like && useNoReasoner)
      return "";
    const reasonerText = `
${useNoReasoner ? promptForNoReasoner : promptForReasoner}
}
`;
    return reasonerText;
  }
  // 处理回复
  async formatResponse(session, response, auxiliaryResult) {
    const user = await getUser(this.ctx, session.userId);
    this.updateChannelParallelCount(session, -1);
    this.onlineUsers = this.onlineUsers.filter((id) => id !== session.userId);
    if (!response)
      return session.text("commands.sat.messages.no-response");
    const catEar = user?.items?.["猫耳发饰"]?.description && user.items["猫耳发饰"].description == "on";
    const fumo = user?.items?.["觉fumo"]?.description && user.items["觉fumo"].description == "on";
    const ring = user?.items?.["订婚戒指"]?.description && user.items["订婚戒指"].description == "已使用";
    const replyPointing = this.config.reply_pointing && (this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1);
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
    if (auxiliaryResult && this.config.visible_favorability && !ring)
      response += auxiliaryResult;
    if (replyPointing) {
      response = `@${session.username} ` + response;
    }
    if (this.config.sentences_divide && response.length > 10) {
      const sentences = splitSentences(response, this.config.min_sentences_length, this.config.max_sentences_length).map((text) => import_koishi12.h.text(text));
      for (const sentence of sentences) {
        await session.send(sentence);
        await new Promise((resolve3) => setTimeout(resolve3, this.config.time_interval));
      }
      return null;
    }
    return response;
  }
  // 清空会话
  clearSession(session, global) {
    if (global) {
      this.memoryManager.clearAllMemories();
      return session.text("commands.sat.clear.messages.Allclean");
    } else {
      if (this.config.personal_memory) {
        this.memoryManager.clearChannelMemory(session.userId);
      } else {
        this.memoryManager.clearChannelMemory(session.channelId);
      }
      this.memoryManager.clearChannelDialogue(session.channelId);
    }
    return session.text("commands.sat.clear.messages.clean");
  }
  // 添加常识
  async addCommonSense(session, content) {
    if (!content)
      return session.text("commands.sat.common_sense.messages.no-prompt");
    const filePath = path7.join(this.config.dataDir, "common_sense.txt");
    await this.memoryManager.saveLongTermMemory(session, [{
      role: "user",
      content
    }], filePath);
    return session.text("commands.sat.common_sense.messages.succeed", [content]);
  }
  // 更新用户等级
  async handleUserLevel(session, options) {
    const userId = options.id || session.userId;
    const user = await ensureUserExists(this.ctx, userId, session.username);
    const level = options.level || (user.userlevel > 1 ? user.userlevel : 1);
    const enableUserKey = user?.items?.["地灵殿通行证"]?.description && user.items["地灵殿通行证"].description == "on";
    if (enableUserKey || level > 3)
      await this.portraitManager.generatePortrait(session, user, this.apiClient);
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
    if (this.portraitManager.hasPortrait(user.userid))
      result += "用户画像生效中\n";
    return result;
  }
  // 随机中间件转接
  async handleRandomMiddleware(session, prompt) {
    const user = await getUser(this.ctx, session.userId);
    const processedPrompt = processPrompt(session.content);
    if (this.performPreChecks(session, processedPrompt))
      return null;
    if (await this.checkUserDialogueCount(session, user, 0))
      return null;
    if (await this.checkFavorabilityBlock(session))
      return null;
    let censored = processedPrompt;
    if (this.ctx.censor)
      censored = await this.ctx.censor.transform(processedPrompt, session);
    if (censored.includes("**"))
      return null;
    return this.handleSatCommand(session, prompt);
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
    const processedPrompt = processPrompt(session.content);
    if (this.performPreChecks(session, processedPrompt))
      return null;
    let censored = processedPrompt;
    if (this.ctx.censor)
      censored = await this.ctx.censor.transform(processedPrompt, session);
    this.memoryManager.updateChannelDialogue(session, censored, session.username);
    return null;
  }
};
var src_default = SAT;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SAT,
  puppeteer
});
