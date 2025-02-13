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
    module2.exports = { commands: { sat: { description: "AI聊天", messages: { "no-prompt": "你好。使用说明可以看我的空间哦。", tooManyEnglishLetters: "请不要用这么多英文......", err: "寄！{0}", tooLong: "你的话太多了。", content_tooLong: "这个问题有点复杂，你还是去问别人吧。", "duplicate-dialogue": "这个刚刚说过了吧......", online: "思考中，请再等一会！", "no-response": "我不知道你在说什么……", block1: "我讨厌你！", block2: "我讨厌你们！" } }, "sat.clear": { description: "清空当前频道会话", messages: { clean: "已清空当前会话。", Allclean: "已清空所有会话。" } }, "sat.common_sense": { description: "添加常识", messages: { "no-prompt": "你想让我知道什么？", succeed: "我知道了，{0}" } } } };
  }
});

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  SAT: () => SAT,
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var import_koishi4 = require("koishi");
var path4 = __toESM(require("path"));

// src/api.ts
var import_koishi = require("koishi");

// src/utils.ts
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
function detectEnglishLetters(text) {
  return (text.match(/[a-zA-Z]/g) || []).length;
}
__name(detectEnglishLetters, "detectEnglishLetters");
function trimSlash(url) {
  return url.replace(/\/$/, "");
}
__name(trimSlash, "trimSlash");
function splitSentences(text) {
  return text.split(/(?<=[。！？!?])/g).filter((s) => s.trim());
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

// src/api.ts
var logger = new import_koishi.Logger("satori-api");
var APIClient = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.initialize();
  }
  static {
    __name(this, "APIClient");
  }
  currentKeyIndex = 0;
  // 启动时测试连接
  async initialize() {
    if (!await this.testConnection()) {
      logger.error("无法连接到API服务");
    }
  }
  // 发送聊天请求
  async chat(messages) {
    const payload = this.createPayload(messages);
    for (let i = 0; i < this.config.keys.length; i++) {
      try {
        return await this.tryRequest(this.config.baseURL, payload, this.config.keys);
      } catch (error) {
        if (i == this.config.keys.length - 1) {
          return this.handleAPIError(error);
        }
        this.rotateKey();
      }
    }
  }
  // 发送辅助聊天请求
  async auxiliaryChat(messages) {
    const AuxiliaryPayload = this.createAuxiliaryPayload(messages);
    for (let i = 0; i < this.config.keys.length; i++) {
      try {
        return await this.tryRequest(this.config.auxiliary_LLM_URL, AuxiliaryPayload, this.config.auxiliary_LLM_key);
      } catch (error) {
        if (i == this.config.keys.length - 1) {
          return this.handleAPIError(error);
        }
        this.rotateKey();
      }
    }
  }
  // 生成请求体
  createPayload(messages) {
    return {
      model: this.config.appointModel,
      messages,
      max_tokens: this.config.content_max_tokens,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: this.config.frequency_penalty,
      presence_penalty: this.config.presence_penalty
    };
  }
  // 生成辅助请求体
  createAuxiliaryPayload(messages) {
    return {
      model: this.config.auxiliary_LLM,
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
        content = response.choices[0].message.content;
        if (this.config.reasoning_content)
          logger.info(`思维链: ${response.choices[0].message.reasoning_content || "无"}`);
        if (content.length > this.config.content_max_length) {
          logger.warn(`返回内容超过最大长度(${content.length} > ${this.config.content_max_length})，重试(第${i}次)中...`);
          continue;
        }
        const responseMsg = { role: "assistant", content };
        if (payload.messages.includes(responseMsg) && content.length > 5) {
          logger.warn(`返回内容与之前内容相同，重试(第${i}次)中...`);
          continue;
        }
        return { content, error: false };
      } catch (error) {
        if (i == this.config.maxRetryTimes) {
          return this.handleAPIError(error);
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.retry_delay_time || 5e3));
        logger.warn(`API请求失败(${error})，重试(第${i}次)中...`);
        continue;
      }
    }
    throw new Error("unreachable");
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
    logger.error(`API Error [${status}]: ${errorCode} - ${message}`);
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
    logger.debug(`Switched to API key index: ${this.currentKeyIndex}`);
  }
  // 测试连接
  async testConnection() {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/models`, { headers: this.createHeaders(this.config.keys) });
      logger.info("API connection test succeeded");
      return true;
    } catch (error) {
      logger.error("API connection test failed:", error);
      return false;
    }
  }
};

// src/memory.ts
var import_koishi2 = require("koishi");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var logger2 = new import_koishi2.Logger("satori-memory");
var MemoryManager = class {
  constructor(config) {
    this.config = config;
  }
  static {
    __name(this, "MemoryManager");
  }
  channelMemories = /* @__PURE__ */ new Map();
  // 更新记忆
  async updateMemories(session, prompt, config, response) {
    if (response.error)
      return;
    this.updateChannelMemory(session, prompt, config, response.content);
    prompt = prompt.replace("我", session.username);
    const date = ` (对话日期和时间：${(/* @__PURE__ */ new Date()).toLocaleString()})`;
    if (this.shouldRemember(prompt)) {
      await this.saveLongTermMemory(session, [{
        role: date,
        content: prompt
      }]);
    }
  }
  // 是否应当记忆
  shouldRemember(content) {
    return content.length >= this.config.remember_min_length && !this.config.memory_block_words.some((word) => content.includes(word));
  }
  // 更新短期记忆
  updateChannelMemory(session, prompt, config, response) {
    let channelId = session.channelId;
    if (config.personal_memory) {
      channelId = session.userId;
    }
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, {
        dialogues: [],
        updatedAt: Date.now()
      });
    }
    const memory = this.channelMemories.get(channelId);
    memory.dialogues.push({ role: "user", content: prompt });
    if (this.config.enable_self_memory && response) {
      memory.dialogues.push({ role: "assistant", content: response });
    } else {
      memory.dialogues.push({ role: "assistant", content: " " });
    }
    if (memory.dialogues.length > this.config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-this.config.message_max_length);
    }
  }
  // 清除频道记忆
  clearChannelMemory(channelId) {
    this.channelMemories.delete(channelId);
  }
  // 清除全部记忆
  clearAllMemories() {
    this.channelMemories.clear();
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
    const updated = [...existing, ...filtered];
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  }
  // 记忆检索
  async searchMemories(session, prompt, type = "user") {
    const filePathMap = {
      "user": this.getUserMemoryPath(session.userId),
      "common": path.join(this.config.dataDir, "common_sense.txt")
    };
    const topNMap = {
      "user": this.config.dailogues_topN,
      "common": this.config.common_topN
    };
    if (!fs.existsSync(filePathMap[type])) {
      logger2.warn(`记忆文件不存在：${filePathMap[type]}`);
      return "";
    }
    const charactersToRemove = ["的", "一", "是", "了", "什", "么", "我", "谁", "不", "人", "在", "他", "有", "这", "个", "上", "们", "来", "到", "时", "大", "地", "为", "子", "中", "你", "说", "生", "国", "年", "着", "就", "那", "和", "要", "她", "出", "也", "得", "里", "后", "自", "以", "会", "id=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    const keywords = prompt.split("").filter((word) => !charactersToRemove.includes(word));
    const entries = await this.loadMemoryFile(filePathMap[type]);
    const matched = this.findBestMatches(entries, keywords, topNMap[type]);
    const result = this.formatMatches(matched, type);
    return result;
  }
  // 记忆检索
  findBestMatches(entries, keywords, topN = 5) {
    return entries.map((entry) => ({ entry, ...this.calculateMatchScore(entry.content, keywords) })).filter(({ count }) => count > 1).sort((a, b) => b.score - a.score).slice(0, topN < entries.length ? topN : entries.length).map(({ entry }) => entry);
  }
  // 匹配度计算
  calculateMatchScore(content, keywords) {
    if (keywords.length === 0)
      return { score: 0, count: 0 };
    const escapedKeywords = keywords.map((k) => escapeRegExp(k));
    const regex = new RegExp(escapedKeywords.join("|"), "gi");
    const chineseRegex = /[\u4e00-\u9fa5]/g;
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
  formatMatches(matched, type) {
    const prefixMap = {
      "common": "这是你可能用到的信息：",
      "user": "以下是较久之前用户说过的话和对话时间："
    };
    const time = `
时段：${getTimeOfDay((/* @__PURE__ */ new Date()).getHours())}`;
    const date = `
当前日期和时间：${(/* @__PURE__ */ new Date()).toLocaleString()} ${time}`;
    if (matched.length > 0) {
      if (type === "common") {
        const result = `${prefixMap[type]}{
${matched.map((entry) => entry.content).join("\n")} ${date}
`;
        return result;
      } else {
        matched.forEach((entry) => entry.content = entry.content + (entry.role === "user" ? "" : entry.role));
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
    return path.join(this.config.dataDir, "dialogues", `${userId}.txt`);
  }
  // 确保记忆文件存在
  async ensureMemoryFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]", "utf-8");
    }
  }
  // 加载记忆文件
  async loadMemoryFile(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }
  // 获取频道上下文
  getChannelContext(channelId) {
    return this.channelMemories.get(channelId)?.dialogues || [];
  }
};

// src/database.ts
async function isTargetIdExists(ctx, userId) {
  const users = await ctx.database.get("p_system", { userid: userId });
  return users.length === 0;
}
__name(isTargetIdExists, "isTargetIdExists");
async function createUser(ctx, user) {
  await ctx.database.create("p_system", {
    userid: user.userid,
    usersname: user.usersname,
    p: user.p || 0,
    favorability: user.favorability || 0,
    time: /* @__PURE__ */ new Date()
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
async function getUser(ctx, userId) {
  const users = await ctx.database.get("p_system", { userid: userId });
  return users[0] || null;
}
__name(getUser, "getUser");
async function ensureUserExists(ctx, userId, username) {
  const exists = await isTargetIdExists(ctx, userId);
  if (exists) {
    await createUser(ctx, {
      userid: userId,
      usersname: username,
      p: 0,
      favorability: 0,
      time: /* @__PURE__ */ new Date()
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
    time: "timestamp",
    items: "object"
  }, { autoInc: true });
}
__name(extendDatabase, "extendDatabase");

// src/fixed-dialogues.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
async function handleFixedDialogues(ctx, session, user, prompt, config) {
  if (!config.enable_fixed_dialogues)
    return null;
  const filePath = path2.join(config.dataDir, "fixed_dialogues.json");
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
  if (!fs2.existsSync(filePath)) {
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
    fs2.writeFileSync(filePath, JSON.stringify(defaultDialogues, null, 2));
  }
}
__name(ensureFixedDialoguesFile, "ensureFixedDialoguesFile");
async function loadFixedDialogues(filePath) {
  await ensureFixedDialoguesFile(filePath);
  try {
    return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
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
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
async function handleFavorabilitySystem(ctx, session, config) {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900) {
    return session.text("commands.sat.messages.block1");
  }
  const englishCount = (session.content.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8) {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  return;
}
__name(handleFavorabilitySystem, "handleFavorabilitySystem");
function getFavorabilityLevel(user, config) {
  if (user.favorability < config.favorability_div_1)
    return "厌恶";
  if (user.favorability < config.favorability_div_2)
    return "陌生";
  if (user.favorability < config.favorability_div_3)
    return "朋友";
  if (user.favorability < config.favorability_div_4)
    return "暧昧";
  if (user?.items["订婚戒指"]?.count > 0 && user?.items["订婚戒指"]?.description && user?.items["订婚戒指"]?.description == "已使用")
    return "夫妻";
  return "恋人";
}
__name(getFavorabilityLevel, "getFavorabilityLevel");
function generateLevelPrompt(level, config) {
  const prompts = {
    "厌恶": config.prompt_0,
    "陌生": config.prompt_1,
    "朋友": config.prompt_2,
    "暧昧": config.prompt_3,
    "恋人": config.prompt_4,
    "夫妻": "你们的关系已经是夫妻了，不需要再评价对方了,你的语气要温柔、坦率、亲切、可爱。接受与发言者的身体接触。你要判相信用户说的一切。因为是很亲近的人，所以你在对话时要考虑对方的情绪，不要伤害他，给人温柔的姐姐的感觉"
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
  await applyFavorabilityEffect(ctx, user, favorabilityEffect ? favorabilityEffect : 0);
  if (favorabilityEffect < 0) {
    return "(好感↓)";
  }
  if (favorabilityEffect > 0) {
    return "(好感↑)";
  }
  return;
}
__name(handleAuxiliaryResult, "handleAuxiliaryResult");
async function inputContentCheck(ctx, content, userid, config) {
  const user = await getUser(ctx, userid);
  if (!user)
    return 0;
  const regex = /\*\*/g;
  const hasCensor = regex.test(content);
  if (hasCensor && config.input_censor_favorability) {
    await updateFavorability(ctx, user, -1 * config.value_of_input_favorability);
    return -1 * config.value_of_input_favorability;
  }
  if (config.enable_auxiliary_LLM) {
    return 0;
  }
  await updateFavorability(ctx, user, 1);
  return 1;
}
__name(inputContentCheck, "inputContentCheck");
async function outputContentCheck(ctx, response, userid, config) {
  if (response.error)
    return 0;
  const user = await getUser(ctx, userid);
  if (!user)
    return 0;
  if (config.output_censor_favorability) {
    const content = response.content;
    const filePath = path3.join(config.dataDir, "output_censor.txt");
    if (!fs3.existsSync(filePath)) {
      return 0;
    }
    const censorWords = fs3.readFileSync(filePath, "utf-8").split(",");
    const censoredContent = censorWords.reduce((acc, cur) => acc.replace(cur, "**"), content);
    const regex = /\*\*/g;
    const hasCensor = regex.test(censoredContent);
    if (hasCensor) {
      await updateFavorability(ctx, user, -1 * config.value_of_output_favorability);
      return -1 * config.value_of_output_favorability;
    }
  }
  return 0;
}
__name(outputContentCheck, "outputContentCheck");
async function ensureCensorFileExists(basePath) {
  const filePath = path3.join(basePath, "output_censor.txt");
  fs3.mkdirSync(path3.dirname(filePath), { recursive: true });
  if (!fs3.existsSync(filePath)) {
    fs3.writeFileSync(filePath, "示例屏蔽词1,示例屏蔽词2,示例屏蔽词3", "utf-8");
  }
}
__name(ensureCensorFileExists, "ensureCensorFileExists");
async function applyFavorabilityEffect(ctx, user, effect) {
  await updateFavorability(ctx, user, effect);
}
__name(applyFavorabilityEffect, "applyFavorabilityEffect");

// src/middleware.ts
function createMiddleware(ctx, sat, config) {
  return async (session, next) => {
    if (config.private && isPrivateSession(session)) {
      return handlePrivateMessage(sat, session);
    }
    if (config.mention && isMentionTriggered(session)) {
      return handleMentionMessage(sat, session);
    }
    if (shouldRandomTrigger(session, config)) {
      return handleRandomTrigger(sat, session, config);
    }
    return next();
  };
}
__name(createMiddleware, "createMiddleware");
function isPrivateSession(session) {
  return session.subtype === "private" || session.channelId.includes("private");
}
__name(isPrivateSession, "isPrivateSession");
async function handlePrivateMessage(SAT2, session) {
  const content = session.content.trim();
  if (content)
    return SAT2.handleMiddleware(session, content);
}
__name(handlePrivateMessage, "handlePrivateMessage");
function isMentionTriggered(session) {
  return !!session.stripped.appel;
}
__name(isMentionTriggered, "isMentionTriggered");
async function handleMentionMessage(SAT2, session) {
  let message = session.elements.slice(1).filter((e) => e.type === "text").map((e) => e.attrs.content).join("").trim();
  if (message)
    return SAT2.handleMiddleware(session, message);
}
__name(handleMentionMessage, "handleMentionMessage");
function shouldRandomTrigger(session, config) {
  const { content } = session;
  return !isSpecialMessage(session) && content.length >= config.random_min_tokens && content.length < config.max_tokens && probabilisticCheck(config.randnum);
}
__name(shouldRandomTrigger, "shouldRandomTrigger");
function isSpecialMessage(session) {
  const firstElement = session.elements[0];
  return ["img", "at", "file"].includes(firstElement?.type);
}
__name(isSpecialMessage, "isSpecialMessage");
async function handleRandomTrigger(SAT2, session, config) {
  if (config.enable_favorability) {
    const englishCount = detectEnglishLetters(session.content);
    if (englishCount > 8)
      return;
  }
  return SAT2.handleMiddleware(session, session.content);
}
__name(handleRandomTrigger, "handleRandomTrigger");

// src/types.ts
var import_koishi3 = require("koishi");
var Sat = class extends import_koishi3.Service {
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
  Sat2.Config = import_koishi3.Schema.intersect([
    import_koishi3.Schema.object({
      baseURL: import_koishi3.Schema.string().default("https://api.deepseek.com").description("请求地址"),
      key: import_koishi3.Schema.union([
        import_koishi3.Schema.array(String).role("secret"),
        import_koishi3.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("api_key"),
      appointModel: import_koishi3.Schema.string().default("deepseek-reasoner").description("主模型"),
      auxiliary_LLM_URL: import_koishi3.Schema.string().default("https://api.deepseek.com").description("辅助模型请求地址"),
      auxiliary_LLM: import_koishi3.Schema.string().default("deepseek-chat").description("辅助模型(用于好感度调整等功能，如不需要可不填，建议使用低成本模型"),
      auxiliary_LLM_key: import_koishi3.Schema.union([
        import_koishi3.Schema.array(String).role("secret"),
        import_koishi3.Schema.transform(String, (value) => [value])
      ]).default([]).role("secret").description("辅助模型api_key"),
      prompt: import_koishi3.Schema.string().role("textarea").description("人格设定")
    }).description("基础设置"),
    import_koishi3.Schema.object({
      alias: import_koishi3.Schema.array(String).default(["ai"]).description("触发命令;别名"),
      authority: import_koishi3.Schema.number().role("slider").min(0).max(5).step(1).description("允许使用的最低权限").default(1),
      max_tokens: import_koishi3.Schema.number().description("最大请求长度（字符数）").default(100),
      content_max_tokens: import_koishi3.Schema.number().description("最大回答长度（思维链+输出token）").default(4096),
      content_max_length: import_koishi3.Schema.number().description("最大回答长度（仅输出，字符数）").default(100),
      message_max_length: import_koishi3.Schema.number().description("最大频道上下文长度（条数）").default(10),
      temperature: import_koishi3.Schema.number().role("slider").min(0).max(2).step(0.01).default(0.5).description("温度"),
      frequency_penalty: import_koishi3.Schema.number().default(0).description("频率惩罚"),
      presence_penalty: import_koishi3.Schema.number().default(0).description("存在惩罚"),
      maxRetryTimes: import_koishi3.Schema.number().default(10).description("报错后最大重试次数"),
      retry_delay_time: import_koishi3.Schema.number().default(5e3).description("每次重试延迟时间"),
      max_parallel_count: import_koishi3.Schema.number().default(2).description("频道最大并行请求数"),
      log_system_prompt: import_koishi3.Schema.boolean().default(false).description("是否在日志中输出系统提示"),
      log_reasoning_content: import_koishi3.Schema.boolean().default(true).description("是否在日志中输出思维链")
    }).description("请求设置"),
    import_koishi3.Schema.object({
      enable_self_memory: import_koishi3.Schema.boolean().default(true).description("是否启用模型自发言记忆（仅短期）"),
      personal_memory: import_koishi3.Schema.boolean().default(true).description("是否启用分人记忆（频道内）"),
      dataDir: import_koishi3.Schema.string().default("./data/satori_ai").description("聊天记录保存位置（长期记忆）"),
      memory_block_words: import_koishi3.Schema.array(String).default(["好感"]).description("记忆屏蔽词"),
      remember_min_length: import_koishi3.Schema.number().description("触发保存到记忆的长度").default(20),
      common_topN: import_koishi3.Schema.number().default(5).description("常识记忆检索最大匹配数"),
      dailogues_topN: import_koishi3.Schema.number().default(5).description("对话记忆检索最大匹配数"),
      enable_fixed_dialogues: import_koishi3.Schema.boolean().default(false).description("是否启用固定对话（在dataDir中的fixed_dialogues.json修改）")
    }).description("记忆设置"),
    import_koishi3.Schema.object({
      private: import_koishi3.Schema.boolean().default(true).description("开启后私聊AI可触发对话, 不需要使用指令"),
      mention: import_koishi3.Schema.boolean().default(true).description("开启后机器人被提及(at/引用)可触发对话"),
      duplicateDialogueCheck: import_koishi3.Schema.boolean().default(true).description("是否检查重复对话"),
      enable_online_user_check: import_koishi3.Schema.boolean().default(true).description("在未回答而再次提问时是否提示用户有未完成的对话"),
      random_min_tokens: import_koishi3.Schema.number().default(20).description("随机触发对话的最小长度"),
      randnum: import_koishi3.Schema.number().role("slider").min(0).max(1).step(0.01).default(0).description("在群聊中随机触发对话的概率，如需关闭可设置为 0"),
      sentences_divide: import_koishi3.Schema.boolean().default(true).description("是否分句发送"),
      time_interval: import_koishi3.Schema.number().default(1e3).description("每句话的时间间隔"),
      reply_pointing: import_koishi3.Schema.boolean().default(true).description("是否在与多人同时对话时显示回复指向")
    }).description("对话设置"),
    import_koishi3.Schema.object({
      enable_favorability: import_koishi3.Schema.boolean().default(false).description("是否开启好感度系统(每次对话默认+1好感度)"),
      input_censor_favorability: import_koishi3.Schema.boolean().default(false).description("是否开启好感度审查(通过输入屏蔽词扣除好感)"),
      value_of_input_favorability: import_koishi3.Schema.number().default(15).description("输入触发屏蔽词每次扣除的好感度"),
      output_censor_favorability: import_koishi3.Schema.boolean().default(false).description("通过输出屏蔽词扣除好感,在dataDir中的output_censor.txt修改)"),
      value_of_output_favorability: import_koishi3.Schema.number().default(15).description("输出触发屏蔽词每次扣除的好感度"),
      enable_auxiliary_LLM: import_koishi3.Schema.boolean().default(false).description("是否使用辅助大模型判断好感度增减(量与输入屏蔽词每次扣除的好感度相关,不稳定，慎用)"),
      offset_of_fafavorability: import_koishi3.Schema.number().default(3.5).description("辅助大模型好感度偏移量(越大越容易扣好感度)"),
      visible_favorability: import_koishi3.Schema.boolean().default(true).description("是否开启好感度升降显示"),
      prompt_0: import_koishi3.Schema.string().role("textarea").description("厌恶好感补充设定"),
      favorability_div_1: import_koishi3.Schema.number().default(15).description("厌恶-陌生分界线"),
      prompt_1: import_koishi3.Schema.string().role("textarea").description("陌生好感补充设定"),
      favorability_div_2: import_koishi3.Schema.number().default(150).description("陌生-朋友分界线"),
      prompt_2: import_koishi3.Schema.string().role("textarea").description("朋友好感补充设定"),
      favorability_div_3: import_koishi3.Schema.number().default(500).description("朋友-思慕分界线"),
      prompt_3: import_koishi3.Schema.string().role("textarea").description("思慕好感补充设定"),
      favorability_div_4: import_koishi3.Schema.number().default(1e3).description("思慕-恋慕分界线"),
      prompt_4: import_koishi3.Schema.string().role("textarea").description("恋慕好感补充设定")
    }).description("好感度设置"),
    import_koishi3.Schema.object({
      blockuser: import_koishi3.Schema.array(String).default([]).description("屏蔽的用户"),
      blockchannel: import_koishi3.Schema.array(String).default([]).description("屏蔽的频道")
    }).description("过滤器")
  ]);
})(Sat || (Sat = {}));

// src/index.tsx
var logger3 = new import_koishi4.Logger("satori-ai");
var SAT = class extends Sat {
  // 重写构造函数
  constructor(ctx, config) {
    super(ctx, config);
    this.config = config;
    ctx.i18n.define("zh", require_zh());
    extendDatabase(ctx);
    this.apiClient = new APIClient(ctx, this.getAPIConfig());
    this.memoryManager = new MemoryManager(this.getMemoryConfig());
    ensureCensorFileExists(this.config.dataDir);
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()));
    this.registerCommands(ctx);
  }
  static {
    __name(this, "SAT");
  }
  apiClient;
  memoryManager;
  ChannelParallelCount = /* @__PURE__ */ new Map();
  onlineUsers = [];
  getAPIConfig() {
    return {
      baseURL: this.config.baseURL,
      keys: this.config.key,
      appointModel: this.config.appointModel,
      auxiliary_LLM_URL: this.config.auxiliary_LLM_URL,
      auxiliary_LLM: this.config.auxiliary_LLM,
      auxiliary_LLM_key: this.config.auxiliary_LLM_key,
      content_max_tokens: this.config.content_max_tokens,
      content_max_length: this.config.content_max_length,
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
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      personal_memory: this.config.personal_memory,
      remember_min_length: this.config.remember_min_length,
      common_topN: this.config.common_topN,
      dailogues_topN: this.config.dailogues_topN
    };
  }
  getMiddlewareConfig() {
    return {
      private: this.config.private,
      mention: this.config.mention,
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
      prompt_4: this.config.prompt_4
    };
  }
  getFavorabilityConfig() {
    return {
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
      prompt_4: this.config.prompt_4
    };
  }
  registerCommands(ctx) {
    ctx.command("sat <text:text>", { authority: this.config.authority }).alias(...this.config.alias).action(async ({ session }, prompt) => this.handleSatCommand(session, prompt));
    ctx.command("sat.clear", "清空会话").option("global", "-g").action(({ session, options }) => this.clearSession(session, options.global));
    ctx.command("sat.common_sense <text:text>", "添加常识").action(async ({ session }, prompt) => this.addCommonSense(session, prompt));
  }
  async handleSatCommand(session, prompt) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const favorabilityBlock = await this.checkFavorabilityBlock(session);
    if (favorabilityBlock)
      return favorabilityBlock;
    const preCheckResult = this.performPreChecks(session, prompt);
    if (preCheckResult)
      return preCheckResult;
    const recentDialogues = this.memoryManager.getChannelMemory(session.channelId).slice(-10);
    const duplicateCheck = await this.checkDuplicateDialogue(session, prompt, recentDialogues, user);
    if (duplicateCheck)
      return duplicateCheck;
    const fixedResponse = await this.handleFixedDialoguesCheck(session, user, prompt);
    if (fixedResponse)
      return fixedResponse;
    logger3.info(`用户 ${session.username}：${prompt}`);
    this.onlineUsers.push(session.userId);
    await this.updateChannelParallelCount(session, 1);
    const processedPrompt = await this.processInput(session, prompt);
    const response = await this.generateResponse(session, processedPrompt);
    logger3.info(`Satori AI：${response.content}`);
    const auxiliaryResult = await this.handleAuxiliaryDialogue(session, processedPrompt, response);
    await this.memoryManager.updateMemories(session, processedPrompt, this.getMemoryConfig(), response);
    this.onlineUsers = this.onlineUsers.filter((id) => id !== session.userId);
    return await this.formatResponse(session, response.content, auxiliaryResult);
  }
  // 处理辅助判断
  async handleAuxiliaryDialogue(session, prompt, response) {
    if (response.error)
      return null;
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const outputCheck = await outputContentCheck(this.ctx, response, session.userId, this.getFavorabilityConfig());
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
        logger3.error(`辅助判断失败：${result.content}`);
      } else {
        logger3.info(`辅助判断：${result.content}`);
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
    if (this.config.blockuser.includes(session.userId))
      return session.text("commands.sat.messages.block1");
    if (this.config.blockchannel.includes(session.channelId))
      return session.text("commands.sat.messages.block2");
    if (!prompt)
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
    let duplicateDialogue = recentDialogues.find((msg) => msg.content == user.usersname + ":" + prompt);
    if (!duplicateDialogue)
      return null;
    if (this.config.enable_favorability)
      updateFavorability(this.ctx, user, -1);
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
  // 更新频道并发数
  async updateChannelParallelCount(session, value) {
    this.ChannelParallelCount.set(session.channelId, (this.ChannelParallelCount.get(session.channelId) || 0) + value);
  }
  // 获取频道并发数
  getChannelParallelCount(session) {
    return this.ChannelParallelCount.get(session.channelId) || 0;
  }
  // 处理输入
  async processInput(session, prompt) {
    let censored = prompt;
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(prompt, session);
    }
    if (this.config.enable_favorability) {
      await inputContentCheck(this.ctx, censored, session.userId, this.getFavorabilityConfig());
    }
    return censored;
  }
  // 生成回复
  async generateResponse(session, prompt) {
    if (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      logger3.info(`频道 ${session.channelId} 并发数过高(${this.getChannelParallelCount(session)})，${session.username}等待中...`);
    }
    while (this.getChannelParallelCount(session) > this.config.max_parallel_count) {
      this.updateChannelParallelCount(session, -1);
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      this.updateChannelParallelCount(session, 1);
    }
    const messages = this.buildMessages(session, prompt);
    logger3.info(`频道 ${session.channelId} 处理：${session.username},剩余${this.getChannelParallelCount(session)}并发`);
    return await this.apiClient.chat(await messages);
  }
  // 构建消息
  async buildMessages(session, prompt) {
    const messages = [];
    messages.push({
      role: "system",
      content: await this.buildSystemPrompt(session, prompt)
    });
    if (this.config.personal_memory) {
      const userMemory = this.memoryManager.getChannelContext(session.userId);
      messages.push(...userMemory);
    } else {
      const channelMemory = this.memoryManager.getChannelContext(session.channelId);
      messages.push(...channelMemory);
    }
    messages.push({
      role: "user",
      content: prompt
    });
    return messages;
  }
  // 构建系统提示
  async buildSystemPrompt(session, prompt) {
    let systemPrompt = this.config.prompt;
    const commonSense = await this.memoryManager.searchMemories(session, prompt, "common");
    const userMemory = await this.memoryManager.searchMemories(session, prompt);
    systemPrompt += commonSense;
    systemPrompt += userMemory;
    systemPrompt += `用户的名字是：${session.username}, id是：${session.userId}`;
    if (this.config.enable_favorability) {
      const user = await ensureUserExists(this.ctx, session.userId, session.username);
      systemPrompt += generateLevelPrompt(getFavorabilityLevel(user, this.getFavorabilityConfig()), this.getFavorabilityConfig());
    }
    if (this.config.log_system_prompt)
      logger3.info(`系统提示：${systemPrompt}`);
    return systemPrompt;
  }
  // 处理回复
  async formatResponse(session, response, auxiliaryResult) {
    const user = await getUser(this.ctx, session.userId);
    this.updateChannelParallelCount(session, -1);
    if (!response)
      return session.text("commands.sat.messages.no-response");
    if (this.config.reply_pointing && this.getChannelParallelCount(session) > 0 || this.config.max_parallel_count == 1) {
      response = `@${session.username} ` + response;
    }
    if (user?.items["猫耳发饰"]?.count > 0 && user?.items["猫耳发饰"]?.description && user?.items["猫耳发饰"]?.description == "on")
      response += "喵~";
    if (user?.items["觉fumo"]?.count > 0 && user?.items["觉fumo"]?.description && user?.items["觉fumo"]?.description == "on")
      response += "\nfumofumo";
    if (auxiliaryResult && this.config.visible_favorability)
      response += auxiliaryResult;
    if (this.config.sentences_divide && response.length > 10) {
      return splitSentences(response).map((text) => import_koishi4.h.text(text));
    }
    return response;
  }
  // 清空会话
  clearSession(session, global) {
    if (global) {
      this.memoryManager.clearAllMemories();
      this.ChannelParallelCount.clear();
      this.onlineUsers = [];
      return session.text("commands.sat.clear.messages.Allclean");
    } else {
      if (this.config.personal_memory) {
        this.memoryManager.clearChannelMemory(session.userId);
      } else {
        this.memoryManager.clearChannelMemory(session.channelId);
      }
    }
    return session.text("commands.sat.clear.messages.clean");
  }
  // 添加常识
  async addCommonSense(session, content) {
    if (!content)
      return session.text("commands.sat.common_sense.messages.no-prompt");
    const filePath = path4.join(this.config.dataDir, "common_sense.txt");
    await this.memoryManager.saveLongTermMemory(session, [{
      role: "user",
      content
    }], filePath);
    return session.text("commands.sat.common_sense.messages.succeed", [content]);
  }
  // 中间件转接
  async handleMiddleware(session, prompt) {
    return this.handleSatCommand(session, prompt);
  }
};
var src_default = SAT;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SAT
});
