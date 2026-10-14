import type {
  ExtractedRequirements,
  ProjectMarkdownFile,
  RequirementQuestion,
} from "./software-projects.store";

export const PROJECT_MARKDOWN_FILES = [
  "AGENTS.md",
  "REQUIREMENTS.md",
  "ARCHITECTURE.md",
  "TECH_STACK.md",
  "DATABASE.md",
  "UI_UX.md",
  "IMPLEMENTATION_PLAN.md",
  "PROMPT_SPEC.md",
  "TESTING.md",
] as const;

const DOCUMENT_DEPENDENCIES: Record<string, string[]> = {
  "AGENTS.md": [],
  "REQUIREMENTS.md": [],
  "ARCHITECTURE.md": ["REQUIREMENTS.md"],
  "TECH_STACK.md": ["REQUIREMENTS.md", "ARCHITECTURE.md"],
  "DATABASE.md": ["REQUIREMENTS.md", "ARCHITECTURE.md", "TECH_STACK.md"],
  "UI_UX.md": ["REQUIREMENTS.md", "ARCHITECTURE.md"],
  "IMPLEMENTATION_PLAN.md": [
    "AGENTS.md",
    "REQUIREMENTS.md",
    "ARCHITECTURE.md",
    "TECH_STACK.md",
    "DATABASE.md",
    "UI_UX.md",
  ],
  "PROMPT_SPEC.md": [
    "AGENTS.md",
    "REQUIREMENTS.md",
    "ARCHITECTURE.md",
    "TECH_STACK.md",
    "IMPLEMENTATION_PLAN.md",
  ],
  "TESTING.md": [
    "REQUIREMENTS.md",
    "ARCHITECTURE.md",
    "DATABASE.md",
    "UI_UX.md",
    "IMPLEMENTATION_PLAN.md",
  ],
};

export function getRelevantPreviousFiles(
  filename: string,
  files: ProjectMarkdownFile[],
): ProjectMarkdownFile[] {
  const dependencies = DOCUMENT_DEPENDENCIES[filename] || [];
  return files.filter(
    (file) =>
      dependencies.includes(file.filename) && file.status === "completed" && file.validation?.valid,
  );
}

export function getAffectedProjectDocuments(filename: string): string[] {
  const affected = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, dependencies] of Object.entries(DOCUMENT_DEPENDENCIES)) {
      if (candidate === filename || affected.has(candidate)) continue;
      if (dependencies.some((dependency) => dependency === filename || affected.has(dependency))) {
        affected.add(candidate);
        changed = true;
      }
    }
  }
  return PROJECT_MARKDOWN_FILES.filter((candidate) => affected.has(candidate));
}

export function getRequirementReviewQuestions(
  requirements?: ExtractedRequirements,
): RequirementQuestion[] {
  return REQUIRED_FIELDS.map((field) => ({
    id: `required-${field.key}`,
    question: questionForField(field, requirements),
    options: field.options || [],
    group: field.label,
    whyItMatters: whyFieldMatters(field, requirements),
    required: true,
  }));
}

export function answersFromRequirements(
  requirements: ExtractedRequirements,
): Record<string, string> {
  return Object.fromEntries(
    REQUIRED_FIELDS.flatMap((field) => {
      const value = requirements[field.key];
      const text = Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
      return text.trim() ? [[questionForField(field, requirements), text]] : [];
    }),
  );
}

export function preserveConfirmedRequirements(
  previous: ExtractedRequirements,
  latest: ExtractedRequirements,
): ExtractedRequirements {
  const arrayKeys: Array<keyof ExtractedRequirements> = [
    "businessObjectives",
    "targetUsers",
    "functionalRequirements",
    "nonFunctionalRequirements",
    "modules",
    "techStack",
    "database",
    "apis",
    "auth",
    "security",
    "uiUx",
    "integrations",
    "constraints",
    "platformRequirements",
    "acceptanceCriteria",
    "assumptions",
    "items",
    "requirementDependencies",
  ];
  const merged = { ...latest };
  for (const key of arrayKeys) {
    const latestValue = latest[key];
    const priorValue = previous[key];
    if (Array.isArray(priorValue) && (!Array.isArray(latestValue) || latestValue.length === 0))
      Object.assign(merged, { [key]: priorValue });
  }
  if (!latest.objective.trim()) merged.objective = previous.objective;
  if (!latest.projectName.trim() || latest.projectName === "Untitled project")
    merged.projectName = previous.projectName;
  return merged;
}

