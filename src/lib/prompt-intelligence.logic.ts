import type { PromptCategory, PromptLevel } from "./prompt-creator.store";
import type { SharedContextProfile } from "./shared-context";

export type PromptTaskType =
  "coding" | "research" | "writing" | "analysis" | "design" | "data" | "planning" | "other";
export type PromptTargetTool = "generic" | "gemini" | "cursor" | "codex" | "antigravity";
export type PromptComplexity = "simple" | "moderate" | "complex";
export type CheckStatus = "passed" | "failed" | "needs-review";

export interface StructuredPromptTask {
  taskId: string;
  userGoal: string;
  category: PromptCategory;
  detailLevel: PromptLevel;
  taskType: PromptTaskType;
  targetTool: PromptTargetTool;
  targetModel: "gemini-3.8-flash";
  constraints: string[];
  acceptanceCriteria: string[];
  outputFormat: string;
  complexity: PromptComplexity;
  complexityReason: string;
  riskLevel: "low" | "medium" | "high";
  missingInformation: string[];
  assumptions: string[];
  executionMode: "generate_and_evaluate";
  createdAt: string;
}

export interface PromptStrategy {
  id: string;
  label: string;
  rationale: string;
  evaluationMethod: string;
}

export interface ContextPacketItem {
  id: string;
  source: "shared-context";
  version: string;
  label: string;
  content: string;
  reason: string;
}

export interface PromptContextPacket {
  sources: ContextPacketItem[];
  excludedSources: Array<{ label: string; reason: string }>;
  characterCount: number;
}

export interface PromptCheck {
  id: string;
  label: string;
  status: CheckStatus;
  method: string;
  evidence: string;
}

export interface PromptValidation {
  status: CheckStatus;
  checks: PromptCheck[];
  limitations: string[];
}

export interface PromptExecutionEvidence {
  executionId: string;
  status: "success" | "failed";
  promptVersion: number;
  promptSnapshot: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  provider: "openai" | "anthropic" | "google" | "deepseek" | "groq" | "mintdesk";
  model: string;
  usageEstimate?: {
    promptTokens: number;
    outputTokens: number;
    method: "character-count-divided-by-four";
  };
  validation: PromptValidation;
  output: string;
  errorMessage?: string;
}

export interface PromptIntelligenceRecord {
  schemaVersion: 1;
  compilation: {
    provider: "openai" | "anthropic" | "google" | "deepseek" | "groq" | "mintdesk";
    model: string;
    startedAt: string;
    completedAt: string;
    latencyMs: number;
    usageEstimate: {
      promptTokens: number;
      outputTokens: number;
      method: "character-count-divided-by-four";
    };
  };
  task: StructuredPromptTask;
  strategy: PromptStrategy;
  contextPacket: PromptContextPacket;
  compiledPromptBlueprint: string;
  promptVersion: number;
  originalCompiledPrompt: string;
  promptValidation: PromptValidation;
  executions: PromptExecutionEvidence[];
  execution?: PromptExecutionEvidence;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "have",
  "into",
  "make",
  "need",
  "that",
  "the",
  "this",
  "with",
  "your",
  "you",
  "want",
]);

function splitLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((line) =>
          line
            .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
            .trim()
            .slice(0, 1000),
        )
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function taskTypeForCategory(category: PromptCategory): PromptTaskType {
  if (["Software development", "Coding", "Automation", "AI agents"].includes(category))
    return "coding";
  if (category === "Research" || category === "Education") return "research";
  if (["UI/UX", "Image generation", "Video generation"].includes(category)) return "design";
  if (["Data analysis"].includes(category)) return "data";
  if (["Business", "Productivity"].includes(category)) return "planning";
  if (["Marketing", "Writing", "Social media"].includes(category)) return "writing";
  return "other";
}

