# satori-ai 记忆系统重构方案

> 目标插件：`external/satori-ai`（`koishi-plugin-satori-ai` v1.4.3，已发 npm，软链到 `node_modules/`，是实际在跑的版本）
> 参考实现：`D:\dev\cyber-wife\satori-ai\src`（单人桌宠，Express + better-sqlite3）
> 范围：记忆系统 + 用户画像。**不动** `p_system` 表与好感度/心情系统。

---

## 1. 背景与目标

### 1.1 现状

现有记忆系统在 [memory.ts](external/satori-ai/src/memory.ts) 里，是一个 `MemoryManager` 类：

| 层次 | 现状 | 问题 |
|---|---|---|
| 短期记忆 | 内存 `Map<string, ChannelMemory>` | 重启即丢；无容量上限之外的淘汰策略 |
| 长期记忆 | 文件 `dataDir/dialogues/<userId>.txt`，JSON 数组 `{role, content}[]`，其中 `role` 被复用存时间字符串 | 每次检索都要全量读写文件；命中后还把命中项重排写回，让记忆顺序随时间漂移 |
| 检索 | `userDialogues.split('')` 按**单字符**切词 → 对每条记忆算 `(最长公共子串² + 共同字符数) / content.length`，过滤 `count > 1` 取 topN | 无 IDF、无长度归一化、无词序信息；"工作累"匹配不到"加班到很晚" |
| 用户画像 | [userportrait.ts](external/satori-ai/src/userportrait.ts) 两遍 LLM（生成新画像 → 合并旧画像），写 `UserPortrait/<userId>.txt` 纯文本 | 全量重写、无结构化字段、无重要度、无淘汰；每次都要把整段历史喂进去 |
| 时间组织 | 无 | 没有"话题"概念，没有按天/周/月归档，历史记忆是一坨扁平列表 |

### 1.2 目标

引入参考实现验证过的**七级分层记忆**（topic → day → week → month → season → year），把扁平列表换成可随时间自动蒸馏的金字塔；检索从字符匹配换成真正的 BM25；画像从全量重写换成增量 delta 更新。

---

## 2. 四项已确定的设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 存储后端 | **Koishi ORM**（`ctx.model.extend` + `ctx.database`） | 插件已有 `Sat.inject.required = ['console', 'database']`；不引入 native 依赖，用户用 sqlite/mysql/mongo 都能跑，插件仍可直接发 npm |
| 向量检索 | **不做**，纯关键词 | 参考实现依赖本地 Python `bert-base-chinese` 服务（:7860）+ `nodejieba` 原生模块 + `better-sqlite3` + `@xenova/transformers`。这些都不能带进一个要发 npm 的插件 |
| 作用域 | 沿用 `config.personal_memory` 开关，所有记忆表加 `scopeId`（= `userId` 或 `channelId`） | 保持现有配置语义，用户行为无感；避免参考实现"一个 `character_id` 一份记忆"在多人群聊下互相污染 |
| 范围 | 记忆系统 + 用户画像 | 画像与记忆强耦合（画像由日总结驱动增量更新）；好感度/情绪系统另案处理 |

### 2.1 已核实的基础设施事实

这些是动手前必须确认的，均已在本仓库验证：

