# hc-code（Huawei Code Assistant）

本项目是一个"类 Claude Code"的本地 CLI 代码助手，命令为 `hc`。

## 快速开始（推荐）

适合内网/离线环境：直接使用仓库内置的便携 Node + 脚本入口。

### 1) 放置项目

把本项目放在任意目录，例如：
```
C:\Users\ZQD\Desktop\手搓claude
```

### 2) 准备配置文件

你可以直接把配置写入：
- `hcai.dashscope.config.json`（脚本默认使用这个）

配置示例（内网）：
```json
{
  "Providers": [
    {
      "name": "xxxxx",
      "api_base_url": "xxxxxxxxxxxxxxxxxxx",
      "api_key": "xxxxxxxxxxxxxxxxxxxxx",
      "models": [
        "qwen3-coder-30b-a3b-instruct",
        "qwen3-coder-480b-a3b-instruct-fc",
        "gpt-oss-120b",
        "qwen3-32b",
        "qwen3-coder-30b-a3b-instruct",
        "qwen3-coder-30b-a3b-instruct-256k"
      ],
      "transformer": {
        "use": [["maxtoken", { "max_tokens": 65536 }]]
      }
    }
  ],
  "Router": {
    "default": "xxxxxxxxxxxxxxxxxxxxxxxx",
    "HOST": "127.0.0.1",
    "LOG": true
  }
}
```

> 注意：文件中只能有一份 JSON（不要重复粘贴两份）。

### 3) 进入你要分析的项目目录

比如你要分析：
```
C:\Users\ZQD\.gemini\antigravity\scratch\study\
```

### 4) 使用（CMD 或 PowerShell）

#### CMD（命令提示符）
```cmd
cd /d C:\Users\ZQD\.gemini\antigravity\scratch\study\

C:\Users\ZQD\Desktop\手搓claude\hc.cmd repo scan
C:\Users\ZQD\Desktop\手搓claude\hc.cmd repo ask "解读这个项目"
```

#### PowerShell
```powershell
cd C:\Users\ZQD\.gemini\antigravity\scratch\study\


C:\Users\ZQD\Desktop\手搓claude\hc.ps1 repo scan
C:\Users\ZQD\Desktop\手搓claude\hc.ps1 repo ask "解读这个项目"
```

## 常用命令

- 交互式聊天：
  ```
  hc chat --config ./hcai.config.json
  ```

- 一次性问答：
  ```
  hc ask "hello" --config ./hcai.config.json
  ```

- 仓库扫描 + 问答 + 改代码：
  ```
  hc repo scan
  hc repo ask "这个项目如何启动"
  hc repo edit "给 README 增加快速开始"
  ```

## 关于 hc.cmd / hc.ps1

项目根目录已提供：
- `hc.cmd`（CMD 用）
- `hc.ps1`（PowerShell 用）

它们会自动：
- 使用 `dist/index.js`
- 默认读取 `hcai.dashscope.config.json`
- 自动使用内置便携 Node（`node-v20.11.1-win-x64`）

你无需再手动输入 `node dist/index.js ...`。


## 常见问题

- 提示找不到 `dist/index.js`
  - 先在本机执行：`npm run build`

- 模型名不匹配
  - 用 `hc models` 查看当前可用模型

- 超时或 401
  - 检查 `api_base_url` 是否可达
  - 检查 API Key 是否正确