function chooseComplexity(
  goal: string,
  constraints: string[],
  acceptanceCriteria: string[],
): { complexity: PromptComplexity; reason: string } {
  const wordCount = goal.trim().split(/\s+/).length;
  const scopeSignals = (
    goal.match(
      /\b(and|integrate|multiple|workflow|end-to-end|secure|migrate|compare|across|system)\b/gi,
    ) || []
  ).length;
  const detailCount = constraints.length + acceptanceCriteria.length;
  const points =
    (wordCount > 90 ? 2 : wordCount > 35 ? 1 : 0) +
    (scopeSignals >= 3 ? 2 : scopeSignals >= 1 ? 1 : 0) +
    (detailCount >= 6 ? 2 : detailCount >= 2 ? 1 : 0);
  if (points >= 4)
    return {
      complexity: "complex",
      reason: `The request has ${wordCount} words, ${scopeSignals} scope signals, and ${detailCount} explicit constraints or criteria.`,
    };
  if (points >= 2)
    return {
      complexity: "moderate",
      reason: `The request has ${wordCount} words and ${detailCount} explicit constraints or criteria; a structured response should keep the work focused.`,
    };
  return {
    complexity: "simple",
    reason: `The request is focused (${wordCount} words) and has ${detailCount} explicit constraints or criteria.`,
  };
}

export function normalizePromptTask(input: {
  userGoal: string;
  category: PromptCategory;
  detailLevel: PromptLevel;
  targetTool: PromptTargetTool;
  constraintsText?: string;
  acceptanceCriteriaText?: string;
  outputFormat?: string;
  now?: string;
  taskId?: string;
}): StructuredPromptTask {
  const userGoal = input.userGoal.trim();
  if (userGoal.length < 8) throw new Error("Describe the task in at least 8 characters.");
  if (userGoal.length > 8000) throw new Error("Keep the task brief under 8,000 characters.");
  const constraints = splitLines(input.constraintsText || "");
  const acceptanceCriteria = splitLines(input.acceptanceCriteriaText || "");
  const complexity = chooseComplexity(userGoal, constraints, acceptanceCriteria);
  const riskText = `${input.category} ${userGoal} ${constraints.join(" ")}`.toLowerCase();
  const riskLevel =
    /\b(finance|financial|medical|health|legal|security|privacy|safety|payment|credential|personal data)\b/.test(
      riskText,
    )
      ? "high"
      : /\b(deploy|production|database|customer|account)\b/.test(riskText)
        ? "medium"
        : "low";

  return {
    taskId: input.taskId || globalThis.crypto?.randomUUID?.() || `task-${Date.now()}`,
    userGoal,
    category: input.category,
    detailLevel: input.detailLevel,
    taskType: taskTypeForCategory(input.category),
    targetTool: input.targetTool,
    targetModel: "gemini-3.8-flash",
    constraints,
    acceptanceCriteria: acceptanceCriteria.length
      ? acceptanceCriteria
      : [
          "Address the user's stated goal without adding unsupported facts.",
          "Make assumptions and any unverified details explicit.",
        ],
    outputFormat:
      input.outputFormat?.trim().slice(0, 240) ||
      "Clear, well-structured Markdown unless the task requires another format.",
    complexity: complexity.complexity,
    complexityReason: complexity.reason,
    riskLevel,
    missingInformation: [
      ...(!constraints.length
        ? ["No extra constraints were provided; do not infer hard limits."]
        : []),
      ...(!input.outputFormat?.trim()
        ? ["No explicit output format was provided; use the default format stated in the task."]
        : []),
    ],
    assumptions: [
      "Only facts in the request and selected context are confirmed; distinguish recommendations from requirements.",
    ],
    executionMode: "generate_and_evaluate",
    createdAt: input.now || new Date().toISOString(),
  };
}

