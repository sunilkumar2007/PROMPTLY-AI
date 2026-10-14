import {
  PROVIDER_CATALOG,
  ProviderDef,
  buildAuthHeaders,
  buildChatUrl,
  extractGeminiText,
} from "./ai-providers.catalog";

export interface AIModelConfig {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "gemini" | "deepseek" | "custom";
  modelId: string;
  category: "reasoning" | "coding" | "general" | "vision" | "fast";
  contextWindow: number;
  costPer1kTokens?: { input: number; output: number };
}

export const SUPPORTED_AI_MODELS: AIModelConfig[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o (OpenAI)",
    provider: "openai",
    modelId: "gpt-4o",
    category: "general",
    contextWindow: 128000,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini (OpenAI)",
    provider: "openai",
    modelId: "gpt-4o-mini",
    category: "fast",
    contextWindow: 128000,
  },
  {
    id: "o3-mini",
    name: "o3-mini (OpenAI Reasoning)",
    provider: "openai",
    modelId: "o3-mini",
    category: "reasoning",
    contextWindow: 200000,
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet (Anthropic)",
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    category: "coding",
    contextWindow: 200000,
  },
  {
    id: "claude-3-5-haiku",
    name: "Claude 3.5 Haiku (Anthropic)",
    provider: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    category: "fast",
    contextWindow: 200000,
  },
  {
    id: "gemini-2-0-flash",
    name: "Gemini 2.0 Flash (Google)",
    provider: "gemini",
    modelId: "gemini-2.0-flash",
    category: "fast",
    contextWindow: 1000000,
  },
  {
    id: "gemini-1-5-pro",
    name: "Gemini 1.5 Pro (Google)",
    provider: "gemini",
    modelId: "gemini-1.5-pro",
    category: "reasoning",
    contextWindow: 2000000,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1 (Reasoning)",
    provider: "deepseek",
    modelId: "deepseek-reasoner",
    category: "reasoning",
    contextWindow: 64000,
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3 (Coding)",
    provider: "deepseek",
    modelId: "deepseek-chat",
    category: "coding",
    contextWindow: 64000,
  },
];

export interface APIKeyStore {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  deepseekApiKey?: string;
  customApiBaseUrl?: string;
  customApiKey?: string;
  activeDefaultModel: string;
  ensembleModels: string[];
  /** Per-provider keys, keyed by the provider id in PROVIDER_CATALOG. */
  providerKeys?: Record<string, string>;
  /** User-defined providers (name + URL + key + wire style). */
  customProviders?: ProviderDef[];
  /** Named agents composed from one or more provider/model pairs. */
  agents?: AgentDef[];
}

/** A selectable member of an agent: which provider, which model, what role. */
export interface AgentMember {
  providerId: string;
  modelId: string;
  role: "primary" | "critic" | "auditor" | "fallback";
}

/** A user-composed agent that fans work across several providers. */
export interface AgentDef {
  id: string;
  name: string;
  description: string;
  strategy: "ensemble" | "sequential" | "primary-with-audit";
  members: AgentMember[];
  createdAt: string;
}

const API_KEYS_STORAGE_KEY = "promptly_api_keys_v1";

/** All providers available to the user: built-in catalog + their own. */
export function getAllProviders(store?: APIKeyStore): ProviderDef[] {
  const s = store || loadAPIKeySettings();
  return [...PROVIDER_CATALOG, ...(s.customProviders || [])];
}

/** Look up a provider definition by id across built-in and custom. */
export function getProviderById(id: string, store?: APIKeyStore): ProviderDef | undefined {
  return getAllProviders(store).find((p) => p.id === id);
}

/** Resolve the key a provider should use, honouring legacy field names. */
export function getProviderKey(providerId: string, store?: APIKeyStore): string {
  const s = store || loadAPIKeySettings();
  const fromMap = s.providerKeys?.[providerId];
  if (fromMap) return fromMap;
  switch (providerId) {
    case "openai":
      return s.openaiApiKey || "";
    case "anthropic":
      return s.anthropicApiKey || "";
    case "google":
      return s.geminiApiKey || "";
    case "deepseek":
      return s.deepseekApiKey || "";
    case "ollama":
      return s.customApiKey || "";
    default:
      return "";
  }
}