const REQUIRED_FIELDS: Array<{
  key: keyof ExtractedRequirements;
  label: string;
  question: string;
  options?: string[];
}> = [
  {
    key: "objective",
    label: "Problem and goal",
    question: "What problem should this software solve, and what outcome should it deliver?",
  },
  {
    key: "businessObjectives",
    label: "Business objectives",
    question: "What are the main business or project outcomes you want?",
  },
  {
    key: "targetUsers",
    label: "Target users",
    question: "Who will use this product, and what are their main needs?",
  },
  {
    key: "functionalRequirements",
    label: "Core features",
    question: "What are the three to five essential things users must be able to do?",
  },
  {
    key: "platformRequirements",
    label: "Platform",
    question: "Where should it run (web, mobile, desktop, or another platform)?",
    options: ["Web", "iOS and Android", "Desktop", "Web and mobile"],
  },
  {
    key: "nonFunctionalRequirements",
    label: "Quality requirements",
    question:
      "What quality requirements matter (for example speed, accessibility, availability, or scale)? Say ‘standard baseline’ if you have no special targets.",
  },
  {
    key: "security",
    label: "Security and privacy",
    question:
      "What data will the product handle, and are there security or privacy rules it must follow?",
    options: [
      "No sensitive data; standard security",
      "Personal data; privacy controls required",
      "Sensitive or regulated data",
      "Not sure yet — document as an open decision",
    ],
  },
  {
    key: "acceptanceCriteria",
    label: "Acceptance criteria",
    question:
      "How will you know the first version is successful? Give observable results or examples.",
  },
];

function projectSubject(requirements?: ExtractedRequirements): string {
  const name = requirements?.projectName?.trim();
  return name && name !== "Untitled project" ? `“${name}”` : "this project";
}

function questionForField(
  field: (typeof REQUIRED_FIELDS)[number],
  requirements?: ExtractedRequirements,
): string {
  const subject = projectSubject(requirements);
  const evidence = [
    requirements?.projectName,
    requirements?.objective,
    ...(requirements?.modules || []),
    ...(requirements?.functionalRequirements || []),
  ]
    .join(" ")
    .toLowerCase();
  switch (field.key) {
    case "objective":
      return `What problem should ${subject} solve, and what outcome should it deliver?`;
    case "businessObjectives":
      if (/to.?do|task|checklist/.test(evidence)) {
        return `For ${subject}, is the main goal to organize personal tasks, coordinate team work, manage deadlines and reminders, or something else?`;
      }
      return `What should people be able to achieve with ${subject}? Name the most important one or two outcomes.`;
    case "targetUsers":
      return `Who will use ${subject}, and what do they need to do with it?`;
    case "functionalRequirements":
      return `Which three to five actions must users be able to perform in ${subject}?`;
    case "platformRequirements":
      return `Where should ${subject} run: web, mobile, desktop, or more than one?`;
    case "nonFunctionalRequirements":
      return `For ${subject}, what matters most for speed, accessibility, availability, or scale? Say “standard baseline” if you have no special target.`;
    case "security":
      return `What information will ${subject} store or process, and what privacy or access rules should apply?`;
    case "acceptanceCriteria":
      return `What observable result would make the first version of ${subject} successful?`;
    default:
      return field.question;
  }
}

function whyFieldMatters(
  field: (typeof REQUIRED_FIELDS)[number],
  requirements?: ExtractedRequirements,
): string {
  const subject = projectSubject(requirements);
  if (field.key === "businessObjectives")
    return `This tells all nine project files which outcomes ${subject} should prioritize.`;
  if (field.key === "targetUsers")
    return `User needs shape the features, screens, and tests for ${subject}.`;
  if (field.key === "functionalRequirements")
    return `These actions define what the first version of ${subject} must do.`;
  if (field.key === "acceptanceCriteria")
    return `The team needs observable checks to know when ${subject} is ready.`;
  return `This helps make the scope and nine project files specific to ${subject}.`;
}

