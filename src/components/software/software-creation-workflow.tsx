import React, { useState, useEffect } from "react";
import {
  FileText,
  Upload,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Layers,
  Settings,
  Copy,
  RefreshCw,
  AlertTriangle,
  Plus,
  Edit3,
  Eye,
  History,
  Sparkles,
  Code,
  Check,
  X,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
  Image as ImageIcon,
  Cpu,
  FastForward,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  FileCode,
  Workflow,
  Share2,
  FilePlus2,
} from "lucide-react";
import {
  SoftwareProject,
  ProjectPhase,
  ExtractedRequirements,
  RequirementQuestion,
  MAX_REQUIREMENTS_TEXT_LENGTH,
} from "@/lib/software-projects.store";
import { getSoftwareProject, saveSoftwareProject } from "@/lib/software-projects.functions";
import { triggerZipDownload } from "@/lib/zip-download";
import { ArtifactEngine, ProjectArtifact } from "@/lib/artifact-engine";
import {
  parseFileDocument,
  planExactNPhases,
  generateSinglePhasePromptWithAPI,
  performImpactAnalysis,
  resolveSelectedModel,
} from "@/lib/software-pipeline";
import {
  analyzeSoftwareRequirements,
  generatePhaseCode,
  generateProjectMarkdownFile,
  reviewProjectMarkdownFile,
} from "@/lib/software-ai.functions";
import {
  addOptionalAssumptions,
  answersFromRequirements,
  applyRequirementAnswers,
  canApproveProjectFile,
  canContinueWithProjectFiles,
  getAffectedProjectDocuments,
  evaluateRequirementCompleteness,
  getRelevantPreviousFiles,
  getRequirementReviewQuestions,
  preserveConfirmedRequirements,
  PROJECT_MARKDOWN_FILES,
  toProjectFile,
  validateProjectMarkdown,
} from "@/lib/software-documents";
import { MultiAPISettingsModal } from "./multi-api-settings-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectChatDrawer } from "@/components/chat/project-chat-drawer";
import { ArtifactDiffModal } from "@/components/artifacts/artifact-diff-modal";
import { LocalCodeWorkspacePanel } from "@/components/software/local-code-workspace-panel";
import {
  readRepositoryContext,
  type LocalWorkspaceDirectoryHandle,
} from "@/lib/local-code-workspace";
import {
  selectConflictSafeOrchestrationBatch,
  selectReadyOrchestrationPhases,
} from "@/lib/orchestration.logic";
import { ProjectMemoryEngine } from "@/lib/project-memory";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSharedContextForRequest, loadSharedContext } from "@/lib/shared-context";
import { OrchestrationDashboard } from "./orchestration-dashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatPhasePrompt(prompt: string): string {
  return prompt
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getPhasePromptConfidence(phase: ProjectPhase, project: SoftwareProject) {
  const hasApprovedRequirements =
    project.requirementsConfirmed && project.requirements.functionalRequirements.length > 0;
  const hasPhaseScope =
    phase.requirementsCovered.some((item) => item.trim()) || phase.description.trim().length > 0;
  const hasAcceptanceChecks =
    phase.completionCriteria.length > 0 ||
    (project.requirements.acceptanceCriteria?.length || 0) > 0;
  if (hasApprovedRequirements && hasPhaseScope && hasAcceptanceChecks) return "High" as const;
  if (hasPhaseScope && phase.objective.trim() && phase.prompt.trim()) return "Medium" as const;
  return "Low" as const;
}

function redactShareSecrets(text: string) {
  return text
    .replace(
      /\b(sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|AIza[\w-]{25,})\b/g,
      "[redacted secret]",
    )
    .replace(/\b(api[_ -]?key|token|password)\s*[:=]\s*[^\s,;]+/gi, "$1: [redacted]");
}

function buildProjectShareContext(project: SoftwareProject) {
  const requirements = project.requirements;
  const sections = [
    `# ${project.name}`,
    project.description && `\n${project.description}`,
    requirements.objective && `\n## Project goal\n${requirements.objective}`,
    requirements.functionalRequirements.length &&
      `\n## Requirements\n${requirements.functionalRequirements.map((item) => `- ${item}`).join("\n")}`,
    requirements.acceptanceCriteria?.length &&
      `\n## Acceptance checks\n${requirements.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
    Object.keys(project.userAnswers).length &&
      `\n## Approved decisions\n${Object.entries(project.userAnswers)
        .map(([question, answer]) => `- ${question}: ${answer}`)
        .join("\n")}`,
    project.phases.length &&
      `\n## Phases\n${project.phases.map((phase) => `- ${phase.phaseNumber}. ${phase.title}: ${phase.objective}`).join("\n")}`,
    project.phases.some((phase) => phase.supportingFiles?.length) &&
      `\n## Phase references\n${project.phases.flatMap((phase) => (phase.supportingFiles || []).map((reference) => `### Phase ${phase.phaseNumber}: ${phase.title} · ${reference.name}\n${reference.content}`)).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return redactShareSecrets(sections);
}

function getPhaseReferenceContext(phase: ProjectPhase) {
  let remaining = 30_000;
  return (phase.supportingFiles || [])
    .map(({ name, content }) => {
      const excerpt = content.slice(0, Math.max(0, Math.min(10_000, remaining)));
      remaining -= excerpt.length;
      return { name, content: excerpt };
    })
    .filter((file) => file.content.length > 0);
}

interface SoftwareCreationWorkflowProps {
  initialProjectId?: string;
  onProjectSaved?: (project: SoftwareProject) => void;
}

const AI_MODELS = [
  "Claude Sonnet 5.5 (Anthropic)",
  "GPT-4o (OpenAI)",
  "Qwen 3.8 (Groq)",
  "MintDesk Sonnet 5.5",
  "MintDesk Opus 5.5",
  "MintDesk Haiku 4.5",
  "MintDesk Codex",
  "MintDesk GPT-4o",
  "Gemini 3.8 Flash (Google)",
  "Gemini 3.1 Pro Preview (Google)",
  "DeepSeek V4.1 Flash",
  "DeepSeek V4 Pro",
];

/** Label + optional hint wrapper keeping every field on the same rhythm. */
const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, children }) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-[14px] font-semibold text-neutral-800">
        {label}
        {required && <span className="ml-0.5 text-neutral-400">*</span>}
      </label>
      {hint && <span className="text-[13px] text-neutral-400">{hint}</span>}
    </div>
    {children}
  </div>
);