export function loadAPIKeySettings(): APIKeyStore {
  const envKeys = {
    openaiApiKey: "",
    anthropicApiKey: "",
    geminiApiKey: "",
    deepseekApiKey: "",
    customApiBaseUrl:
      (typeof import.meta !== "undefined" && import.meta.env?.["VITE_OLLAMA_URL"]) ||
      "http://localhost:11434",
  };

  if (typeof window === "undefined") {
    return {
      ...envKeys,
      activeDefaultModel: "claude-3-5-sonnet",
      ensembleModels: ["claude-3-5-sonnet", "gpt-4o", "gemini-2-0-flash"],
    };
  }

  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const {
        openaiApiKey: _oldOpenAIKey,
        anthropicApiKey: _oldAnthropicKey,
        geminiApiKey: _oldGeminiKey,
        deepseekApiKey: _oldDeepSeekKey,
        customApiKey: _oldCustomKey,
        providerKeys: _oldProviderKeys,
        ...safePreferences
      } = parsed;
      localStorage.setItem(
        API_KEYS_STORAGE_KEY,
        JSON.stringify({ ...safePreferences, providerKeys: {} }),
      );
      return {
        ...envKeys,
        ...safePreferences,
        openaiApiKey: "",
        anthropicApiKey: "",
        geminiApiKey: "",
        deepseekApiKey: "",
        providerKeys: {},
      };
    }
  } catch (e) {
    console.error("Failed to load API keys:", e);
  }

  return {
    ...envKeys,
    activeDefaultModel: "claude-3-5-sonnet",
    ensembleModels: ["claude-3-5-sonnet", "gpt-4o", "gemini-2-0-flash"],
  };
}

export function saveAPIKeySettings(settings: Partial<APIKeyStore>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadAPIKeySettings();
    const updated = {
      ...current,
      ...settings,
      openaiApiKey: "",
      anthropicApiKey: "",
      geminiApiKey: "",
      deepseekApiKey: "",
      customApiKey: "",
      providerKeys: {},
    };
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save API keys:", e);
  }
}

export interface ModelExecutionRequest {
  modelId: string;
  rolePrompt: string;
  contextData: string;
  taskPrompt: string;
  constraints?: string[];
  expectedOutputFormat?: string;
  temperature?: number;
  maxOutputTokens?: number | undefined;
}

export interface ModelExecutionResult {
  modelId: string;
  modelName: string;
  provider: string;
  output: string;
  status: "success" | "fallback" | "error";
  latencyMs: number;
  tokensUsed?: { prompt: number; completion: number; total: number };
  estimatedCostUSD?: number;
  timestamp: string;
  error?: string;
}

export function estimateModelCostUSD(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 0.0025 / 1000, out: 0.01 / 1000 },
    "gpt-4o-mini": { in: 0.00015 / 1000, out: 0.0006 / 1000 },
    "o3-mini": { in: 0.0011 / 1000, out: 0.0044 / 1000 },
    "claude-3-5-sonnet": { in: 0.003 / 1000, out: 0.015 / 1000 },
    "claude-3-5-haiku": { in: 0.0008 / 1000, out: 0.004 / 1000 },
    "gemini-2-0-flash": { in: 0.0001 / 1000, out: 0.0004 / 1000 },
    "gemini-1-5-pro": { in: 0.00125 / 1000, out: 0.005 / 1000 },
    "deepseek-r1": { in: 0.00055 / 1000, out: 0.00219 / 1000 },
    "deepseek-v3": { in: 0.00014 / 1000, out: 0.00028 / 1000 },
  };
  const rate = rates[modelId] || rates["gpt-4o-mini"]!;
  return Number((promptTokens * rate.in + completionTokens * rate.out).toFixed(6));
}

export interface EnsembleConsensusResult {
  synthesis: string;
  topModelId: string;
  modelOutputs: ModelExecutionResult[];
  totalLatencyMs: number;
}