- `ctx.setInterval(cb, ms)` **可用**，来自 `@cordisjs/timer`，返回 disposer 且随 ctx 自动清理。同包还有 `ctx.throttle` / `ctx.debounce`。本仓库已有用例：[p-setu/src/index.ts:356](external/p-setu/src/index.ts#L356) 用了 `ctx.setTimeout`。
- `ctx.model.extend(name, fields, opts)` 的 `opts` 支持 `{ autoInc, primary, unique, indexes }`，`indexes` 可声明**复合索引**。
- minato 字段类型白名单：`'integer' | 'unsigned' | 'float' | 'double' | 'decimal' | 'char' | 'string' | 'text' | 'boolean' | 'timestamp' | 'date' | 'time' | 'binary' | 'json' | 'list' | ...`
- 查询算子齐全：`$gt / $gte / $lt / $lte / $in / $regex / $some`，且 `ctx.database.eval()` 支持聚合，`ctx.database.transact` 可用。
- **未安装** `nodejieba`、`string-similarity`、`better-sqlite3`；仓库内**没有任何**分词或向量检索的现成代码。
- 仓库**没有测试框架**（`package.json` 无 test script），但有 `tsx`，可用 `npx tsx` 跑独立脚本。

---

## 3. 参考实现：移植什么、不移植什么

### 3.1 移植

1. **七级分层结构**：`topic → day → week → month → season → year`，每级把子级记忆喂 LLM 汇总成一条父级记忆。
2. **话题归档**：LLM 判断话题是否切换，切换时把 [话题起点, now] 的原始对话总结成一条 topic 记忆。这是整个金字塔的入口——没有 topic 层，day 层就没有输入。
3. **`user_state` 维度**：每条记忆附带"此时段用户状态"（在做什么、作息、情绪），独立于"聊了什么"。设计意图见参考项目 `todo.md:374-391`。
4. **金字塔上下文**：`buildRecentContext()` 自上次各粒度汇总以来，按 `近期话题 / 近日总结 / 近周总结 / 近月总结 / 近季总结 / 年度总结` 分段拼 prompt。
5. **增量用户画像**：LLM 输出 `{added, modified, deleted}` JSON delta，本地 apply（去重、按 importance 淘汰、上限 60 条，注入时取 importance 最高的 30 条并按 6 个类别分组）。类别：`identity / preference / aversion / requirement / habit / fact`。
6. **画像由日总结驱动**：day 汇总完成后顺带调 `summarizeFromMemories()`，而不是每轮对话都跑。
7. **启动兜底**：修复缺失数据、归档未归档对话。
8. **`repairJSON` / `extractJSONObjects`**（在参考项目 `agent/segment-utils.ts`）：栈匹配提取完整 JSON 对象、去 markdown 围栏、修尾逗号。

### 3.2 不移植

| 不移植 | 原因 |
|---|---|
| `db/database.ts` 的 `now()` 返回"偏移 +8h 的 Date" + `getUTC*()` 读墙面钟 + `migrateToUTC8()` 一次性迁移 | 极易误读；一旦迁移漏跑或跑两次，全部时间戳错乱。改为**全程存真实 UTC 时间戳**，时区只在一个纯函数里参与"日界线计算" |
| `better-sqlite3` 直连 | 见决策表 |
| `nodejieba` / `string-similarity` / `node-cron` / `uuid` | 未安装；`ctx.setInterval` 替代 node-cron，`crypto.randomUUID()` 替代 uuid，分词自写 |
| `retrieval/bm25.ts` 与 `retrieval/reranker.ts` | 两者功能重叠，且 `bm25.ts` 里的 `computeIDF` / `bm25Score` / `keywordMatchScore` 全是**从未被调用的死代码**，真正生效的是 `0.7 * stringSimilarity + 0.3 * termOverlap`——文件名叫 BM25，实际不是 BM25。合并重写为一个真正的 BM25 |
| `state/manager.ts`（多维好感度/情绪） | 超出本次范围 |
| `logDb` + `flushToFile` | 插件已有 Koishi `Logger`，不引入第二套日志体系 |

---

## 4. 目标架构

### 4.1 模块划分

新增 `src/memory/` 目录，替代现有 `memory.ts` 与 `userportrait.ts`：

```
src/memory/
  index.ts        MemoryService 门面 —— 对外唯一入口（替代 MemoryManager）
  schema.ts       表定义 + extendDatabase + 类型声明
  repository.ts   数据访问层（dialogues / memories / knowledge / profile / meta 的 CRUD 与聚合）
  short-term.ts   短期记忆（沿用现有 RAM ring + bracket/memory filter）
  retrieval.ts    纯 JS 中文分词 + BM25 + 时间衰减重排
  summarizer.ts   话题归档 + 分层汇总
  context.ts      金字塔上下文组装
  profile.ts      增量用户画像（替代 userportrait.ts）
  heartbeat.ts    ctx.setInterval 定时任务 + 并发控制
  migrate.ts      旧文件 → DB 一次性迁移
  prompts.ts      所有提示词集中
  json.ts         parseLLMJson（repairJSON + 栈匹配提取）
```

依赖方向是单向的，无循环：

```
index.ts ──> context / summarizer / short-term / profile / migrate
                │           │
                └───────────┴──> retrieval ──> repository ──> schema
```

`index.ts` 是唯一被 `src/index.tsx` 引用的文件。

### 4.2 数据流

**每轮对话（同步路径，不能阻塞回复）：**
```
用户消息
  → short-term.push()            RAM ring，返回 Sat.Msg[]（喂 buildMessages 和 emoji）
  → repository.insertDialogue()  落库 sat_dialogue
  → 异步（setImmediate，不 await）：
       summarizer.ensureTopicTracking()
       summarizer.shouldSwitchTopic()  → true 则 archiveCurrentTopic()
```

**定时心跳（`ctx.setInterval`，默认 10 分钟）：**
```
heartbeat.tick()
  → 防重入检查
  → 找出"有新对话"的 scope，取前 K 个（默认 3），**串行**处理
  → 每个 scope：summarizer.summarizeScope()
       兜底归档超龄话题 → day → week → month → season → year
       day 完成后 → profile.summarizeFromMemories()
  → repository.pruneDialogues(retentionDays)
```

**组装系统提示（同步路径）：**
```
memory.buildPromptContext(session, prompt)
  → common / group    知识条目（替代 searchMemories('common'|'group')）
  → ambient           群聊最近对话（RAM，措辞不变）
  → pyramid           分层上下文（新增）
  → recalled          关键词检索召回的历史记忆（替代 searchMemories('user')）
  → profile           画像（替代 readPortrait）
```

---

## 5. 数据模型

### 5.1 为什么不能照搬参考实现的表结构

参考实现只有 `memories(id, granularity, content, embedding, user_state, period_start, period_end, created_at)` 和 `dialogues(id, turn_index, user_content, ai_content, created_at)`，靠 `character_id` 区分角色。移植时必须补三样：

1. **`scopeId`**：参考实现是单人，插件是多人/多群。所有记忆表都要按 scope 隔离。
2. **`kind`**：参考实现的 `dialogues` 只存"用户↔bot 的对话"。插件的群聊环境里还有大量"不对 bot 说的"消息（现在走 `getChannelDialogue`），两者的留存价值完全不同，必须能区分、能分别淘汰。
3. **显式索引**：参考实现靠 `CREATE INDEX` 手写；ORM 下要在 `extend` 的 `indexes` 里声明。

### 5.2 表定义

```ts
// src/memory/schema.ts
declare module 'koishi' {
  interface Tables {
    sat_dialogue: SatDialogue
    sat_memory: SatMemory
    sat_knowledge: SatKnowledge
    sat_profile: SatProfile
    sat_meta: SatMeta
  }
}

// 原始对话
interface SatDialogue {
  id: number
  scopeId: string      // userId 或 channelId，取决于 personal_memory
  userId: string
  username: string
  kind: string         // 'turn'   用户↔bot 的一轮
                       // 'ambient' 群聊环境消息（不对 bot）
                       // 'legacy'  旧文件迁移进来的
  userContent: string
  aiContent: string    // ambient / legacy 为空串
  createdAt: Date
}

// 分层记忆
interface SatMemory {
  id: number
  scopeId: string
  granularity: string  // 'topic'|'day'|'week'|'month'|'season'|'year'
  topic: string        // topic 粒度的话题名，其他粒度为空串
  content: string
  userState: string    // 此时段用户状态，可为空串
  periodStart: Date
  periodEnd: Date
  sourceCount: number  // 由多少条子记忆/对话汇总而来，用于调试与展示
  createdAt: Date
}

// 常识 / 群常识（替代 common_sense.txt 与 group_sense/<id>.txt）
interface SatKnowledge {
  id: number
  kind: string         // 'common' | 'group'
  targetId: string     // common → '*'；group → channelId
  content: string
  createdAt: Date
}

// 用户画像（每 scope 一行 JSON 文档）
interface SatProfile {
  id: number
  scopeId: string
  data: any            // { entries: UserProfileEntry[], lastSummarizedAt: string }
  updatedAt: Date
}

// 每 scope 的游标与状态
interface SatMeta {
  id: number
  scopeId: string
  topicStart: Date | null    // 当前话题起点；归档后推进到归档时刻
  lastActiveAt: Date
  migratedAt: Date | null
}
```

```ts
export function extendDatabase(ctx: Context) {
  ctx.model.extend('sat_dialogue', {
    id: 'unsigned', scopeId: 'string', userId: 'string', username: 'string',
    kind: 'string', userContent: 'text', aiContent: 'text', createdAt: 'timestamp',
  }, { autoInc: true, indexes: [['scopeId', 'createdAt'], ['scopeId', 'kind']] })

  ctx.model.extend('sat_memory', {
    id: 'unsigned', scopeId: 'string', granularity: 'string', topic: 'string',
    content: 'text', userState: 'text',
    periodStart: 'timestamp', periodEnd: 'timestamp',
    sourceCount: 'integer', createdAt: 'timestamp',
  }, { autoInc: true, indexes: [['scopeId', 'granularity', 'periodEnd']] })

  ctx.model.extend('sat_knowledge', {
    id: 'unsigned', kind: 'string', targetId: 'string', content: 'text', createdAt: 'timestamp',
  }, { autoInc: true, indexes: [['kind', 'targetId']] })

  ctx.model.extend('sat_profile', {
    id: 'unsigned', scopeId: 'string', data: 'json', updatedAt: 'timestamp',
  }, { autoInc: true, unique: [['scopeId']] })

  ctx.model.extend('sat_meta', {
    id: 'unsigned', scopeId: 'string', topicStart: 'timestamp',
    lastActiveAt: 'timestamp', migratedAt: 'timestamp',
  }, { autoInc: true, unique: [['scopeId']] })
}
```

### 5.3 游标：不从记忆行反推，改用聚合

参考实现的 `getLatestSummaryTime()` 用 `getByGranularity(granularity, 1)`（按 `period_start DESC` 取 1 条）的 `periodEnd` 当游标。**当两条记忆 `period_start` 相同时（同一天多次总结）排序不稳定，游标可能回退导致重复总结。**

改用聚合查询，单一事实来源、无漂移、无歧义：

```ts
// 某粒度的游标 = 该粒度已产出记忆的最大 periodEnd
const [row] = await ctx.database.eval('sat_memory',
  row => $.max(row.periodEnd),
  { scopeId, granularity: 'day' })
const cursorDay = row ?? null

// 首次总结的起点 = 子粒度的最小 periodStart
const [start] = await ctx.database.eval('sat_memory',
  row => $.min(row.periodStart),
  { scopeId, granularity: 'topic' })
```

区间查询走真正的 SQL，而不是参考实现的"捞 1000 条再在 JS 里过滤"：

```ts
const children = await ctx.database.get('sat_memory', {
  scopeId, granularity: 'topic',
  periodEnd: { $gt: cursorDay, $lte: boundary },
})
```

> 参考实现 `getByGranularity(sub, 1000)` 的 **1000 条硬上限会静默丢数据**——超过 1000 条 topic 记忆时，更早的记忆永远不会被汇总进 day 层。

---

## 6. 检索层：纯 JS 中文分词 + BM25

### 6.1 分词

没有 jieba，自写。中文用 **unigram + bigram**，这是 CJK 检索的经典无词典方案，bigram 保留了词序信息（单字切分丢掉的正是这个）。

```ts
// src/memory/retrieval.ts
const STOPWORDS = new Set([
  '的','一','是','了','什','么','我','谁','不','人','在','他','有','这','个','上','们','来','到','时',
  '大','地','为','子','中','你','说','生','国','年','着','就','那','和','要','她','出','也','得','里',
  '后','自','以','会','啊','吧','吗','呢','呀','哦','嗯','嗯','然后','但是','因为','所以','如果',
  '可以','什么','怎么','这样','那样','还是','就是','只是','已经','一下','一个','没有','知道','觉得',
  '可能','应该','现在','时候','自己',
])

export function segment(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase()
  // 英文 / 数字：整串保留
  for (const m of lower.matchAll(/[a-z0-9_]+/g)) tokens.push(m[0])
  // 中文：unigram（过滤停用字）+ bigram（不过滤，含停用字的 bigram 常常有意义，如"的时候"）
  for (const m of lower.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const s = m[0]
    for (let i = 0; i < s.length; i++) {
      if (!STOPWORDS.has(s[i])) tokens.push(s[i])
      if (i + 1 < s.length) tokens.push(s.slice(i, i + 2))
    }
  }
  return tokens
}
```

停用词表的种子就是现有 [memory.ts:13](external/satori-ai/src/memory.ts#L13) 的 `charactersToRemove`，扩充虚词/连词/高频动词。

### 6.2 BM25

```ts
const K1 = 1.5
const B = 0.75

// idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
// score(q, d) = Σ_{t ∈ unique(q)} idf(t) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * |d| / avgdl))
```

关键点：**查询词去重后再求和**（否则查询里重复出现的词会被重复计入）；`df` / `N` / `avgdl` 从当次候选集现算（候选集是同一 scope 的记忆，规模可控，不需要持久化倒排索引）。

### 6.3 重排：加时间衰减

参考实现的检索**完全没有新近度加权**——一条三年前的记忆和昨天的记忆同分。对记忆检索这是缺陷（参考实现自己在 `recallRandomDayMemory` 里用了 `1/(1+days*0.1)`，说明作者知道新近度重要，只是没用在检索上）。

```ts
// final = 0.75 * bm25归一化 + 0.25 * 新近度
// recency = 0.5 ** (ageDays / HALFLIFE_DAYS)   默认 HALFLIFE_DAYS = 30
```

`bm25` 分数按当次候选集的 max 归一化到 [0,1] 后再加权。

### 6.4 检索范围

- **候选**：当前 scope 的 `topic` + `day` 记忆，且 `periodEnd` 早于金字塔窗口起点（金字塔已经无条件注入了最近的，不重复召回）；时间窗限制在最近 `memory_retention_days` 内，避免无限增长。
- **知识**：`sat_knowledge` 里 `common` + 当前 `group` 的条目，按同一套 BM25 打分，取 `common_topN` / `dailogues_topN`（沿用现有配置名）。
- **粗粒度不参与检索**：week/month/season/year 由金字塔无条件注入，不需要召回。

### 6.5 相比现有方案的真实提升与局限

**提升**（都是可验证的）：IDF 加权（现在没有）、文档长度归一化（现在没有）、bigram 保留词序（现在是单字）、时间衰减（现在没有）、不再每次检索都读写文件并重排。

**局限**（必须在文档里写清楚，避免误期待）：
- **无法处理同义词/换词表达**。"工作累" 依然匹配不到 "加班到很晚"。这只有向量检索能解决——本次明确不做。
- **bigram 有噪音**：跨词边界的 bigram（如 "天的"）会产生假匹配，靠 IDF 压制，短文本上仍可能误召回。
- **专有名词不如 jieba**：jieba 有词典，本方案没有。人名/作品名的匹配质量会差一些。

---

## 7. 分层汇总

### 7.1 话题归档

沿用参考实现的判定结构（[memory.ts:48-83](../cyber-wife/satori-ai/src/memory/manager.ts)）：对话 ≤ `TOPIC_MIN_TURNS`(5) 返回 false，≥ `TOPIC_MAX_TURNS`(20) 直接 true，中间区间问 LLM。

**新增兜底**：参考实现**没有**超龄强制归档，导致一个真实缺陷——如果用户一整天只聊一个话题不切换，就永远不产生 topic 记忆，而 day 汇总依赖 `getEarliestMemoryTime('topic')`，拿不到子记忆就 `continue`，**日总结永远不会发生**，整条金字塔断在第二级。

所以：`topicStart` 距现在超过 `TOPIC_MAX_AGE_HOURS`(24) 且区间内有对话 → 强制归档一次。

### 7.2 各级阈值与日界线

| 级别 | 子粒度 | 阈值 |
|---|---|---|
| day | topic | 1 天（日界线） |
| week | day | 7 天 |
| month | week | 28 天 |
| season | month | 90 天 |
| year | season | 365 天 |

阈值与 `TOPIC_*` / `HALFLIFE_DAYS` / `MAX_SCOPES_PER_TICK` 一样，先做模块常量，需要调再提升为配置项（参考项目自己的 CLAUDE.md 也写着 "No 'flexibility' or 'configurability' that wasn't requested"）。

**日界线计算**——这是参考实现最危险的地方（`now()` 返回偏移 Date + `setUTCHours(4)`），必须重写为纯函数，输入输出都是真实 UTC：

```ts
/** 返回"最近一个已过的日界线时刻"，真实 UTC */
export function lastBoundary(now: Date, tzOffsetHours: number, boundaryHour: number): Date {
  const shifted = new Date(now.getTime() + tzOffsetHours * 3600_000)
  const boundaryLocal = Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), boundaryHour, 0, 0, 0)
  const local = shifted.getTime() < boundaryLocal ? boundaryLocal - 86400_000 : boundaryLocal
  return new Date(local - tzOffsetHours * 3600_000)
}
```

DB 里全程存真实 UTC 时间戳，时区只在调用这个函数时参与。`tzOffsetHours` 默认 8，`boundaryHour` 默认 4（对齐参考实现"凌晨 4 点日界线"的意图）。

### 7.3 汇总提示词

沿用参考实现的措辞，核心要求是**无状态化存储**（把"明天"换成具体日期、"最近"换成具体时间范围），以及同时产出 `summary` 和 `user_state`：

```
总结要求：综合考虑此段记忆未来被调用的场景和目的，无状态地去存储信息，
例如把"明天"替换成具体日期，把"最近"替换成具体时间范围等。
请以 JSON 格式返回，不要包含其他任何内容：
{"topic": "...", "summary": "...", "user_state": "..."}
```

各级的 prompt 集中在 `prompts.ts`，JSON 解析统一走 `json.ts` 的 `parseLLMJson()`——参考实现用的是裸的 `content.match(/\{[\s\S]*\}/)`，贪婪匹配到最后一个 `}`，遇到嵌套对象、markdown 围栏或尾逗号就会抛。参考项目自己在 `agent/segment-utils.ts` 里有 `repairJSON` + `extractJSONObjects` 却没用在记忆模块里。

### 7.4 事务

一次汇总要写两条：插入父级记忆 + 推进游标。用 `ctx.database.transact` 包住，避免半途失败留下"记忆写了但游标没推进"或反之的脏状态。

---

## 8. 心跳与并发控制

参考实现用 `node-cron` 每分钟跑 `checkAndSummarizeAll()`。单人桌宠可以，**多用户 bot 上这是成本灾难**——每个 scope 每次心跳可能触发 5 次 LLM 调用。

```ts
// src/memory/heartbeat.ts
export function startHeartbeat(ctx: Context, service: MemoryService) {
  const interval = ctx.setInterval(() => void tick(ctx, service), HEARTBEAT_MINUTES * 60_000)
  return interval   // 返回 disposer，ctx dispose 时自动清理
}
```

`tick()` 的设计：

1. **防重入**：`if (running) return`。参考实现的 node-cron 默认不防重入，一次心跳超过周期就会有两次并发跑同一区间，**重复总结并插入两条记忆**。
2. **只处理有新对话的 scope**：`sat_meta.lastActiveAt` 在每次写对话时更新；心跳只取 `lastActiveAt` 在活跃窗口内、且有对话晚于其 day 游标的 scope。
3. **每 tick 限量 + 串行**：最多处理 `MAX_SCOPES_PER_TICK`(3) 个 scope，且**串行**执行。休眠 scope 靠轮转在后续 tick 里逐步推进，保证最终一致。
4. **dry-run 模式**：`summary_dry_run = true` 时只把将要发给 LLM 的 prompt 和判定结果写日志，**不真的调用**。这是在没有测试框架的前提下验证汇总逻辑的关键手段（不烧 token）。
5. **复用已有 LLM 通道**：走 [api.ts](external/satori-ai/src/api.ts) 的 `APIClient.auxiliaryChat(messages, user)`（低成本辅助模型 + 重试 + key 轮换），不新写 HTTP 调用。传入 `user` 时与 `chat()` 一样优先使用其“地灵殿通行证”里的 key/model/baseURL；票配置不完整则告警并回退默认辅助模型。按人记忆（`personal_memory=true`）时 `scopeId` 就是 `userId`，心跳与话题归档据此解析用户；群级记忆无法唯一定位用户，不解析。

---

## 9. 增量用户画像

替代 [userportrait.ts](external/satori-ai/src/userportrait.ts) 的两遍式全量重写。

- **存储**：`sat_profile` 每 scope 一行，`data` 是 `{ entries, lastSummarizedAt }` JSON 文档（对齐参考实现，保证 apply/淘汰逻辑可以整体原子读改写）。
- **触发**：day 汇总成功后调用，不每轮跑。
- **LLM 输出**：严格 JSON `{ added:[{key,category,content,importance}], modified:[{key,content?,importance?}], deleted:[key] }`，类别 `identity / preference / aversion / requirement / habit / fact`，importance 0–50。
- **本地 apply**：
  - 按 `key` 去重，保留 `updatedAt` 较新者；
  - 上限 `MAX_ENTRIES`(60)，超出按 `importance ASC, updatedAt ASC` 淘汰；
  - **修正参考实现的缺陷**：`added` 分支内部不去重，且 `modified` 遇到不存在的 key 会当新增——同一次 delta 里 `added` 与 `modified` 撞 key 会产生两条，去重结果依赖 `updatedAt` 字符串比较和遍历顺序，边界脆弱。改为先合并成一个 key→entry 的 Map 再落盘。
  - **修正**：参考实现淘汰时 `sort` 原地打乱 `entries` 顺序并永久存盘，导致每次淘汰都重排。改为始终按 `importance DESC, updatedAt DESC` 持久化排序，存盘顺序稳定且有意义。
- **注入**：取 importance 最高的 `MAX_CONTEXT_ENTRIES`(30) 条，按 6 个类别分组输出，带中文类别标签。

---

## 10. 上下文组装

`context.ts` 的 `buildPromptContext()` 返回结构化片段，由 `index.tsx` 的 `buildSystemPrompt` 按现有段落头拼装——**保持 `#首先明确一些参考信息` / `##` 的结构和顺序不变**，这样用户已调好的 `config.prompt` 和 `reasoner_prompt` 依然生效。

| 片段 | 替代 | 说明 |
|---|---|---|
| `common` | `searchMemories(session, 'common')` | `sat_knowledge` 里 `kind='common'` |
| `group` | `searchMemories(session, 'group')` | `sat_knowledge` 里 `kind='group'` 且 `targetId=channelId` |
| `ambient` | `getChannelDialogue(session)` | 措辞不变（含"注意分辨发言人是谁"） |
| `pyramid` | **新增** | 近期话题 / 近日总结 / 近周总结 / 近月总结 / 近季总结 / 年度总结 |
| `recalled` | `searchMemories(session, 'user')` | BM25 召回的历史记忆 |
| `profile` | `getUserPortrait(session)` | 增量画像 |

**token 预算**：新增 `memory_context_max_chars`(默认 2000)。金字塔 + 召回 + 画像拼起来可能很长，超预算时按 `年度总结 → 近季 → 近月 → 召回` 的顺序截断（越近的越优先保留）。

---

## 11. 配置项变更清单

在 [types.ts](external/satori-ai/src/types.ts) 的 Schema 里新增一组 `记忆系统（分层）`。

### 新增

| 配置 | 默认 | 说明 |
|---|---|---|
| `enable_layered_memory` | `true` | **总开关**。关闭时只保留“短期记忆 + 知识库”：不写 `sat_dialogue`、不做分层汇总与召回（旧引擎已删除，没有回退分支） |
| `memory_timezone_offset` | `8` | 日界线时区偏移 |
| `memory_day_boundary_hour` | `4` | 日界线小时 |
| `summary_heartbeat_minutes` | `10` | 心跳周期 |
| `summary_dry_run` | `false` | 只记日志不调 LLM |
| `summary_max_scopes_per_tick` | `3` | 单次心跳最多处理的 scope 数（游标轮转） |
| `topic_switch_check` | `true` | 是否用 LLM 判断话题切换 |
| `memory_recall_topN` | `5` | 关键词召回条数 |
| `memory_active_window_days` | `7` | 多久没活动的 scope 不再参与后台汇总 |
| `memory_retention_days` | `180` | 原始对话保留天数 |
| `memory_context_max_chars` | `2000` | 分层上下文注入上限 |
| `profile_enabled` | `true` | 增量画像开关（`enable_user_portrait` 保留为兼容别名） |
| `profile_max_entries` | `60` | 画像最多保留条目数（超出按重要度淘汰） |
| `profile_context_entries` | `30` | 注入提示词的画像条目数 |

### 语义变化

| 配置 | 变化 |
|---|---|
| `remember_min_length` | **已废弃，运行时不再读取**。分层汇总需要短对话作为输入；环境群聊（`kind='ambient'`）只存在于内存，本来就不落库。保留字段只为不破坏旧 `koishi.yml` |
| `memory_block_words` | 仍然是硬门槛，但作用点从"是否写入长期记忆"变为"是否写入 `sat_dialogue`"——被屏蔽的轮次不落库，也就不会进入任何层级的汇总 |
| `common_topN` / `dailogues_topN` | 名字保留（避免破坏现有 `koishi.yml`），语义变为知识/记忆召回的 topN |

### 废弃

| 配置 | 处置 |
|---|---|
| `enable_user_portrait` | 保留为 `profile_enabled` 的别名 |
| `portrait_usage` / `max_portrait_dialogues` | 无意义（新画像由日总结驱动、按条数上限淘汰）。标记 deprecated，Schema 里保留但忽略 |

### 不变

`dataDir`、`bracket_filter`、`memory_filter`、`message_max_length`、`enable_self_memory`、`personal_memory`、`channel_dialogues`、`channel_dialogues_max_length`、`enable_fixed_dialogues`。

---

## 12. 数据迁移

### 12.1 映射

| 旧数据 | 新位置 | 处理 |
|---|---|---|
| `dataDir/dialogues/<userId>.txt` | `sat_dialogue`，`kind='legacy'` | JSON 数组 `{role, content}[]`，`content` 是用户说过的话（旧系统不保存 AI 回复，`aiContent=''`）。**已用生产环境 1131 个真实文件验证**，`role` 有两种时间写法，都要解析：`对话日期和时间：2026/9/20 00:56:55`（117002 条）和 `对话日期和时间：10/18/2026, 10:04:24 AM`（3741 条，12 小时制）。时间由服务器 locale 写出，实测服务器为 `Asia/Shanghai`，按 `memory_timezone_offset` 换算成真实 UTC。`role` 字面量为 `"user"` 的旧条目（7480 条）没有可信时间，**跳过并在日志中计数/告警，不伪造日期**；旧文件保持原样。同文件内 `role+content` 完全相同的重复条目去重 |
| `dataDir/UserPortrait/<userId>.txt` | `sat_profile` | 整段原文作为**单条** entry：`{key:'legacy_portrait', category:'fact', content: 原文, importance: 30}`，让后续 delta 更新自然吸收 |
| `dataDir/common_sense.txt` | `sat_knowledge` | `kind='common'`, `targetId='*'`，`addKnowledgeIfAbsent` 去重 |
| `dataDir/group_sense/<id>.txt` | `sat_knowledge` | `kind='group'`, `targetId=<id>`，`addKnowledgeIfAbsent` 去重 |

> **作用域反推问题**：`dialogues/<userId>.txt` 只能反推出 `userId`。若 `personal_memory=false`（记忆按 channelId 组织），旧数据无法反推 channelId。处置：统一挂到 `userId` 作为 scopeId，并在日志里明确告警"检测到 personal_memory=false，历史记忆已按用户维度导入"。这是可接受的降级——数据不丢，只是作用域边界与之后的新数据不同。

### 12.2 幂等与安全

- **触发**：**手动执行 `sat.memory.migrate`**（需要 authority 4）。不在启动时自动跑，避免首次启动被 10 万级 INSERT 阻塞；`sat_meta.migratedAt` 记录完成时间，`--force` 可重跑。
- **幂等**：重跑前先 `remove('sat_dialogue', { kind: 'legacy' })` 再重灌（legacy 行是迁移专属标记，不会误删新数据）；知识用 `addKnowledgeIfAbsent` 去重；画像只在 `sat_profile` 还没有该 scope 时写入，不会覆盖新系统产出的画像。**重跑不回拨归档游标**：只有 `sat_memory` 里还没有该 scope 的任何行（说明从没归档过）时才把 `topicStart` 设回最早一条旧对话；已经有记忆的 scope 保持游标不动，否则 `-f` 重跑会把同期区间再归档一次，产出区间完全相同的重复 topic 记忆。`lastActiveAt` 用 `touchMetaIfNewer` 只在更晚时更新，历史时间不会把「最近活跃」往回拨。
- **批量写入**：每个用户文件的对话包在一个 `database.transact` 里，避免每行一个隐式事务（实测 12 万行约 80 秒）。
- **旧文件不修改、不删除、也不改名**（偏离原计划的重命名为 `.migrated`）。迁移只读旧文件，回滚或重新解析都随时可行。
- **回滚**：`enable_layered_memory=false` 只会退化成“短期记忆 + 知识库”，旧引擎代码已删除；旧文件仍在 `dataDir` 下。

### 12.3 真实数据验证（2026-10-18）

从生产服务器只读拉取全量数据到 `.scratch/server-data/full`，用临时 SQLite 库跑完整迁移：

- 1131 个对话文件、128223 条记录：成功迁移 **120743** 条（CN 时间 117002 + US 时间 3741，去重后），跳过无时间条目 **7480** 条，JSON 解析失败 0。
- 时间范围（UTC）：`2025-02-12T16:56:04Z` ~ `2026-10-18T04:45:17Z`，与服务器 `Asia/Shanghai` 的墙上时间一致。
- 画像 59 份、知识 129 条（common 118 + group 11）全部落库。
- 连续迁移两次，对话/画像/知识条数不变，幂等成立。
- 另用 5000 条真实用户消息验证检索：`游戏/考试/猫/睡觉/喜欢/妈妈/下雨/工作` 均能命中语义相关条目，`量子力学` 无匹配；单次查询约 26ms。
- 分层汇总（LLM 用固定响应替身）在迁移后的真实用户上连续跑 5 个心跳周期：`topicStart` 单调推进，每周期归档 200 条对话；topic/day/week/month/season 各 5 条、year 1 条，同层区间无重叠；5 次日总结各触发一次画像更新。共 26 次替身调用，零网络请求。
- 迁移把 `topicStart` 指向最早一条旧对话，因此首次心跳会以每 tick 200 条的速度回填历史（4999 条 ≈ 25 个 tick）；不迁移则在首次对话时从"现在"开始。

### 12.4 游标与活跃时间的不变量（2026-10-18 修复）

上线后发现「历史积压只能等用户再开口才推进」，根因是三处语义混用，现已固定成不变量：

| 不变量 | 实现 | 违反后果 |
| --- | --- | --- |
| `topicStart`（归档游标）只表示「已归档到哪」，**写入它绝不改 `lastActiveAt`** | `setTopicStart` 只 `set` 游标 | 归档的是历史区间，游标时间戳会把 `lastActiveAt` 拨回历史，scope 立刻掉出活跃窗口，下一轮心跳选不到它，积压停滞 |
| `lastActiveAt` 单调不减，只在更晚时更新 | `touchMetaIfNewer` | 迁移回填历史时间会把「最近活跃」往回拨，同样是掉出活跃窗口 |
| 归档结果与游标推进**同事务**提交 | `commitTopicArchive` → `database.transact` | 进程在两次写之间被中断（重启/崩溃）会留下没推进的游标，下一轮把同一批对话再归档一次，产出重复 topic 记忆 |
| 迁移只在 scope 没有任何 `sat_memory` 行时回拨游标 | `hasAnyMemory` 守卫 | `-f` 重跑会把已归档区间重新归档成重复记忆 |

归档仍只把游标推进到**本批对话的末尾**（不是 `now`），归档期间新到的消息不会被跳过。

另外：`getActiveMetas` 排除 `__global__`。它只用来存 `migratedAt`，没有对话，却是合法的一行 `sat_meta`——上线实测它被心跳当成候选、每次处理都把 `lastActiveAt` 刷成当前时间，于是永远排在最前面，白占 3 个处理名额里的一个。

验证：`.scratch/cursor-check.ts`（游标/活跃时间语义、事务回滚——用未知字段让 minato 抛 `TypeError` 断言游标未推进、心跳自推进积压）；`summarize-check.ts` 每 tick 追加断言 `lastActiveAt ≈ now` 且 scope 仍在 `getActiveMetas` 窗口内、topic 区间不重复；`migrate-check.ts` 第三次迁移断言已归档 scope 的游标不回拨、无记忆 scope 仍回到最早旧对话、迁移不增删记忆。

---

## 13. 参考实现的缺陷清单（移植时逐条规避）

已逐行核对源码，以下都是**不照搬**的具体理由：

| # | 位置 | 缺陷 |
|---|---|---|
| 1 | `retrieval/bm25.ts:37-47,52-81` | `computeIDF` 声明了 Map 和 docFreq、算了一堆、直接 `return idf`（永远空 Map），且**从未被调用**；`bm25Score`、`keywordMatchScore` 同样是死代码。真正生效的是 `rerankWithBM25` 里 `0.7 * stringSimilarity + 0.3 * termOverlap`。文件名与实现不符 |
| 2 | `memory/manager.ts:13` | `currentTopicStartTime` 是**模块级可变全局变量**，单例 `memoryManager` 共享。多用户场景下互相覆盖 |
| 3 | `memory/manager.ts:477` | `recoverAndSummarizeUnarchived` 调 `dialogueDb.getAllDialogueSince(cutoffDate)` **没传 characterId**，跨角色泄漏 |
| 4 | `memory/manager.ts:248,419` | `getByGranularity(sub, 1000)` 硬上限 1000 条，超出**静默丢弃**；且在 JS 里过滤时间范围，没走 SQL |
| 5 | `memory/manager.ts:159-163` | `getLatestSummaryTime` 用按 `period_start DESC` 取 1 条的 `periodEnd` 当游标。两条记忆 `period_start` 相同时排序不稳定 → 游标可能回退 → 重复总结 |
| 6 | `memory/manager.ts:186-192` | 日界线用"偏移 +8h 的 Date" + `setUTCHours(4)` + `getUTC*()` 读墙面钟。语义上等价于 UTC+8 的 4:00，能跑但极易误读；配套的 `migrateToUTC8()` 一旦漏跑或跑两次，全部时间戳错乱 |
| 7 | `memory/manager.ts:235` | 非 day 级别的 `endDate` 传的是 `nowTime` 而不是边界时刻，week/month 的 `period_end` 是不确定的"现在"，游标语义模糊 |
| 8 | `memory/manager.ts:116,284` | 用 `content.match(/\{[\s\S]*\}/)` 解析 LLM JSON，贪婪匹配到最后一个 `}`，嵌套对象/围栏/尾逗号都会炸。参考项目自己 `agent/segment-utils.ts` 里有 `repairJSON` + `extractJSONObjects` 却没用在这里 |
| 9 | `memory/manager.ts:204-208` | day 汇总依赖 topic 记忆存在。用户一整天不换话题 → 无 topic 记忆 → `getEarliestMemoryTime('topic')` 返回 null → `continue` → **日总结永远不发生**，金字塔断在第二级 |
| 10 | `memory/manager.ts:179-238` | `checkAndSummarizeAll` 无并发保护；配合 node-cron 每分钟无防重入触发，一次心跳超周期就会并发跑同一区间，**重复总结并插入两条记忆** |
| 11 | `memory/manager.ts:256-258` | `relevantMemories.length < 1` 返回 null 且**不推进游标**，下个心跳重复查询，空转到下一个日界线 |
| 12 | `user/profile.ts:191-199` | `added` 分支内部不去重，`modified` 遇到不存在的 key 会当新增（`:172-182`）。同一次 delta 里 `added` 与 `modified` 撞 key 会产生两条，去重依赖 `updatedAt` 字符串比较和遍历顺序 |
| 13 | `user/profile.ts:202-209` | 淘汰时 `sort` 原地打乱 `entries` 顺序并永久存盘，每次淘汰都重排，存盘顺序无意义 |
| 14 | `memory/manager.ts:404-415` | `recallRandomMemory` 声明 `async` 但内部无 `await` |
| 15 | `memory/manager.ts:54-55` | `shouldSwitchTopic` 里 `length >= 20` 直接返回 true——对话一长就无脑切话题，即使仍在同一话题 |
| 16 | `state/manager.ts:65-71` | `getAffinityStages()` / `getEmotionStages()` 用 `!` 非空断言，未 `configureDimensions` 时返回 undefined 并崩（本次不移植，仅记录） |

---

## 14. 分阶段实施

每阶段独立可验证、可回滚。**P0–P2 完全不改变现有行为**，风险集中在 P3 之后。

| 阶段 | 内容 | 验证方法 |
|---|---|---|
| **P0** 骨架与迁移 | `src/memory/` 目录、`schema.ts`、`repository.ts`、`migrate.ts`、`json.ts`；`extendDatabase` 在 `SAT` 构造函数里调用。**不接主流程** | `yarn dev` 正常启动；跑 `sat.memory.migrate`，用 sqlite 查 `data/koishi.db` 确认 4 类旧数据都进了新表且条数对得上；重跑一次确认幂等（条数不变） |
| **P1** 纯检索层 | `retrieval.ts`（`segment` / `bm25` / `rerank` / `lastBoundary`） | `.scratch/retrieval-check.ts` 用 `npx tsx` 跑断言：中文 bigram 生成、停用词过滤、IDF 排序符合预期、空查询/单字查询不崩、`lastBoundary` 在日界线前后两侧的返回值正确。**完全离线，不烧 token** |
| **P2** 短期记忆 + 落库 | `short-term.ts`（沿用现有 RAM 行为）+ 每轮写 `sat_dialogue` | 发几条消息后查 `sat_dialogue` 有行且 `scopeId` 正确；`emoji.ts` 未改动仍正常（`Sat.Msg[]` 形状不变）；重启后短期记忆清空但 `sat_dialogue` 保留 |
| **P3** 分层汇总 + 心跳 | `summarizer.ts` + `heartbeat.ts` + `prompts.ts`；先开 `summary_dry_run=true` | dry-run 下日志里能看到各级的 prompt、区间判定与跳过原因，**零 LLM 调用**；再关 dry-run，把 `memory_day_boundary_hour` 临时设成"1 分钟前"制造边界，确认真的产出 topic/day 记忆；连续跑两个 tick 确认防重入生效（不产生重复记忆） |
| **P4** 上下文接入 | `context.ts` + 改 [index.tsx](external/satori-ai/src/index.tsx) 的 `buildSystemPrompt` | `log_system_prompt=true` 看系统提示里出现分层段落；对比同一句话在接入前后的回复，确认没有丢掉常识/群常识/群聊记录三段 |
| **P5** 增量画像 | `profile.ts` 替换 `userportrait.ts` | 跑一次 day 汇总看 delta 应用日志（`+n ~m -k`）；`sat.memory.view` 确认画像条目与类别分组正确；手工构造超 60 条的画像验证淘汰 |
| **P6** 收尾 | 命令（`sat.memory.view` / `clear` / `migrate`）、Schema 配置项、readme、删除 `memory.ts` 与 `userportrait.ts` | `yarn build`（tsc）通过；`enable_layered_memory=false` 时只保留短期记忆 + 知识库且不报错 |

### 命令设计（全部新增，不破坏现有命令语义）

| 命令 | 权限 | 作用 |
|---|---|---|
| `sat.memory.view [scopeId]` | 4 | 查看某 scope 的分层记忆条数、最近各粒度内容、画像条目 |
| `sat.memory.migrate` | 4 | 手动重跑旧数据迁移（幂等） |
| `sat.memory.clear [-i <scopeId>] [-a]` | 4 | 删除某 scope（或全部）的持久化记忆与画像 |

现有的 `sat.clear`（清空短期记忆）与 `sat.clear -g`（清空全部短期记忆）**语义不变**，`sat.common_sense` / `sat.group_sense` 从写文件改为写 `sat_knowledge`，命令名和别名不变。

---

## 15. 改动面

| 文件 | 改动 |
|---|---|
| `src/memory/*` | 新增 12 个文件 |
| [src/index.tsx](external/satori-ai/src/index.tsx) | 构造函数换 `MemoryManager` → `MemoryService` + `extendDatabase` + `startHeartbeat`；`buildSystemPrompt` 的四段检索换成 `buildPromptContext`；`buildMessages` 的短期记忆来源改为 `short-term`；`clearSession` / `addCommonSense` / `addGroupCommonSense` / `handleChannelMemoryManager` 改调新 API；`getMemoryConfig()` 换成新配置透传 |
| [src/types.ts](external/satori-ai/src/types.ts) | `Sat.Config` 加新字段；Schema 加一组 `记忆系统（分层）`；`MemoryConfig` 增补 |
| [src/memory.ts](external/satori-ai/src/memory.ts) | 删除（P6） |
| [src/userportrait.ts](external/satori-ai/src/userportrait.ts) | 删除（P6） |
| [src/emoji.ts](external/satori-ai/src/emoji.ts) | **零改动**——`getEmoji(session, user, recentMessages: Sat.Msg[])` 只读最后 5 条的 `{role, content}`，`short-term` 保持返回 `Sat.Msg[]` 即可 |
| [src/utils.ts](external/satori-ai/src/utils.ts) | `findLongestCommonSubstring` / `countCommonChars` 变为孤儿函数。按参考项目 CLAUDE.md 的 "Surgical Changes" 原则：**先不删，在提交信息里提一句** |
| `src/database.ts` | **不改**（`p_system` 与好感度无关的部分不动） |

---

## 16. 风险与缓解

| 风险 | 缓解 |
|---|---|
| **LLM 成本失控**（心跳 × 多 scope × 5 级） | 每 tick 限 3 个 scope + 串行 + 只处理有新对话的 scope + 走低成本 `auxiliaryChat`（持票用户走其通行证 key，不占机器人辅助额度）+ `summary_dry_run` 开发期验证 |
| **提示词膨胀**导致回复质量下降或超 token | `memory_context_max_chars` 上限 + 按"越近越优先"截断 |
| **时区/日界线算错**导致总结错位或重复 | 抽成纯函数 `lastBoundary()`，P1 阶段离线断言覆盖日界线前后两侧 |
| **迁移不可逆** | 旧文件只读、不修改不删除；迁移只删 `kind='legacy'` 的行；`enable_layered_memory=false` 可停用分层引擎 |
| **候选集无限增长**导致检索变慢 | SQL 层先按 `scopeId` + 时间窗（`memory_retention_days`）过滤再进 JS 打分；`pruneDialogues` 定期清理原始对话 |
| **Koishi ORM 在 mongo 后端下正则慢** | 检索**不走 DB 正则**，只按 `scopeId`/`granularity`/时间范围取候选，BM25 在 JS 里算 |
| **多实例部署**（同一 bot 多进程）心跳重复跑 | 防重入只解决单进程。多实例需额外方案（DB 行锁 / 独立心跳进程），本次**不做**，在 readme 里标注为已知限制 |
| **归档把 scope 挤出活跃窗口**，历史积压只能等用户再开口 | 游标与活跃时间分离：`setTopicStart` 不写 `lastActiveAt`，迁移用 `touchMetaIfNewer` 只前进（§12.4）。上线时对存量 `lastActiveAt` 做一次单调修复（取该 scope 最后一条对话的时间） |
| **归档写入被中断产生重复 topic 记忆** | `commitTopicArchive` 用 `database.transact` 把「记忆落库」和「游标推进」合并成一次提交（§12.4） |

---

## 17. 验证清单

1. **纯函数**（离线，P1）：`npx tsx .scratch/retrieval-check.ts` —— `segment` / `bm25` / `rerank` / `lastBoundary` 的断言。
2. **迁移幂等**（P0）：连续跑两次 `sat.memory.migrate`，`sat_dialogue` / `sat_knowledge` / `sat_profile` 条数不变。
3. **汇总 dry-run**（P3）：`summary_dry_run=true` 下跑若干 tick，日志里出现各级 prompt 与判定，且 API 调用计数为 0。
4. **汇总真实产出**（P3）：临时把 `memory_day_boundary_hour` 调到"1 分钟前"，确认 `sat_memory` 里出现 `granularity='day'` 的行，`userState` 非空。
5. **防重入**（P3）：连续跑两个 tick，确认同一区间不产生重复记忆。
6. **上下文**（P4）：`log_system_prompt=true`，确认系统提示里 `近期话题` / `近日总结` / 常识 / 群常识 / 群聊记录 都在。
7. **画像**（P5）：`sat.memory.view` 确认条目按 6 类分组、importance 排序；构造超限场景验证淘汰。
8. **端到端**（P6）：`yarn dev` + 真实群聊发消息，观察 24h 内 topic → day 的自动蒸馏。
9. **构建**（P6）：`cd external/satori-ai && yarn build`（tsc）无错误。
10. **真实数据迁移**（已完成）：`npx tsx .scratch/migrate-check.ts` —— 用生产环境 1131 个文件在临时 SQLite 库跑三次迁移，断言条数、时间范围、`topicStart`、`lastActiveAt`、画像/知识数量、幂等性与「重跑不回拨游标」（§12.4）。
11. **启动冒烟**（已完成）：`npx tsx .scratch/smoke-start.ts` —— 用真实 `koishi.yml` 配置启动完整插件（临时数据库），验证 5 张表建立、`recordTurn` 落库、`getPromptContext` 组装、知识幂等写入。
12. **真实语料检索**（已完成）：`npx tsx .scratch/real-retrieval-check.ts` —— 5000 条真实用户消息上的中文召回质量与耗时。
13. **游标/活跃时间不变量**（已完成，§12.4）：`npx tsx .scratch/cursor-check.ts` —— 游标不动活跃时间、活跃时间单调、事务回滚（未知字段触发 minato `TypeError`，断言游标未推进且记忆未落库）、心跳自推进积压且重复运行不产生重复区间。