export const SoftwareCreationWorkflow: React.FC<SoftwareCreationWorkflowProps> = ({
  initialProjectId,
  onProjectSaved,
}) => {
  // WORKFLOW STAGE CONTROLLER
  const [workflowStage, setWorkflowStage] = useState<
    | "create"
    | "questions"
    | "review"
    | "documents"
    | "documents-review"
    | "granularity"
    | "phase-planning"
    | "generating"
    | "completion"
    | "portal"
  >("create");

  // Multi-API Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffTargetPhase, setDiffTargetPhase] = useState<ProjectPhase | null>(null);
  const [isPhasePromptDialogOpen, setIsPhasePromptDialogOpen] = useState(false);
  const [isPhaseContextDialogOpen, setIsPhaseContextDialogOpen] = useState(false);
  const [phaseContextTitle, setPhaseContextTitle] = useState("");
  const [phaseContextText, setPhaseContextText] = useState("");
  const [isProjectShareDialogOpen, setIsProjectShareDialogOpen] = useState(false);
  const [projectShareText, setProjectShareText] = useState("");

  // Step 1 Inputs
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedAiModel, setSelectedAiModel] = useState("Gemini 3.1 Pro Preview (Google)");
  const [pastedText, setPastedText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    content: string;
  } | null>(null);
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [requirementSource, setRequirementSource] = useState<"upload" | "paste">("upload");
  const [isAnalyzingRequirements, setIsAnalyzingRequirements] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Step 2 Questions State
  const [questions, setQuestions] = useState<RequirementQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [documentGenerationError, setDocumentGenerationError] = useState<string | null>(null);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(0);
  const [editedDocumentContent, setEditedDocumentContent] = useState("");
  const [isDocumentReviewBusy, setIsDocumentReviewBusy] = useState(false);

  // Step 3 Phase Count State
  const [selectedPhaseCount, setSelectedPhaseCount] = useState<number>(5);
  const [customPhaseInput, setCustomPhaseInput] = useState<string>("");

  // Step 4 Sequential API Generation State
  const [generatingPhases, setGeneratingPhases] = useState<ProjectPhase[]>([]);
  const [activeGeneratingIdx, setActiveGeneratingIdx] = useState<number>(0);
  const [generationErrorPhaseIdx, setGenerationErrorPhaseIdx] = useState<number | null>(null);

  // Active Project State
  const [currentProject, setCurrentProject] = useState<SoftwareProject | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<ProjectPhase | null>(null);
  const [localWorkspaceDirectory, setLocalWorkspaceDirectory] =
    useState<LocalWorkspaceDirectoryHandle | null>(null);
  const [selectedArtifactIdx, setSelectedArtifactIdx] = useState<number>(0);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState("");
  const [newRequirementInput, setNewRequirementInput] = useState("");
  const [showPortalHeaderActions, setShowPortalHeaderActions] = useState(false);
  const [showOrchestration, setShowOrchestration] = useState(false);
  const [generatingCodePhaseIds, setGeneratingCodePhaseIds] = useState<string[]>([]);
  const [comparisonModel, setComparisonModel] = useState("MintDesk Sonnet 5.5");
  const [isComparingPhaseModels, setIsComparingPhaseModels] = useState(false);
  const hasOtherApprovedPhasesToGenerate = Boolean(
    currentProject?.phases.some(
      (phase) =>
        phase.id !== selectedPhase?.id &&
        phase.promptApproved &&
        phase.prompt.trim() &&
        (!phase.generatedCode || phase.generatedCodeOutdated) &&
        !generatingCodePhaseIds.includes(phase.id),
    ),
  );

  useEffect(() => {
    setLocalWorkspaceDirectory(null);
  }, [currentProject?.id]);

  useEffect(() => {
    const filename = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
    const file = filename
      ? currentProject?.projectFiles?.find((item) => item.filename === filename)
      : undefined;
    setEditedDocumentContent(file?.content || "");
  }, [currentProject?.id, currentProject?.projectFiles, activeDocumentIndex]);

  // Load existing project if initialProjectId is supplied
  useEffect(() => {
    if (initialProjectId) {
      getSoftwareProject({ data: { id: initialProjectId } })
        .then((savedProject) => {
          const found = savedProject as SoftwareProject | null;
          if (found) {
            setCurrentProject(found);
            setGeneratingPhases(found.phases);
            setSelectedPhase(found.phases[0] || null);
            setQuestions(found.questions);
            setUserAnswers(found.userAnswers);
            setSelectedPhaseCount(found.granularity);
            const failedIndex = found.phases.findIndex(
              (phase) => phase.generationStatus === "failed",
            );
            setGenerationErrorPhaseIdx(failedIndex >= 0 ? failedIndex : null);
          }
          setWorkflowStage(
            found?.workflowStage || (found?.status === "READY_TO_BUILD" ? "portal" : "create"),
          );
        })
        .catch((error) => {
          toast.error(error.message || "Could not load this saved project from this browser.");
        });
    }
  }, [initialProjectId]);

  useEffect(() => {
    if (!currentProject || workflowStage !== "questions") return;
    const timer = window.setTimeout(() => {
      void saveSoftwareProject({
        data: {
          project: {
            ...currentProject,
            userAnswers,
            workflowStage: "questions",
            updatedAt: new Date().toISOString(),
          },
        },
      }).catch((error) => {
        console.warn("Could not autosave project answers:", error);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [userAnswers, currentProject, workflowStage]);

  // File Upload Handlers
  const handleFileUpload = async (file: File) => {
    try {
      const parsed = await parseFileDocument(file);
      setUploadedFile({
        name: parsed.fileName,
        size: parsed.fileSize,
        content: parsed.content,
      });
      toast.success(`Uploaded document '${file.name}'`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid file format");
    }
  };

  const handleImageUpload = (files: FileList | File[]) => {
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      toast.error("Please upload image files (.png, .jpg, .webp)");
      return;
    }
    if (images.length < list.length) {
      toast.error(`${list.length - images.length} non-image file(s) skipped`);
    }
    const existingSize = uploadedImages.reduce((total, image) => total + image.url.length, 0);
    let remainingSize = Math.max(0, 550_000 - existingSize);
    const accepted = images.filter((file) => {
      if (file.size > 300_000 || file.size > remainingSize) return false;
      remainingSize -= file.size;
      return true;
    });
    if (accepted.length < images.length)
      toast.error("Design images are limited to 300 KB each and about 550 KB total per project.");
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImages((prev) => [
          ...prev,
          { name: file.name, url: e.target?.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (accepted.length)
      toast.success(`Added ${accepted.length} design reference${accepted.length > 1 ? "s" : ""}`);
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // STAGE A - STEP 1: Upload Requirements -> Understand & Generate Questions
  const handleProcessUploadAndGenerateQuestions = async () => {
    const rawContent = uploadedFile?.content || pastedText.trim();
    if (!rawContent && !projectName && uploadedImages.length === 0) {
      toast.error("Please enter a project name or upload an SRS document.");
      return;
    }
    if (rawContent.length > MAX_REQUIREMENTS_TEXT_LENGTH) {
      toast.error("Requirements must contain 100,000 characters or fewer.");
      return;
    }

    setIsAnalyzingRequirements(true);
    try {
      const selected = resolveSelectedModel(selectedAiModel);
      const analysis = await analyzeSoftwareRequirements({
        data: {
          providerId: selected.providerId,
          modelId: selected.modelId,
          projectName: projectName.trim(),
          description: projectDescription.trim(),
          rawRequirements:
            rawContent ||
            `${projectName.trim()}\n${projectDescription.trim()}\nDesign references: ${uploadedImages.map((image) => image.name).join(", ")}`,
          sharedContext: formatSharedContextForRequest(loadSharedContext()),
        },
      });
      const reqs = addOptionalAssumptions(analysis.requirements);
      const gate = evaluateRequirementCompleteness(reqs, {});
      const dynamicQuestions = gate.questions;
      const initialAns: Record<string, string> = {};

      const newProj: SoftwareProject = {
        id: `proj-${Date.now()}`,
        name: projectName.trim() || reqs.projectName,
        description: projectDescription || reqs.objective,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "DRAFT_PROMPT_GEN",
        targetAiModel: selectedAiModel,
        ...(uploadedImages[0]
          ? { referenceImageUrl: uploadedImages[0].url, referenceImageName: uploadedImages[0].name }
          : {}),
        referenceImages: uploadedImages,
        ...(uploadedFile ? { rawDocumentName: uploadedFile.name } : {}),
        rawDocumentContent: rawContent,
        requirements: reqs,
        questions: dynamicQuestions,
        userAnswers: initialAns,
        requirementsConfirmed: false,
        workflowStage: gate.complete ? "review" : "questions",
        granularity: 5,
        phases: [],
        progress: 0,
      };

      setCurrentProject(newProj);
      setQuestions(dynamicQuestions);
      setUserAnswers(initialAns);
      setWorkflowStage(gate.complete ? "review" : "questions");
      if (onProjectSaved) onProjectSaved(newProj);
      void saveSoftwareProject({ data: { project: newProj } }).catch((error) => {
        toast.error(error.message || "Project draft could not be saved in this browser.");
      });
      toast.success(
        gate.complete
          ? "Requirements analyzed. Review them before generating the project files."
          : "Requirements analyzed. Please answer the essential follow-up questions.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Requirements analysis failed. Check provider configuration and try again.",
      );
    } finally {
      setIsAnalyzingRequirements(false);
    }
  };

  // STAGE A - STEP 2: Submit User Answers
  const handleSubmitUserAnswers = async () => {
    if (!currentProject) return;
    setIsAnalyzingRequirements(true);
    try {
      const answersText = Object.entries(userAnswers)
        .filter(([, value]) => value.trim())
        .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
        .join("\n\n");
      const analysisInput = `${currentProject.rawDocumentContent || currentProject.description}\n\nConfirmed user clarifications:\n${answersText}`;
      if (analysisInput.length > MAX_REQUIREMENTS_TEXT_LENGTH) {
        toast.error(
          "The requirements and answers exceed 100,000 characters. Shorten the source document before reanalysing.",
        );
        return;
      }
      const selected = resolveSelectedModel(currentProject.targetAiModel || selectedAiModel);
      const analysis = await analyzeSoftwareRequirements({
        data: {
          providerId: selected.providerId,
          modelId: selected.modelId,
          projectName: currentProject.name,
          description: currentProject.description,
          rawRequirements: analysisInput,
          sharedContext: formatSharedContextForRequest(loadSharedContext()),
        },
      });
      const preservedRequirements = preserveConfirmedRequirements(
        currentProject.requirements,
        analysis.requirements,
      );
      const answeredRequirements = addOptionalAssumptions(
        applyRequirementAnswers(preservedRequirements, userAnswers),
      );
      const gate = evaluateRequirementCompleteness(answeredRequirements, userAnswers);
      const updatedProj: SoftwareProject = {
        ...currentProject,
        requirements: answeredRequirements,
        questions: gate.questions,
        userAnswers,
        requirementsConfirmed: false,
        workflowStage: gate.complete ? "review" : "questions",
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(updatedProj);
      setQuestions(gate.questions);
      setWorkflowStage(gate.complete ? "review" : "questions");
      await saveSoftwareProject({ data: { project: updatedProj } });
      if (!gate.complete)
        toast.info(
          "A few required details are still missing. Please answer the remaining questions.",
        );
      else
        toast.success(
          "Requirements are complete. Review and confirm before generating the project files.",
        );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reanalyse the requirements.");
    } finally {
      setIsAnalyzingRequirements(false);
    }
  };

  const handleConfirmRequirements = async () => {
    if (!currentProject) return;
    const gate = evaluateRequirementCompleteness(currentProject.requirements, userAnswers);
    if (!gate.complete) {
      setQuestions(gate.questions);
      setWorkflowStage("questions");
      toast.error("Resolve the required questions before continuing.");
      return;
    }
    const confirmed = {
      ...currentProject,
      requirementsConfirmed: true,
      workflowStage: "documents" as const,
      documentGenerationStatus: "waiting" as const,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(confirmed);
    setWorkflowStage("documents");
    setDocumentGenerationError(null);
    try {
      await saveSoftwareProject({ data: { project: confirmed } });
      await generateProjectDocuments(confirmed);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save the confirmed requirements.";
      const firstFile = PROJECT_MARKDOWN_FILES[0];
      const failedProject = {
        ...confirmed,
        documentGenerationStatus: "failed" as const,
        ...(firstFile
          ? {
              projectFiles: [
                ...(confirmed.projectFiles || []).filter((file) => file.filename !== firstFile),
                {
                  filename: firstFile,
                  content: "",
                  version: 1,
                  status: "failed" as const,
                  validation: { valid: false, issues: [message] },
                },
              ],
            }
          : {}),
      };
      setCurrentProject(failedProject);
      setDocumentGenerationError(message);
      void saveSoftwareProject({ data: { project: failedProject } }).catch(() => {});
      toast.error(message);
    }
  };

  const generateProjectDocuments = async (project: SoftwareProject) => {
    const selected = resolveSelectedModel(project.targetAiModel || selectedAiModel);
    let generationProviderId = selected.providerId;
    let generationModelId = selected.modelId;
    const files = [...(project.projectFiles || [])];
    const firstPendingIndex = PROJECT_MARKDOWN_FILES.findIndex((filename) => {
      const file = files.find((item) => item.filename === filename);
      return !(file?.status === "completed" && file.validation?.valid);
    });
    if (firstPendingIndex >= 0) {
      const firstPendingFilename = PROJECT_MARKDOWN_FILES[firstPendingIndex]!;
      const firstRecord = {
        filename: firstPendingFilename,
        content: files.find((file) => file.filename === firstPendingFilename)?.content || "",
        version: files.find((file) => file.filename === firstPendingFilename)?.version || 1,
        status: "generating" as const,
        provider: generationProviderId,
        model: generationModelId,
      };
      const existingIndex = files.findIndex((file) => file.filename === firstPendingFilename);
      if (existingIndex >= 0) files[existingIndex] = firstRecord;
      else files.push(firstRecord);
      setActiveDocumentIndex(firstPendingIndex);
    }
    let working: SoftwareProject = {
      ...project,
      projectFiles: files,
      documentGenerationStatus: "generating",
      workflowStage: "documents",
    };
    setCurrentProject(working);
    let currentFilename: string | null =
      firstPendingIndex >= 0 ? PROJECT_MARKDOWN_FILES[firstPendingIndex]! : null;
    try {
      await saveSoftwareProject({ data: { project: working } });
      for (let index = 0; index < PROJECT_MARKDOWN_FILES.length; index++) {
        setActiveDocumentIndex(index);
        const filename = PROJECT_MARKDOWN_FILES[index];
        if (!filename) continue;
        currentFilename = filename;
        const prior = files.find((file) => file.filename === filename);
        if (prior?.status === "completed" && prior.validation?.valid) continue;
        const generationRecord = {
          filename,
          content: prior?.content || "",
          version: prior?.version || 1,
          status: "generating" as const,
          provider: generationProviderId,
          model: generationModelId,
        };
        const recordIndex = files.findIndex((file) => file.filename === filename);
        if (recordIndex >= 0) files[recordIndex] = generationRecord;
        else files.push(generationRecord);
        working = { ...working, projectFiles: [...files] };
        setCurrentProject(working);
        await saveSoftwareProject({ data: { project: working } });
        const providerResult = await generateProjectMarkdownFile({
          data: {
            providerId: generationProviderId,
            modelId: generationModelId,
            filename,
            requirements: JSON.stringify({
              ...working.requirements,
              confirmedAnswers: working.userAnswers,
            }),
            sharedContext: formatSharedContextForRequest(loadSharedContext()),
            previousFiles: getRelevantPreviousFiles(filename, files).map(
              ({ filename: name, content }) => ({ filename: name, content }),
            ),
          },
        });
        if (providerResult.output.length > 55_000)
          throw new Error(
            `${filename} exceeded the document size limit. Retry with a more concise document.`,
          );
        const generated = toProjectFile(
          filename,
          providerResult.output,
          prior,
          providerResult.provider,
          providerResult.model,
        );
        if (!generated.validation?.valid)
          throw new Error(
            `${filename} did not pass validation: ${generated.validation?.issues.join(" ")}`,
          );
        generationProviderId = providerResult.provider;
        generationModelId = providerResult.model;
        const existingIndex = files.findIndex((file) => file.filename === filename);
        if (existingIndex >= 0) files[existingIndex] = generated;
        else files.push(generated);
        working = { ...working, projectFiles: [...files], updatedAt: new Date().toISOString() };
        setCurrentProject(working);
        await saveSoftwareProject({ data: { project: working } });
      }
      working = {
        ...working,
        documentGenerationStatus: "completed",
        workflowStage: "documents-review",
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(working);
      setWorkflowStage("documents-review");
      await saveSoftwareProject({ data: { project: working } });
      toast.success("All nine project Markdown files are ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project document generation failed.";
      setDocumentGenerationError(message);
      if (currentFilename) {
        const failedIndex = files.findIndex((file) => file.filename === currentFilename);
        const failed = {
          ...(files[failedIndex] || { filename: currentFilename, content: "", version: 1 }),
          status: "failed" as const,
          validation: { valid: false, issues: [message] },
        };
        if (failedIndex >= 0) files[failedIndex] = failed;
        else files.push(failed);
      }
      working = {
        ...working,
        projectFiles: files,
        documentGenerationStatus: "failed",
        workflowStage: "documents",
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(working);
      await saveSoftwareProject({ data: { project: working } }).catch(() => {});
      toast.error(message);
    }
  };

  const saveDocumentContent = async (approve = false) => {
    if (!currentProject) return;
    const filename = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
    if (!filename) return;
    const previous = currentProject.projectFiles?.find((file) => file.filename === filename);
    if (!previous || previous.status !== "completed") return;
    const validation = validateProjectMarkdown(filename, editedDocumentContent);
    if (!validation.valid) {
      toast.error(validation.issues.join(" "));
      return;
    }
    const contentChanged = editedDocumentContent !== previous.content;
    if (approve && contentChanged) {
      toast.error(
        "Save the edited document, rerun review and verification, then approve the new version.",
      );
      return;
    }
    if (approve && !canApproveProjectFile(previous)) {
      toast.error(
        "Run the document review and verification, then resolve every finding before approval.",
      );
      return;
    }
    const updatedFile = contentChanged
      ? toProjectFile(filename, editedDocumentContent, previous, previous.provider, previous.model)
      : { ...previous, validation, generatedAt: new Date().toISOString() };
    if (contentChanged) {
      delete updatedFile.review;
      delete updatedFile.verification;
    }
    updatedFile.approved = approve || (!contentChanged && previous.approved) || false;
    const affectedDocuments = new Set(contentChanged ? getAffectedProjectDocuments(filename) : []);
    const updatedFiles = (currentProject.projectFiles || []).map((file) => {
      if (file.filename === filename) return updatedFile;
      if (!affectedDocuments.has(file.filename)) return file;
      const {
        review: _previousReview,
        verification: _previousVerification,
        ...dependentFile
      } = file;
      return { ...dependentFile, approved: false };
    });
    const updatedProject = {
      ...currentProject,
      projectFiles: updatedFiles,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updatedProject);
    setEditedDocumentContent(editedDocumentContent);
    await saveSoftwareProject({ data: { project: updatedProject } });
    toast.success(
      approve
        ? `${filename} approved.`
        : `${filename} saved. Review and verification were reset because the content changed.`,
    );
  };

  const regenerateSelectedDocument = async () => {
    if (!currentProject) return;
    const filename = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
    if (!filename) return;
    const activeFile = currentProject.projectFiles?.find((file) => file.filename === filename);
    if (activeFile && activeFile.content !== editedDocumentContent) {
      toast.error("Save or discard your unsaved edits before regenerating this document.");
      return;
    }
    setIsDocumentReviewBusy(true);
    try {
      const selected = resolveSelectedModel(currentProject.targetAiModel || selectedAiModel);
      const previousFiles = currentProject.projectFiles || [];
      const result = await generateProjectMarkdownFile({
        data: {
          providerId: selected.providerId,
          modelId: selected.modelId,
          filename,
          requirements: JSON.stringify({
            ...currentProject.requirements,
            confirmedAnswers: currentProject.userAnswers,
          }),
          sharedContext: formatSharedContextForRequest(loadSharedContext()),
          previousFiles: getRelevantPreviousFiles(filename, previousFiles).map(
            ({ filename: name, content }) => ({ filename: name, content }),
          ),
        },
      });
      const prior = previousFiles.find((file) => file.filename === filename);
      const generated = toProjectFile(
        filename,
        result.output,
        prior,
        result.provider,
        result.model,
      );
      if (!generated.validation?.valid)
        throw new Error(generated.validation?.issues.join(" ") || `${filename} failed validation.`);
      const affectedDocuments = new Set(getAffectedProjectDocuments(filename));
      const updatedFiles = previousFiles.map((file) => {
        if (file.filename === filename) return generated;
        if (!affectedDocuments.has(file.filename)) return file;
        const {
          review: _previousReview,
          verification: _previousVerification,
          ...dependentFile
        } = file;
        return { ...dependentFile, approved: false };
      });
      if (!updatedFiles.some((file) => file.filename === filename)) updatedFiles.push(generated);
      const updatedProject = {
        ...currentProject,
        projectFiles: updatedFiles,
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(updatedProject);
      await saveSoftwareProject({ data: { project: updatedProject } });
      toast.success(`${filename} regenerated. Review, verify, and approve the new version.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document regeneration failed.");
    } finally {
      setIsDocumentReviewBusy(false);
    }
  };

  const runDocumentCheck = async (mode: "review" | "verify") => {
    if (!currentProject) return;
    const filename = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
    if (!filename) return;
    const file = currentProject.projectFiles?.find((item) => item.filename === filename);
    if (!file) return;
    if (editedDocumentContent !== file.content) {
      toast.error("Save your document edits before running a review or verification.");
      return;
    }
    if (
      mode === "verify" &&
      (!file.review || file.review.status !== "reviewed" || file.review.findings.length > 0)
    ) {
      toast.error("Review the document first and resolve all findings before verification.");
      return;
    }
    setIsDocumentReviewBusy(true);
    try {
      const selected = resolveSelectedModel(
        currentProject.reviewAiModel || currentProject.targetAiModel || selectedAiModel,
      );
      const response = await reviewProjectMarkdownFile({
        data: {
          providerId: selected.providerId,
          modelId: selected.modelId,
          mode,
          filename,
          requirements: JSON.stringify({
            ...currentProject.requirements,
            confirmedAnswers: currentProject.userAnswers,
          }),
          content: editedDocumentContent,
          relatedDocuments: getRelevantPreviousFiles(
            filename,
            currentProject.projectFiles || [],
          ).map(({ filename: relatedFilename, content }) => ({
            filename: relatedFilename,
            content: content.slice(0, 5000),
          })),
        },
      });
      const record = response.result as unknown as Record<string, unknown>;
      const files = [...(currentProject.projectFiles || [])];
      const fileIndex = files.findIndex((item) => item.filename === filename);
      if (fileIndex < 0) throw new Error("The selected project document no longer exists.");
      const currentFile = files[fileIndex]!;
      if (mode === "review") {
        const rawFindings = Array.isArray(record["findings"]) ? record["findings"] : [];
        const findings = rawFindings.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const entry = item as Record<string, unknown>;
          const severity = entry["severity"];
          const issue = entry["issue"];
          const evidence = entry["evidence"];
          const suggestion = entry["suggestion"];
          if (
            !["high", "medium", "low"].includes(String(severity)) ||
            typeof issue !== "string" ||
            typeof evidence !== "string" ||
            typeof suggestion !== "string"
          )
            return [];
          return [{ severity: severity as "high" | "medium" | "low", issue, evidence, suggestion }];
        });
        if (typeof record["summary"] !== "string" || findings.length !== rawFindings.length)
          throw new Error("The model review response did not match the required format.");
        const { verification: _oldVerification, ...fileWithoutVerification } = currentFile;
        files[fileIndex] = {
          ...fileWithoutVerification,
          approved: false,
          review: {
            status: findings.length ? "needs-changes" : "reviewed",
            summary: record["summary"],
            findings,
            provider: response.provider,
            model: response.model,
            reviewedAt: new Date().toISOString(),
          },
        };
      } else {
        const evidence = Array.isArray(record["evidence"])
          ? record["evidence"].filter((value): value is string => typeof value === "string")
          : [];
        if (
          typeof record["summary"] !== "string" ||
          typeof record["passed"] !== "boolean" ||
          !evidence.length
        )
          throw new Error("The verification response did not include a result and evidence.");
        const unsupported = Array.isArray(record["unsupportedFindings"])
          ? record["unsupportedFindings"].filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        files[fileIndex] = {
          ...currentFile,
          approved: false,
          verification: {
            status: record["passed"] && unsupported.length === 0 ? "passed" : "failed",
            summary: record["summary"],
            evidence: [...evidence, ...unsupported.map((value) => `Unsupported finding: ${value}`)],
            provider: response.provider,
            model: response.model,
            verifiedAt: new Date().toISOString(),
          },
        };
      }
      const updatedProject = {
        ...currentProject,
        projectFiles: files,
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(updatedProject);
      await saveSoftwareProject({ data: { project: updatedProject } });
      toast.success(
        mode === "review" ? "Document review complete." : "Independent verification complete.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Document ${mode} failed.`);
    } finally {
      setIsDocumentReviewBusy(false);
    }
  };

  const continueToPhasePlanning = () => {
    if (!currentProject) return;
    if (!canContinueWithProjectFiles(currentProject.projectFiles)) {
      const unapproved = PROJECT_MARKDOWN_FILES.filter(
        (filename) =>
          !currentProject.projectFiles?.find((file) => file.filename === filename)?.approved,
      );
      toast.error(`Approve all nine project files first. Still waiting: ${unapproved.join(", ")}`);
      return;
    }
    const updated = {
      ...currentProject,
      workflowStage: "granularity" as const,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updated);
    setWorkflowStage("granularity");
    void saveSoftwareProject({ data: { project: updated } }).catch((error) =>
      toast.error(error.message || "Project could not be saved."),
    );
  };

  const updateDocumentReviewModel = (model: string) => {
    if (!currentProject) return;
    const updated = {
      ...currentProject,
      reviewAiModel: model,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updated);
    void saveSoftwareProject({ data: { project: updated } }).catch((error) =>
      toast.error(error.message || "Review model preference could not be saved."),
    );
  };

  const selectProjectDocument = (index: number) => {
    const activeName = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
    const activeFile = currentProject?.projectFiles?.find((file) => file.filename === activeName);
    if (
      activeFile &&
      activeFile.content !== editedDocumentContent &&
      !window.confirm("Discard unsaved edits to this document?")
    )
      return;
    setActiveDocumentIndex(index);
  };

  // Stage a requirement-based phase plan first so users can rename and reshape it before AI calls.
  const handleStartSequentialAPIGeneration = (phaseCount: number) => {
    if (!currentProject) return;
    if (
      currentProject.workflowStage === "phase-planning" &&
      currentProject.phases.length > 0 &&
      !window.confirm("Create a fresh suggested plan? This replaces your current phase edits.")
    )
      return;

    const count = Math.max(1, phaseCount);
    setSelectedPhaseCount(count);

    const plannedPhases = planExactNPhases(currentProject.requirements, userAnswers, count);

    const projectWithPlan = {
      ...currentProject,
      phases: plannedPhases,
      granularity: count,
      workflowStage: "phase-planning" as const,
    };
    setCurrentProject(projectWithPlan);
    setSelectedPhase(plannedPhases[0] || null);
    setWorkflowStage("phase-planning");
    void saveSoftwareProject({ data: { project: projectWithPlan } }).catch((error) => {
      toast.error(error.message || "Project plan could not be saved.");
    });
  };

  const handleGeneratePlannedPrompts = () => {
    if (!currentProject || !currentProject.phases.length) return;
    const plan = { ...currentProject, workflowStage: "generating" as const };
    setGeneratingPhases(plan.phases);
    setActiveGeneratingIdx(0);
    setGenerationErrorPhaseIdx(null);
    setCurrentProject(plan);
    setWorkflowStage("generating");
    generatePhaseSequentialAPILoop(plan, plan.phases, 0);
  };

  // Sequential Generation Loop via Server AI API
  const generatePhaseSequentialAPILoop = async (
    proj: SoftwareProject,
    phases: ProjectPhase[],
    startIndex: number,
  ) => {
    const updatedPhases = [...phases];

    for (let i = startIndex; i < phases.length; i++) {
      const phase = updatedPhases[i];
      if (!phase) throw new Error(`Phase ${i + 1} is missing from the saved plan.`);
      setActiveGeneratingIdx(i);
      setGenerationErrorPhaseIdx(null);

      updatedPhases[i] = { ...phase, generationStatus: "generating" };
      setGeneratingPhases([...updatedPhases]);
      void saveSoftwareProject({
        data: { project: { ...proj, phases: updatedPhases, workflowStage: "generating" } },
      }).catch(() => {});

      const prevContext = updatedPhases
        .slice(0, i)
        .map((p) => `Phase ${p.phaseNumber} (${p.title}): ${p.objective}`)
        .join("\n");

      try {
        const generated = await generateSinglePhasePromptWithAPI({
          project: proj,
          phaseNumber: phase.phaseNumber,
          totalPhases: phases.length,
          phaseTitle: phase.title,
          previousPhasesContext: prevContext,
          useEnsemble:
            proj.targetAiModel?.includes("Ensemble") ||
            proj.targetAiModel?.includes("Concurrent") ||
            false,
        });
        const promptText = generated.output;

        updatedPhases[i] = {
          ...phase,
          prompt: promptText,
          versions: [{ version: 1, promptText, createdAt: new Date().toISOString() }],
          generationStatus: "completed",
          generationProvider: generated.provider,
          generationModel: generated.model,
        };

        setGeneratingPhases([...updatedPhases]);
        void saveSoftwareProject({
          data: { project: { ...proj, phases: updatedPhases, workflowStage: "generating" } },
        }).catch(() => {});
      } catch (error) {
        console.error(`Failed to generate prompt for Phase ${i + 1}:`, error);
        updatedPhases[i] = { ...phase, generationStatus: "failed" };
        setGeneratingPhases([...updatedPhases]);
        void saveSoftwareProject({
          data: { project: { ...proj, phases: updatedPhases, workflowStage: "generating" } },
        }).catch(() => {});
        setGenerationErrorPhaseIdx(i);
        toast.error(`API Generation failed for Phase ${i + 1}. Click 'Retry' to resume.`);
        return;
      }
    }

    const finalProj: SoftwareProject = {
      ...proj,
      granularity: phases.length,
      phases: updatedPhases,
      workflowStage: "completion",
      updatedAt: new Date().toISOString(),
    };

    setCurrentProject(finalProj);
    setSelectedPhase(updatedPhases[0] || null);
    setWorkflowStage("completion");
    void saveSoftwareProject({ data: { project: finalProj } }).catch((error) => {
      toast.error(error.message || "Generated prompts could not be saved.");
    });
    toast.success(`🎉 All ${phases.length} phase prompts generated successfully!`);
  };

  const handleRetryPhaseGeneration = (failedIdx: number) => {
    if (!currentProject) return;
    generatePhaseSequentialAPILoop(currentProject, generatingPhases, failedIdx);
  };

  // STAGE A - STEP 5: Complete & Enter Software Creation Portal
  const handleCompleteAndEnterPortal = async () => {
    if (!currentProject) return;

    const readyProj: SoftwareProject = {
      ...currentProject,
      status: "READY_TO_BUILD",
      workflowStage: "portal",
      updatedAt: new Date().toISOString(),
    };

    setIsSavingProject(true);
    try {
      await saveSoftwareProject({ data: { project: readyProj } });
      setCurrentProject(readyProj);
      if (onProjectSaved) onProjectSaved(readyProj);
      setWorkflowStage("portal");
      toast.success(`Project '${readyProj.name}' is saved and ready in the prompt portal.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Project could not be saved in this browser.",
      );
    } finally {
      setIsSavingProject(false);
    }
  };

  const savePhasePlan = (phases: ProjectPhase[], selectId = selectedPhase?.id) => {
    if (!currentProject) return;
    const updated = {
      ...currentProject,
      phases,
      granularity: phases.length,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updated);
    setSelectedPhase(phases.find((phase) => phase.id === selectId) || null);
    void saveSoftwareProject({ data: { project: updated } }).catch((error) =>
      toast.error(error.message || "Phase plan could not be saved."),
    );
  };

  const addCustomPhase = () => {
    if (!currentProject) return;
    const phaseNumber = currentProject.phases.length + 1;
    const nextRequirement = currentProject.requirements.functionalRequirements.find(
      (requirement) =>
        !currentProject.phases.some((existing) =>
          existing.requirementsCovered.includes(requirement),
        ),
    );
    const suggestedTitle = nextRequirement
      ? nextRequirement
          .trim()
          .replace(/[.!?]+$/, "")
          .slice(0, 54)
      : `${currentProject.name} follow-up`;
    const phase: ProjectPhase = {
      id: `custom-phase-${Date.now()}`,
      phaseNumber,
      title: suggestedTitle || `Phase ${phaseNumber}`,
      objective: nextRequirement || `Define an additional outcome for ${currentProject.name}.`,
      description: nextRequirement || "User-added development phase.",
      requirementsCovered: nextRequirement ? [nextRequirement] : [],
      dependencies: phaseNumber > 1 ? [phaseNumber - 1] : [],
      prerequisites: [],
      expectedOutput: "A reviewed implementation deliverable.",
      filesAffected: { create: [], modify: [], doNotBreak: [] },
      technologies: currentProject.requirements.techStack,
      complexity: "Intermediate",
      completionCriteria: [],
      prompt: "",
      promptApproved: false,
      versions: [],
      currentVersion: 1,
      status: "Not Started",
      generationStatus: "waiting",
      updatedAt: new Date().toISOString(),
    };
    savePhasePlan([...currentProject.phases, phase], phase.id);
    toast.success("Phase added. Add its objective and prompt before approving it.");
  };

  const addPhaseContextText = () => {
    if (!selectedPhase || !phaseContextTitle.trim() || !phaseContextText.trim()) return;
    const savedReferenceSize = (currentProject?.phases || [])
      .flatMap((phase) => phase.supportingFiles || [])
      .reduce((total, file) => total + file.content.length, 0);
    if (savedReferenceSize + phaseContextText.trim().length > 400_000) {
      toast.error("Phase references are limited to 400 KB per project to protect local storage.");
      return;
    }
    updateSelectedPhase({
      supportingFiles: [
        ...(selectedPhase.supportingFiles || []),
        {
          id: `phase-context-${crypto.randomUUID()}`,
          name: phaseContextTitle.trim().slice(0, 100),
          content: phaseContextText.trim().slice(0, 100_000),
          addedAt: new Date().toISOString(),
        },
      ],
    });
    setPhaseContextTitle("");
    setPhaseContextText("");
    setIsPhaseContextDialogOpen(false);
    toast.success("Phase reference saved with this project.");
  };

  const addPhaseContextFile = async (file?: File) => {
    if (!selectedPhase || !file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      toast.error("Choose a .md, .markdown, or .txt file.");
      return;
    }
    const savedReferenceSize = (currentProject?.phases || [])
      .flatMap((phase) => phase.supportingFiles || [])
      .reduce((total, reference) => total + reference.content.length, 0);
    if (savedReferenceSize + file.size > 400_000) {
      toast.error("Phase references are limited to 400 KB per project to protect local storage.");
      return;
    }
    try {
      const content = await file.text();
      updateSelectedPhase({
        supportingFiles: [
          ...(selectedPhase.supportingFiles || []),
          {
            id: `phase-file-${crypto.randomUUID()}`,
            name: file.name,
            content,
            addedAt: new Date().toISOString(),
          },
        ],
      });
      setIsPhaseContextDialogOpen(false);
      toast.success(`${file.name} added to this phase.`);
    } catch {
      toast.error("Could not read this file.");
    }
  };

  const shareProjectContext = async () => {
    if (!projectShareText.trim()) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: currentProject?.name || "Project context",
          text: projectShareText,
        });
        toast.success("Project context shared.");
      } else {
        await navigator.clipboard.writeText(projectShareText);
        toast.success("Project context copied. Paste it into a message to share.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(projectShareText);
        toast.success("Project context copied. Paste it into a message to share.");
      } catch {
        toast.error("Sharing is unavailable here. Select and copy the preview text.");
      }
    }
  };

  const updateSelectedPhase = (changes: Partial<ProjectPhase>) => {
    if (!currentProject || !selectedPhase) return;
    const updatedPhase = {
      ...selectedPhase,
      ...changes,
      promptApproved: false,
      ...(selectedPhase.generatedCode ? { generatedCodeOutdated: true } : {}),
      ...(selectedPhase.codeComparisons?.length ? { codeComparisonsOutdated: true } : {}),
      updatedAt: new Date().toISOString(),
    };
    savePhasePlan(
      currentProject.phases.map((phase) => (phase.id === updatedPhase.id ? updatedPhase : phase)),
      updatedPhase.id,
    );
  };

  const removePhase = (phaseId: string) => {
    if (!currentProject || currentProject.phases.length <= 1) {
      toast.error("A project needs at least one phase.");
      return;
    }
    if (
      !window.confirm(
        "Remove this phase from the plan? Its generated code will remain in the project archive.",
      )
    )
      return;
    const removed = currentProject.phases.find((phase) => phase.id === phaseId);
    const remaining = currentProject.phases
      .filter((phase) => phase.id !== phaseId)
      .map((phase, index) => ({
        ...phase,
        phaseNumber: index + 1,
        dependencies: phase.dependencies
          .filter((number) => number !== removed?.phaseNumber)
          .map((number) => (number > (removed?.phaseNumber || 0) ? number - 1 : number)),
        promptApproved: false,
        status: "Not Started" as const,
      }));
    const updatedProject = {
      ...currentProject,
      phases: remaining,
      archivedPhases: [...(currentProject.archivedPhases || []), ...(removed ? [removed] : [])],
      granularity: remaining.length,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updatedProject);
    setSelectedPhase(remaining[0] || null);
    void saveSoftwareProject({ data: { project: updatedProject } }).catch((error) =>
      toast.error(error.message || "Phase plan could not be saved."),
    );
    toast.success("Phase removed. Affected prompt approvals were reset.");
  };

  const movePhase = (phaseId: string, direction: -1 | 1) => {
    if (!currentProject) return;
    const phases = [...currentProject.phases];
    const index = phases.findIndex((phase) => phase.id === phaseId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= phases.length) return;
    const phase = phases[index]!;
    const neighbor = phases[nextIndex]!;
    if (
      phase.dependencies.includes(neighbor.phaseNumber) ||
      neighbor.dependencies.includes(phase.phaseNumber)
    ) {
      toast.error(
        "These phases have a dependency link. Update that dependency before reordering them.",
      );
      return;
    }
    [phases[index], phases[nextIndex]] = [phases[nextIndex]!, phases[index]!];
    const numberMap = new Map(
      currentProject.phases.map((item, oldIndex) => [
        item.phaseNumber,
        oldIndex + 1 === index + 1
          ? nextIndex + 1
          : oldIndex + 1 === nextIndex + 1
            ? index + 1
            : oldIndex + 1,
      ]),
    );
    const reordered = phases.map((item, newIndex) => ({
      ...item,
      phaseNumber: newIndex + 1,
      dependencies: item.dependencies.map((number) => numberMap.get(number) || number),
      promptApproved: false,
      status: "Not Started" as const,
    }));
    savePhasePlan(reordered, phaseId);
    toast.success("Phase order updated. Review the affected prompts before generating code.");
  };

  const handleSavePromptEdit = () => {
    if (!selectedPhase || !currentProject || !editedPromptText.trim()) return;

    const newVersionNum = selectedPhase.currentVersion + 1;
    const newVersionObj = {
      version: newVersionNum,
      promptText: editedPromptText.replace(/^#{1,6}\s+/gm, ""),
      createdAt: new Date().toISOString(),
      notes: `Manual edit v${newVersionNum}`,
    };

    const updatedPhase: ProjectPhase = {
      ...selectedPhase,
      prompt: editedPromptText.replace(/^#{1,6}\s+/gm, ""),
      promptApproved: false,
      ...(selectedPhase.generatedCode ? { generatedCodeOutdated: true } : {}),
      ...(selectedPhase.codeComparisons?.length ? { codeComparisonsOutdated: true } : {}),
      currentVersion: newVersionNum,
      versions: [...selectedPhase.versions, newVersionObj],
      updatedAt: new Date().toISOString(),
    };

    const updatedPhases = currentProject.phases.map((p) =>
      p.id === updatedPhase.id ? updatedPhase : p,
    );
    const updatedProj = { ...currentProject, phases: updatedPhases };

    setCurrentProject(updatedProj);
    setSelectedPhase(updatedPhase);
    setIsEditingPrompt(false);
    setIsPhasePromptDialogOpen(false);

    void saveSoftwareProject({ data: { project: updatedProj } }).catch((error) =>
      toast.error(error.message || "Prompt edit could not be saved."),
    );
    toast.success(`Saved Version ${newVersionNum}`);
  };

  const handleSetPhaseModel = (phaseId: string, model: string, global = false) => {
    if (!currentProject) return;
    const updatedPhases = global
      ? currentProject.phases
      : currentProject.phases.map((phase) =>
          phase.id === phaseId ? { ...phase, codeGenerationModel: model } : phase,
        );
    const updatedProject = {
      ...currentProject,
      ...(global ? { targetAiModel: model } : {}),
      phases: updatedPhases,
      updatedAt: new Date().toISOString(),
    };
    setCurrentProject(updatedProject);
    const changed = updatedPhases.find((phase) => phase.id === phaseId);
    if (changed && selectedPhase?.id === phaseId) setSelectedPhase(changed);
    void saveSoftwareProject({ data: { project: updatedProject } }).catch((error) =>
      toast.error(error.message || "Model preference could not be saved."),
    );
  };

  const handleApprovePhasePrompt = () => {
    if (!selectedPhase || !currentProject || !selectedPhase.prompt.trim()) return;
    const approved = {
      ...selectedPhase,
      promptApproved: true,
      updatedAt: new Date().toISOString(),
    };
    const updatedProject = {
      ...currentProject,
      phases: currentProject.phases.map((phase) => (phase.id === approved.id ? approved : phase)),
    };
    setCurrentProject(updatedProject);
    setSelectedPhase(approved);
    void saveSoftwareProject({ data: { project: updatedProject } }).catch((error) =>
      toast.error(error.message || "Prompt approval could not be saved."),
    );
    toast.success(`Phase ${approved.phaseNumber} prompt approved.`);
  };

  const handleGeneratePhaseCode = async (requestedPhases: ProjectPhase[]) => {
    if (!currentProject || requestedPhases.length === 0) return;
    if (generatingCodePhaseIds.length) {
      toast.info("Wait for the current code-generation batch to finish.");
      return;
    }
    if (!currentProject.requirementsConfirmed) {
      toast.error("Confirm project requirements before generating source code.");
      return;
    }
    const phases = requestedPhases.filter(
      (phase) =>
        phase.promptApproved && phase.prompt.trim() && !generatingCodePhaseIds.includes(phase.id),
    );
    if (!phases.length) {
      toast.error("Review and approve a phase prompt before generating its code.");
      return;
    }
    let working = currentProject;
    const targetIds = new Set(phases.map((phase) => phase.id));
    const processed = new Set<string>();
    let completedCount = 0;
    const failures: Error[] = [];
    setGeneratingCodePhaseIds([...targetIds]);
    try {
      while (processed.size < phases.length) {
        const completedNumbers = new Set(
          working.phases
            .filter((phase) => phase.codeGenerationStatus === "completed")
            .map((phase) => phase.phaseNumber),
        );
        const ready = selectReadyOrchestrationPhases(
          working.phases,
          targetIds,
          completedNumbers,
          processed,
          3,
        );
        const batch = selectConflictSafeOrchestrationBatch(ready, 3);
        if (!batch.length) {
          const remaining = phases.filter((phase) => !processed.has(phase.id));
          toast.error(
            `${remaining.length} phase(s) remain blocked by unfinished dependencies, a dependency cycle, or a failed prerequisite.`,
          );
          break;
        }

        const batchIds = new Set(batch.map((phase) => phase.id));
        working = {
          ...working,
          phases: working.phases.map((phase) => {
            if (!batchIds.has(phase.id)) return phase;
            const { codeGenerationError: _previousError, ...phaseWithoutError } = phase;
            return { ...phaseWithoutError, codeGenerationStatus: "generating" as const };
          }),
          updatedAt: new Date().toISOString(),
        };
        setCurrentProject(working);
        await saveSoftwareProject({ data: { project: working } });

        const results = await Promise.all(
          batch.map(async (phase) => {
            const startedAt = Date.now();
            try {
              const selected = resolveSelectedModel(
                phase.codeGenerationModel || working.targetAiModel || selectedAiModel,
              );
              const priorContext = working.phases
                .filter((item) => item.phaseNumber < phase.phaseNumber && item.generatedCode)
                .map(
                  (item) =>
                    `Phase ${item.phaseNumber}: ${item.title}\n${item.generatedCode?.slice(0, 6_000)}`,
                )
                .join("\n\n");
              const relevantDocuments = (working.projectFiles || [])
                .filter((file) =>
                  [
                    "REQUIREMENTS.md",
                    "ARCHITECTURE.md",
                    "TECH_STACK.md",
                    "DATABASE.md",
                    "UI_UX.md",
                  ].includes(file.filename),
                )
                .map(({ filename, content }) => ({ filename, content: content.slice(0, 5_000) }));
              const repositoryContext = localWorkspaceDirectory
                ? await readRepositoryContext(localWorkspaceDirectory, [
                    ...phase.filesAffected.create,
                    ...phase.filesAffected.modify,
                  ])
                : "";
              const result = await generatePhaseCode({
                data: {
                  providerId: selected.providerId,
                  modelId: selected.modelId,
                  projectName: working.name,
                  phaseNumber: phase.phaseNumber,
                  phaseTitle: phase.title,
                  reviewedPrompt: phase.prompt.replace(/^#{1,6}\s+/gm, ""),
                  requirements: JSON.stringify({
                    ...working.requirements,
                    confirmedAnswers: working.userAnswers,
                    projectDocuments: relevantDocuments,
                    phaseReferences: getPhaseReferenceContext(phase),
                  }),
                  previousPhaseContext: priorContext,
                  repositoryContext,
                },
              });
              if (!result.output.includes("```"))
                throw new Error(`${phase.title}: the model returned no file blocks.`);
              return { id: phase.id, result, durationMs: Date.now() - startedAt } as const;
            } catch (error) {
              return {
                id: phase.id,
                error: error instanceof Error ? error : new Error("Code generation failed."),
                durationMs: Date.now() - startedAt,
              } as const;
            }
          }),
        );

        const resultById = new Map(results.map((item) => [item.id, item]));
        working = {
          ...working,
          phases: working.phases.map((phase) => {
            const item = resultById.get(phase.id);
            if (!item) return phase;
            if ("error" in item) {
              failures.push(item.error);
              return {
                ...phase,
                codeGenerationStatus: "failed" as const,
                codeGenerationError: item.error.message,
                codeGenerationDurationMs: item.durationMs,
              };
            }
            completedCount++;
            const {
              codeGenerationError: _previousError,
              codeGenerationAppliedAt: _previousApplyAt,
              codeGenerationAppliedFiles: _previousAppliedFiles,
              ...phaseWithoutPreviousResults
            } = phase;
            return {
              ...phaseWithoutPreviousResults,
              generatedCode: item.result.output,
              generatedCodeOutdated: false,
              codeGenerationProvider: item.result.provider,
              codeGenerationActualModel: item.result.model,
              codeGenerationStatus: "completed" as const,
              codeGenerationDurationMs: item.durationMs,
              updatedAt: new Date().toISOString(),
            };
          }),
          updatedAt: new Date().toISOString(),
        };
        for (const phase of batch) processed.add(phase.id);
        setCurrentProject(working);
        const updatedSelected = working.phases.find((phase) => phase.id === selectedPhase?.id);
        if (updatedSelected) setSelectedPhase(updatedSelected);
        await saveSoftwareProject({ data: { project: working } });
      }
      if (failures.length)
        toast.error(
          `${completedCount} phase(s) generated; ${failures.length} failed. ${failures[0]?.message || ""}`,
        );
      else if (processed.size === phases.length)
        toast.success(
          `Real source code generated for ${completedCount} phase${completedCount === 1 ? "" : "s"}.`,
        );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation or project save failed.");
    } finally {
      setGeneratingCodePhaseIds([]);
    }
  };

  const comparePhaseModels = async (phase: ProjectPhase) => {
    if (!currentProject || !phase.promptApproved || isComparingPhaseModels) return;
    const primaryName =
      phase.codeGenerationModel || currentProject.targetAiModel || selectedAiModel;
    if (primaryName === comparisonModel) {
      toast.error("Choose a comparison model different from the primary model.");
      return;
    }
    setIsComparingPhaseModels(true);
    try {
      const names = [primaryName, comparisonModel];
      const outputs = await Promise.all(
        names.map(async (name) => {
          const selected = resolveSelectedModel(name);
          const docs = (currentProject.projectFiles || [])
            .filter((file) =>
              [
                "REQUIREMENTS.md",
                "ARCHITECTURE.md",
                "TECH_STACK.md",
                "DATABASE.md",
                "UI_UX.md",
              ].includes(file.filename),
            )
            .map(({ filename, content }) => ({ filename, content: content.slice(0, 5000) }));
          const prior = currentProject.phases
            .filter((item) => item.phaseNumber < phase.phaseNumber && item.generatedCode)
            .map(
              (item) =>
                `Phase ${item.phaseNumber}: ${item.title}\n${item.generatedCode?.slice(0, 6000)}`,
            )
            .join("\n\n");
          const repositoryContext = localWorkspaceDirectory
            ? await readRepositoryContext(localWorkspaceDirectory, [
                ...phase.filesAffected.create,
                ...phase.filesAffected.modify,
              ])
            : "";
          const result = await generatePhaseCode({
            data: {
              providerId: selected.providerId,
              modelId: selected.modelId,
              projectName: currentProject.name,
              phaseNumber: phase.phaseNumber,
              phaseTitle: phase.title,
              reviewedPrompt: phase.prompt.replace(/^#{1,6}\s+/gm, ""),
              requirements: JSON.stringify({
                ...currentProject.requirements,
                confirmedAnswers: currentProject.userAnswers,
                projectDocuments: docs,
                phaseReferences: getPhaseReferenceContext(phase),
              }),
              previousPhaseContext: prior,
              repositoryContext,
            },
          });
          if (!result.output.includes("```"))
            throw new Error(`${name} returned no named source file blocks.`);
          return {
            provider: result.provider,
            model: result.model,
            output: result.output,
            createdAt: new Date().toISOString(),
          };
        }),
      );
      const updatedPhase = {
        ...phase,
        codeComparisons: outputs,
        codeComparisonsOutdated: false,
        updatedAt: new Date().toISOString(),
      };
      const updatedProject = {
        ...currentProject,
        phases: currentProject.phases.map((item) => (item.id === phase.id ? updatedPhase : item)),
        updatedAt: new Date().toISOString(),
      };
      setCurrentProject(updatedProject);
      if (selectedPhase?.id === phase.id) setSelectedPhase(updatedPhase);
      await saveSoftwareProject({ data: { project: updatedProject } });
      toast.success(
        "Both model outputs are ready for comparison. Neither has been applied to a repository.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Model comparison failed.");
    } finally {
      setIsComparingPhaseModels(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8 font-inter">
      {/* ========================================================================================= */}
      {/* STEPPER — numbered circles with connectors, mirroring the reference form framework        */}
      {/* ========================================================================================= */}
      {workflowStage !== "portal" &&
        (() => {
          const STEPS = [
            { n: 1, label: "Requirements", stage: "create" },
            { n: 2, label: "Questions", stage: "questions" },
            { n: 3, label: "Review", stage: "review" },
            { n: 4, label: "Project files", stage: "documents" },
            { n: 5, label: "Phase count", stage: "granularity" },
            { n: 6, label: "Review phases", stage: "phase-planning" },
            { n: 7, label: "Prompts", stage: "generating" },
          ] as const;
          const activeIndex =
            workflowStage === "create"
              ? 0
              : workflowStage === "questions"
                ? 1
                : workflowStage === "review"
                  ? 2
                  : workflowStage === "documents" || workflowStage === "documents-review"
                    ? 3
                    : workflowStage === "granularity"
                      ? 4
                      : workflowStage === "phase-planning"
                        ? 5
                        : 6;
          return (
            <div className="flex items-start">
              {STEPS.map((s, i) => {
                const done = i < activeIndex;
                const active = i === activeIndex;
                return (
                  <React.Fragment key={s.n}>
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors",
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : done
                              ? "border-neutral-900 bg-white text-neutral-900"
                              : "border-neutral-200 bg-white text-neutral-400",
                        )}
                      >
                        {done ? <Check className="h-4 w-4" /> : s.n}
                      </div>
                      <span
                        className={cn(
                          "hidden whitespace-nowrap text-[11px] font-semibold sm:block",
                          active || done ? "text-neutral-900" : "text-neutral-400",
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={cn(
                          "mt-4 h-px flex-1 transition-colors",
                          i < activeIndex ? "bg-neutral-900" : "bg-neutral-200",
                        )}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}

      {/* ========================================================================================= */}
      {/* STAGE A - STEP 1: UPLOAD / ENTER REQUIREMENTS (.md, .txt, paste, photo)                  */}
      {/* ========================================================================================= */}
      {workflowStage === "create" && (
        <div className="font-inter">
          <div className="mb-7">
            <h1 className="font-sora text-[34px] font-bold leading-tight tracking-tight text-neutral-900">
              New software project
            </h1>
            <p className="mt-2 text-[15px] text-neutral-500">
              Fill in the details to generate your build prompts.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,15,15,0.04)] sm:p-9">
            <div className="mb-7">
              <h2 className="text-[19px] font-semibold tracking-tight text-neutral-900">
                Basic information
              </h2>
              <p className="mt-1 text-[14px] text-neutral-500">
                Tell us about the software you want to build.
              </p>
            </div>

            <div className="space-y-6">
              <Field label="Project name" required hint="Shown across your workspace">
                <input
                  type="text"
                  placeholder="e.g. Task Management Application"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-13 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] font-medium text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
                />
              </Field>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Field label="Target AI engine" required hint="Routes phase prompts">
                  <Select value={selectedAiModel} onValueChange={setSelectedAiModel}>
                    <SelectTrigger className="h-13 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-neutral-900 shadow-none outline-none transition-colors hover:border-neutral-300 focus:border-neutral-900 focus:ring-0 data-[state=open]:border-neutral-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-neutral-200 bg-white p-1 text-neutral-900 shadow-lg">
                      {AI_MODELS.map((m) => (
                        <SelectItem
                          key={m}
                          value={m}
                          disabled={m.includes("Not available yet") || m.includes("Simulator")}
                          className="cursor-pointer rounded-lg py-2.5 pl-3 pr-9 text-[14px] font-medium text-neutral-700 outline-none transition-colors focus:bg-neutral-100 focus:text-neutral-900 data-[state=checked]:font-semibold data-[state=checked]:text-neutral-900"
                        >
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Design reference" hint="Optional — multiple allowed">
                  <div className="space-y-2.5">
                    {uploadedImages.length > 0 && (
                      <div className="flex flex-wrap gap-2.5">
                        {uploadedImages.map((img, idx) => (
                          <div key={`${img.name}-${idx}`} className="group relative">
                            <img
                              src={img.url}
                              alt={img.name}
                              title={img.name}
                              className="h-16 w-16 rounded-xl border border-neutral-200 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              aria-label={`Remove ${img.name}`}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 opacity-0 shadow-sm transition-opacity hover:text-neutral-900 group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <input
                      type="file"
                      id="photo-input"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) handleImageUpload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById("photo-input")?.click()}
                      className="flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 text-[13px] font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {uploadedImages.length > 0
                        ? `Add more images (${uploadedImages.length})`
                        : "Upload screenshots or wireframes"}
                    </button>
                  </div>
                </Field>
              </div>

              <Field label="Brief description" hint="Optional">
                <textarea
                  placeholder="Summarize the project goals…"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  className="min-h-[110px] w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] font-medium leading-relaxed text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
                />
              </Field>

              {/* ENGINE NOTE + KEY SETTINGS */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 px-4.5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4.5 w-4.5 flex-shrink-0 text-neutral-500" />
                  <p className="text-[13px] leading-snug text-neutral-500">
                    Ensemble mode fans each phase out to multiple models and merges the strongest
                    result.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:border-neutral-900 hover:text-neutral-900 sm:self-auto"
                >
                  <Settings className="h-4 w-4" /> Multi-API keys &amp; ensemble
                </button>
              </div>
            </div>

            {/* REQUIREMENTS SUB-SECTION */}
            <div className="mt-9 border-t border-neutral-100 pt-7">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-neutral-900">
                    Requirements
                  </h3>
                  <p className="mt-1 text-[14px] text-neutral-500">
                    Upload your SRS or paste it directly.
                  </p>
                </div>
                <div className="inline-flex rounded-xl bg-neutral-100 p-1">
                  {(
                    [
                      { id: "upload", label: "Upload document", icon: FileText },
                      { id: "paste", label: "Paste text", icon: Edit3 },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRequirementSource(tab.id)}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold transition-all",
                        requirementSource === tab.id
                          ? "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(15,15,15,0.06)]"
                          : "text-neutral-500 hover:text-neutral-800",
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {requirementSource === "upload" ? (
                <div className="space-y-3.5">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                    }}
                    className={cn(
                      "group flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
                      isDragOver
                        ? "border-neutral-900 bg-neutral-50"
                        : "border-neutral-300 bg-neutral-50/60 hover:border-neutral-400",
                    )}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors group-hover:text-neutral-900">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-[15px] font-semibold text-neutral-900">
                      {isDragOver ? "Release to attach" : "Drop your SRS document here"}
                    </p>
                    <p className="mt-1 text-[13px] text-neutral-400">
                      .md, .txt, .json, .yaml or .sql &mdash; or paste it in the other tab
                    </p>
                    <input
                      type="file"
                      id="srs-file-input"
                      accept=".md,.txt,.json,.yaml,.yml,.sql"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById("srs-file-input")?.click()}
                      className="mt-5 h-9.5 rounded-lg border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900"
                    >
                      Browse files
                    </button>
                  </div>

                  {uploadedFile && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                          <FileText className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-neutral-900">
                            {uploadedFile.name}
                          </p>
                          <p className="text-[12px] text-neutral-400">
                            {(uploadedFile.size / 1024).toFixed(1)} KB &middot; attached
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        aria-label="Remove attached document"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    maxLength={MAX_REQUIREMENTS_TEXT_LENGTH}
                    placeholder={
                      "Paste raw requirements, user stories or acceptance criteria…\n\n1. As a user I can create a task\n2. Tasks support due dates"
                    }
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="min-h-[200px] w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-[13px] font-mono leading-relaxed text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
                  />
                  <p className="mt-2.5 text-right text-[12px] text-neutral-400">
                    {pastedText.trim()
                      ? `${pastedText.trim().split(/\s+/).length} words · ${pastedText.length.toLocaleString()}/${MAX_REQUIREMENTS_TEXT_LENGTH.toLocaleString()} characters`
                      : `Empty · 0/${MAX_REQUIREMENTS_TEXT_LENGTH.toLocaleString()} characters`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER ACTION BAR */}
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2.5 text-[14px] text-neutral-500">
              {projectName || uploadedFile || pastedText.trim() || uploadedImages.length > 0 ? (
                <>
                  <Check className="h-4.5 w-4.5 flex-shrink-0 text-neutral-900" />
                  <span>
                    Ready to analyse
                    {uploadedFile
                      ? ` — ${uploadedFile.name}`
                      : pastedText.trim()
                        ? " — pasted requirements"
                        : uploadedImages.length > 0
                          ? ` — ${uploadedImages.length} design reference${uploadedImages.length > 1 ? "s" : ""}`
                          : ` — ${projectName}`}
                  </span>
                </>
              ) : (
                <>
                  <HelpCircle className="h-4.5 w-4.5 flex-shrink-0 text-neutral-400" />
                  <span>
                    Add a project name, a requirements document or a design reference to continue.
                  </span>
                </>
              )}
            </p>

            <button
              onClick={handleProcessUploadAndGenerateQuestions}
              disabled={
                isAnalyzingRequirements ||
                !(projectName || uploadedFile || pastedText.trim() || uploadedImages.length > 0)
              }
              className="inline-flex h-13 flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-7 text-[14px] font-semibold uppercase tracking-[0.12em] text-white transition-all hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isAnalyzingRequirements ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" /> Analyzing requirements…
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* STAGE A - STEP 2: REQUIREMENT QUESTIONS QUESTIONNAIRE                                    */}
      {/* ========================================================================================= */}
      {workflowStage === "questions" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2 border-b pb-4">
            <span className="px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-bold uppercase tracking-wider">
              Step 2: Questions based on your requirements
            </span>
            <h2 className="text-2xl font-sora font-bold text-slate-900">
              A few details will complete {currentProject.name}.
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              These questions are based on the requirements you shared. Answer only what is still
              missing; you can review everything before generating the nine project files.
            </p>
          </div>

          <div className="space-y-6">
            {questions.map((q, index) => (
              <div
                key={q.id}
                className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3"
              >
                <span className="text-xs font-bold text-slate-900 block">
                  {index + 1}. {q.question}
                </span>
                {q.group && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {q.group}
                  </span>
                )}
                {q.whyItMatters && (
                  <p className="text-xs text-slate-500">Why it matters: {q.whyItMatters}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {q.options.map((opt) => {
                    const isSelected = userAnswers[q.question] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setUserAnswers({ ...userAnswers, [q.question]: opt })}
                        className={cn(
                          "p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between",
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400",
                        )}
                      >
                        <span>{opt}</span>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={userAnswers[q.question] || ""}
                    onChange={(event) =>
                      setUserAnswers({ ...userAnswers, [q.question]: event.target.value })
                    }
                    aria-label={`Answer to ${q.question}`}
                    placeholder="Choose an option or enter your answer"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <button
              onClick={() => setWorkflowStage("create")}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Upload
            </button>
            <button
              onClick={handleSubmitUserAnswers}
              disabled={isAnalyzingRequirements}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 shadow-md disabled:opacity-60"
            >
              {isAnalyzingRequirements ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Rechecking requirements…
                </>
              ) : (
                <>
                  Save answers & recheck <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {workflowStage === "review" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <span className="px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-bold uppercase tracking-wider">
              Requirements complete
            </span>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">Review {currentProject.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Confirm this summary to start generating the nine Markdown project files.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Problem and goal", currentProject.requirements.objective],
              ["Business objectives", currentProject.requirements.businessObjectives?.join("\n")],
              ["Target users", currentProject.requirements.targetUsers.join("\n")],
              ["Core features", currentProject.requirements.functionalRequirements.join("\n")],
              ["Platform", currentProject.requirements.platformRequirements?.join("\n")],
              [
                "Quality requirements",
                currentProject.requirements.nonFunctionalRequirements.join("\n"),
              ],
              ["Security and privacy", currentProject.requirements.security.join("\n")],
              ["Success criteria", currentProject.requirements.acceptanceCriteria?.join("\n")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-xs font-bold text-slate-800">{label}</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                  {value || "Not specified"}
                </p>
              </div>
            ))}
          </div>
          {!!currentProject.requirements.assumptions?.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-xs font-bold text-amber-900">
                Open preferences (will be labelled as assumptions)
              </h3>
              <p className="mt-2 text-sm text-amber-800">
                {currentProject.requirements.assumptions.join(" · ")}
              </p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
            <button
              onClick={() => {
                setQuestions(getRequirementReviewQuestions(currentProject.requirements));
                setUserAnswers({
                  ...currentProject.userAnswers,
                  ...answersFromRequirements(currentProject.requirements),
                });
                setWorkflowStage("questions");
              }}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold text-slate-700"
            >
              <Edit3 className="h-4 w-4" /> Revise answers
            </button>
            <button
              onClick={handleConfirmRequirements}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white"
            >
              <Check className="h-4 w-4" /> Confirm & generate nine files{" "}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {workflowStage === "documents" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
          <div>
            <span className="px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-bold uppercase tracking-wider">
              Nine-file SDLC pack
            </span>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              {documentGenerationError
                ? "Generation needs attention"
                : "Creating project documents"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Files are generated in dependency order and saved as each one passes Markdown
              validation.
            </p>
            {currentProject.documentGenerationStatus === "generating" && (
              <p
                className="mt-2 text-xs font-semibold text-slate-700"
                role="status"
                aria-live="polite"
              >
                Generating file {Math.min(activeDocumentIndex + 1, PROJECT_MARKDOWN_FILES.length)}{" "}
                of {PROJECT_MARKDOWN_FILES.length}
                {PROJECT_MARKDOWN_FILES[activeDocumentIndex]
                  ? ` · ${PROJECT_MARKDOWN_FILES[activeDocumentIndex]}`
                  : ""}
              </p>
            )}
          </div>
          <div className="space-y-2">
            {PROJECT_MARKDOWN_FILES.map((filename, index) => {
              const file = currentProject.projectFiles?.find((item) => item.filename === filename);
              const active =
                index === activeDocumentIndex &&
                currentProject.documentGenerationStatus === "generating";
              return (
                <div
                  key={filename}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <span className="w-7 text-xs text-slate-400">{index + 1}</span>
                  {file?.status === "completed" && file.validation?.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-semibold text-slate-800">{filename}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {file?.status === "completed" && file.validation?.valid
                      ? `Ready · v${file.version}`
                      : active
                        ? "Generating"
                      : file?.status === "failed"
                        ? "Needs retry"
                        : "Waiting"}
                  </span>
                </div>
              );
            })}
          </div>
          {documentGenerationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {documentGenerationError}
            </div>
          )}
          {documentGenerationError && (
            <button
              onClick={() => {
                setDocumentGenerationError(null);
                void generateProjectDocuments(currentProject);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Retry from the failed file
            </button>
          )}
        </div>
      )}

      {workflowStage === "documents-review" &&
        currentProject &&
        (() => {
          const filename = PROJECT_MARKDOWN_FILES[activeDocumentIndex];
          const activeFile = filename
            ? currentProject.projectFiles?.find((file) => file.filename === filename)
            : undefined;
          const approvedCount =
            currentProject.projectFiles?.filter((file) => file.approved).length || 0;
          return (
            <section
              className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
              aria-label="Review project documents"
            >
              <div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Review before planning
                </span>
                <h2 className="mt-4 text-2xl font-bold text-slate-900">
                  Review the nine project files
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Edit any document, run an AI review, then run a separate verification pass. Every
                  file needs your approval before phase planning.
                </p>
                <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  Review and verification model
                  <select
                    value={
                      currentProject.reviewAiModel ||
                      currentProject.targetAiModel ||
                      selectedAiModel
                    }
                    onChange={(event) => updateDocumentReviewModel(event.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
                  >
                    {AI_MODELS.filter(
                      (model) => !model.includes("Not available") && !model.includes("Simulator"),
                    ).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {PROJECT_MARKDOWN_FILES.map((name, index) => {
                  const file = currentProject.projectFiles?.find((item) => item.filename === name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectProjectDocument(index)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${index === activeDocumentIndex ? "border-slate-900 bg-slate-50 text-slate-950" : "border-slate-200 bg-white text-slate-800"}`}
                    >
                      <span className="font-semibold">{name}</span>
                      <span className="text-xs text-slate-500">
                        {file?.approved
                          ? "Approved"
                          : file?.review?.status === "needs-changes"
                            ? "Fix findings"
                            : file?.verification?.status === "passed"
                              ? "Verified"
                              : "Review"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeFile && filename && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{filename}</h3>
                      <p className="text-xs text-slate-500">
                        Version {activeFile.version} · Generated by{" "}
                        {activeFile.provider || "AI provider"} ·{" "}
                        {activeFile.model || "selected model"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${activeFile.approved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                    >
                      {activeFile.approved ? "Approved" : "Awaiting approval"}
                    </span>
                  </div>
                  <textarea
                    aria-label={`${filename} content`}
                    value={editedDocumentContent}
                    onChange={(event) => setEditedDocumentContent(event.target.value)}
                    rows={18}
                    className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs leading-relaxed text-black focus:border-slate-900 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveDocumentContent(false)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                    >
                      Save edits
                    </button>
                    <button
                      type="button"
                      disabled={isDocumentReviewBusy}
                      onClick={() => void runDocumentCheck("review")}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    >
                      {isDocumentReviewBusy ? "Checking…" : "AI review"}
                    </button>
                    <button
                      type="button"
                      disabled={isDocumentReviewBusy}
                      onClick={() => void regenerateSelectedDocument()}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    >
                      Regenerate file
                    </button>
                    <button
                      type="button"
                      disabled={
                        isDocumentReviewBusy ||
                        !activeFile.review ||
                        activeFile.review.status !== "reviewed" ||
                        activeFile.review.findings.length > 0
                      }
                      onClick={() => void runDocumentCheck("verify")}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    >
                      Independent verify
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canApproveProjectFile(activeFile) ||
                        editedDocumentContent !== activeFile.content
                      }
                      onClick={() => void saveDocumentContent(true)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Approve file
                    </button>
                  </div>
                  {activeFile.review && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                      <p className="font-semibold">Review · {activeFile.review.status}</p>
                      <p className="mt-1">{activeFile.review.summary}</p>
                      {activeFile.review.findings.map((finding, index) => (
                        <div
                          key={`${finding.issue}-${index}`}
                          className="mt-3 border-t border-slate-200 pt-3"
                        >
                          <p className="font-semibold">
                            {finding.severity.toUpperCase()}: {finding.issue}
                          </p>
                          <p className="mt-1">
                            <span className="font-semibold">Evidence:</span> {finding.evidence}
                          </p>
                          <p className="mt-1">
                            <span className="font-semibold">Suggested change:</span>{" "}
                            {finding.suggestion}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeFile.verification && (
                    <div
                      className={`rounded-xl border p-4 text-sm ${activeFile.verification.status === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}
                    >
                      <p className="font-semibold">
                        Verification · {activeFile.verification.status}
                      </p>
                      <p className="mt-1">{activeFile.verification.summary}</p>
                      <ul className="mt-2 list-disc pl-5">
                        {activeFile.verification.evidence.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600">
                  {approvedCount} of {PROJECT_MARKDOWN_FILES.length} files approved
                </p>
                <button
                  type="button"
                  onClick={continueToPhasePlanning}
                  disabled={!canContinueWithProjectFiles(currentProject.projectFiles)}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue to phase planning
                </button>
              </div>
            </section>
          );
        })()}

      {/* ========================================================================================= */}
      {/* STAGE A - STEP 3: ASK NUMBER OF PHASES                                                    */}
      {/* ========================================================================================= */}
      {workflowStage === "granularity" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-8 text-center max-w-3xl mx-auto">
          <div className="space-y-2">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-sora font-bold text-slate-900">
              How many development phases do you want?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-lg mx-auto">
              Choose the number of dependency-ordered work packages. The plan uses your analyzed
              scope, and each phase prompt is generated by the selected provider.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {[5, 10, 15, 20, 30, 50, 100].map((count) => (
              <button
                key={count}
                onClick={() => handleStartSequentialAPIGeneration(count)}
                className="p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:border-slate-900 hover:bg-slate-900 hover:text-white transition-all text-left group flex flex-col justify-between h-24 shadow-2xs"
              >
                <span className="text-xl font-sora font-bold group-hover:text-white">{count}</span>
                <span className="text-xs font-bold text-slate-800 group-hover:text-slate-200">
                  {count} Prompts
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {workflowStage === "phase-planning" && currentProject && (
        <section className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Review phase plan · {currentProject.name}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                Shape the work before prompts
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Rename phases and change their objectives. Prompt generation starts only after you
                continue.
              </p>
            </div>
            <button
              type="button"
              onClick={addCustomPhase}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add phase
            </button>
          </div>
          <div className="space-y-3">
            {currentProject.phases.map((phase) => (
              <article
                key={phase.id}
                className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-start"
              >
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  Phase {phase.phaseNumber} name
                  <input
                    maxLength={100}
                    value={phase.title}
                    onChange={(event) =>
                      savePhasePlan(
                        currentProject.phases.map((item) =>
                          item.id === phase.id
                            ? { ...item, title: event.target.value, promptApproved: false }
                            : item,
                        ),
                        phase.id,
                      )
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  What this phase should deliver
                  <textarea
                    rows={2}
                    value={phase.objective}
                    onChange={(event) =>
                      savePhasePlan(
                        currentProject.phases.map((item) =>
                          item.id === phase.id
                            ? { ...item, objective: event.target.value, promptApproved: false }
                            : item,
                        ),
                        phase.id,
                      )
                    }
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove phase ${phase.phaseNumber}`}
                  onClick={() => removePhase(phase.id)}
                  disabled={currentProject.phases.length <= 1}
                  className="mt-5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setWorkflowStage("granularity")}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleGeneratePlannedPrompts}
              disabled={
                !currentProject.phases.every(
                  (phase) => phase.title.trim() && phase.objective.trim(),
                )
              }
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Generate {currentProject.phases.length} prompts
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================================= */}
      {/* STAGE A - STEP 4: DEDICATED SEQUENTIAL PROMPT GENERATION SCREEN (EXACTLY N PROMPTS)      */}
      {/* ========================================================================================= */}
      {workflowStage === "generating" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2 border-b pb-4">
            <span className="px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 w-fit">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating Development Prompts via
              Server AI API
            </span>
            <h2 className="text-2xl font-sora font-bold text-slate-900">{currentProject.name}</h2>
            <p className="text-xs text-slate-500 font-medium">
              Generating prompt {activeGeneratingIdx + 1} of {generatingPhases.length}...
            </p>
          </div>

          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
            {generatingPhases.map((phase, idx) => {
              const isDone = phase.generationStatus === "completed";
              const isCurrent =
                idx === activeGeneratingIdx && phase.generationStatus === "generating";
              const isFailed = phase.generationStatus === "failed";

              return (
                <div
                  key={phase.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4",
                    isDone
                      ? "bg-emerald-50/50 border-emerald-200 text-emerald-950"
                      : isCurrent
                        ? "bg-purple-50 border-purple-600 shadow-md ring-2 ring-purple-600/10"
                        : isFailed
                          ? "bg-red-50 border-red-200 text-red-950"
                          : "bg-slate-50 border-slate-200 opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs",
                        isDone
                          ? "bg-emerald-600 text-white"
                          : isCurrent
                            ? "bg-purple-600 text-white animate-pulse"
                            : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-sora font-bold block">
                        Phase {phase.phaseNumber}: {phase.title}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">
                        {isDone
                          ? "Prompt generated ✓"
                          : isCurrent
                            ? "Calling AI API..."
                            : isFailed
                              ? "Generation Failed"
                              : "Waiting"}
                      </span>
                    </div>
                  </div>

                  {isFailed && (
                    <button
                      onClick={() => handleRetryPhaseGeneration(idx)}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Phase {idx + 1}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* STAGE A - STEP 5: PROMPT COMPLETION SCREEN & [ COMPLETE & ENTER SOFTWARE CREATION ]       */}
      {/* ========================================================================================= */}
      {workflowStage === "completion" && currentProject && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-3 text-center">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-300 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-sora font-bold">🎉 Your development plan is ready!</h2>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              {generatingPhases.length} / {generatingPhases.length} context-aware prompts generated
              successfully for <span className="font-bold text-white">{currentProject.name}</span>.
            </p>

            <div className="pt-2">
              <button
                onClick={handleCompleteAndEnterPortal}
                disabled={isSavingProject}
                className="px-8 py-4 bg-emerald-500 text-slate-950 font-sora font-extrabold text-sm uppercase tracking-wider rounded-2xl hover:bg-emerald-400 transition-all shadow-xl hover:scale-105"
              >
                {isSavingProject ? "Saving project…" : "Save & Enter Prompt Portal →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* STAGE B: SOFTWARE CREATION PORTAL (HORIZONTAL TIMELINE & PROMPT WORKBENCH)                */}
      {/* ========================================================================================= */}
      {workflowStage === "portal" && currentProject && (
        <div className="space-y-6">
          {/* ULTRA-MINIMAL COMPACT PORTAL HEADER BAR */}
          <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3 shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-base font-sora font-bold text-slate-900 truncate">
                {currentProject.name}
              </h1>
              <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                {currentProject.phases.length} Phases
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  Source generated:{" "}
                  {
                    currentProject.phases.filter(
                      (phase) => phase.codeGenerationStatus === "completed",
                    ).length
                  }
                  /{currentProject.phases.length}
                </span>
              </div>
            </div>

            {/* PORTAL TOP ACTIONS BAR */}
            <div className="flex items-center gap-2 relative">
              <button
                type="button"
                aria-pressed={showOrchestration}
                onClick={() => setShowOrchestration((visible) => !visible)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                  showOrchestration
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
                )}
              >
                <Workflow className="w-3.5 h-3.5" />
                {showOrchestration ? "Back to project" : "Code & model flow"}
              </button>

              <button
                type="button"
                onClick={() => setIsChatDrawerOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Project Brain Chat
              </button>

              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" /> Multi-API
              </button>

              <button
                onClick={() => setShowPortalHeaderActions(!showPortalHeaderActions)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-slate-200"
              >
                <span>Actions</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    showPortalHeaderActions && "rotate-180",
                  )}
                />
              </button>

              {/* DROPDOWN MENU - INITIALLY HIDDEN */}
              {showPortalHeaderActions && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 z-30 space-y-1 animate-in fade-in slide-in-from-top-2">
                  <button
                    onClick={() => {
                      triggerZipDownload(currentProject);
                      setShowPortalHeaderActions(false);
                      toast.success(`Downloaded '${currentProject.name}' project files as .zip.`);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-100 rounded-xl flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-emerald-600" /> Download project
                  </button>

                  <button
                    onClick={() => {
                      setProjectShareText(buildProjectShareContext(currentProject));
                      setIsProjectShareDialogOpen(true);
                      setShowPortalHeaderActions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-100 rounded-xl flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4 text-slate-600" /> Share project context
                  </button>

                  <button
                    onClick={() => {
                      setCurrentProject(null);
                      setProjectName("");
                      setProjectDescription("");
                      setPastedText("");
                      setUploadedFile(null);
                      setUploadedImages([]);
                      setWorkflowStage("create");
                      setShowPortalHeaderActions(false);
                      toast.info("Starting a new Software Project setup...");
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-100 rounded-xl flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-slate-600" /> New Software Project
                  </button>
                </div>
              )}
            </div>
          </div>

          {showOrchestration ? (
            <OrchestrationDashboard
              projects={[currentProject]}
              selectedProjectId={currentProject.id}
              onSelectProject={() => undefined}
              onProjectSaved={(project) => {
                setCurrentProject(project);
                setGeneratingPhases(project.phases);
                setSelectedPhase(
                  (current) =>
                    project.phases.find((phase) => phase.id === current?.id) ||
                    project.phases[0] ||
                    null,
                );
                onProjectSaved?.(project);
              }}
              onCreateProject={() => undefined}
            />
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Nine project files</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Confirmed Markdown documents for planning and AI-assisted implementation.
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {currentProject.projectFiles?.filter(
                      (file) => file.status === "completed" && file.validation?.valid,
                    ).length || 0}{" "}
                    / 9 ready
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PROJECT_MARKDOWN_FILES.map((filename) => {
                    const file = currentProject.projectFiles?.find(
                      (item) => item.filename === filename,
                    );
                    return (
                      <div
                        key={filename}
                        className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                          {filename}
                        </span>
                        {file?.status === "completed" && file.validation?.valid ? (
                          <button
                            type="button"
                            title={`Download ${filename}`}
                            onClick={() => {
                              const url = URL.createObjectURL(
                                new Blob([file.content], { type: "text/markdown;charset=utf-8" }),
                              );
                              const anchor = document.createElement("a");
                              anchor.href = url;
                              anchor.download = filename;
                              anchor.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-900"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* HORIZONTAL PHASE PROCESS TIMELINE (MATCHING USER'S IMAGE DESIGN) */}
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-6 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-sora font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-500" /> Project workflow
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Edit the plan and approve each prompt before code generation.
                    </span>
                    <button
                      type="button"
                      onClick={addCustomPhase}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Add phase
                    </button>
                  </div>
                </div>

                {/* CONNECTED TIMELINE PROGRESS BAR */}
                <div className="pt-3 pb-2 overflow-x-auto custom-scrollbar">
                  <div className="relative min-w-[700px] px-2 pt-1 pb-2">
                    {/* Background Line */}
                    <div className="absolute top-[24px] left-8 right-8 h-1 bg-slate-200 rounded-full z-0" />

                    {/* Progress reflects source-generation requests that returned files. */}
                    <div
                      className="absolute top-[24px] left-8 h-1 bg-gradient-to-r from-slate-900 via-amber-500 to-amber-400 rounded-full z-0 transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (currentProject.phases.filter(
                            (phase) => phase.codeGenerationStatus === "completed",
                          ).length /
                            Math.max(1, currentProject.phases.length)) *
                            100,
                        )}%`,
                      }}
                    />

                    {/* NODES ROW */}
                    <div className="relative z-10 flex items-center justify-between">
                      {currentProject.phases.map((phase, idx) => {
                        const isCompleted = phase.codeGenerationStatus === "completed";
                        const isInProgress = phase.codeGenerationStatus === "generating";
                        const isFailed = phase.codeGenerationStatus === "failed";
                        const isSelected = selectedPhase?.id === phase.id;
                        const numStr =
                          phase.phaseNumber < 10 ? `0${phase.phaseNumber}` : `${phase.phaseNumber}`;

                        return (
                          <div
                            key={phase.id}
                            onClick={() => {
                              setSelectedPhase(phase);
                              setIsEditingPrompt(false);
                            }}
                            className="flex flex-col items-center cursor-pointer group"
                          >
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-sora text-xs font-bold transition-all duration-300 border-2 bg-white relative",
                                isCompleted
                                  ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-105"
                                  : isInProgress
                                    ? "border-amber-500 text-slate-900 shadow-sm scale-105 font-bold"
                                    : isFailed
                                      ? "border-red-400 text-red-700"
                                      : isSelected
                                        ? "border-slate-900 text-slate-900 ring-4 ring-slate-100 scale-105"
                                        : "border-slate-300 text-slate-400 group-hover:border-slate-500",
                              )}
                            >
                              {/* Spinning Loading Ring around node when in progress */}
                              {isInProgress && (
                                <div className="absolute -inset-1 border-2 border-amber-500 border-t-transparent border-r-transparent rounded-full animate-spin" />
                              )}

                              {isCompleted ? (
                                <Check className="w-5 h-5 text-white stroke-[3]" />
                              ) : (
                                <span>{numStr}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* STEP CARDS BELOW NODES (SHOWING ALL PHASES UP TO 10+) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-4">
                      {currentProject.phases.map((phase) => {
                        const isCompleted = phase.codeGenerationStatus === "completed";
                        const isInProgress = phase.codeGenerationStatus === "generating";
                        const isFailed = phase.codeGenerationStatus === "failed";
                        const isSelected = selectedPhase?.id === phase.id;

                        return (
                          <div
                            key={phase.id}
                            onClick={() => {
                              setSelectedPhase(phase);
                              setIsEditingPrompt(false);
                            }}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-28 text-left relative overflow-hidden",
                              isCompleted
                                ? "bg-slate-50 border-slate-200"
                                : isInProgress
                                  ? "bg-amber-50/60 border-amber-400 ring-1 ring-amber-200"
                                  : isFailed
                                    ? "bg-red-50 border-red-300"
                                    : isSelected
                                      ? "bg-white border-slate-900 shadow-md ring-2 ring-slate-900/10"
                                      : "bg-slate-50/50 border-slate-200/80 hover:bg-white hover:border-slate-300",
                            )}
                          >
                            <div>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                Step{" "}
                                {phase.phaseNumber < 10
                                  ? `0${phase.phaseNumber}`
                                  : phase.phaseNumber}
                              </span>
                              <h4
                                className={cn(
                                  "text-xs font-sora font-bold line-clamp-2 leading-tight",
                                  isCompleted
                                    ? "text-slate-900"
                                    : isInProgress
                                      ? "text-slate-900 font-extrabold"
                                      : isFailed
                                        ? "text-red-800"
                                        : "text-slate-800",
                                )}
                              >
                                {phase.title}
                              </h4>
                            </div>

                            <div className="flex items-center justify-between text-[10px] font-bold">
                              {isCompleted ? (
                                <span className="text-amber-700 flex items-center gap-1 font-bold">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />{" "}
                                  Source ready
                                </span>
                              ) : isInProgress ? (
                                <span className="text-amber-700 flex items-center gap-1 font-bold">
                                  <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />{" "}
                                  Generating code
                                </span>
                              ) : isFailed ? (
                                <span className="text-red-700">Generation failed</span>
                              ) : (
                                <span className="text-slate-400">
                                  {phase.promptApproved ? "Prompt approved" : "Needs review"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* SELECTED PHASE FIRST, THEN THE FULL PHASE LIST */}
              <div className="grid grid-cols-1 gap-6">
                {/* ALL PHASES: SELECT ONE TO EDIT */}
                <div className="order-2 space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Project phases
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {currentProject.phases.length} Total
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {currentProject.phases.map((phase) => {
                      const isSelected = selectedPhase?.id === phase.id;

                      return (
                        <div
                          key={phase.id}
                          onClick={() => {
                            setSelectedPhase(phase);
                            setIsEditingPrompt(false);
                          }}
                          className={cn(
                            "p-4 rounded-2xl border transition-all cursor-pointer space-y-2",
                            isSelected
                              ? "bg-white border-slate-900 shadow-md ring-2 ring-slate-900/10"
                              : "bg-white/80 border-slate-200 hover:border-slate-400",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              Phase{" "}
                              {phase.phaseNumber < 10 ? `0${phase.phaseNumber}` : phase.phaseNumber}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  phase.codeGenerationStatus === "completed"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : phase.codeGenerationStatus === "generating"
                                      ? "border-slate-300 bg-slate-100 text-slate-700"
                                      : phase.codeGenerationStatus === "failed"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : phase.promptApproved
                                          ? "border-slate-300 bg-white text-slate-700"
                                          : "border-slate-200 bg-slate-50 text-slate-500",
                                )}
                              >
                                {phase.codeGenerationStatus === "completed"
                                  ? "Source ready"
                                  : phase.codeGenerationStatus === "generating"
                                    ? "Generating"
                                    : phase.codeGenerationStatus === "failed"
                                      ? "Failed"
                                      : phase.promptApproved
                                        ? "Prompt approved"
                                        : "Needs review"}
                              </span>
                              <button
                                type="button"
                                title={`Add a note or reference to ${phase.title}`}
                                aria-label={`Add note or reference to phase ${phase.phaseNumber}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedPhase(phase);
                                  setPhaseContextTitle("");
                                  setPhaseContextText("");
                                  setIsPhaseContextDialogOpen(true);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <h3 className="text-xs font-sora font-bold text-slate-900">
                            {phase.title}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium line-clamp-2">
                            {phase.objective}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SELECTED PHASE WORKBENCH */}
                <div className="order-1">
                  {selectedPhase ? (
                    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-6">
                      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded text-[10px] font-bold uppercase">
                              Phase {selectedPhase.phaseNumber}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                              v{selectedPhase.currentVersion}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setDiffTargetPhase(selectedPhase);
                                setIsDiffModalOpen(true);
                              }}
                              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center gap-1 transition-all"
                              title="Inspect Version History"
                            >
                              <History className="w-3 h-3" /> History
                            </button>
                          </div>
                          <h2 className="mt-3 text-xl font-bold text-slate-950">
                            {selectedPhase.title}
                          </h2>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {selectedPhase.objective}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {selectedPhase.codeGenerationProvider &&
                            selectedPhase.codeGenerationActualModel
                              ? `Code generated by ${selectedPhase.codeGenerationProvider} · ${selectedPhase.codeGenerationActualModel}`
                              : `Code model: ${selectedPhase.codeGenerationModel || currentProject.targetAiModel || "not specified"}`}
                          </p>
                          <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                              Edit phase details
                            </summary>
                            <div className="mt-3 space-y-3">
                              <label className="block text-xs font-semibold text-slate-700">
                                Phase name
                                <input
                                  aria-label="Phase name"
                                  value={selectedPhase.title}
                                  onChange={(event) =>
                                    updateSelectedPhase({ title: event.target.value })
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-slate-700">
                                Objective
                                <textarea
                                  aria-label="Phase objective"
                                  value={selectedPhase.objective}
                                  onChange={(event) =>
                                    updateSelectedPhase({ objective: event.target.value })
                                  }
                                  rows={2}
                                  className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-slate-700">
                                Dependencies
                                <input
                                  aria-label="Phase dependencies"
                                  value={selectedPhase.dependencies.join(", ")}
                                  onChange={(event) => {
                                    const dependencies = [
                                      ...new Set(
                                        event.target.value
                                          .split(",")
                                          .map((value) => Number(value.trim()))
                                          .filter(
                                            (value) =>
                                              Number.isInteger(value) &&
                                              value > 0 &&
                                              value < selectedPhase.phaseNumber,
                                          ),
                                      ),
                                    ];
                                    updateSelectedPhase({ dependencies });
                                  }}
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                                />
                              </label>
                              <div className="border-t border-slate-200 pt-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-800">
                                      Phase references
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Add notes or Markdown/text files for this phase.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Add a text note"
                                      aria-label="Add phase text"
                                      onClick={() => setIsPhaseContextDialogOpen(true)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                    <label
                                      title="Attach a Markdown or text file"
                                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                    >
                                      <FilePlus2 className="h-4 w-4" />
                                      <span className="sr-only">Attach phase reference</span>
                                      <input
                                        type="file"
                                        accept=".md,.markdown,.txt,text/markdown,text/plain"
                                        className="sr-only"
                                        onChange={(event) => {
                                          void addPhaseContextFile(event.target.files?.[0]);
                                          event.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                                {(selectedPhase.supportingFiles || []).length > 0 && (
                                  <ul className="mt-2 space-y-1">
                                    {selectedPhase.supportingFiles?.map((file) => (
                                      <li
                                        key={file.id}
                                        className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                                      >
                                        <span className="truncate">{file.name}</span>
                                        <button
                                          type="button"
                                          aria-label={`Remove ${file.name}`}
                                          onClick={() =>
                                            updateSelectedPhase({
                                              supportingFiles: (
                                                selectedPhase.supportingFiles || []
                                              ).filter((item) => item.id !== file.id),
                                            })
                                          }
                                          className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </details>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                          <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                            {selectedPhase.codeGenerationStatus === "completed"
                              ? "Source files saved"
                              : selectedPhase.codeGenerationStatus === "generating"
                                ? "Provider request running"
                                : selectedPhase.codeGenerationStatus === "failed"
                                  ? "Generation failed · retry below"
                                  : selectedPhase.promptApproved
                                    ? "Ready for code generation"
                                    : "Review and approve the prompt"}
                          </span>
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                              More
                            </summary>
                            <div className="absolute right-0 z-20 mt-2 grid min-w-40 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                              <button
                                type="button"
                                onClick={() => movePhase(selectedPhase.id, -1)}
                                className="rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Move up
                              </button>
                              <button
                                type="button"
                                onClick={() => movePhase(selectedPhase.id, 1)}
                                className="rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Move down
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  triggerZipDownload(currentProject);
                                  toast.success(
                                    `Downloaded '${currentProject.name}' project files as .zip.`,
                                  );
                                }}
                                className="rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Download project
                              </button>
                              <button
                                type="button"
                                onClick={() => removePhase(selectedPhase.id)}
                                className="rounded-md px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                              >
                                Remove phase
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              Code generation
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Review the prompt, then generate files for this phase.
                            </p>
                          </div>
                          <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Provider setup
                          </button>
                        </div>

                        {/* Explicit model choice and review/approval gate */}
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
                          <details className="text-xs md:col-span-2">
                            <summary className="cursor-pointer font-semibold text-slate-700">
                              Project default model
                            </summary>
                            <label className="mt-2 block max-w-md space-y-1.5 font-semibold text-slate-800">
                              Applies when a phase has no model override
                              <Select
                                value={currentProject.targetAiModel || selectedAiModel}
                                onValueChange={(model) =>
                                  handleSetPhaseModel(selectedPhase.id, model, true)
                                }
                              >
                                <SelectTrigger
                                  aria-label="Project default model"
                                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-none focus:ring-0"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[70] max-h-60 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg">
                                  {AI_MODELS.filter(
                                    (model) =>
                                      !model.includes("Not available") &&
                                      !model.includes("Simulator"),
                                  ).map((model) => (
                                    <SelectItem
                                      key={model}
                                      value={model}
                                      className="cursor-pointer"
                                    >
                                      {model}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          </details>
                          <label className="space-y-1.5 text-xs font-semibold text-slate-800">
                            Model for Phase {selectedPhase.phaseNumber}
                            <Select
                              value={
                                selectedPhase.codeGenerationModel ||
                                currentProject.targetAiModel ||
                                selectedAiModel
                              }
                              onValueChange={(model) =>
                                handleSetPhaseModel(selectedPhase.id, model)
                              }
                            >
                              <SelectTrigger
                                aria-label={`Model for Phase ${selectedPhase.phaseNumber}`}
                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-none focus:ring-0"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-[70] max-h-60 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg">
                                {AI_MODELS.filter(
                                  (model) =>
                                    !model.includes("Not available") &&
                                    !model.includes("Simulator"),
                                ).map((model) => (
                                  <SelectItem key={model} value={model} className="cursor-pointer">
                                    {model}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                          <details className="text-xs">
                            <summary className="cursor-pointer font-semibold text-slate-700">
                              Compare with another model
                            </summary>
                            <label className="mt-2 block space-y-1.5 font-semibold text-slate-800">
                              Comparison model
                              <Select value={comparisonModel} onValueChange={setComparisonModel}>
                                <SelectTrigger
                                  aria-label="Comparison model"
                                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-none focus:ring-0"
                                >
                                  <SelectValue placeholder="Choose a model" />
                                </SelectTrigger>
                                <SelectContent
                                  position="popper"
                                  side="top"
                                  sideOffset={4}
                                  className="z-[70] max-h-60 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg"
                                >
                                  {AI_MODELS.filter(
                                    (model) =>
                                      !model.includes("Not available") &&
                                      !model.includes("Simulator") &&
                                      model !==
                                        (selectedPhase.codeGenerationModel ||
                                          currentProject.targetAiModel ||
                                          selectedAiModel),
                                  ).map((model) => (
                                    <SelectItem
                                      key={model}
                                      value={model}
                                      className="cursor-pointer"
                                    >
                                      {model}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            <button
                              type="button"
                              onClick={() => void comparePhaseModels(selectedPhase)}
                              disabled={
                                !selectedPhase.promptApproved ||
                                isComparingPhaseModels ||
                                isEditingPrompt
                              }
                              className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 disabled:opacity-50"
                            >
                              {isComparingPhaseModels ? "Comparing…" : "Run comparison"}
                            </button>
                          </details>
                          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                            <button
                              type="button"
                              onClick={() => void handleGeneratePhaseCode([selectedPhase])}
                              disabled={
                                !selectedPhase.promptApproved ||
                                isEditingPrompt ||
                                generatingCodePhaseIds.includes(selectedPhase.id) ||
                                !selectedPhase.prompt.trim()
                              }
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                            >
                              {generatingCodePhaseIds.includes(selectedPhase.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Code className="h-3.5 w-3.5" />
                              )}
                              {generatingCodePhaseIds.includes(selectedPhase.id)
                                ? "Generating code…"
                                : "Generate code"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleGeneratePhaseCode(
                                  currentProject.phases.filter(
                                    (phase) =>
                                      phase.id !== selectedPhase.id &&
                                      phase.promptApproved &&
                                      phase.prompt.trim() &&
                                      (!phase.generatedCode || phase.generatedCodeOutdated) &&
                                      !generatingCodePhaseIds.includes(phase.id),
                                  ),
                                )
                              }
                              disabled={!hasOtherApprovedPhasesToGenerate}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            >
                              Generate other approved phases
                            </button>
                          </div>
                          {!selectedPhase.promptApproved || isEditingPrompt ? (
                            <p
                              className="text-xs leading-5 text-slate-600 md:col-span-2"
                              role="status"
                            >
                              {isEditingPrompt
                                ? "Save your prompt edits, then approve the prompt to enable code generation."
                                : "Approve this phase prompt below to enable code generation."}
                            </p>
                          ) : null}
                          {!hasOtherApprovedPhasesToGenerate && (
                            <p
                              className="text-xs leading-5 text-slate-600 md:col-span-2"
                              role="status"
                            >
                              Approve another phase prompt to enable batch generation.
                            </p>
                          )}
                        </div>

                        {selectedPhase.codeComparisons &&
                          selectedPhase.codeComparisons.length > 0 && (
                            <section
                              className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"
                              aria-label="Model output comparison"
                            >
                              <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                  Model comparison
                                  {selectedPhase.codeComparisonsOutdated ? " · older prompt" : ""}
                                </h3>
                                <p className="text-xs text-slate-600">
                                  Two independent API outputs for the approved prompt. Review them
                                  and choose which output to keep by generating it as the primary
                                  result. These outputs are preserved when prompts change.
                                </p>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2">
                                {selectedPhase.codeComparisons.map((comparison, index) => (
                                  <article
                                    key={`${comparison.provider}-${comparison.model}-${index}`}
                                    className="rounded-xl border border-slate-200 bg-white p-3"
                                  >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <p className="text-xs font-bold text-slate-900">
                                        {comparison.provider} · {comparison.model}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void navigator.clipboard
                                            .writeText(comparison.output)
                                            .then(() => toast.success("Comparison output copied."))
                                        }
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                    <textarea
                                      readOnly
                                      value={comparison.output}
                                      rows={12}
                                      aria-label={`Comparison output from ${comparison.model}`}
                                      className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-[11px] leading-relaxed text-black"
                                    />
                                  </article>
                                ))}
                              </div>
                            </section>
                          )}

                        {selectedPhase.generatedCodeOutdated && (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                            These source files were generated from an earlier phase prompt and are
                            preserved for review. Generate again after approving the updated prompt.
                          </p>
                        )}

                        <LocalCodeWorkspacePanel
                          phase={selectedPhase}
                          directory={localWorkspaceDirectory}
                          onDirectorySelected={setLocalWorkspaceDirectory}
                          onApplied={async (files) => {
                            const phaseId = selectedPhase?.id;
                            if (!currentProject || !phaseId)
                              throw new Error("Project or phase is no longer selected.");
                            const updatedAt = new Date().toISOString();
                            const updatedProject = {
                              ...currentProject,
                              phases: currentProject.phases.map((phase) =>
                                phase.id === phaseId
                                  ? {
                                      ...phase,
                                      codeGenerationAppliedAt: updatedAt,
                                      codeGenerationAppliedFiles: files,
                                      updatedAt,
                                    }
                                  : phase,
                              ),
                              updatedAt,
                            };
                            setCurrentProject(updatedProject);
                            const updatedSelected = updatedProject.phases.find(
                              (phase) => phase.id === phaseId,
                            );
                            if (updatedSelected) setSelectedPhase(updatedSelected);
                            await saveSoftwareProject({ data: { project: updatedProject } });
                          }}
                        />

                        {/* INTERACTIVE MULTI-FILE CODE EXPLORER */}
                        {(() => {
                          const phaseArtifacts = selectedPhase?.generatedCode
                            ? ArtifactEngine.extractArtifactsFromOutput(
                                selectedPhase.phaseNumber,
                                selectedPhase.title,
                                selectedPhase.generatedCode,
                              )
                            : [];
                          const safeIdx =
                            selectedArtifactIdx < phaseArtifacts.length ? selectedArtifactIdx : 0;
                          const activeArtifact = phaseArtifacts[safeIdx];

                          return (
                            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                                <div className="flex items-center gap-2">
                                  <FileCode className="w-4 h-4 text-slate-700" />
                                  <span className="text-xs font-bold text-slate-900 tracking-wide">
                                    Generated Code Artifacts ({phaseArtifacts.length}{" "}
                                    {phaseArtifacts.length === 1 ? "file" : "files"})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (activeArtifact) {
                                        navigator.clipboard.writeText(activeArtifact.content);
                                        toast.success(
                                          `Copied '${activeArtifact.fileName}' to clipboard!`,
                                        );
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                                  >
                                    <Copy className="w-3 h-3 text-slate-400" /> Copy File
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!activeArtifact) return;
                                      const url = URL.createObjectURL(
                                        new Blob([activeArtifact.content], {
                                          type: "text/plain;charset=utf-8",
                                        }),
                                      );
                                      const anchor = document.createElement("a");
                                      anchor.href = url;
                                      anchor.download =
                                        activeArtifact.filePath.split("/").pop() ||
                                        activeArtifact.fileName;
                                      anchor.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    disabled={!activeArtifact}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition disabled:opacity-50"
                                  >
                                    <Download className="w-3 h-3" /> Download file
                                  </button>
                                  <button
                                    onClick={() => {
                                      triggerZipDownload(currentProject);
                                      toast.success("Downloading full codebase .zip archive...");
                                    }}
                                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                                  >
                                    <Download className="w-3 h-3" /> Download .zip
                                  </button>
                                </div>
                              </div>

                              {/* File Tabs */}
                              {phaseArtifacts.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                                  {phaseArtifacts.map((art, idx) => {
                                    const isActive = idx === safeIdx;
                                    const isTS =
                                      art.filePath.endsWith(".ts") || art.filePath.endsWith(".tsx");
                                    const isSQL = art.filePath.endsWith(".sql");
                                    const isJSON = art.filePath.endsWith(".json");

                                    return (
                                      <button
                                        key={art.id || idx}
                                        onClick={() => setSelectedArtifactIdx(idx)}
                                        className={cn(
                                          "px-3 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5 transition-all whitespace-nowrap border",
                                          isActive
                                            ? "bg-slate-100 text-slate-900 border-slate-400 shadow-sm font-semibold"
                                            : "bg-white text-slate-700 border-slate-300 hover:text-slate-900 hover:bg-slate-50",
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            isTS
                                              ? "bg-blue-400"
                                              : isSQL
                                                ? "bg-emerald-400"
                                                : isJSON
                                                  ? "bg-amber-400"
                                                  : "bg-purple-400",
                                          )}
                                        />
                                        <span>{art.filePath}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Code Content Window */}
                              {activeArtifact ? (
                                <div className="relative group">
                                  <div className="flex items-center justify-between text-[11px] text-slate-700 bg-slate-50 px-3 py-1.5 rounded-t-xl font-mono border-t border-x border-slate-300">
                                    <span>{activeArtifact.filePath}</span>
                                    <span>{activeArtifact.content.split("\n").length} lines</span>
                                  </div>
                                  <div className="p-4 bg-white text-black rounded-b-xl font-mono text-[12px] max-h-[350px] overflow-y-auto overflow-x-auto leading-relaxed border border-slate-300 custom-scrollbar">
                                    <pre className="whitespace-pre text-black">
                                      {activeArtifact.content}
                                    </pre>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-6 text-center text-xs text-slate-700 border border-slate-200 rounded-xl bg-slate-50">
                                  {selectedPhase.codeGenerationStatus === "generating"
                                    ? "Generating source files from the approved prompt…"
                                    : selectedPhase.codeGenerationStatus === "failed"
                                      ? `Code generation failed. ${selectedPhase.codeGenerationError || "Check your API setup or choose another model, then try again."}`
                                      : "No source files yet. Review and approve this phase prompt, then select Generate code."}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Compact prompt review. The complete prompt opens only on request. */}
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                Prompt review
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-[10px] font-semibold",
                                  selectedPhase.promptApproved
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-white text-slate-600 border border-slate-200",
                                )}
                              >
                                {selectedPhase.promptApproved ? "Approved" : "Needs approval"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditedPromptText(formatPhasePrompt(selectedPhase.prompt));
                                setIsEditingPrompt(false);
                                setIsPhasePromptDialogOpen(true);
                              }}
                              disabled={!selectedPhase.prompt.trim()}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-40"
                            >
                              View full prompt
                            </button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Prompt summary
                              </p>
                              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-800">
                                {selectedPhase.objective ||
                                  selectedPhase.requirementsCovered.slice(0, 2).join("; ") ||
                                  "Add a phase objective to clarify this prompt."}
                              </p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Expected output
                              </p>
                              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-800">
                                {selectedPhase.expectedOutput ||
                                  selectedPhase.completionCriteria.slice(0, 2).join("; ") ||
                                  "Add the deliverable this phase should produce."}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
                            <p className="text-[10px] text-slate-500">
                              Scope confidence:{" "}
                              <span className="font-semibold text-slate-700">
                                {getPhasePromptConfidence(selectedPhase, currentProject)}
                              </span>
                              <span className="ml-1">
                                (based on confirmed requirements and acceptance checks)
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard
                                    .writeText(formatPhasePrompt(selectedPhase.prompt))
                                    .then(() => toast.success("Copied phase prompt."))
                                    .catch(() => toast.error("Clipboard access was blocked."));
                                }}
                                disabled={!selectedPhase.prompt.trim()}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                              >
                                <Copy className="h-3.5 w-3.5" /> Copy prompt
                              </button>
                              <button
                                type="button"
                                onClick={handleApprovePhasePrompt}
                                disabled={
                                  !selectedPhase.prompt.trim() ||
                                  isEditingPrompt ||
                                  generatingCodePhaseIds.includes(selectedPhase.id)
                                }
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {selectedPhase.promptApproved ? "Approved" : "Approve prompt"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Multi-API Provider & Ensemble Settings Modal */}
      <MultiAPISettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <Dialog open={isPhasePromptDialogOpen} onOpenChange={setIsPhasePromptDialogOpen}>
        <DialogContent className="flex h-[82vh] max-h-[92vh] w-[min(96vw,1100px)] max-w-5xl flex-col gap-3 overflow-hidden border-slate-200 bg-white p-5 text-slate-900 sm:p-7">
          <DialogHeader>
            <DialogTitle>Phase {selectedPhase?.phaseNumber} prompt</DialogTitle>
            <DialogDescription>
              Review the full prompt here. Save edits before approving it for code generation.
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="Full phase prompt"
            value={
              isEditingPrompt ? editedPromptText : formatPhasePrompt(selectedPhase?.prompt || "")
            }
            onChange={(event) => {
              setEditedPromptText(event.target.value);
              setIsEditingPrompt(true);
            }}
            className="min-h-0 flex-1 resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-slate-900"
          />
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(
                    isEditingPrompt
                      ? editedPromptText
                      : formatPhasePrompt(selectedPhase?.prompt || ""),
                  )
                  .then(() => toast.success("Copied phase prompt."))
                  .catch(() => toast.error("Clipboard access was blocked."))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Copy prompt
            </button>
            <div className="flex flex-wrap gap-2">
              {isEditingPrompt && (
                <button
                  type="button"
                  onClick={handleSavePromptEdit}
                  disabled={!editedPromptText.trim()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Save changes
                </button>
              )}
              <button
                type="button"
                onClick={handleApprovePhasePrompt}
                disabled={
                  !selectedPhase?.prompt.trim() ||
                  isEditingPrompt ||
                  generatingCodePhaseIds.includes(selectedPhase?.id || "")
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {selectedPhase?.promptApproved ? "Approved" : "Approve prompt"}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPhaseContextDialogOpen} onOpenChange={setIsPhaseContextDialogOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a phase note</DialogTitle>
            <DialogDescription>
              This note is saved with the current project and included as phase reference context.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            Note name
            <input
              value={phaseContextTitle}
              onChange={(event) => setPhaseContextTitle(event.target.value)}
              maxLength={100}
              placeholder="e.g. Task form validation notes"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            Text
            <textarea
              value={phaseContextText}
              onChange={(event) => setPhaseContextText(event.target.value)}
              maxLength={100000}
              rows={7}
              placeholder="Add details, constraints, examples, or Markdown…"
              className="w-full rounded-lg border border-slate-300 p-3 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <FilePlus2 className="h-3.5 w-3.5" /> Attach .md or .txt file
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={(event) => {
                void addPhaseContextFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              onClick={addPhaseContextText}
              disabled={!phaseContextTitle.trim() || !phaseContextText.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save note
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProjectShareDialogOpen} onOpenChange={setIsProjectShareDialogOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-3 overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share project context</DialogTitle>
            <DialogDescription>
              Review or edit this project summary. It is shared only when you choose Share or Copy;
              no account or database connection is used.
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="Shareable project context"
            value={projectShareText}
            onChange={(event) => setProjectShareText(event.target.value)}
            rows={15}
            className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900"
          />
          <DialogFooter className="flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([projectShareText], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${(currentProject?.name || "project").replace(/[^a-z0-9_-]+/gi, "-")}-context.md`;
                anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Download .md
            </button>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(projectShareText)
                  .then(() => toast.success("Project context copied."))
                  .catch(() => toast.error("Clipboard access was blocked."))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => void shareProjectContext()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Brain Intelligence Chat Drawer */}
      {currentProject && (
        <ProjectChatDrawer
          isOpen={isChatDrawerOpen}
          onClose={() => setIsChatDrawerOpen(false)}
          project={currentProject}
          onApplyImpactAction={(report) => {
            const affectedIds = new Set(report.affectedPhases.map((phase) => phase.phaseId));
            const updatedPhases = currentProject.phases.map((phase) =>
              affectedIds.has(phase.id)
                ? {
                    ...phase,
                    promptApproved: false,
                    status: "Not Started" as const,
                    ...(phase.generatedCode ? { generatedCodeOutdated: true } : {}),
                    ...(phase.codeComparisons?.length ? { codeComparisonsOutdated: true } : {}),
                    updatedAt: new Date().toISOString(),
                  }
                : phase,
            );
            const updatedProject = {
              ...currentProject,
              phases: updatedPhases,
              updatedAt: new Date().toISOString(),
            };
            setCurrentProject(updatedProject);
            if (selectedPhase && affectedIds.has(selectedPhase.id)) {
              setSelectedPhase(
                updatedPhases.find((phase) => phase.id === selectedPhase.id) || null,
              );
            }
            void saveSoftwareProject({ data: { project: updatedProject } }).catch((error) =>
              toast.error(error.message || "Affected phases could not be saved."),
            );
            toast.info(
              `Applied change plan: ${report.affectedPhases.length} affected phase(s) reopened for review.`,
            );
          }}
        />
      )}

      {/* Artifact Version Diff Modal */}
      {diffTargetPhase && (
        <ArtifactDiffModal
          isOpen={isDiffModalOpen}
          onClose={() => {
            setIsDiffModalOpen(false);
            setDiffTargetPhase(null);
          }}
          phase={diffTargetPhase}
        />
      )}
    </div>
  );
};
