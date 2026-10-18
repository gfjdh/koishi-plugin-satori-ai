# koishi-plugin-satori-ai

[![npm](https://img.shields.io/npm/v/koishi-plugin-satori-ai?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-satori-ai) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](http://choosealicense.com/licenses/mit/) ![Language](https://img.shields.io/badge/language-TypeScript-brightgreen) ![Static Badge](https://img.shields.io/badge/QQ交流群-2167028216-green)

当前版本: 2.0.1  •  最后更新: 2026-10-18

基于 Koishi 框架的智能聊天机器人插件（Satori 适配器），集成多轮对话、分层长期记忆与用户画像、好感度/情绪系统，可选 Puppeteer、天气感知、广播与小游戏等扩展功能，支持深度自定义。

[作者主页](https://gfjdh.cn)

适配目标：Satori 适配器（对其他适配器兼容性未经过完整测试）。

使用前可在诸如 DeepSeek、火山引擎等平台获取 API key：

- DeepSeek 示例 baseURL: `https://api.deepseek.com`
- 火山引擎 示例 baseURL: `https://ark.cn-beijing.volces.com/api/v3`

注意：不同提供商的温度范围可能不同（例如 DeepSeek 0-2，火山引擎通常 0-1）。

对于部署者行为及其产生的任何纠纷，Koishi 及本插件概不负责。

如果想修改插件内置的本地化文本，可编辑本项目的 `locales/zh` 内容。

---

## 最近更新要点

### v2.0：分层长期记忆重构

- **话题 → 日 → 周 → 月 → 季 → 年** 六级金字塔。话题记忆严格不跨自然日；上一级只在一个「已闭合且下层已齐」的周期上生成，每个周期最多一条节点。
- 自然日默认以 **+08 凌晨 04:00** 为界（`memory_timezone_offset` / `memory_day_boundary_hour` 可配）。历史积压按日切块，单日超过 200 条对话时同一天拆成多块，day 级再合并。
- 后台心跳每 10 分钟处理一批活跃用户/群，自动补齐积压；归档与层级汇总共享每次的辅助模型调用预算（`summary_max_calls_per_tick`），预算不够时宁可不建上层，也不会生成缺子项的周/月节点。
- 记忆与归档游标在同一个事务中写入，中断不会丢消息，也不会重复归档。
- 长期记忆从旧版 JSON 文件迁移到 **数据库表**（`sat_dialogue` / `sat_memory` / `sat_knowledge` / `sat_profile` / `sat_meta`）。首次启动会自动迁移一次，之后可用 `sat.memory.migrate` 手动重跑。

### 其它改进

- **检索**：中文无词典分词（unigram + bigram）+ BM25 + 时间衰减，按查询召回相关历史记忆；注入系统提示时按「越近越优先」截断。
- **用户画像**：由日总结驱动增量更新，不再消耗额外的轮次配额。
- **@ 与昵称前缀**：写入对话记录前会去掉「@bot」和以昵称开场的称呼，避免记忆里堆积「古明地觉 xxxx」这类噪声；其他用户的 @ 仍保留名字。
- Puppeteer 可选集成、天气感知、Broadcast 管理、小游戏与 galgame 模块继续保留。
- 增强频道级并发控制、重复请求检测与请求排队。

详细设计与变更可参见 `docs/memory-refactor-plan.md` 与仓库提交记录。

## 功能特性

- **自然语言交互**
  支持私聊/群聊触发，内置指令、@提及、昵称、随机概率触发与上下文记忆。
- **分层长期记忆**
  短期上下文 + 话题归档 + 日/周/月/季/年汇总 + 关键词召回 + 用户画像 + 常识/群常识知识库。
- **好感度系统**
  六级情感状态（厌恶/陌生/朋友/暧昧/恋人/夫妻），持有「订婚戒指」可升级为夫妻关系，影响回复风格与交互限制。
- **情绪系统**
  与好感度并列的心情值，支持可见化反馈、屏蔽词扣减与每日重置。
- **API 集成**
  支持多密钥轮换、自动重试、错误处理，兼容 DeepSeek 格式的 API；可为辅助任务（话题判断、汇总、画像、好感度）单独配置低成本的辅助模型。
- **扩展机制**
  固定对话模板、自定义触发策略、中间件管道；回复内容支持道具后缀（如「猫耳发饰」「觉fumo」）。
- **并发控制**
  频道级并发限制，自动排队处理高负载请求。

额外模块：

- 可选 Puppeteer 集成：用于页面渲染、截图或抓取外部内容（需安装 `koishi-plugin-puppeteer`）。
- WeatherManager：基于配置的天气感知与时效缓存。
- BroadcastManager：广播/消息推送的集中管理与频道屏蔽。
- 小游戏与经济系统：简单的游戏开关、口袋钱（pocket money）与道具消费逻辑。

---

## 使用方法

### 安装与配置

1. 安装插件，并在 Koishi 配置中启用：
   ```powershell
   npm install koishi-plugin-satori-ai
   ```

2. 兼容性与依赖

- peerDependency：`koishi` ^4.17.10。
- **需要启用数据库插件**（如 `database-sqlite`，默认写入 `data/koishi.db`）。分层记忆的所有表都由插件自动创建。
- 可选：若需 Puppeteer 功能，请额外安装并启用 `koishi-plugin-puppeteer`。

### 触发方式

- 指令触发：`sat <消息内容>`（可用 `alias` 配置别名，如 `ai`）
- 私聊自动触发（`private: true`）
- @机器人 触发
- 发言中包含昵称触发（`nick_name` + `nick_name_list`）
- 随机概率触发（`randnum`）
- 戳一戳触发（`enable_OneTouch`）

### 常用命令

| 命令 | 说明 | 权限 |
| --- | --- | --- |
| `sat <text>` | 与 AI 对话 | 可配（默认 1） |
| `sat.clear [-g]` | 清空**短期**会话记忆；`-g` 清空所有短期记忆 | 1（默认） |
| `sat.common_sense <text>` | 添加常识 | 4 |
| `sat.group_sense <text> [-i <群号>]` | 添加群常识 | 3 |
| `sat.memory.view [scopeId]` | 查看某用户/群的六级记忆 | 4 |
| `sat.memory.clear [scopeId] [-a]` | 清空分层记忆；`-a` 清空全部 | 4 |
| `sat.memory.migrate [-f]` | 迁移旧版记忆文件；`-f` 强制重跑 | 4 |
| `sat.get_user_portrait <userId>` | 查看用户画像 | 4 |
| `sat.user_usage` | 查看今日使用次数 | 1（默认） |
| `sat.update_user_level [-i <id>] [-l <level>]` | 调整用户等级 | 2/4 |
| `sat.add_output_censor <text>` | 添加输出敏感词 | 4 |

可选的天气、心情、游戏、galgame 命令（`sat.get_weather`、`sat.set_mood`、`sat.pocket_money`、`sat.game`、`sat.galgame_start` 等）在对应模块开启后注册。

### 记忆系统

#### 分层结构

```
topic  （一次连续话题，不跨自然日）
  └─ day    （自然日，默认 04:00 分界）
       └─ week    （周一 04:00 起）
            └─ month   （每月 1 日 04:00 起）
                 └─ season  （季度）
                      └─ year    （自然年）
```

- 话题切换由轮数阈值（5–20 条）与辅助模型共同判断；历史积压按自然日逐块归档。
- 只有当一个周期的**所有下层节点**都已产出、且归档游标已经越过该周期末尾时，才会生成周期节点。单子节点直接晋升，不额外调用模型。
- 每 10 分钟一次心跳，每次最多处理 3 个活跃用户/群；每个 scope 的辅助模型调用预算默认 8 次，在归档与层级汇总之间平分。历史积压较多时可调大 `summary_max_calls_per_tick`。
- 原始对话默认保留 180 天（`memory_retention_days`），汇总后的记忆不会被清理。

#### 数据存储

| 表 | 内容 |
| --- | --- |
| `sat_dialogue` | 原始对话（`turn` 实时对话、`legacy` 迁移数据） |
| `sat_memory` | 六级记忆节点（`topic/day/week/month/season/year`） |
| `sat_knowledge` | 常识与群常识 |
| `sat_profile` | 增量用户画像 |
| `sat_meta` | 每个 scope 的归档游标与活跃时间 |

旧版 `data/satori_ai/dialogues/<userId>.txt`、`UserPortrait/`、`common_sense.txt` 只在 `sat.memory.migrate` 时读取，**不再写入**；迁移完成后可自行归档备份。

#### 检索与注入

- 知识库与历史记忆使用 BM25 + 时间衰减打分，按查询词召回 TopN。
- 系统提示中始终包含最近一条话题与最近一条日总结，再按预算追加召回记忆与画像条目。
- 画像由日总结增量更新，最多保留 `profile_max_entries` 条。

---

## 使用示例

1. **添加常识**：
   ```
   sat.common_sense 太阳从东边升起
   ```

2. **查看某人的分层记忆**：
   ```
   sat.memory.view 123456789
   ```

3. **好感度升降效果**（`visible_favorability` 开启时）：
   ```
   [用户] sat 你今天真可爱
   [bot] @用户 谢谢夸奖~（好感↑）
   ```

4. **清空自己的短期会话**：
   ```
   sat.clear
   ```
   注意：短期记忆清空后，已经归档的长期记忆仍然保留；要一并清除请用 `sat.memory.clear`。

---

## 注意事项

1. **成本**
   - 分层记忆在后台持续调用辅助模型；历史积压时的总调用量约为「归档次数 + 日画像 + 多子节点汇总」。
   - 辅助模型建议使用低成本模型；`summary_dry_run: true` 可先观察将要执行的任务而不实际调用。
   - 每隔一段时间会为每个日节点更新一次用户画像；不需要时可用 `profile_enabled: false` 关闭。

2. **好感度机制**
   - 启用辅助模型后，基础好感度自动增长将**失效**。
   - 每次情感分析会产生额外 API 调用；模型误判可能导致好感度异常波动，调试时建议开启 `visible_favorability`。

3. **数据安全**
   - 定期备份数据库文件（默认 `data/koishi.db`）。
   - 敏感词过滤文件路径：`data/satori_ai/output_censor.txt`。
   - 旧版记忆文件迁移前请保留备份；`sat.memory.migrate -f` 会整批替换 `legacy` 对话。
   - 不要手动修改 `sat_meta.topicStart`，归档游标被回拨会导致同一批对话重复归档。

4. **性能优化**
   - 推荐 `max_parallel_count` 设为 2–4（根据 API 调整）。
   - 高并发场景建议启用 `online_user_check` 防止重复请求。
   - 活跃用户/群很多时可降低 `memory_active_window_days` 或 `summary_max_scopes_per_tick`，控制后台成本。

5. **问题排查**
   - API 原始错误看 `satori-api` 日志；归档与汇总看 `satori-summary`、`satori-heartbeat`、`satori-memory`。
   - `sat.memory.view` 可确认某个 scope 是否已经产出对应层级的记忆。
   - `sat.clear -g` 只重置短期会话；长期记忆请用 `sat.memory.clear`。

---

🔄 项目持续开发中，欢迎提交 Issue 和 PR 参与改进！
