# hc-code (Huawei Code Assistant)

一个“类 Claude Code”的本地 CLI 代码助手：`hc`

- Node.js 20+
- TypeScript
- 支持 Windows / macOS / Linux
- 仅访问你配置的 `api_base_url`
- 不要提交密钥到仓库

## 安装与构建（pnpm 推荐）

```bash
pnpm i
pnpm build
pnpm hc models --config ./hcai.config.json
```

也可用 npm：

```bash
npm i
npm run build
npm run hc -- models --config ./hcai.config.json
```

## 配置文件

默认按顺序查找：

1. `./hcai.config.json`
2. `~/.hcai/config.json`

也可显式指定：

```bash
hc models --config C:\path\to\hcai.config.json
```

配置结构（必须兼容）：

```json
{
  "Providers": [
    {
      "name": "huawei",
      "api_base_url": "http://api.openai.rnd.huawei.com/v1/chat/completions",
      "api_key": "sk-1234",
      "models": [
        "qwen3-coder-30b-a3b-instruct",
        "qwen3-coder-480b-a3b-instruct-fc",
        "gpt-oss-120b",
        "qwen3-32b",
        "qwen3-coder-30b-a3b-instruct",
        "qwen3-coder-30b-a3b-instruct-256k"
      ],
      "transformer": {
        "use": [
          ["maxtoken", { "max_tokens": 65536 }]
        ]
      }
    }
  ],
  "Router": {
    "default": "huawei,qwen3-coder-30b-a3b-instruct-256k",
    "HOST": "127.0.0.1",
    "LOG": true
  }
}
```

### 密钥与环境变量覆盖

不要把真实密钥提交到仓库。

优先级：

1. 环境变量 `HCAI_<PROVIDER>_API_KEY`（例如 `HCAI_HUAWEI_API_KEY`）
2. 环境变量 `HCAI_API_KEY`
3. 配置文件中的 `api_key`

示例（PowerShell）：

```powershell
$env:HCAI_HUAWEI_API_KEY="sk-xxxx"
pnpm hc ask "hello" --config .\hcai.config.json
```

## 命令一览

### 1) 交互式聊天

```bash
hc chat --config ./hcai.config.json
```

支持：

- `/model <provider,model>` 切换模型
- `/new` 新会话
- `/save` 保存到 `.hcai/sessions/<timestamp>.json`
- `/load <file>` 加载会话
- `/help`

参数：

- `--system <path>` 指定 system prompt 文件
- `--max-tokens N` 覆盖 transformer 默认值
- `--no-stream` 关闭流式
- `--verbose` 更详细日志

### 2) 一次性问答

```bash
hc ask "请解释这个项目结构" --config ./hcai.config.json
hc ask "hello" --json --config ./hcai.config.json
```

### 3) 查看模型

```bash
hc models --config ./hcai.config.json
```

### 4) 仓库能力（类 Claude Code）

先扫描工作区：

```bash
hc repo scan
```

基于仓库提问：

```bash
hc repo ask "这个项目如何启动？"
```

让模型生成 patch 并应用：

```bash
hc repo edit "为 config 增加严格校验"
hc repo edit "修复一个明显的空指针问题" --yes
```

流程：

1. 生成 unified diff patch（模型输出）
2. 校验可应用
3. 展示变更摘要
4. 二次确认（或 `--yes`）
5. 写入磁盘

### 5) 运行命令（可选）

```bash
hc run "pnpm test"
```

- 默认需要二次确认
- `--yes` 可跳过确认
- 会在终端输出结果，并截取最后若干行供后续上下文使用（当前仅打印）

## 常见问题

### 401 Unauthorized

- 检查环境变量是否覆盖了配置
- 检查 provider 名称是否一致（影响 `HCAI_<PROVIDER>_API_KEY`）

### 超时 / 连接失败

- `api_base_url` 是否可达
- 内网代理/网关是否允许访问
- 默认有超时和重试（网络错误/5xx）

### 模型名不匹配

- `hc models` 查看可用模型
- `/model provider,model` 需要 provider 与 model 均存在

### 流式不工作

- 可用 `--no-stream` 关闭流式
- 某些服务端只返回非 SSE 的 JSON 分块，本项目已做兼容，但仍可能依赖服务端实现

## 测试

```bash
pnpm test
```

覆盖：

- 配置解析与默认路径
- Router.default 解析
- transformer 注入
- patch 应用器