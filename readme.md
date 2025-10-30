# koishi-plugin-satori-ai

[![npm](https://img.shields.io/npm/v/koishi-plugin-satori-ai?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-satori-ai) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](http://choosealicense.com/licenses/mit/) ![Language](https://img.shields.io/badge/language-TypeScript-brightgreen) ![Static Badge](https://img.shields.io/badge/QQ交流群-2167028216-green)

当前版本: 1.4.0-beta.1  • 最后更新: 2025-10-30

基于 Koishi 框架的智能聊天机器人插件（Satori 适配器），集成多轮对话、长期记忆、好感度/情绪系统、可选的 Puppeteer 支持、天气感知与广播/小游戏等扩展功能，支持深度自定义与扩展。

[作者主页](https://gfjdh.cn)

适配目标：Satori 适配器（对其他适配器兼容性未经过完整测试）。

使用前可在诸如 DeepSeek 或 火山引擎 等平台获取 API key：

- DeepSeek 示例 baseURL: "https://api.deepseek.com"
- 火山引擎 示例 baseURL: "https://ark.cn-beijing.volces.com/api/v3"

注意：不同提供商的温度范围可能不同（例如 DeepSeek 0-2，火山引擎通常 0-1）。

对于部署者行为及其产生的任何纠纷，Koishi 及本插件概不负责。

如果想修改插件内置的本地化文本，可编辑本项目的 `locales/zh` 内容。

---

## 最近更新要点

- 升级至 v1.4.0-beta.1：完善 TypeScript 声明（`lib/*.d.ts`），并同步 package 信息。
- 新增或增强功能：Puppeteer 可选集成（用于截图/渲染场景）、天气感知模块、Broadcast 管理、小游戏支持与更多配置选项（见下文配置节）。
- 改进记忆与好感度系统：更多防护与开关（辅助模型情感分析、可见化显示、每日上限等）。
- 增强并发与队列管理：频道级并发控制、重复请求检测、请求排队与超时保护。
- 若干 Bug 修复与性能优化。

详细变更请参见仓库提交记录（本地或 GitHub）。

## 功能特性

- **自然语言交互**
  支持私聊/群聊触发，内置随机回复、@提及响应、上下文记忆等机制
- **好感度系统**
  六级情感状态（厌恶/陌生/朋友/暧昧/恋人/夫妻），持有「订婚戒指」可升级为夫妻关系，影响回复风格与交互限制
- **记忆管理**
  简易的llm-with-rag，支持频道短期上下文记忆 + 用户长期记忆存储（JSON格式） + 常识知识库（common_sense.txt）
- **API 集成**
  支持多密钥轮换、自动重试、错误处理，兼容 DeepSeek 格式的 API，可独立配置辅助模型密钥
- **扩展机制**
  支持固定对话模板、自定义触发策略、中间件管道等扩展方式，回复内容支持道具后缀（如「猫耳发饰」「觉fumo」）
- **并发控制**
  支持频道级并发限制，自动排队处理高负载请求

额外模块与增强：

- 可选 Puppeteer 集成：用于页面渲染、截图或抓取外部内容（需安装 `koishi-plugin-puppeteer`）。
- WeatherManager：支持基于配置的天气感知与时效缓存（提供天气相关回复或上下文注入）。
- BroadcastManager：用于广播/消息推送场景的集中管理与频道屏蔽配置。
- 小游戏与经济系统：支持简单的游戏开关、口袋钱（pocket money）与道具消费逻辑。
- 情绪（Mood）系统：与好感度并列，支持可见化反馈、辅助模型驱动的情绪调整与每日上限控制。

---

## 使用方法

### 安装与配置

1. 安装插件：
   ```powershell
   npm install koishi-plugin-satori-ai
   ```

2. 兼容性与依赖

- 本插件的 peerDependency: `koishi` ^4.17.10。请确保 Koishi 版本满足要求。
- 可选：若需启用 Puppeteer 功能（如页面渲染或截图），请额外安装并在 Koishi 中启用 `koishi-plugin-puppeteer`。

### 功能说明

#### 基本聊天功能
- **触发方式**：
  - 指令触发：`sat <消息内容>`
  - 私信自动触发
  - 艾特机器人触发
  - 随机概率触发（需配置`randnum`参数）

- **核心命令**：
  - `sat <text:text>`：发送消息给 AI 进行回复（支持alias别名）
  - `sat.clear [-g]`：清空会话记忆（`-g`参数清空全局记忆）
  - `sat.common_sense <text:text>`：添加常识到知识库（管理员权限）

#### [道具系统（自用，并不推荐安装）](https://github.com/gfjdh/koishi-plugin-p-shop)
- 当用户拥有以下道具时，回复会追加特殊内容：
  - **猫耳发饰**：回复末尾追加「喵~」
  - **觉fumo**：回复末尾追加换行符+「fumofumo」
  - **订婚戒指**：当描述标记为「已使用」时，关系状态变更为「夫妻」

#### 记忆系统
- **数据存储路径**：
  - 短期记忆：内存中保留最近 N 条对话（`message_max_length`配置）
  - 长期记忆：`data/satori_ai/dialogues/<user_id>.txt`（JSON格式）
  - 常识库：`data/satori_ai/common_sense.txt`

- **检索机制**：
  - 自动过滤常用词（的/是/了等）
  - 支持自动时间上下文注入（如「当前日期和时间：2024-02-20 下午」）

---

## 使用示例

1. **添加常识**：
   ```
   sat.common_sense 太阳从东边升起
   ```

2. **好感度升降效果**：
  - 默认的+1是不显示的
   ```
   [用户] sat 你今天真可爱
   [bot] @用户 谢谢夸奖~（好感↑）
   ```

---

## 注意事项

1. **好感度机制**：
   - 启用辅助模型后，基础好感度自动增长将**失效**
   - 每次情感分析会产生额外API调用
   - 模型误判可能导致好感度异常波动，调试时建议开启`visible_favorability`

2. **数据安全**：
   - 长期记忆文件使用JSON格式存储
   - 敏感词过滤文件路径：`data/satori_ai/output_censor.txt`
   - 定期备份`data/satori_ai`目录防止数据丢失

3. **性能优化**：
   - 推荐`max_parallel_count`设为2-4（根据API调整）
   - 高并发场景建议启用`online_user_check`防止重复请求

4. **问题排查**：
   - 查看`satori-api`标签日志获取原始API错误
   - 使用`sat.clear -g`可重置所有会话状态
   - 检查`data/satori_ai/dialogues`目录权限确保可写入

---

🔄 项目持续开发中，欢迎提交 Issue 和 PR 参与改进！
