"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformHint = getPlatformHint;
function getPlatformHint() {
    const platform = process.platform;
    if (platform === "win32") {
        return [
            "# Platform Hint (Windows)",
            "你正在 Windows 环境中运行（CMD / PowerShell）。",
            "",
            "当你需要用户执行命令来验证/定位问题时：",
            "1) **优先输出 PowerShell 或 CMD 命令**，不要输出 bash。",
            "2) 命令必须放在 fenced code block 中，并标注语言：```powershell``` 或 ```cmd```。",
            "3) 文本搜索优先用 ripgrep `rg`；若用户没有安装 `rg`，PowerShell 可用 `Select-String` 作为替代。",
            "",
            "示例（PowerShell）：",
            "```powershell",
            "rg -n \"symbol\" .",
            "Select-String -Path .\\**\\*.c -Pattern \"symbol\"",
            "```",
            "",
            "示例（CMD）：",
            "```cmd",
            "cd /d D:\\repo",
            "rg -n \"symbol\" .",
            "```"
        ].join("\n");
    }
    return [
        "# Platform Hint (Linux/macOS)",
        "你正在 Linux/macOS 环境中运行。",
        "",
        "当你需要用户执行命令来验证/定位问题时：",
        "1) 命令请使用 bash，并放在 fenced code block 中：```bash```。",
        "2) 文本搜索优先用 `rg`（ripgrep）；必要时再用 `grep`。",
        "",
        "示例：",
        "```bash",
        "rg -n \"symbol\" .",
        "```"
    ].join("\n");
}
//# sourceMappingURL=platformHint.js.map