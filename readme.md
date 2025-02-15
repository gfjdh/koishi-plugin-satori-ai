# koishi-plugin-satori-ai

[![npm](https://img.shields.io/npm/v/koishi-plugin-satori-ai?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-satori-ai) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](http://choosealicense.com/licenses/mit/) ![Language](https://img.shields.io/badge/language-TypeScript-brightgreen) ![Static Badge](https://img.shields.io/badge/QQ交流群-2167028216-green)

# 觉bot的ai对话

基于 Koishi 框架的智能聊天机器人插件，集成多轮对话、好感度系统、记忆管理、上下文感知等功能，支持深度自定义与扩展。

[作者主页](https://gfjdh.cn)

本插件是一个基于 Koishi 框架的聊天机器人插件，支持多种触发方式和丰富的配置选项。
适配于satori适配器，不保证其他适配器能否适用。

使用前可以在[deepseek](https://platform.deepseek.com)或[火山引擎](https://www.volcengine.com/)中获取api-key

如果使用deepseek，你的baseURL应该形如"https://api.deepseek.com"
如果使用火山引擎，你的baseURL应该形如"https://ark.cn-beijing.volces.com/api/v3"
或其他兼容格式api均可

需要注意的是，deepseek模型的温度配置范围为0-2，而火山引擎为0-1

对于部署者行为及所产生的任何纠纷， Koishi 及 koishi-plugin-satori-ai 概不负责。

如果有更多文本内容想要修改，可以在 本地化 中修改 zh 内容

---

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

---

## 使用方法

### 安装与配置

1. **安装插件**：
   ```bash
   npm install koishi-plugin-satori-ai
   ```
   或前往插件市场安装

2. **配置插件**：

建议的关系prompt模板：
```bash
你对我的关系是xx，你的语气要xx。
```

完整配置示例（koishi.yml）：
```yaml
satori-ai:
  baseURL: "https://api.deepseek.com"
  keys:
    - "your-api-key-1"
    - "your-api-key-2"
  auxiliary_LLM_URL: "https://api.example.com"  # 辅助模型API地址
  auxiliary_LLM: "economy-model"                # 辅助模型名称
  auxiliary_LLM_key: ["aux-key"]                # 辅助模型专用密钥
  content_max_tokens: 1500                      # 生成内容最大token数
  max_parallel_count: 3                         # 最大并行处理数
```

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

#### [道具系统](https://github.com/gfjdh/koishi-plugin-p-shop)
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
  - 中文关键词权重加倍
  - 支持自动时间上下文注入（如「当前日期和时间：2024-02-20 下午」）

---

## 高级配置

### 辅助模型配置
```yaml
# 情感分析专用配置
enable_auxiliary_LLM: true     # 启用情感分析模型
auxiliary_LLM: "gpt-3.5-turbo" # 建议使用低成本模型
value_of_favorability: 15      # 情感系数基准值（0-9分制）
visible_favorability: true     # 显示好感度变化标识
```

### 记忆系统配置
```yaml
remember_min_length: 5         # 最小记忆长度（字符数）
common_topN: 3                 # 常识检索返回条数
dailogues_topN: 5              # 历史对话检索条数
memory_block_words: ["xx"]   # 记忆屏蔽词列表
```

### 开发者选项
```yaml
log_reasoning_content: true    # 显示思维链日志
log_system_prompt: true        # 打印完整系统提示
sentences_divide: true         # 长回复自动分段
```

---

## 使用示例

1. **添加常识**：
   ```
   sat.common_sense 太阳从东边升起
   ```

2. **查看好感度效果**：
   ```
   [用户] sat 你今天真可爱
   [bot] @用户 谢谢夸奖~（好感↑）
   ```

3. **触发道具效果**：
   ```
   [用户] sat 你好呀
   [bot] @用户 你好喵~（佩戴猫耳发饰）
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