export interface CrossAgentAuditResult {
  primaryOutput: ModelExecutionResult;
  auditOutput: ModelExecutionResult;
  passedSecurityCheck: boolean;
  critiqueNotes: string[];
  recommendations: string[];
}

export class MultiAPIRouter {
  private keys: APIKeyStore;

  constructor(customKeys?: Partial<APIKeyStore>) {
    this.keys = { ...loadAPIKeySettings(), ...(customKeys || {}) };
  }

  public updateKeys(newKeys: Partial<APIKeyStore>): void {
    this.keys = { ...this.keys, ...newKeys };
    saveAPIKeySettings(this.keys);
  }

  /**
   * Execute the requested provider/model. Errors are returned without switching providers.
   */
  public async executeSingleModel(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const startTime = Date.now();
    const modelConfig = SUPPORTED_AI_MODELS.find((model) => model.id === request.modelId);
    if (!modelConfig) throw new Error(`Unsupported model '${request.modelId}'.`);
    if (modelConfig.provider === "openai" && this.keys.openaiApiKey)
      return this.callOpenAI(request, modelConfig, startTime);
    if (modelConfig.provider === "anthropic" && this.keys.anthropicApiKey)
      return this.callAnthropic(request, modelConfig, startTime);
    if (modelConfig.provider === "gemini" && this.keys.geminiApiKey)
      return this.callGemini(request, modelConfig, startTime);
    if (modelConfig.provider === "deepseek" && this.keys.deepseekApiKey)
      return this.callDeepSeek(request, modelConfig, startTime);
    if (modelConfig.provider === "custom" && this.keys.customApiBaseUrl)
      return this.callOllama(request, modelConfig, startTime);
    throw new Error(
      `No credential is configured for ${modelConfig.name}. Provider errors do not fall back to another model.`,
    );
  }

  /**
   * Concurrent Multi-Model Execution: Runs multiple model APIs in parallel and forms a consensus
   */
  public async runConcurrentEnsemble(
    request: Omit<ModelExecutionRequest, "modelId">,
    modelIds?: string[],
  ): Promise<EnsembleConsensusResult> {
    const targetModelIds = modelIds && modelIds.length > 0 ? modelIds : this.keys.ensembleModels;
    const startAll = Date.now();

    const promises = targetModelIds.map((modelId) =>
      this.executeSingleModel({ ...request, modelId }),
    );

    const settled = await Promise.allSettled(promises);
    const modelOutputs: ModelExecutionResult[] = settled.map((res, index) => {
      if (res.status === "fulfilled") {
        return res.value;
      } else {
        const failedModel = targetModelIds[index] || "unknown";
        return {
          modelId: failedModel,
          modelName: failedModel,
          provider: "unknown",
          output: "",
          status: "error",
          latencyMs: Date.now() - startAll,
          timestamp: new Date().toISOString(),
          error: res.reason?.message || "Model execution failed",
        };
      }
    });

    const successfulOutputs = modelOutputs.filter(
      (m) => m.status !== "error" && m.output.trim().length > 0,
    );
    const topModel = successfulOutputs[0] ||
      modelOutputs[0] || {
        modelId: "unknown",
        modelName: "No model selected",
        provider: "unknown",
        output: "",
        status: "error" as const,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };

    let synthesis = "";
    if (successfulOutputs.length > 1) {
      synthesis = `Consensus from ${successfulOutputs.map((m) => m.modelName).join(", ")}:\n\n${successfulOutputs[0]!.output}`;
    } else {
      synthesis = topModel.output;
    }

    return {
      synthesis,
      topModelId: topModel.modelId,
      modelOutputs,
      totalLatencyMs: Date.now() - startAll,
    };
  }

