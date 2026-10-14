/**
 * Real-world AI provider catalog.
 *
 * Every entry carries the actual API base URL, the authentication style that
 * provider expects, and a starter list of model ids. The lists are editable —
 * they seed the UI, they are not a hard allow-list.
 */

export type AuthStyle = "bearer" | "x-api-key" | "query-key" | "none";

/** Wire format the endpoint speaks. Drives how a request is built and parsed. */
export type ApiStyle = "openai" | "anthropic" | "gemini" | "cohere" | "ollama";

export interface ProviderModel {
  /** Model id sent on the wire. */
  id: string;
  /** Human label shown in the UI. */
  label: string;
  category: "reasoning" | "coding" | "general" | "vision" | "fast";
}

export interface ProviderDef {
  id: string;
  name: string;
  /** Base URL, no trailing slash. */
  baseUrl: string;
  authStyle: AuthStyle;
  apiStyle: ApiStyle;
  /** Placeholder shown in the key field, hinting the expected prefix. */
  keyPlaceholder: string;
  /** Docs link, surfaced in the UI so the user can verify. */
  docsUrl: string;
  models: ProviderModel[];
  /** True for user-defined providers persisted to storage. */
  custom?: boolean;
}

export const PROVIDER_CATALOG: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    models: [
      { id: "gpt-4o", label: "GPT-4o", category: "general" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", category: "fast" },
      { id: "o3-mini", label: "o3-mini", category: "reasoning" },
      { id: "o1", label: "o1", category: "reasoning" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authStyle: "x-api-key",
    apiStyle: "anthropic",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", category: "coding" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", category: "coding" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", category: "fast" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", category: "reasoning" },
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authStyle: "query-key",
    apiStyle: "gemini",
    keyPlaceholder: "AIzaSy...",
    docsUrl: "https://ai.google.dev/api/generate-content",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", category: "fast" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", category: "reasoning" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", category: "fast" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "sk-...",
    docsUrl: "https://api-docs.deepseek.com",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3", category: "coding" },
      { id: "deepseek-reasoner", label: "DeepSeek R1", category: "reasoning" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "gsk_...",
    docsUrl: "https://console.groq.com/docs/api-reference",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", category: "general" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", category: "fast" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", category: "general" },
    ],
  },
  {
    id: "mintdesk",
    name: "MintDesk",
    baseUrl: "https://mintdesk.tech/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "Server key configured",
    docsUrl: "https://mintdesk.tech/v1",
    models: [
      { id: "sonnet-5.5", label: "Sonnet 5.5", category: "coding" },
      { id: "opus-5.5", label: "Opus 5.5", category: "reasoning" },
      { id: "haiku-4.5", label: "Haiku 4.5", category: "fast" },
      { id: "codex", label: "Codex", category: "coding" },
      { id: "gpt-4o", label: "GPT-4o", category: "general" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "...",
    docsUrl: "https://docs.mistral.ai/api",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large", category: "general" },
      { id: "mistral-small-latest", label: "Mistral Small", category: "fast" },
      { id: "codestral-latest", label: "Codestral", category: "coding" },
    ],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "xai-...",
    docsUrl: "https://docs.x.ai/docs/api-reference",
    models: [
      { id: "grok-2-latest", label: "Grok 2", category: "general" },
      { id: "grok-2-vision-latest", label: "Grok 2 Vision", category: "vision" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/docs",
    models: [
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", category: "coding" },
      { id: "openai/gpt-4o", label: "GPT-4o", category: "general" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", category: "general" },
      { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5", category: "fast" },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "...",
    docsUrl: "https://docs.together.ai/reference",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        label: "Llama 3.3 70B Turbo",
        category: "general",
      },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B", category: "general" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1", category: "reasoning" },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "fw_...",
    docsUrl: "https://docs.fireworks.ai/api-reference",
    models: [
      {
        id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        label: "Llama 3.3 70B",
        category: "general",
      },
      { id: "accounts/fireworks/models/deepseek-v3", label: "DeepSeek V3", category: "coding" },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "pplx-...",
    docsUrl: "https://docs.perplexity.ai/api-reference",
    models: [
      { id: "sonar-pro", label: "Sonar Pro", category: "general" },
      { id: "sonar", label: "Sonar", category: "fast" },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    baseUrl: "https://api.moonshot.cn/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.moonshot.cn/docs/api",
    models: [
      { id: "moonshot-v1-128k", label: "Moonshot 128k", category: "general" },
      { id: "moonshot-v1-32k", label: "Moonshot 32k", category: "general" },
    ],
  },
  {
    id: "zhipu",
    name: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "...",
    docsUrl: "https://open.bigmodel.cn/dev/api",
    models: [
      { id: "glm-4-plus", label: "GLM-4 Plus", category: "general" },
      { id: "glm-4-flash", label: "GLM-4 Flash", category: "fast" },
    ],
  },
  {
    id: "qwen",
    name: "Alibaba Qwen",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    authStyle: "bearer",
    apiStyle: "openai",
    keyPlaceholder: "sk-...",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio",
    models: [
      { id: "qwen-max", label: "Qwen Max", category: "general" },
      { id: "qwen-plus", label: "Qwen Plus", category: "general" },
      { id: "qwen-turbo", label: "Qwen Turbo", category: "fast" },
    ],
  },
  {
    id: "cohere",
    name: "Cohere",
    baseUrl: "https://api.cohere.com/v2",
    authStyle: "bearer",
    apiStyle: "cohere",
    keyPlaceholder: "...",
    docsUrl: "https://docs.cohere.com/reference/chat",
    models: [
      { id: "command-r-plus", label: "Command R+", category: "general" },
      { id: "command-r", label: "Command R", category: "fast" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: "http://localhost:11434",
    authStyle: "none",
    apiStyle: "ollama",
    keyPlaceholder: "no key needed",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    models: [
      { id: "llama3.2", label: "Llama 3.2", category: "general" },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder", category: "coding" },
      { id: "deepseek-r1", label: "DeepSeek R1", category: "reasoning" },
    ],
  },
];

/** Auth header/patch a request needs, derived from the provider definition. */
export function buildAuthHeaders(provider: ProviderDef, apiKey: string): Record<string, string> {
  switch (provider.authStyle) {
    case "bearer":
      return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    case "x-api-key":
      return apiKey ? { "x-api-key": apiKey } : {};
    default:
      return {};
  }
}

/** Full URL for a chat completion, handling the per-provider path differences. */
export function buildChatUrl(provider: ProviderDef, modelId: string, apiKey: string): string {
  const base = provider.baseUrl.replace(/\/$/, "");
  switch (provider.apiStyle) {
    case "anthropic":
      return `${base}/messages`;
    case "gemini":
      return `${base}/models/${modelId}:generateContent${apiKey ? `?key=${apiKey}` : ""}`;
    case "cohere":
      return `${base}/chat`;
    case "ollama":
      return `${base}/api/chat`;
    default:
      return `${base}/chat/completions`;
  }
}

/** Join all text segments in the first Gemini candidate, preserving their order. */
export function extractGeminiText(data: unknown): string {
  const root = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const candidates = root["candidates"];
  const candidate = Array.isArray(candidates) && candidates[0] && typeof candidates[0] === "object"
    ? (candidates[0] as Record<string, unknown>)
    : {};
  const content = candidate["content"];
  const parts = content && typeof content === "object"
    ? (content as Record<string, unknown>)["parts"]
    : undefined;
  return Array.isArray(parts)
    ? parts
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const value = (part as Record<string, unknown>)["text"];
          return typeof value === "string" ? value : "";
        })
        .filter(Boolean)
        .join("\n")
    : "";
}
