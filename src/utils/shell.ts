import { spawn, spawnSync } from "node:child_process";

export function hasCommand(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function execStreaming(
  command: string,
  args: string[],
  cwd: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      const s = String(buf);
      stdout += s;
      onStdout?.(s);
    });

    child.stderr.on("data", (buf) => {
      const s = String(buf);
      stderr += s;
      onStderr?.(s);
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