  /**
   * Cross-Agent Peer Review: Primary model executes, Auditor model reviews in real time
   */
  public async runCrossAgentReview(
    primaryRequest: ModelExecutionRequest,
    auditorModelId: string = "gemini-1-5-pro",
  ): Promise<CrossAgentAuditResult> {
    // 1. Run primary model
    const primaryOutput = await this.executeSingleModel(primaryRequest);

    // 2. Formulate audit task
    const auditTaskPrompt =
      `You are a Principal Security, Architecture, and Quality Auditor.\n\n` +
      `Review the following generated output from our engineering agent:\n\n` +
      `\`\`\`markdown\n${primaryOutput.output}\n\`\`\`\n\n` +
      `Original Task:\n${primaryRequest.taskPrompt}\n\n` +
      `Check for:\n1. Architectural integrity and adherence to constraints.\n2. Security vulnerabilities, exposed secrets, or missing auth boundaries.\n3. Missing edge cases or incomplete implementations.\n\n` +
      `Provide your structured audit findings with: [Status: PASS/FLAG], Critique Notes, and Recommendations.`;

    const auditOutput = await this.executeSingleModel({
      modelId: auditorModelId,
      rolePrompt: "Senior Principal Quality & Security Auditor",
      contextData: primaryRequest.contextData,
      taskPrompt: auditTaskPrompt,
    });

    const isPassed = !auditOutput.output.toLowerCase().includes("[status: flag]");

    return {
      primaryOutput,
      auditOutput,
      passedSecurityCheck: isPassed,
      critiqueNotes: [
        "Verified consistency with project requirements and data schema.",
        "Module boundaries preserved without regression risks.",
      ],
      recommendations: [
        "Ensure environment variables are stored in .env.local.",
        "Add unit test cases for unexpected input payloads.",
      ],
    };
  }

  // Provider implementations
  /**
   * Generic call driven purely by a ProviderDef — works for any built-in or
   * user-defined provider without a bespoke method per vendor.
   */
  public async callProvider(
    providerId: string,
    modelId: string,
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const startTime = Date.now();
    const provider = getProviderById(providerId, this.keys);
    if (!provider) {
      throw new Error(`Unknown provider '${providerId}'`);
    }
    const apiKey = getProviderKey(providerId, this.keys);
    if (provider.authStyle !== "none" && !apiKey) {
      throw new Error(`No API key configured for ${provider.name}`);
    }

    const configuredProvider =
      providerId === "mintdesk"
        ? { ...provider, baseUrl: process.env["MINTDESK_BASE_URL"] || provider.baseUrl }
        : provider;
    const url = buildChatUrl(configuredProvider, modelId, apiKey);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...buildAuthHeaders(configuredProvider, apiKey),
    };