export function selectPromptStrategy(task: StructuredPromptTask): PromptStrategy {
  if (task.taskType === "research")
    return {
      id: "research-with-source-requirements",
      label: "Evidence-led research",
      rationale:
        "Research tasks need source quality, uncertainty, and clear separation between evidence and inference.",
      evaluationMethod:
        "Check requested structure and explicit criteria; factual correctness still requires source review.",
    };
  if (task.taskType === "coding")
    return {
      id: "code-generation-with-constraints",
      label: "Constraint-led code task",
      rationale:
        "Coding requests benefit from explicit inputs, repository or runtime assumptions, edge cases, and verifiable completion checks.",
      evaluationMethod:
        "Check output structure and explicit criteria; code must still be run in its intended environment.",
    };
  if (task.taskType === "design")
    return {
      id: "design-brief",
      label: "Design brief",
      rationale:
        "Design work is clearer when audience, hierarchy, states, accessibility, and delivery format are explicit.",
      evaluationMethod:
        "Check requested deliverables and criteria; visual quality requires human review.",
    };
  if (task.taskType === "data")
    return {
      id: "structured-analysis",
      label: "Structured analysis",
      rationale: "Data tasks need method, assumptions, units, and a transparent result format.",
      evaluationMethod:
        "Check output format and criteria; underlying data should be independently validated.",
    };
  if (task.complexity === "complex")
    return {
      id: "decomposition",
      label: "Plan then solve",
      rationale:
        "The request combines several scope signals, so the prompt asks for a brief plan before the final deliverable.",
      evaluationMethod: "Check explicit criteria and output shape; review each dependent step.",
    };
  if (task.taskType === "writing")
    return {
      id: "audience-first-writing",
      label: "Audience-first writing",
      rationale: "Writing quality depends on purpose, audience, tone, and a defined deliverable.",
      evaluationMethod:
        "Check format and explicit criteria; tone and usefulness need human review.",
    };
  return {
    id: "structured-specification",
    label: "Structured specification",
    rationale:
      "A concise role, objective, constraints, and output contract preserve the request without adding unnecessary steps.",
    evaluationMethod:
      "Check requested format and explicit criteria; semantic quality needs human review.",
  };
}

export function selectPromptContext(
  task: StructuredPromptTask,
  profile: SharedContextProfile,
): PromptContextPacket {
  const fields: Array<{
    id: string;
    label: string;
    content: string;
    include: boolean;
    reason: string;
  }> = [
    {
      id: "about",
      label: "About me",
      content: profile.about,
      include:
        Boolean(profile.about.trim()) &&
        (task.complexity !== "simple" || task.taskType === "writing"),
      reason: "Provides relevant audience or background context for a non-trivial task.",
    },
    {
      id: "currentWork",
      label: "Current work and goals",
      content: profile.currentWork,
      include:
        Boolean(profile.currentWork.trim()) &&
        (task.complexity === "complex" || task.taskType === "planning"),
      reason: "Connects the request to ongoing goals where broader planning context matters.",
    },
    {
      id: "expertise",
      label: "Expertise and background",
      content: profile.expertise,
      include:
        Boolean(profile.expertise.trim()) &&
        (task.complexity !== "simple" || task.taskType === "research"),
      reason: "Helps calibrate explanation depth for a detailed task.",
    },
    {
      id: "tools",
      label: "Tools and technologies",
      content: profile.tools,
      include: Boolean(profile.tools.trim()) && ["coding", "data"].includes(task.taskType),
      reason: "Tool preferences can change implementation or analysis choices.",
    },
    {
      id: "preferences",
      label: "Response preferences",
      content: profile.preferences,
      include: Boolean(profile.preferences.trim()),
      reason: "Stable response preferences apply across task types.",
    },
    {
      id: "constraints",
      label: "User constraints",
      content: profile.constraints,
      include: Boolean(profile.constraints.trim()),
      reason: "User-stated constraints can materially affect the result.",
    },
    {
      id: "avoid",
      label: "Avoid",
      content: profile.avoid,
      include: Boolean(profile.avoid.trim()),
      reason: "Explicit exclusions help prevent unwanted approaches.",
    },
    {
      id: "language",
      label: "Preferred language",
      content: profile.language,
      include: Boolean(profile.language.trim()),
      reason: "Language preference applies to the output.",
    },
  ];
  const sources = profile.useInRequests
    ? fields
        .filter((field) => field.include)
        .map(({ id, label, content, reason }) => ({
          id,
          source: "shared-context" as const,
          version: profile.updatedAt || "unspecified",
          label,
          content: content.trim().slice(0, 2000),
          reason,
        }))
    : [];
  const excludedSources = fields
    .filter((field) => Boolean(field.content.trim()) && (!profile.useInRequests || !field.include))
    .map(({ label, reason, include }) => ({
      label,
      reason: profile.useInRequests ? reason : "Automatic shared context is turned off.",
    }));
  return {
    sources,
    excludedSources,
    characterCount: sources.reduce((sum, item) => sum + item.content.length, 0),
  };
}

