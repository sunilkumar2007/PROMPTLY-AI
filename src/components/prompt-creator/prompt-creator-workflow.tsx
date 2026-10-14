import React, { useState } from "react";
import { ArrowRight, Check, Copy, Loader2, Sparkles } from "lucide-react";
import {
  GeneratedPromptItem,
  PromptCategory,
  PromptLevel,
  loadPromptsFromStorage,
  savePromptsToStorage,
} from "@/lib/prompt-creator.store";
import { detectPromptCategory } from "@/lib/prompt-pipeline";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { loadSharedContext } from "@/lib/shared-context";
import {
  compilePromptBlueprint,
  normalizePromptTask,
  selectPromptContext,
  selectPromptStrategy,
} from "@/lib/prompt-intelligence.logic";
import { compilePromptIntelligence } from "@/lib/software-ai.functions";

interface PromptCreatorWorkflowProps {
  onPromptSaved?: (prompt: GeneratedPromptItem) => void;
}

const CATEGORY_GROUPS: { label: string; categories: PromptCategory[] }[] = [
  {
    label: "Build & design",
    categories: [
      "Software development",
      "Coding",
      "UI/UX",
      "AI agents",
      "Automation",
      "Data analysis",
    ],
  },
  {
    label: "Content & media",
    categories: ["Image generation", "Video generation", "Writing", "Marketing", "Social media"],
  },
  {
    label: "Work & learning",
    categories: ["Business", "Education", "Research", "Productivity", "Other/custom"],
  },
];

export const PromptCreatorWorkflow: React.FC<PromptCreatorWorkflowProps> = ({ onPromptSaved }) => {
  const [ideaInput, setIdeaInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PromptCategory>("Coding");
  const [selectedLevel, setSelectedLevel] = useState<PromptLevel>("Professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePrompt, setActivePrompt] = useState<GeneratedPromptItem | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleIdeaInputChange = (text: string) => {
    setIdeaInput(text);
    if (text.length > 5) setSelectedCategory(detectPromptCategory(text));
  };

  const handleGenerate = async () => {
    const brief = ideaInput.trim();
    if (!brief) {
      toast.error("Describe what you want the prompt to do.");
      return;
    }

    setIsGenerating(true);
    setActivePrompt(null);
    try {
      const task = normalizePromptTask({
        userGoal: brief,
        category: selectedCategory,
        detailLevel: selectedLevel,
        targetTool: "generic",
      });
      const strategy = selectPromptStrategy(task);
      const contextPacket = selectPromptContext(task, loadSharedContext());
      const blueprint = compilePromptBlueprint(task, strategy, contextPacket);
      const response = await compilePromptIntelligence({
        data: { task, strategy, contextPacket, compilerBlueprint: blueprint },
      });
      const promptText = response.output.trim();
      if (!promptText) throw new Error("Gemini returned an empty prompt. Please try again.");

      const now = new Date().toISOString();
      const item: GeneratedPromptItem = {
        id: globalThis.crypto?.randomUUID?.() ?? `prompt-${Date.now()}`,
        title: brief.replace(/\s+/g, " ").slice(0, 72),
        rawInputIdea: brief,
        category: selectedCategory,
        level: selectedLevel,
        promptText,
        variables: [],
        recommendedModel: `Google Gemini ${response.model}`,
        expectedOutput: "Plain text prompt",
        improvementSuggestions: [],
        variations: [],
        createdAt: now,
        updatedAt: now,
        intelligence: {
          schemaVersion: 1,
          compilation: {
            provider: response.provider,
            model: response.model,
            startedAt: response.startedAt,
            completedAt: response.completedAt,
            latencyMs: response.latencyMs,
            usageEstimate: response.usageEstimate,
          },
          task,
          strategy,
          contextPacket,
          compiledPromptBlueprint: blueprint,
          promptVersion: 1,
          originalCompiledPrompt: promptText,
          promptValidation: response.validation,
          executions: [],
        },
      };

      setActivePrompt(item);
      const savedPrompts = loadPromptsFromStorage();
      if (savePromptsToStorage([item, ...savedPrompts.filter((prompt) => prompt.id !== item.id)])) {
        onPromptSaved?.(item);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Prompt generation failed. Check the Gemini server setup and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!activePrompt) return;
    try {
      await navigator.clipboard.writeText(activePrompt.promptText);
      setIsCopied(true);
      toast.success("Prompt copied. Paste it into your AI tool.");
      window.setTimeout(() => setIsCopied(false), 1800);
    } catch {
      toast.error("Clipboard access was blocked. Select the prompt text and copy it.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Sparkles className="h-3.5 w-3.5" /> Promptly
          </div>
          <h2 className="font-sora text-2xl font-bold text-slate-900 sm:text-3xl">
            Create a prompt
          </h2>
          <p className="text-sm text-slate-600">
            Describe what you need. Copy the prompt and paste it into your AI tool.
          </p>
        </header>

        <textarea
          placeholder="What do you want the AI to do?"
          value={ideaInput}
          onChange={(event) => handleIdeaInputChange(event.target.value)}
          maxLength={8000}
          aria-label="Describe what you want the prompt to do"
          className="block min-h-32 w-full resize-y rounded-xl border border-slate-300 p-4 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 sm:text-base"
        />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Category
            <Select
              value={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value as PromptCategory)}
            >
              <SelectTrigger
                aria-label="Prompt category"
                className="h-10 w-48 rounded-xl border-slate-200 bg-white text-xs font-semibold normal-case tracking-normal text-slate-800"
              >
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent
                align="start"
                className="max-h-80 rounded-xl border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {CATEGORY_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </SelectLabel>
                    {group.categories.map((category) => (
                      <SelectItem
                        key={category}
                        value={category}
                        textValue={category}
                        className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-slate-700 focus:bg-slate-100 focus:text-slate-950"
                      >
                        {category}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Level
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 normal-case tracking-normal">
              {(["Quick", "Professional", "Expert"] as PromptLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSelectedLevel(level)}
                  aria-pressed={selectedLevel === level}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    selectedLevel === level
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                Create prompt <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </section>

      {activePrompt && !isGenerating && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Your prompt</h3>
              <p className="mt-1 text-sm text-slate-500">Copy it and paste it into your AI tool.</p>
            </div>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {isCopied ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-800">
            {activePrompt.promptText}
          </pre>
        </section>
      )}
    </main>
  );
};
