import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import type { CommandShell } from "./commandBlocks";

export interface ExecScriptBlockOptions {
  shell: CommandShell;
  script: string;
  cwd: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ExecScriptBlockResult {
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
  scriptPath: string;
}

function hasCommand(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

function buildRunner(shell: CommandShell): {
  command: string;
  args: (scriptPath: string) => string[];
  ext: string;
  normalizeContent: (script: string) => string;
} {
  if (shell === "powershell") {
    const isWin = process.platform === "win32";
    const psCmd = isWin ? "powershell.exe" : hasCommand("pwsh") ? "pwsh" : "";
    if (!psCmd) {
      throw new Error("PowerShell is not available on this platform.");
    }
    return {
      command: psCmd,
      args: (scriptPath) => [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath
      ],
      ext: "ps1",
      normalizeContent: (script) => {
        // Windows PowerShell 5.1 reads UTF-8 reliably when BOM is present.
        const body = script.replace(/\r?\n/g, "\r\n");
        return `\ufeff${body}`;
      }
    };
  }

  if (shell === "cmd") {
    if (process.platform !== "win32") {
      throw new Error("CMD blocks are only supported on Windows.");
    }
    return {
      command: "cmd.exe",
      args: (scriptPath) => ["/d", "/s", "/c", scriptPath],
      ext: "cmd",
      normalizeContent: (script) => script.replace(/\r?\n/g, "\r\n")
    };
  }

  if (shell === "bash") {
    if (process.platform === "win32") {
      throw new Error(
        "bash blocks are not supported on Windows by default. Please output PowerShell/CMD commands instead."
      );
    }

    const cmd = hasCommand("bash") ? "bash" : "sh";
    return {
      command: cmd,
      args: (scriptPath) => [scriptPath],
      ext: "sh",
      normalizeContent: (script) => script.replace(/\r?\n/g, "\n")
    };
  }

  const _exhaustive: never = shell;
  throw new Error(`Unsupported shell: ${_exhaustive}`);
}

export async function execScriptBlock(
  opts: ExecScriptBlockOptions
): Promise<ExecScriptBlockResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const runner = buildRunner(opts.shell);

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "hc-code-"));
  const scriptPath = path.join(
    tmpDir,
    `hc-script-${Date.now()}.${runner.ext}`
  );

  const content = runner.normalizeContent(opts.script);
  await fsp.writeFile(scriptPath, content, "utf8");

  const command = runner.command;
  const args = runner.args(scriptPath);

  return await new Promise<ExecScriptBlockResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      stderr += `\n[hc] command timeout after ${timeoutMs}ms`;
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on("data", (buf) => {
      const s = String(buf);
      stdout += s;
      opts.onStdout?.(s);
    });

    child.stderr.on("data", (buf) => {
      const s = String(buf);
      stderr += s;
      opts.onStderr?.(s);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", async (code) => {
      clearTimeout(timer);
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
      resolve({ code, stdout, stderr, command, args, scriptPath });
    });
  });
}