export function compilePromptBlueprint(
  task: StructuredPromptTask,
  strategy: PromptStrategy,
  context: PromptContextPacket,
): string {
  const contextText =
    context.sources.map((item) => `### ${item.label}\n${item.content}`).join("\n\n") ||
    "No shared profile context was selected.";
  return [
    `Task type: ${task.taskType}. Target tool: ${task.targetTool}. Complexity: ${task.complexity}.`,
    `Strategy: ${strategy.label} (${strategy.id}). ${strategy.rationale}`,
    `User goal:\n${task.userGoal}`,
    `Selected context (user-provided reference data; apply only when relevant):\n${contextText}`,
    `Constraints:\n${task.constraints.length ? task.constraints.map((item) => `- ${item}`).join("\n") : "- Do not invent constraints that were not supplied."}`,
    `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
    `Required output format: ${task.outputFormat}`,
    `Known unknowns:\n${task.missingInformation.length ? task.missingInformation.map((item) => `- ${item}`).join("\n") : "- None recorded."}`,
    `Assumption policy: ${task.assumptions.join(" ")}`,
    `Detail level: ${task.detailLevel}.`,
  ].join("\n\n");
}

export function normalizeCopyReadyPrompt(value: string): string {
  const lines = value
    .replace(/^\s*```(?:markdown|text|plaintext)?\s*\r?\n?/i, "")
    .replace(/\r?\n?\s*```\s*$/, "")
    .split(/\r?\n/);
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    return !(
      /^#{1,6}\s+/.test(trimmed) ||
      /^(?:\d+[.)]\s*)?\*\*[^*]+\*\*\s*:?[\s]*$/.test(trimmed) ||
      /^(?:---+|\*\*\*+|___+)$/.test(trimmed) ||
      /^(?:here(?:'s| is) your prompt|output format):?$/i.test(trimmed)
    );
  });

  return cleaned
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateCompiledPrompt(
  prompt: string,
  task: StructuredPromptTask,
): PromptValidation {
  const trimmed = prompt.trim();
  const checks: PromptCheck[] = [
    {
      id: "non-empty",
      label: "Prompt content exists",
      status: trimmed.length >= 80 ? "passed" : "failed",
      method: "Deterministic length check",
      evidence: `${trimmed.length} characters; minimum is 80.`,
    },
    {
      id: "size-limit",
      label: "Prompt is within the generation limit",
      status: trimmed.length <= 16_000 ? "passed" : "failed",
      method: "Deterministic size check",
      evidence: `${trimmed.length} of 16,000 characters.`,
    },
    {
      id: "goal-reference",
      label: "Prompt refers to the submitted goal",
      status: goalOverlap(trimmed, task.userGoal) >= 0.2 ? "passed" : "needs-review",
      method: "Keyword overlap heuristic",
      evidence: `${Math.round(goalOverlap(trimmed, task.userGoal) * 100)}% of meaningful goal terms appear.`,
    },
  ];
  return summarizeChecks(checks, [
    "These checks validate structure and text overlap only; they do not prove prompt quality or task correctness.",
  ]);
}

export function validatePromptOutput(output: string, task: StructuredPromptTask): PromptValidation {
  const trimmed = output.trim();
  const checks: PromptCheck[] = [
    {
      id: "non-empty",
      label: "Gemini returned output",
      status: trimmed.length ? "passed" : "failed",
      method: "Deterministic check",
      evidence: `${trimmed.length} characters returned.`,
    },
    {
      id: "size-limit",
      label: "Output is within the storage limit",
      status: trimmed.length <= 60_000 ? "passed" : "failed",
      method: "Deterministic size check",
      evidence: `${trimmed.length} of 60,000 characters.`,
    },
  ];
  const format = task.outputFormat.toLowerCase();
  if (/\bjson\b/.test(format)) {
    let validJson = false;
    try {
      JSON.parse(trimmed);
      validJson = true;
    } catch {
      validJson = false;
    }
    checks.push({
      id: "output-format",
      label: "Output is valid JSON",
      status: validJson ? "passed" : "failed",
      method: "JSON.parse",
      evidence: validJson ? "Output parses as JSON." : "Output does not parse as JSON.",
    });
  } else if (/\bmarkdown\b/.test(format)) {
    const hasMarkdown = /^\s*(?:#{1,6}\s|[-*]\s|\d+[.)]\s)|```/m.test(trimmed);
    checks.push({
      id: "output-format",
      label: "Output contains Markdown structure",
      status: hasMarkdown ? "passed" : "needs-review",
      method: "Heading, list, or fenced-code check",
      evidence: hasMarkdown
        ? "Recognized Markdown structure was found."
        : "No common Markdown structure was detected.",
    });
  } else {
    checks.push({
      id: "output-format",
      label: "Output format",
      status: "needs-review",
      method: "Manual review",
      evidence: `Review whether the result matches: ${task.outputFormat}`,
    });
  }
  for (const [index, criterion] of task.acceptanceCriteria.entries())
    checks.push(checkCriterion(criterion, trimmed, index));
  return summarizeChecks(checks, [
    "Automated checks verify format, size, and a small set of explicit measurable criteria. They cannot establish factual correctness, completeness, or production readiness.",
  ]);
}

