var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
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

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  SAT: () => SAT,
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var import_koishi4 = require("koishi");
var path3 = __toESM(require("path"));

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
  }
  static {
    __name(this, "APIClient");
  }
  currentKeyIndex = 0;
  retryCount = 0;
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
        return await this.tryRequest(payload);
      } catch (error) {
        this.rotateKey();
        this.handleAPIError(error);
      }
    }
    throw new Error("All API keys exhausted");
  }
  // 生成请求体
  createPayload(messages) {
    return {
      model: this.config.appointModel,
      messages,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0.5
    };
  }
  // 尝试请求
  async tryRequest(payload) {
    const url = `${trimSlash(this.config.baseURL)}/v1/chat/completions`;
    const headers = this.createHeaders();
    try {
      const response = await this.ctx.http.post(url, payload, {
        headers,
        timeout: this.config.timeout
      });
      this.retryCount = 0;
      return response.choices[0].message.content;
    } catch (error) {
      return this.handleAPIError(error);
    }
  }
  // 生成请求头
  createHeaders() {
    return {
      Authorization: `Bearer ${this.config.keys[this.currentKeyIndex]}`,
      "Content-Type": "application/json"
    };
  }
  // 处理API错误
  handleAPIError(error) {
    if (!isErrorWithMessage(error))
      throw error;
    const status = error.response?.status || 500;
    const errorCode = error.response?.data?.error?.code || "unknown";
    const message = error.response?.data?.error?.message || error.message;
    logger.error(`API Error [${status}]: ${errorCode} - ${message}`);
    if (status === 429) {
      if (probabilisticCheck(0.3))
        this.rotateKey();
      throw new Error("Rate limit exceeded");
    }
    if (status === 401) {
      this.rotateKey();
      throw new Error("Invalid API key");
    }
    throw error;
  }
  // 切换API密钥
  rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length;
    logger.debug(`Switched to API key index: ${this.currentKeyIndex}`);
  }
  // 测试连接
  async testConnection() {
    try {
      await this.ctx.http.get(`${trimSlash(this.config.baseURL)}/v1/models`, {
        headers: this.createHeaders()
      });
      return true;
    } catch (error) {
      logger.error("API connection test failed:", error);
      return false;
    }
  }
};

// src/memory.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var MemoryManager = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  static {
    __name(this, "MemoryManager");
  }
  channelMemories = /* @__PURE__ */ new Map();
  // 短期记忆管理
  handleChannelMemory(session, prompt, response) {
    const channelId = session.channelId;
    if (!this.channelMemories.has(channelId)) {
      this.channelMemories.set(channelId, {
        dialogues: [],
        updatedAt: Date.now()
      });
    }
    const memory = this.channelMemories.get(channelId);
    memory.dialogues.push({ role: session.username, content: prompt });
    if (this.config.enable_self_memory && response) {
      memory.dialogues.push({ role: "assistant", content: response });
    }
    if (memory.dialogues.length > this.config.message_max_length) {
      memory.dialogues = memory.dialogues.slice(-this.config.message_max_length);
    }
  }
  clearChannelMemory(channelId) {
    this.channelMemories.delete(channelId);
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
  async searchMemories(session, keywords, type = "user") {
    const filePath = type === "user" ? this.getUserMemoryPath(session.userId) : path.join(this.config.dataDir, "common_sense.txt");
    if (!fs.existsSync(filePath))
      return "";
    const entries = await this.loadMemoryFile(filePath);
    const matched = this.findBestMatches(entries, keywords);
    return this.formatMatches(matched, type);
  }
  getUserMemoryPath(userId) {
    return path.join(this.config.dataDir, "dialogues", `${userId}.txt`);
  }
  async ensureMemoryFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]");
    }
  }
  async loadMemoryFile(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }
  findBestMatches(entries, keywords, topN = 10) {
    const scored = entries.map((entry, index) => ({
      index,
      score: this.calculateMatchScore(entry.content, keywords)
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topN).map((item) => entries[item.index]);
  }
  calculateMatchScore(content, keywords) {
    const regex = new RegExp(keywords.map(escapeRegExp).join("|"), "gi");
    const matches = content.match(regex) || [];
    const chineseCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishCount = content.length - chineseCount;
    const totalWeight = chineseCount * 2 + englishCount;
    return totalWeight > 0 ? (matches.length * 2 + matches.join("").length) / totalWeight : 0;
  }
  formatMatches(matches, type) {
    const prefix = type === "user" ? "这是你和发言者较久之前的对话内容：" : "这是你需要知道的信息：";
    return matches.length > 0 ? `${prefix}
${matches.map((e) => `${e.role}: ${e.content}`).join("\n")}
` : "";
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
async function updateFavorability(ctx, userId, adjustment) {
  const user = await getUser(ctx, userId);
  if (!user)
    return;
  let newValue;
  if (typeof adjustment === "number") {
    newValue = user.favorability + adjustment;
  } else {
    newValue = adjustment.absolute;
  }
  await ctx.database.set(
    "p_system",
    { userid: userId },
    { favorability: Math.max(newValue, -1e3) }
  );
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
    time: "timestamp"
  }, { autoInc: true });
}
__name(extendDatabase, "extendDatabase");

// src/fixed-dialogues.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
async function handleFixedDialogues(ctx, session, user, config) {
  if (!config.enable_fixed_dialogues)
    return null;
  const filePath = path2.join(config.dataDir, "fixed_dialogues.json");
  await ensureFixedDialoguesFile(filePath);
  const dialogues = await loadFixedDialogues(filePath);
  const currentTime = parseTime(session.timestamp);
  const matched = dialogues.filter(
    (dialogue) => matchDialogue(dialogue, session.content, user, currentTime)
  );
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
function parseTime(timestamp) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}
__name(parseTime, "parseTime");
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
    await updateFavorability(ctx, user.userid, dialogue.favorability);
  }
}
__name(processFavorability, "processFavorability");

