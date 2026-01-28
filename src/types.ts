export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: Usage;
  raw?: unknown;
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (result: ChatCompletionResult) => void;
  onError: (err: unknown) => void;
}