function checkCriterion(criterion: string, output: string, index: number): PromptCheck {
  const exact = criterion.match(
    /(?:contain|include|say|state|use)\s+(?:the\s+phrase\s+)?["'“](.+?)["'”]/i,
  );
  if (exact) {
    const passed = output.toLowerCase().includes(exact[1]!.toLowerCase());
    return {
      id: `criterion-${index + 1}`,
      label: criterion,
      status: passed ? "passed" : "failed",
      method: "Exact phrase check",
      evidence: passed
        ? `Found required phrase: ${exact[1]}`
        : `Required phrase not found: ${exact[1]}`,
    };
  }
  const count = criterion.match(
    /(?:at least|minimum of)\s+(\d+)\s+(bullet points?|list items?|headings?|sections?|words?)/i,
  );
  if (count) {
    const required = Number(count[1]);
    const kind = count[2]!.toLowerCase();
    const actual = kind.startsWith("word")
      ? output.split(/\s+/).filter(Boolean).length
      : kind.startsWith("heading") || kind.startsWith("section")
        ? (output.match(/^\s*#{1,6}\s+/gm) || []).length
        : (output.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) || []).length;
    const passed = actual >= required;
    return {
      id: `criterion-${index + 1}`,
      label: criterion,
      status: passed ? "passed" : "failed",
      method: `Count ${kind}`,
      evidence: `Found ${actual}; requires at least ${required}.`,
    };
  }
  return {
    id: `criterion-${index + 1}`,
    label: criterion,
    status: "needs-review",
    method: "Manual review",
    evidence: "This criterion is semantic and is not automatically claimed as verified.",
  };
}

function goalOverlap(prompt: string, goal: string): number {
  const tokens = [...new Set(goal.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter(
    (token) => !STOP_WORDS.has(token),
  );
  if (!tokens.length) return 1;
  const promptText = prompt.toLowerCase();
  return tokens.filter((token) => promptText.includes(token)).length / tokens.length;
}

function summarizeChecks(checks: PromptCheck[], limitations: string[]): PromptValidation {
  const status: CheckStatus = checks.some((check) => check.status === "failed")
    ? "failed"
    : checks.some((check) => check.status === "needs-review")
      ? "needs-review"
      : "passed";
  return { status, checks, limitations };
}