export function evaluateRequirementCompleteness(
  requirements: ExtractedRequirements,
  answers: Record<string, string>,
) {
  const unanswered = REQUIRED_FIELDS.filter(({ key }) => {
    const value = requirements[key];
    if (Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim()))
      return false;
    if (typeof value === "string" && value.trim()) return false;
    return true;
  });
  const conflicts: string[] = [];
  const source = [
    requirements.objective,
    ...requirements.constraints,
    ...requirements.nonFunctionalRequirements,
  ]
    .join(" ")
    .toLowerCase();
  if (/offline/.test(source) && /(always online|internet required|online only)/.test(source))
    conflicts.push("Offline support conflicts with a requirement that the product be online-only.");
  if (
    /no login|without authentication|anonymous/.test(source) &&
    /(must log in|authentication required|authenticated users only)/.test(source)
  )
    conflicts.push("The access requirements conflict about whether users must sign in.");
  if (/real.?time/.test(source) && /(batch only|daily batch|once per day)/.test(source))
    conflicts.push("Real-time behavior conflicts with the stated batch-only schedule.");
  const unresolvedConflicts = conflicts.filter(
    (conflict) => !answers[`${conflict} Which requirement should take priority?`]?.trim(),
  );
  const measurable =
    /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|minutes?|hours?|days?|%|users?|requests?\/s|transactions?\/s)\b/i;
  const vagueRequirements = [
    ...requirements.functionalRequirements,
    ...requirements.nonFunctionalRequirements,
  ].filter(
    (requirement) =>
      /\b(fast|easy|user.?friendly|secure|scalable|high performance|reliable|modern|simple)\b/i.test(
        requirement,
      ) && !measurable.test(requirement),
  );
  const ambiguityQuestions = [...new Set(vagueRequirements)]
    .map((requirement) => ({
      id: `ambiguous-${requirement.slice(0, 24)}`,
      question: `Clarify ambiguous requirement: “${requirement}” What measurable behavior or threshold do you expect?`,
      options: ["Set a measurable target", "Use the standard baseline"],
      group: "Clarify an ambiguous requirement",
      whyItMatters: "Specific targets make architecture choices and acceptance checks verifiable.",
      required: true,
    }))
    .filter((question) => !answers[question.question]?.trim());
  const unrealisticRequirements = [
    ...requirements.nonFunctionalRequirements,
    ...requirements.constraints,
  ].filter((requirement) =>
    /\b(100\s*%\s*uptime|zero latency|unlimited (?:users|scale|traffic)|impossible to breach|instant for everyone)\b/i.test(
      requirement,
    ),
  );
  const feasibilityQuestions = [...new Set(unrealisticRequirements)]
    .map((requirement) => ({
      id: `feasibility-${requirement.slice(0, 24)}`,
      question: `Feasibility review: “${requirement}” What measurable target should the team plan for?`,
      options: ["Set a practical service target", "Keep this as a stretch goal"],
      group: "Review feasibility",
      whyItMatters:
        "Absolute guarantees can produce an unachievable plan; a measurable target keeps delivery testable.",
      required: true,
    }))
    .filter((question) => !answers[question.question]?.trim());
  const questions: RequirementQuestion[] = [
    ...unresolvedConflicts.map((conflict, index) => ({
      id: `conflict-${index}`,
      question: `${conflict} Which requirement should take priority?`,
      options: ["Keep the first requirement", "Keep the second requirement"],
      group: "Resolve a conflict",
      whyItMatters: "The architecture and acceptance criteria depend on this decision.",
      required: true,
    })),
    ...ambiguityQuestions,
    ...feasibilityQuestions,
    ...unanswered.map((field) => ({
      id: `required-${field.key}`,
      question: questionForField(field, requirements),
      options: field.options || [],
      group: field.label,
      whyItMatters: whyFieldMatters(field, requirements),
      required: true,
    })),
  ];
  return {
    complete: questions.length === 0,
    missing: unanswered.map((field) => field.label),
    conflicts: unresolvedConflicts,
    questions,
  };
}

