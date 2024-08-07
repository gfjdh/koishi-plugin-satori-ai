# koishi-plugin-satori-ai

[![npm](https://img.shields.io/npm/v/koishi-plugin-satori-ai?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-satori-ai)

# 觉bot的ai对话

使用前在[https://platform.deepseek.com/](https://platform.deepseek.com) 中获取api-key

对于部署者行为及所产生的任何纠纷， Koishi 及 koishi-plugin-satori-ai 概不负责。

如果有更多文本内容想要修改，可以在 本地化 中修改 zh 内容

# 使用方法

### 指令如下：
| 功能 | 指令 |
|  ----  | ----  |
| 重置会话 | dvc.重置会话 |
| 添加人格 | dvc.添加人格 |
| 清空所有回话 | dvc.clear |
| 切换人格 | dvc.切换人格 |
| 查询余额 | dvc.credit |
| 切换输出模式 | dvc.output |
| 更新人格(需要4级权限) | dvc.update |
| 显示一个对话 |  dvc.cat |

- dvc \<prompt\>
  - -o 输出方式

## 设置多个 key 的方法

1. 直接修改
2. 在配置文件修改
  打开koishi.yml  (可以使用 explorer 插件)
  修改配置项
    ```
    davinci-003:3seyqr:
        key:
        - sk-kashdkahsjdhkashkd*
        - sk-ItGRonJPTa6sp9QYhN*
        - sk-sgadtiasyn2ouoi1n*
    ```

## 添加人格的方法

* 使用 [`explorer`](https://koishi.chat/zh-CN/plugins/console/explorer.html) 插件直接编辑, [*点我*](../files/personality.json) 跳转到编译页面
    - 编辑后记得保存哟
* 在聊天中发送“dvc.添加人格”可以添加并自动保存人格
* [添加人格教程](https://forum.koishi.xyz/t/topic/2349/4)
* 使用 `dvc.update` 指令(需要4级权限)，该指令会加载 [*ChatPrompts*](https://github.com/initialencounter/ChatPrompts) 里的所有人格
    - 分享你的人格！，可以到 [*ChatPrompts/Pulls*](https://github.com/initialencounter/ChatPrompts//pulls) 创建一个 Pr
