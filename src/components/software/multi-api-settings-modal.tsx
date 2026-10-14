import React, { useState, useEffect } from "react";
import {
  Key,
  Shield,
  Sparkles,
  Check,
  X,
  Cpu,
  Plus,
  Trash2,
  Link2,
  Server,
  Bot,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import {
  loadAPIKeySettings,
  saveAPIKeySettings,
  APIKeyStore,
  AgentDef,
  AgentMember,
  getAllProviders,
} from "@/lib/multi-api-router";
import type { ProviderDef, AuthStyle, ApiStyle } from "@/lib/ai-providers.catalog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MultiAPISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "providers" | "custom" | "agents";

const AUTH_STYLES: { value: AuthStyle; label: string; hint: string }[] = [
  { value: "bearer", label: "Bearer token", hint: "Authorization: Bearer <key>" },
  { value: "x-api-key", label: "x-api-key header", hint: "x-api-key: <key>" },
  { value: "query-key", label: "Query parameter", hint: "?key=<key>" },
  { value: "none", label: "No auth", hint: "Local / open endpoints" },
];

const API_STYLES: { value: ApiStyle; label: string }[] = [
  { value: "openai", label: "OpenAI-compatible (/chat/completions)" },
  { value: "anthropic", label: "Anthropic (/messages)" },
  { value: "gemini", label: "Google Gemini (:generateContent)" },
  { value: "cohere", label: "Cohere (/chat)" },
  { value: "ollama", label: "Ollama (/api/chat)" },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `provider-${Date.now()}`;

export const MultiAPISettingsModal: React.FC<MultiAPISettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [settings, setSettings] = useState<APIKeyStore>(loadAPIKeySettings());
  const [activeTab, setActiveTab] = useState<Tab>("providers");

  // custom provider draft
  const [draft, setDraft] = useState<{
    name: string;
    baseUrl: string;
    apiKey: string;
    authStyle: AuthStyle;
    apiStyle: ApiStyle;
    models: string;
  }>({
    name: "",
    baseUrl: "",
    apiKey: "",
    authStyle: "bearer",
    apiStyle: "openai",
    models: "",
  });

  // agent draft
  const [agentDraft, setAgentDraft] = useState<{
    name: string;
    description: string;
    strategy: AgentDef["strategy"];
  }>({
    name: "",
    description: "",
    strategy: "ensemble",
  });
  const [agentMembers, setAgentMembers] = useState<AgentMember[]>([]);
  const [memberProvider, setMemberProvider] = useState("");
  const [memberModel, setMemberModel] = useState("");
  const [memberRole, setMemberRole] = useState<AgentMember["role"]>("primary");

  useEffect(() => {
    if (isOpen) setSettings(loadAPIKeySettings());
  }, [isOpen]);

  if (!isOpen) return null;

  const providers = getAllProviders(settings);
  const agents = settings.agents || [];
  const customProviders = settings.customProviders || [];

  const handleSave = () => {
    saveAPIKeySettings(settings);
    toast.success("Agent preferences saved. Configure provider secrets in the server environment.");
    onClose();
  };

  const addCustomProvider = () => {
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      toast.error("Provider name and base URL are required.");
      return;
    }
    const id = slug(draft.name);
    if (providers.some((p) => p.id === id)) {
      toast.error("A provider with that name already exists.");
      return;
    }
    const models = draft.models
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((m) => ({ id: m, label: m, category: "general" as const }));

    const provider: ProviderDef = {
      id,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/$/, ""),
      authStyle: draft.authStyle,
      apiStyle: draft.apiStyle,
      keyPlaceholder: draft.authStyle === "none" ? "no key needed" : "API key",
      docsUrl: "",
      models: models.length ? models : [{ id: "default", label: "default", category: "general" }],
      custom: true,
    };

    setSettings((s) => ({
      ...s,
      customProviders: [...(s.customProviders || []), provider],
    }));
    setDraft({
      name: "",
      baseUrl: "",
      apiKey: "",
      authStyle: "bearer",
      apiStyle: "openai",
      models: "",
    });
    toast.success(`Added provider "${provider.name}"`);
  };

  const removeCustomProvider = (id: string) => {
    setSettings((s) => ({
      ...s,
      customProviders: (s.customProviders || []).filter((p) => p.id !== id),
    }));
  };

  const addAgentMember = () => {
    if (!memberProvider || !memberModel) {
      toast.error("Pick a provider and model first.");
      return;
    }
    setAgentMembers((m) => [
      ...m,
      { providerId: memberProvider, modelId: memberModel, role: memberRole },
    ]);
    setMemberModel("");
  };

  const saveAgent = () => {
    if (!agentDraft.name.trim()) {
      toast.error("Give the agent a name.");
      return;
    }
    if (agentMembers.length === 0) {
      toast.error("Add at least one model to the agent.");
      return;
    }
    const agent: AgentDef = {
      id: `agent-${Date.now()}`,
      name: agentDraft.name.trim(),
      description: agentDraft.description.trim(),
      strategy: agentDraft.strategy,
      members: agentMembers,
      createdAt: new Date().toISOString(),
    };
    setSettings((s) => ({ ...s, agents: [...(s.agents || []), agent] }));
    setAgentDraft({ name: "", description: "", strategy: "ensemble" });
    setAgentMembers([]);
    toast.success(`Agent "${agent.name}" created`);
  };

  const removeAgent = (id: string) => {
    setSettings((s) => ({ ...s, agents: (s.agents || []).filter((a) => a.id !== id) }));
  };

  const selectedProviderForMember = providers.find((p) => p.id === memberProvider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-sora text-lg font-semibold tracking-tight text-neutral-900">
                Providers &amp; agents
              </h3>
              <p className="text-[12px] text-neutral-500">
                Connect any AI API, then compose them into agents.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-100 px-6 pt-3">
          {(
            [
              { id: "providers", label: "Providers", icon: Key },
              { id: "custom", label: "Add provider", icon: Plus },
              { id: "agents", label: "Agents", icon: Bot },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors",
                activeTab === t.id
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-[12px] text-neutral-600">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-500" />
            <span>
              Provider secrets stay on the server. Configure OPENAI_API_KEY, ANTHROPIC_API_KEY,
              GEMINI_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY in the server environment. Gemini
              can fail over to Groq when Google is temporarily unavailable. Custom endpoints and
              ensembles are not connected to this workflow yet.
            </span>
          </div>

          {/* ---------------- PROVIDERS ---------------- */}
          {activeTab === "providers" && (
            <div className="space-y-3">
              {providers.map((p) => {
                return (
                  <div key={p.id} className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] font-semibold text-neutral-900">{p.name}</span>
                        {p.custom && (
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                            custom
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.docsUrl && (
                          <a
                            href={p.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900"
                          >
                            Docs
                          </a>
                        )}
                        {p.custom && (
                          <button
                            onClick={() => removeCustomProvider(p.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Link2 className="h-3 w-3" /> {p.baseUrl}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Server className="h-3 w-3" /> {p.authStyle}
                      </span>
                      <span>
                        {p.models.length} model{p.models.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---------------- ADD PROVIDER ---------------- */}
          {activeTab === "custom" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                    Provider name *
                  </span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. My vLLM server"
                    className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                  Base URL *
                </span>
                <input
                  value={draft.baseUrl}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="h-10 w-full rounded-lg border border-neutral-200 px-3 font-mono text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                    Authentication
                  </span>
                  <div className="relative">
                    <select
                      value={draft.authStyle}
                      onChange={(e) =>
                        setDraft({ ...draft, authStyle: e.target.value as AuthStyle })
                      }
                      className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-9 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-900"
                    >
                      {AUTH_STYLES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-neutral-400">
                    {AUTH_STYLES.find((a) => a.value === draft.authStyle)?.hint}
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                    API format
                  </span>
                  <div className="relative">
                    <select
                      value={draft.apiStyle}
                      onChange={(e) => setDraft({ ...draft, apiStyle: e.target.value as ApiStyle })}
                      className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-9 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-900"
                    >
                      {API_STYLES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-neutral-400">
                    How requests are shaped and responses parsed.
                  </span>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                  Models
                </span>
                <input
                  value={draft.models}
                  onChange={(e) => setDraft({ ...draft, models: e.target.value })}
                  placeholder="Comma separated, e.g. llama-3.3-70b, mixtral-8x7b"
                  className="h-10 w-full rounded-lg border border-neutral-200 px-3 font-mono text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
                />
              </label>

              <button
                onClick={addCustomProvider}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
              >
                <Plus className="h-4 w-4" /> Add provider
              </button>

              {customProviders.length > 0 && (
                <p className="text-[12px] text-neutral-500">
                  {customProviders.length} custom provider{customProviders.length > 1 ? "s" : ""}{" "}
                  added — see the Providers tab.
                </p>
              )}
            </div>
          )}

          {/* ---------------- AGENTS ---------------- */}
          {activeTab === "agents" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-neutral-200 p-4">
                <h4 className="text-[14px] font-semibold text-neutral-900">Create an agent</h4>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  Combine models from different providers and pick how they collaborate.
                </p>

                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                        Agent name *
                      </span>
                      <input
                        value={agentDraft.name}
                        onChange={(e) => setAgentDraft({ ...agentDraft, name: e.target.value })}
                        placeholder="e.g. Architecture Council"
                        className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                        Strategy
                      </span>
                      <div className="relative">
                        <select
                          value={agentDraft.strategy}
                          onChange={(e) =>
                            setAgentDraft({
                              ...agentDraft,
                              strategy: e.target.value as AgentDef["strategy"],
                            })
                          }
                          className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-9 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-900"
                        >
                          <option value="ensemble">Ensemble — all run in parallel</option>
                          <option value="sequential">Sequential — each builds on the last</option>
                          <option value="primary-with-audit">
                            Primary with audit — one writes, one reviews
                          </option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      </div>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-neutral-800">
                      Description
                    </span>
                    <input
                      value={agentDraft.description}
                      onChange={(e) =>
                        setAgentDraft({ ...agentDraft, description: e.target.value })
                      }
                      placeholder="What this agent is for"
                      className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
                    />
                  </label>

                  {/* member builder */}
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                    <span className="mb-2 block text-[12px] font-semibold text-neutral-700">
                      Add a model
                    </span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="relative">
                        <select
                          value={memberProvider}
                          onChange={(e) => {
                            setMemberProvider(e.target.value);
                            setMemberModel("");
                          }}
                          className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-[12px] font-medium text-neutral-900 outline-none focus:border-neutral-900"
                        >
                          <option value="">Provider…</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                      </div>
                      <div className="relative">
                        <select
                          value={memberModel}
                          onChange={(e) => setMemberModel(e.target.value)}
                          disabled={!selectedProviderForMember}
                          className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-[12px] font-medium text-neutral-900 outline-none focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
                        >
                          <option value="">Model…</option>
                          {(selectedProviderForMember?.models || []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <select
                            value={memberRole}
                            onChange={(e) => setMemberRole(e.target.value as AgentMember["role"])}
                            className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-[12px] font-medium text-neutral-900 outline-none focus:border-neutral-900"
                          >
                            <option value="primary">Primary</option>
                            <option value="critic">Critic</option>
                            <option value="auditor">Auditor</option>
                            <option value="fallback">Fallback</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                        </div>
                        <button
                          onClick={addAgentMember}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-900 hover:text-neutral-900"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {agentMembers.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {agentMembers.map((m, i) => {
                          const prov = providers.find((p) => p.id === m.providerId);
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2"
                            >
                              <span className="text-[12px] text-neutral-700">
                                <span className="font-semibold text-neutral-900">
                                  {prov?.name || m.providerId}
                                </span>
                                <span className="text-neutral-400"> · </span>
                                <span className="font-mono">{m.modelId}</span>
                                <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                  {m.role}
                                </span>
                              </span>
                              <button
                                onClick={() =>
                                  setAgentMembers((arr) => arr.filter((_, idx) => idx !== i))
                                }
                                className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-900"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={saveAgent}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
                  >
                    <Sparkles className="h-4 w-4" /> Create agent
                  </button>
                </div>
              </div>

              {agents.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">
                    Your agents ({agents.length})
                  </span>
                  {agents.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start justify-between rounded-xl border border-neutral-200 p-3.5"
                    >
                      <div>
                        <span className="text-[14px] font-semibold text-neutral-900">{a.name}</span>
                        <span className="ml-2 rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                          {a.strategy}
                        </span>
                        {a.description && (
                          <p className="mt-0.5 text-[12px] text-neutral-500">{a.description}</p>
                        )}
                        <p className="mt-1 text-[11px] text-neutral-400">
                          {a.members.length} model{a.members.length !== 1 ? "s" : ""}:{" "}
                          {a.members.map((m) => `${m.providerId}/${m.modelId}`).join(", ")}
                        </p>
                      </div>
                      <button
                        onClick={() => removeAgent(a.id)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-[12px] text-neutral-500">
                  <AlertCircle className="h-4 w-4 text-neutral-400" />
                  No agents yet. Compose one above, then pick it as your engine in the project form.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 bg-neutral-50 px-6 py-4">
          <button
            onClick={onClose}
            className="h-10 px-4 text-[13px] font-semibold text-neutral-600 hover:text-neutral-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-10 rounded-lg bg-neutral-900 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
};