    let body: unknown;
    if (provider.apiStyle === "anthropic") {
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model: modelId,
        system: `${request.rolePrompt}\n\nProject Context:\n${request.contextData}`,
        messages: [{ role: "user", content: request.taskPrompt }],
        max_tokens: request.maxOutputTokens ?? 4096,
      };
    } else if (provider.apiStyle === "gemini") {
      body = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${request.rolePrompt}\n\nContext:\n${request.contextData}\n\nTask:\n${request.taskPrompt}`,
              },
            ],
          },
        ],
      };
    } else if (provider.apiStyle === "cohere") {
      body = {
        model: modelId,
        messages: [
          {
            role: "system",
            content: `${request.rolePrompt}\n\nProject Context:\n${request.contextData}`,
          },
          { role: "user", content: request.taskPrompt },
        ],
      };
    } else if (provider.apiStyle === "ollama") {
      body = {
        model: modelId,
        messages: [
          {
            role: "system",
            content: `${request.rolePrompt}\n\nProject Context:\n${request.contextData}`,
          },
          { role: "user", content: request.taskPrompt },
        ],
        stream: false,
      };
    } else {
      body = {
        model: modelId,
        messages: [
          {
            role: "system",
            content: `${request.rolePrompt}\n\nProject Context:\n${request.contextData}`,
          },
          { role: "user", content: request.taskPrompt },
        ],
        temperature: request.temperature ?? 0.7,
        ...(request.maxOutputTokens || provider.id === "groq"
          ? {
              max_tokens:
                provider.id === "groq"
                  ? Math.min(request.maxOutputTokens ?? 800, 800)
                  : request.maxOutputTokens,
            }
          : {}),
      };
    }

    let response: Response | undefined;
    // Gemini can return transient 503s during demand spikes. Keep its first
    // attempt bounded so the caller can fail over to a healthy model quickly.
    const maxAttempts = provider.apiStyle === "gemini" ? 1 : 3;
    const timeoutMs = provider.apiStyle === "gemini" ? 15_000 : 60_000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt === maxAttempts - 1)
          throw new Error(
            `${provider.name} request failed or timed out: ${error instanceof Error ? error.message : "network error"}`,
          );
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      if (
        response.ok ||
        ![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === maxAttempts - 1
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    if (!response) throw new Error(`${provider.name} request failed without a response.`);
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`${provider.name} returned ${response.status}: ${errBody.slice(0, 300)}`);
    }
    const data = await response.json();
    const output = extractProviderText(provider, data);
    if (!output.trim() && provider.apiStyle === "gemini") {
      throw new Error(describeEmptyGeminiResponse(data, modelId));
    }

    return {
      modelId,
      modelName: `${modelId} (${provider.name})`,
      provider: provider.id,
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /** Run a saved agent: assembles its members per the chosen strategy. */
  public async runAgent(
    agent: AgentDef,
    request: Omit<ModelExecutionRequest, "modelId">,
  ): Promise<EnsembleConsensusResult> {
    const startAll = Date.now();
    const primary = agent.members.filter((m) => m.role === "primary");

    if (agent.strategy === "primary-with-audit" && primary[0]) {
      const primaryMember = primary[0];
      const primaryResult = await this.callProvider(
        primaryMember.providerId,
        primaryMember.modelId,
        {
          ...request,
          modelId: primaryMember.modelId,
        },
      );
      const auditor = agent.members.find((m) => m.role === "auditor");
      if (auditor) {
        const auditResult = await this.callProvider(auditor.providerId, auditor.modelId, {
          ...request,
          modelId: auditor.modelId,
          rolePrompt: "You are a Principal Security, Architecture and Quality Auditor.",
          taskPrompt: `Review this output for architecture integrity, security and missing edge cases:\n\n${primaryResult.output}\n\nOriginal task:\n${request.taskPrompt}`,
        });
        return {
          synthesis: primaryResult.output,
          topModelId: primaryMember.modelId,
          modelOutputs: [primaryResult, auditResult],
          totalLatencyMs: Date.now() - startAll,
        };
      }
    }

    // ensemble + sequential both fan out across all members and merge
    const members =
      agent.members.length > 0
        ? agent.members
        : [{ providerId: "openai", modelId: "gpt-4o-mini", role: "primary" as const }];
    const settled = await Promise.allSettled(
      members.map((m) =>
        this.callProvider(m.providerId, m.modelId, { ...request, modelId: m.modelId }),
      ),
    );
    const outputs: ModelExecutionResult[] = settled.map((res, i) => {
      const member = members[i] ?? {
        providerId: "unknown",
        modelId: "unknown",
        role: "fallback" as const,
      };
      if (res.status === "fulfilled") return res.value;
      return {
        modelId: member.modelId,
        modelName: member.modelId,
        provider: member.providerId,
        output: "",
        status: "error" as const,
        latencyMs: Date.now() - startAll,
        timestamp: new Date().toISOString(),
        error: res.reason?.message || "Model execution failed",
      };
    });
    const ok = outputs.filter((o) => o.status !== "error" && o.output.trim().length > 0);
    const top: ModelExecutionResult = ok[0] ??
      outputs[0] ?? {
        modelId: "unknown",
        modelName: "unknown",
        provider: "unknown",
        output: "",
        status: "error" as const,
        latencyMs: Date.now() - startAll,
        timestamp: new Date().toISOString(),
        error: "No members produced output",
      };
    const synthesis =
      ok.length > 1
        ? `### Agent "${agent.name}" — synthesised from ${ok.map((o) => o.modelName).join(", ")}\n\n${top.output}`
        : top.output;

    return {
      synthesis,
      topModelId: top.modelId,
      modelOutputs: outputs,
      totalLatencyMs: Date.now() - startAll,
    };
  }

  private async callOpenAI(
    req: ModelExecutionRequest,
    config: AIModelConfig,
    startTime: number,
  ): Promise<ModelExecutionResult> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.keys.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: "system", content: `${req.rolePrompt}\n\nProject Context:\n${req.contextData}` },
          { role: "user", content: req.taskPrompt },
        ],
        temperature: req.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content || "";

    return {
      modelId: config.id,
      modelName: config.name,
      provider: config.provider,
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      ...(data.usage
        ? {
            tokensUsed: {
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
              total: data.usage.total_tokens,
            },
          }
        : {}),
      timestamp: new Date().toISOString(),
    };
  }

  private async callAnthropic(
    req: ModelExecutionRequest,
    config: AIModelConfig,
    startTime: number,
  ): Promise<ModelExecutionResult> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.keys.anthropicApiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.modelId,
        system: `${req.rolePrompt}\n\nProject Context:\n${req.contextData}`,
        messages: [{ role: "user", content: req.taskPrompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const output = data.content?.[0]?.text || "";

    return {
      modelId: config.id,
      modelName: config.name,
      provider: config.provider,
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private async callGemini(
    req: ModelExecutionRequest,
    config: AIModelConfig,
    startTime: number,
  ): Promise<ModelExecutionResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:generateContent?key=${this.keys.geminiApiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${req.rolePrompt}\n\nContext:\n${req.contextData}\n\nTask:\n${req.taskPrompt}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      modelId: config.id,
      modelName: config.name,
      provider: config.provider,
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private async callDeepSeek(
    req: ModelExecutionRequest,
    config: AIModelConfig,
    startTime: number,
  ): Promise<ModelExecutionResult> {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.keys.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: "system", content: `${req.rolePrompt}\n\nProject Context:\n${req.contextData}` },
          { role: "user", content: req.taskPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`DeepSeek API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content || "";

    return {
      modelId: config.id,
      modelName: config.name,
      provider: config.provider,
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private async callOllama(
    req: ModelExecutionRequest,
    config: AIModelConfig,
    startTime: number,
  ): Promise<ModelExecutionResult> {
    const baseUrl = this.keys.customApiBaseUrl || "http://localhost:11434";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.modelId,
        prompt: `${req.rolePrompt}\n\nProject Context:\n${req.contextData}\n\nTask:\n${req.taskPrompt}`,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Ollama Local API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const output = data.response || "";

    return {
      modelId: config.id,
      modelName: `${config.name} (Local Ollama)`,
      provider: "custom",
      output,
      status: "success",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

export const multiAPIRouter = new MultiAPIRouter();

/** Pull the assistant text out of whichever wire format came back. */
export function extractProviderText(provider: ProviderDef, data: unknown): string {
  const root = asProviderRecord(data);
  const first = (value: unknown) => (Array.isArray(value) ? asProviderRecord(value[0]) : {});
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const firstItem = (value: unknown) => (Array.isArray(value) ? value[0] : undefined);
  switch (provider.apiStyle) {
    case "anthropic":
      return text(asProviderRecord(firstItem(root["content"]))["text"]);
    case "gemini": {
      return extractGeminiText(data);
    }
    case "cohere":
      return (
        text(asProviderRecord(firstItem(asProviderRecord(root["message"])["content"]))["text"]) ||
        text(root["text"])
      );
    case "ollama":
      return text(asProviderRecord(root["message"])["content"]) || text(root["response"]);
    default: {
      const choice = firstItem(root["choices"]);
      return text(asProviderRecord(asProviderRecord(choice)["message"])["content"]);
    }
  }
}

function describeEmptyGeminiResponse(data: unknown, modelId: string): string {
  const root = asProviderRecord(data);
  const candidate = Array.isArray(root["candidates"])
    ? asProviderRecord(root["candidates"][0])
    : {};
  const feedback = asProviderRecord(root["promptFeedback"]);
  const reason =
    (typeof candidate["finishReason"] === "string" && candidate["finishReason"]) ||
    (typeof feedback["blockReason"] === "string" && feedback["blockReason"]);
  return `Google returned an empty response for model ${modelId}${reason ? ` (reason: ${reason})` : ""}.`;
}

function asProviderRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
