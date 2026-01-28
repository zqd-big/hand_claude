import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true });
}

export async function readJsonFile<T>(p: string): Promise<T> {
  const raw = await fsp.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(p: string, value: unknown): Promise<void> {
  const dir = path.dirname(p);
  await ensureDir(dir);
  await fsp.writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

export async function readTextFile(p: string): Promise<string> {
  return fsp.readFile(p, "utf8");
}

export async function writeTextFile(p: string, content: string): Promise<void> {
  const dir = path.dirname(p);
  await ensureDir(dir);
  await fsp.writeFile(p, content, "utf8");
}