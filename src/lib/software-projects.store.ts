export interface ExtractedRequirementItem {
  id: string;
  category:
    | "module"
    | "feature"
    | "database"
    | "api"
    | "auth"
    | "security"
    | "ui_ux"
    | "integration"
    | "testing"
    | "deployment"
    | "non_functional";
  title: string;
  description: string;
  importance: "high" | "medium" | "low";
}

/** Maximum text accepted by the requirements analysis endpoint. */
export const MAX_REQUIREMENTS_TEXT_LENGTH = 100_000;

export interface RequirementQuestion {
  id: string;
  question: string;
  options: string[];
  selectedAnswer?: string;
  group?: string;
  whyItMatters?: string;
  required?: boolean;
}

export interface ExtractedRequirements {
  projectName: string;
  objective: string;
  businessObjectives?: string[];
  targetUsers: string[];
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  modules: string[];
  techStack: string[];
  database: string[];
  apis: string[];
  auth: string[];
  security: string[];
  uiUx: string[];
  integrations: string[];
  constraints: string[];
  platformRequirements?: string[];
  acceptanceCriteria?: string[];
  assumptions?: string[];
  requirementDependencies?: { requirement: string; dependsOn: string; reason: string }[];
  items: ExtractedRequirementItem[];
}

export interface PromptVersion {
  version: number;
  promptText: string;
  createdAt: string;
  notes?: string;
}

export interface ProjectPhase {
  id: string;
  phaseNumber: number;
  title: string;
  objective: string;
  description: string;
  requirementsCovered: string[];
  dependencies: number[]; // Phase numbers this phase depends on
  prerequisites: string[];
  expectedOutput: string;
  filesAffected: {
    create: string[];
    modify: string[];
    doNotBreak: string[];
  };
  technologies: string[];
  complexity: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  completionCriteria: string[];
  /** User-provided Markdown or plain-text references for this phase. */
  supportingFiles?: Array<{ id: string; name: string; content: string; addedAt: string }>;
  prompt: string;
  /** Requires explicit user approval before implementation code is requested. */
  promptApproved?: boolean;
  /** Source returned by the selected code-generation model, saved as fenced files. */
  generatedCode?: string;
  generatedCodeOutdated?: boolean;
  codeComparisons?: Array<{ provider: string; model: string; output: string; createdAt: string }>;
  codeComparisonsOutdated?: boolean;
  codeGenerationProvider?: string;
  codeGenerationModel?: string;
  codeGenerationActualModel?: string;
  /** Wall-clock provider request duration, recorded from the browser around the real request. */
  codeGenerationDurationMs?: number;
  codeGenerationStatus?: "waiting" | "generating" | "completed" | "failed";
  codeGenerationError?: string;
  /** Persisted evidence that reviewed files were written to a user-selected local folder. */
  codeGenerationAppliedAt?: string;
  codeGenerationAppliedFiles?: string[];
  versions: PromptVersion[];
  currentVersion: number;
  status: "Not Started" | "In Progress" | "Completed";
  generationStatus?: "waiting" | "generating" | "completed" | "failed";
  generationProvider?: string;
  generationModel?: string;
  updatedAt: string;
}

export interface ImpactAnalysisResult {
  modifiedRequirement: string;
  affectedPhaseIds: string[];
  summary: string;
  suggestedAction: string;
}

export interface SoftwareProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: "DRAFT_PROMPT_GEN" | "READY_TO_BUILD";
  targetAiModel?: string;
  reviewAiModel?: string;
  referenceImageUrl?: string;
  referenceImageName?: string;
  referenceImages?: { name: string; url: string }[];
  rawDocumentName?: string;
  rawDocumentContent?: string;
  requirements: ExtractedRequirements;
  questions: RequirementQuestion[];
  userAnswers: Record<string, string>;
  requirementsConfirmed: boolean;
  workflowStage?:
    | "create"
    | "questions"
    | "review"
    | "documents"
    | "documents-review"
    | "granularity"
    | "phase-planning"
    | "generating"
    | "completion"
    | "portal";
  projectFiles?: ProjectMarkdownFile[];
  archivedPhases?: ProjectPhase[];
  documentGenerationStatus?: "waiting" | "generating" | "completed" | "failed";
  granularity: number; // 5, 10, 15, 20, 30, 50, 100, custom
  phases: ProjectPhase[];
  impactAnalysis?: ImpactAnalysisResult | null;
  progress: number; // 0 to 100
}

export interface ProjectMarkdownFile {
  filename: string;
  content: string;
  version: number;
  status: "generating" | "completed" | "failed";
  generatedAt?: string;
  provider?: string;
  model?: string;
  validation?: { valid: boolean; issues: string[] };
  review?: {
    status: "not-reviewed" | "reviewed" | "needs-changes";
    summary: string;
    findings: Array<{
      severity: "high" | "medium" | "low";
      issue: string;
      evidence: string;
      suggestion: string;
    }>;
    provider?: string;
    model?: string;
    reviewedAt?: string;
  };
  verification?: {
    status: "not-verified" | "passed" | "failed";
    summary: string;
    evidence: string[];
    provider?: string;
    model?: string;
    verifiedAt?: string;
  };
  approved?: boolean;
}