// src/favorability.ts
var import_koishi2 = require("koishi");
var logger2 = new import_koishi2.Logger("satori-ai");
async function handleFavorabilitySystem(ctx, session, config) {
  const user = await ensureUserExists(ctx, session.userId, session.username);
  if (user.favorability < config.favorability_div_1 - 20 && user.favorability > -900) {
    return session.text("commands.sat.messages.block1");
  }
  const englishCount = (session.content.match(/[a-zA-Z]/g) || []).length;
  if (user.favorability < 50 && englishCount > 8) {
    return session.text("commands.sat.messages.tooManyEnglishLetters");
  }
  const level = getFavorabilityLevel(user.favorability, config);
  logger2.info(`[好感度] 用户 ${session.username} 等级 ${level}`);
  return generateLevelPrompt(level, config);
}
__name(handleFavorabilitySystem, "handleFavorabilitySystem");
function getFavorabilityLevel(favorability, config) {
  if (favorability < config.favorability_div_1)
    return "厌恶";
  if (favorability < config.favorability_div_2)
    return "陌生";
  if (favorability < config.favorability_div_3)
    return "朋友";
  if (favorability < config.favorability_div_4)
    return "暧昧";
  return "恋人";
}
__name(getFavorabilityLevel, "getFavorabilityLevel");
function generateLevelPrompt(level, config) {
  const prompts = {
    "厌恶": config.prompt_0,
    "陌生": config.prompt_1,
    "朋友": config.prompt_2,
    "暧昧": config.prompt_3,
    "恋人": config.prompt_4
  };
  return `
${prompts[level]}
`;
}
__name(generateLevelPrompt, "generateLevelPrompt");
async function handleContentCheck(ctx, content, userId) {
  const user = await getUser(ctx, userId);
  if (!user)
    return 0;
  const regex = /\*\*/g;
  const hasCensor = regex.test(content);
  if (hasCensor) {
    await updateFavorability(ctx, userId, -15);
    return -15;
  }
  await updateFavorability(ctx, userId, 1);
  return 1;
}
__name(handleContentCheck, "handleContentCheck");

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
      enableContext: import_koishi3.Schema.boolean().default(true).description("是否启用上下文, 关闭后将减少 token 消耗(无人格)"),
      appointModel: import_koishi3.Schema.string().default("deepseek-chat").description("模型"),
      prompt: import_koishi3.Schema.string().role("textarea").description("人格设定")
    }).description("基础设置"),
    import_koishi3.Schema.object({
      max_tokens: import_koishi3.Schema.number().description("最大请求长度").default(50),
      content_max_tokens: import_koishi3.Schema.number().description("最大回答长度").default(100),
      message_max_length: import_koishi3.Schema.number().description("最大频道上下文长度").default(10),
      enable_self_memory: import_koishi3.Schema.boolean().default(true).description("是否启用自发言记忆（启用容易发生复读）"),
      memory_block_words: import_koishi3.Schema.array(String).default(["好感"]).description("记忆屏蔽词"),
      remember_min_length: import_koishi3.Schema.number().description("触发保存到记忆的长度").default(20),
      dataDir: import_koishi3.Schema.string().default("./data/satori_ai").description("聊天记录保存位置（长期记忆）"),
      temperature: import_koishi3.Schema.number().role("slider").min(0).max(2).step(0.01).default(0.5).description("温度"),
      authority: import_koishi3.Schema.number().role("slider").min(0).max(5).step(1).description("允许使用的最低权限").default(1),
      enable_fixed_dialogues: import_koishi3.Schema.boolean().default(true).description("是否启用固定对话（在dataDir中的fixed_dialogues.json修改）"),
      alias: import_koishi3.Schema.array(String).default(["ai"]).description("触发命令;别名"),
      private: import_koishi3.Schema.boolean().default(true).description("开启后私聊AI可触发对话, 不需要使用指令"),
      mention: import_koishi3.Schema.boolean().default(true).description("开启后机器人被提及(at/引用)可触发对话"),
      random_min_tokens: import_koishi3.Schema.number().default(20).description("随机触发的最小长度"),
      randnum: import_koishi3.Schema.number().role("slider").min(0).max(1).step(0.01).default(0).description("在群聊中随机触发对话的概率，如需关闭可设置为 0"),
      sentences_divide: import_koishi3.Schema.boolean().default(true).description("是否分句发送"),
      time_interval: import_koishi3.Schema.number().default(1e3).description("每句话的时间间隔"),
      maxRetryTimes: import_koishi3.Schema.number().default(30).description("报错后最大重试次数")
    }).description("进阶设置"),
    import_koishi3.Schema.object({
      enable_favorability: import_koishi3.Schema.boolean().default(false).description("是否开启好感度系统（建议添加p-qiandao插件）"),
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
    extendDatabase(ctx);
    this.apiClient = new APIClient(ctx, this.getAPIConfig());
    this.memoryManager = new MemoryManager(ctx, this.getMemoryConfig());
    ctx.middleware(createMiddleware(ctx, this, this.getMiddlewareConfig()));
    this.registerCommands(ctx);
  }
  static {
    __name(this, "SAT");
  }
  apiClient;
  memoryManager;
  getAPIConfig() {
    return {
      baseURL: this.config.baseURL,
      keys: this.config.key,
      appointModel: this.config.appointModel,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature
    };
  }
  getMemoryConfig() {
    return {
      dataDir: this.config.dataDir,
      message_max_length: this.config.message_max_length,
      memory_block_words: this.config.memory_block_words,
      enable_self_memory: this.config.enable_self_memory,
      remember_min_length: this.config.remember_min_length
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
    ctx.command("sat.clear", "清空会话").action(({ session }) => this.clearSession(session));
    ctx.command("sat.common_sense <text:text>", "添加常识").action(async ({ session }, prompt) => this.addCommonSense(session, prompt));
  }
  async handleSatCommand(session, prompt) {
    const user = await ensureUserExists(this.ctx, session.userId, session.username);
    const fixedResponse = await handleFixedDialogues(
      this.ctx,
      session,
      user,
      {
        dataDir: this.config.dataDir,
        enable_favorability: this.config.enable_favorability,
        enable_fixed_dialogues: this.config.enable_fixed_dialogues
      }
    );
    if (fixedResponse)
      return fixedResponse;
    if (this.config.enable_favorability) {
      const blockMessage = await handleFavorabilitySystem(this.ctx, session, this.config);
      if (blockMessage)
        return blockMessage;
    }
    logger3.info(`用户 ${session.username}：${prompt}`);
    const processedPrompt = await this.processInput(session, prompt);
    const response = await this.generateResponse(session, processedPrompt);
    logger3.info(`Satori AI：${response}`);
    await this.updateMemories(session, processedPrompt, response);
    return this.formatResponse(session, response);
  }
  // 处理输入
  async processInput(session, prompt) {
    let censored = prompt;
    if (this.ctx.censor) {
      censored = await this.ctx.censor.transform(prompt, session);
    }
    if (this.config.enable_favorability) {
      await handleContentCheck(this.ctx, censored, session.userId);
    }
    return censored;
  }
  // 生成回复
  async generateResponse(session, prompt) {
    const messages = this.buildMessages(session, prompt);
    return this.apiClient.chat(await messages);
  }
  // 构建消息
  async buildMessages(session, prompt) {
    const messages = [];
    messages.push({
      role: "system",
      content: await this.buildSystemPrompt(session)
    });
    const channelMemory = this.memoryManager.getChannelContext(session.channelId);
    messages.push(...channelMemory);
    messages.push({
      role: "user",
      content: prompt
    });
    return messages;
  }
  // 构建系统提示
  async buildSystemPrompt(session) {
    let prompt = this.config.prompt;
    const commonSense = this.memoryManager.searchMemories(session, [], "common");
    prompt += commonSense;
    const userMemory = this.memoryManager.searchMemories(session, [session.userId]);
    prompt += userMemory;
    prompt += `
当前时间：${(/* @__PURE__ */ new Date()).toLocaleString()}`;
    if (this.config.enable_favorability) {
      const user = await ensureUserExists(this.ctx, session.userId, session.username);
      prompt += generateLevelPrompt(getFavorabilityLevel(user.favorability, this.config), this.config);
    }
    return prompt;
  }
  // 更新记忆
  async updateMemories(session, prompt, response) {
    this.memoryManager.handleChannelMemory(session, prompt, response);
    if (this.shouldRemember(prompt)) {
      await this.memoryManager.saveLongTermMemory(session, [{
        role: "user",
        content: prompt
      }]);
    }
  }
  // 是否应当记忆
  shouldRemember(content) {
    return content.length >= this.config.remember_min_length && !this.config.memory_block_words.some((word) => content.includes(word));
  }
  // 格式化回复
  formatResponse(session, response) {
    if (this.config.sentences_divide) {
      return splitSentences(response).map((text) => import_koishi4.h.text(text));
    }
    return response;
  }
  // 清空会话
  clearSession(session) {
    this.memoryManager.clearChannelMemory(session.channelId);
    return session.text("commands.sat.clear.messages.clean");
  }
  // 添加常识
  async addCommonSense(session, content) {
    const filePath = path3.join(this.config.dataDir, "common_sense.txt");
    await this.memoryManager.saveLongTermMemory(session, [{
      role: "system",
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
