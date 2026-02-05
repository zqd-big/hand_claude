export type CommandShell = "powershell" | "cmd" | "bash";

export interface CommandBlock {
  shell: CommandShell;
  rawLanguage: string;
  content: string;
  lines: string[];
}

function normalizeShell(languageRaw: string): CommandShell | null {
  const lang = languageRaw.trim().toLowerCase();
  if (["powershell", "pwsh", "ps", "ps1"].includes(lang)) return "powershell";
  if (["cmd", "bat", "batch"].includes(lang)) return "cmd";
  if (["bash", "sh"].includes(lang)) return "bash";
  return null;
}

function stripPromptPrefix(line: string): string {
  // Only strip very common prompt prefixes. Keep this conservative.
  // - "$ " (but do not strip "$env:" / "$var" etc.)
  if (/^\$\s+/.test(line)) {
    return line.replace(/^\$\s+/, "");
  }

  // - "PS C:\path> "
  if (/^PS [^>]*>\s*/i.test(line)) {
    return line.replace(/^PS [^>]*>\s*/i, "");
  }

  // - "C:\path> "
  if (/^[A-Za-z]:\\[^>]*>\s*/.test(line)) {
    return line.replace(/^[A-Za-z]:\\[^>]*>\s*/, "");
  }

  return line;
}

function cleanBlockContent(content: string): string {
  const rawLines = content.split(/\r?\n/);

  const cleaned: string[] = [];
  for (const raw of rawLines) {
    const line = stripPromptPrefix(raw).replace(/\s+$/, "");
    if (line.trim().length === 0) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

export function extractCommandBlocks(text: string): CommandBlock[] {
  const blocks: CommandBlock[] = [];

  // ```lang\n...\n```
  const re = /```([a-zA-Z0-9_-]+)\s*[\r\n]+([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rawLanguage = match[1] ?? "";
    const rawContent = match[2] ?? "";
    const shell = normalizeShell(rawLanguage);
    if (!shell) continue;

    const content = cleanBlockContent(rawContent);
    if (!content) continue;

    const lines = content.split(/\r?\n/).filter(Boolean);
    blocks.push({ shell, rawLanguage, content, lines });
  }

  return blocks;
}

