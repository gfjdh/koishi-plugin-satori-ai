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
  五级情感状态（厌恶/陌生/朋友/暧昧/恋人），影响回复风格与交互限制
- **记忆管理**
  简易的llm-with-rag，支持频道短期上下文记忆 + 用户长期记忆存储 + 常识知识库
- **API 集成**
  可配置多密钥轮换、自动重试、错误处理，兼容 DeepSeek 格式的 API
- **扩展机制**
  支持固定对话模板、自定义触发策略、中间件管道等扩展方式

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

## 功能说明

### 基本聊天功能

- **触发方式**：
  - 指令触发
  - 私信触发
  - 艾特触发
  - 随机触发

- **命令**：
  - `sat <text:text>`：发送消息给 AI 进行回复。
  - `sat.clear`：清空所有会话及人格。
  - `sat.common_sense <text:text>`：添加常识。

建议为指令添加别名使用

### 常识添加

- 管理员可以通过 `sat.common_sense <text:text>` 命令添加常识内容。
- 添加的常识内容会存储在指定的文件中，并在对话中提供参考。

## 使用示例

1. **基本聊天**：
   ```
   sat 你好，今天天气怎么样？
   ```

2. **清空会话**：
   ```
   sat.clear
   ```

3. **添加常识**：
   ```
   sat.common_sense 太阳从东边升起。
   ```

### 固定对话配置
- 在 `data/satori_ai/fixed_dialogues.json` 添加模板：

### 记忆检索机制
- **短期记忆**：保留最近 N 条对话记录
- **长期记忆**：自动存储到 `data/dialogues/*.txt`
- **常识库**：存储在 `common_sense.txt` 的通用知识

### 辅助模型
辅助模型的作用
情感判断：通过辅助模型分析用户与AI的对话内容，判断AI回答时的情绪状态（愤怒/平淡/愉悦），并据此动态调整好感度
精细控制：相比基础好感度系统，辅助模型能识别更复杂的对话情境（如调情、警告等），实现更智能的好感度管理
行为抑制：当启用辅助模型时，系统将暂停基础好感度自动增长机制，完全由模型判断决定好感度变化

配置说明
在插件配置中需设置：

bash
  ```
  # 基础设置
  auxiliary_LLM_URL: "https://api.example.com"  # 辅助模型API地址
  auxiliary_LLM: "economy-model"                # 辅助模型名称（建议使用低成本模型）
  auxiliary_LLM_key: ["your-api-key"]           # 辅助模型专用密钥

  # 好感度设置
  enable_auxiliary_LLM: true                    # 启用辅助模型判断
  value_of_favorability: 15                     # 情感系数基准值
  ```

工作原理
对话分析：将主模型的回答内容与用户问题、当前好感等级组合成分析提示

情绪判断：辅助模型返回「愤怒」「平淡」「愉悦」三种判定结果,以基准值15为例：
   - 愤怒：扣除15点好感度 → "(好感度↓)"
   - 平淡：无变化
   - 愉悦：增加3点好感度 → "(好感度↑)"

效果反馈：在可见模式下会直接在回复后附加变化标识

使用建议
   - 模型选择：推荐使用具有较强指令遵循能力的低成本模型
   - 密钥管理：建议使用独立于主模型的API密钥，避免资源冲突
   - 阈值调整：通过修改value_of_favorability控制好感度变化幅度

---

## 注意事项

1. 开启好感度系统后，以下情况会降低好感：
   - 发送敏感词（检测 `**` 符号）
   - 重复提问相同内容
   - 低好感时发送过多英文(通常是prompt注入攻击)

2. 生产环境建议：
   - 配置多个 API 密钥
   - 定期备份记忆数据
   - 通过 `blockuser`/`blockchannel` 过滤恶意用户

3. 调试技巧：
   - 查看 `satori-api` 日志标签
   - 使用 `log_reasoning_content` 显示思维链

4.辅助模型相关
   - 启用后基础好感度自动增长将失效，完全依赖模型判断
   - 每次调用会产生额外API消耗，请合理设置重试次数(maxRetryTimes)
   - 模型误判可能导致好感度异常变化，建议配合visible_favorability监控效果
   - 系统提示词已固化，如需修改需直接修改generateAuxiliaryPrompt函数
---

🔄 项目持续开发中，欢迎提交 Issue 和 PR 参与改进！
