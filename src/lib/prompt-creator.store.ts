import type { PromptIntelligenceRecord } from "./prompt-intelligence.logic";

export type PromptCategory =
  | "Software development"
  | "Coding"
  | "UI/UX"
  | "Image generation"
  | "Video generation"
  | "Marketing"
  | "Business"
  | "Education"
  | "Research"
  | "Writing"
  | "Social media"
  | "Data analysis"
  | "AI agents"
  | "Automation"
  | "Productivity"
  | "Other/custom";

export type PromptLevel = "Quick" | "Professional" | "Expert" | "Custom";

export interface PromptVariable {
  name: string;
  description: string;
  defaultValue?: string;
}

export interface PromptVariation {
  id: string;
  level: "Concise" | "Professional" | "Expert";
  title: string;
  promptText: string;
  strategyDescription: string;
}

export interface GeneratedPromptItem {
  id: string;
  title: string;
  rawInputIdea: string;
  category: PromptCategory;
  level: PromptLevel;
  promptText: string;
  variables: PromptVariable[];
  recommendedModel: string;
  expectedOutput: string;
  /** Present only when a real evaluator has produced a score. */
  qualityScore?: number;
  improvementSuggestions: string[];
  variations: PromptVariation[];
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  remixHistory?: {
    timestamp: string;
    instruction: string;
    previousPromptText: string;
  }[];
  /** Structured task, selected context, compiler checks, and saved execution evidence. */
  intelligence?: PromptIntelligenceRecord;
}

const STORAGE_KEY = "promptly_creator_prompts_v1";

export function loadPromptsFromStorage(): GeneratedPromptItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to load prompts from storage:", e);
    return [];
  }
}

export function savePromptsToStorage(items: GeneratedPromptItem[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    console.error("Failed to save prompts to storage:", e);
    return false;
  }
}
