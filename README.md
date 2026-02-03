# hc-code（Hand Claude Assistant）

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

### 4) 使用（Windows / Linux / macOS）

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

#### Linux / macOS（离线推荐：hc.sh + .runtime；也可用系统 Node 20+）
```bash
cd /path/to/your/project

export HCAI_HUAWEI_API_KEY="你的key"

node /path/to/hand_claude/dist/index.js repo scan --config /path/to/hand_claude/hcai.dashscope.config.json
node /path/to/hand_claude/dist/index.js repo ask "解读这个项目" --config /path/to/hand_claude/hcai.dashscope.config.json
```

也可以使用脚本入口（首次可能需要 chmod；默认不自动下载，离线优先；如需在线下载需显式开启）：
```bash
chmod +x /path/to/hand_claude/hc.sh
/path/to/hand_claude/hc.sh repo scan
/path/to/hand_claude/hc.sh repo ask "解读这个项目"
```

如需在线自动下载 Node（不推荐在离线环境使用）：
```bash
HCAI_ALLOW_NODE_DOWNLOAD=1 /path/to/hand_claude/hc.sh repo scan
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
  `repo edit` 会展示改动摘要与 patch 预览，确认后才落盘。

- 仓库交互式对话（带上下文）：
  ```
  hc repo chat
  ```
  在对话中可用：
  ```
  /open <path>
  ```
  把文件内容追加到上下文。

## repo ask 记忆说明

`repo ask` 默认会保存简要问答历史到目标项目的：
```
.hcai/repo-ask-memory.json
```

当历史过长时，会自动压缩为摘要，避免上下文爆炸。

你可以这样控制：
```
hc repo ask "问题" --reset-memory   # 清空历史后再问
hc repo ask "问题" --no-memory      # 本次不使用历史
hc repo ask "问题" --history 3      # 仅带入最近 3 轮 Q/A
hc repo ask "问题" --no-model-summary  # 关闭模型摘要
```

## 关于 hc.cmd / hc.ps1

项目根目录已提供：
- `hc.cmd`（CMD 用）
- `hc.ps1`（PowerShell 用）
- `hc.sh`（Linux/macOS 用）

它们会自动：
- 使用 `dist/index.js`
- 默认读取 `hcai.dashscope.config.json`
- 自动使用内置便携 Node（`node-v20.11.1-win-x64`）

你无需再手动输入 `node dist/index.js ...`。

> 说明：Windows 内置便携 Node。  
> Linux/macOS 默认离线优先：优先使用 `.runtime/` 中的 Node 运行时；若不存在则尝试使用系统 `node`（需 >=20）。  
> 如需在线自动下载 Node，设置 `HCAI_ALLOW_NODE_DOWNLOAD=1`（默认关闭）。

## Linux/macOS 彻底离线（拷贝目录即可用）

如果你希望 **直接拷贝整个项目目录到离线 Linux/macOS 机器就能用**，请在有网机器先准备好依赖与构建产物（确保存在 `dist/` 与 `node_modules/`）：

```bash
npm ci
npm run build
```

然后再把运行时下载到 `.runtime/`：

### Windows 上准备运行时（推荐）
```powershell
.\scripts\prepare-offline-runtime.ps1 -TargetOS linux -TargetArch x64
.\scripts\prepare-offline-runtime.ps1 -TargetOS darwin -TargetArch arm64
```

### Linux/macOS 上准备运行时
```bash
TARGET_OS=linux TARGET_ARCH=x64 ./scripts/prepare-offline-runtime.sh
TARGET_OS=darwin TARGET_ARCH=arm64 ./scripts/prepare-offline-runtime.sh
```

完成后，直接**复制整个项目目录**到离线机器即可：
```bash
./hc.sh repo scan
```

离线常见问题：
- Permission denied：先执行 `chmod +x hc.sh`，或用 `bash hc.sh repo scan`。
- /usr/bin/env: 'bash\\r'：说明脚本是 CRLF 行尾；请用 git clone（有 .gitattributes 自动转 LF）或使用 `dos2unix hc.sh` 转换。
- 架构不匹配：`uname -m` 若是 `aarch64/arm64`，需要准备 `linux-arm64` 运行时而不是 `linux-x64`。

## Linux/macOS 离线包（内含 Node）

在 Linux/macOS 上执行下面脚本，会生成离线 tar 包（内含 Node 20+，并包含 `dist/` + `node_modules/`，解压即可用）：

> 打包前请确保已执行过：`npm ci && npm run build`。

```bash
chmod +x scripts/package-offline.sh
./scripts/package-offline.sh
```

输出目录：
```
dist-packages/hc-code-<os>-<arch>.tar.gz
```

使用方式（解压后）：
```bash
tar -xzf hc-code-<os>-<arch>.tar.gz
cd hc-code-<os>-<arch>
./hc.sh repo scan
./hc.sh repo ask "解读这个项目"
```

> 说明：该脚本会下载 Node 官方发行版，请在联网环境执行一次打包，再拷贝到离线环境使用。

### Windows 上打 Linux/macOS 离线包

如果你只有 Windows 机器，也可以直接打包 Linux/macOS 离线包：
```powershell
.\scripts\package-offline.ps1 -TargetOS linux -TargetArch x64
.\scripts\package-offline.ps1 -TargetOS darwin -TargetArch arm64
```

输出文件同样在：
```
dist-packages/hc-code-<os>-<arch>.tar.gz
```


## 常见问题

- 提示找不到 `dist/index.js`
  - 先在本机执行：`npm run build`

- 模型名不匹配
  - 用 `hc models` 查看当前可用模型

- 超时或 401
  - 检查 `api_base_url` 是否可达
  - 检查 API Key 是否正确