export function applyRequirementAnswers(
  requirements: ExtractedRequirements,
  answers: Record<string, string>,
): ExtractedRequirements {
  const updated = { ...requirements, constraints: [...requirements.constraints] };
  for (const field of REQUIRED_FIELDS) {
    const answer = answers[questionForField(field, requirements)]?.trim();
    if (!answer) continue;
    const current = updated[field.key];
    if (Array.isArray(current)) (updated[field.key] as string[]) = [answer];
    else if (typeof current === "string") (updated[field.key] as string) = answer;
  }
  for (const [question, answer] of Object.entries(answers)) {
    if (question.includes("Which requirement should take priority?") && answer.trim())
      updated.constraints.push(
        `User-confirmed conflict resolution for ${question}: ${answer.trim()}`,
      );
    if (question.startsWith("Clarify ambiguous requirement:") && answer.trim())
      updated.nonFunctionalRequirements.push(`Clarification: ${answer.trim()}`);
    if (question.startsWith("Feasibility review:") && answer.trim())
      updated.constraints.push(`User-confirmed feasibility decision: ${answer.trim()}`);
  }
  return updated;
}

export function addOptionalAssumptions(requirements: ExtractedRequirements): ExtractedRequirements {
  const assumptions = [...(requirements.assumptions || [])];
  const defaults: Array<[boolean, string]> = [
    [
      !requirements.techStack.length,
      "No technology stack was confirmed; any stack guidance is a proposal for review.",
    ],
    [
      !requirements.database.length,
      "No database preference was confirmed; data storage recommendations remain proposals.",
    ],
    [
      !requirements.integrations.length,
      "No external integrations were specified; none are assumed in the initial scope.",
    ],
    [!requirements.constraints.length, "No additional delivery constraints were provided."],
  ];
  for (const [missing, text] of defaults)
    if (missing && !assumptions.includes(text)) assumptions.push(text);
  return { ...requirements, assumptions };
}

export function validateProjectMarkdown(
  filename: string,
  content: string,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const trimmed = content.trim();
  if (trimmed.length < 80) issues.push("Document is too short to be useful.");
  if (!/^#\s+\S/m.test(trimmed))
    issues.push("Document must start with a descriptive Markdown heading.");
  if (/^\s*```(?:json)?\s*\n\s*\{/i.test(trimmed) || /^\s*\{\s*"/.test(trimmed))
    issues.push("Response appears to be JSON rather than a Markdown document.");
  if (/\b(?:TODO|TBD|lorem ipsum|insert here)\b/i.test(trimmed))
    issues.push("Document contains placeholder text.");
  const referenced = [
    ...trimmed.matchAll(
      /\b(?:AGENTS|REQUIREMENTS|ARCHITECTURE|TECH_STACK|DATABASE|UI_UX|IMPLEMENTATION_PLAN|PROMPT_SPEC|TESTING)\.md\b/g,
    ),
  ].map((match) => match[0]);
  for (const reference of new Set(referenced))
    if (!PROJECT_MARKDOWN_FILES.includes(reference as (typeof PROJECT_MARKDOWN_FILES)[number]))
      issues.push(`Invalid project document reference: ${reference}`);
  if (!PROJECT_MARKDOWN_FILES.includes(filename as (typeof PROJECT_MARKDOWN_FILES)[number]))
    issues.push("Unexpected output filename.");
  return { valid: issues.length === 0, issues };
}

export function toProjectFile(
  filename: string,
  content: string,
  prior?: ProjectMarkdownFile,
  provider?: string,
  model?: string,
): ProjectMarkdownFile {
  return {
    filename,
    content,
    version: prior ? (prior.status === "completed" ? prior.version + 1 : prior.version) : 1,
    status: "completed",
    generatedAt: new Date().toISOString(),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    validation: validateProjectMarkdown(filename, content),
  };
}

export function canApproveProjectFile(file: ProjectMarkdownFile | undefined): boolean {
  return Boolean(
    file &&
    file.status === "completed" &&
    file.validation?.valid &&
    file.review?.status === "reviewed" &&
    file.review.findings.length === 0 &&
    file.verification?.status === "passed",
  );
}

export function canContinueWithProjectFiles(files: ProjectMarkdownFile[] = []): boolean {
  return PROJECT_MARKDOWN_FILES.every((filename) => {
    const file = files.find((candidate) => candidate.filename === filename);
    return canApproveProjectFile(file) && file?.approved === true;
  });
}
