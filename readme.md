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
| 清空所有回话 | sat.clear |
| 对话 |  sat |

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
