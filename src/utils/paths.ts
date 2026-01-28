import os from "node:os";
import path from "node:path";

export function expandHome(inputPath: string): string {
  if (!inputPath.startsWith("~")) {
    return inputPath;
  }
  const home = os.homedir();
  return path.join(home, inputPath.slice(1));
}

export function resolveConfigPath(explicit?: string): string[] {
  if (explicit) {
    return [expandHome(explicit)];
  }
  return [
    path.resolve(process.cwd(), "hcai.config.json"),
    path.join(os.homedir(), ".hcai", "config.json")
  ];
}

export function hcaiDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hcai");
}

export function sessionsDir(cwd: string = process.cwd()): string {
  return path.join(hcaiDir(cwd), "sessions");
}

export function indexFile(cwd: string = process.cwd()): string {
  return path.join(hcaiDir(cwd), "index.json");
}

export function hcaiIgnoreFile(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hcaiignore");
}