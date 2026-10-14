import type { ExtractedRequirements, ProjectPhase } from "./software-projects.store";

/** Creates an exact-size, dependency-ordered plan based on analyzed project scope. */
export function planExactNPhases(
  requirements: ExtractedRequirements,
  userAnswers: Record<string, string>,
  exactCount: number,
): ProjectPhase[] {
  const count = Math.max(1, Math.min(Math.floor(exactCount), 100));
  const featureTopics = [
    ...new Set(
      [
        ...requirements.functionalRequirements,
        ...requirements.modules,
        ...requirements.items.map((item) => `${item.title}: ${item.description}`),
      ]
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  const milestones: Array<{ title: string; scope: string[] }> = [];
  const projectLabel = requirements.projectName.trim() || "Project";
  const shortProjectLabel =
    projectLabel.length > 30 ? `${projectLabel.slice(0, 27).trim()}…` : projectLabel;
  milestones.push({
    title: `${shortProjectLabel} foundation`,
    scope: [requirements.objective, ...requirements.constraints].filter(Boolean),
  });

  // Name implementation phases from the actual requested capabilities. These keyword groups
  // are deliberately transparent fallbacks: users can rename/re-scope every phase before approval.
  const topicGroups: Array<{ title: string; match: RegExp }> = [
    {
      title: "Task creation and updates",
      match: /\b(add|create|edit|update|delete|remove|complete|task management)\b/i,
    },
    {
      title: "Task details and organization",
      match: /\b(title|description|priority|due date|category|tag|label)\b/i,
    },
    {
      title: "Search, filters, and sorting",
      match: /\b(search|filter|sort|today|active|completed)\b/i,
    },
    {
      title: "Progress and task counts",
      match: /\b(count|total|pending|dashboard|statistics|progress)\b/i,
    },
    {
      title: "Responsive and accessible interface",
      match:
        /\b(responsive|mobile|desktop|accessib|keyboard|screen reader|empty state|loading state)\b/i,
    },
    {
      title: "Validation and automated tests",
      match:
        /\b(validat|automated tests?|unit tests?|integration tests?|setup instructions|error handling)\b/i,
    },
  ];
  const remaining = new Set(featureTopics);
  for (const group of topicGroups) {
    const scope = featureTopics.filter((topic) => group.match.test(topic));
    if (scope.length) {
      milestones.push({ title: group.title, scope });
      scope.forEach((topic) => remaining.delete(topic));
    }
  }
  if (requirements.database.length)
    milestones.push({ title: "Data persistence", scope: requirements.database });
  if (requirements.auth.length)
    milestones.push({ title: "Authentication and access", scope: requirements.auth });
  if (requirements.apis.length || requirements.integrations.length)
    milestones.push({
      title: "API and external integrations",
      scope: [...requirements.apis, ...requirements.integrations],
    });
  if (requirements.security.length || requirements.nonFunctionalRequirements.length) {
    milestones.push({
      title: "Security and reliability",
      scope: [...requirements.security, ...requirements.nonFunctionalRequirements],
    });
  }
  if (remaining.size)
    milestones.push({ title: "Additional project capabilities", scope: [...remaining] });
  milestones.push({
    title: `${shortProjectLabel} verification and delivery`,
    scope: [
      ...(requirements.acceptanceCriteria || []),
      "Verify the implemented requirements and document any unverified behavior.",
    ],
  });

  if (count === 1) {
    const allScope = [...new Set(milestones.flatMap((milestone) => milestone.scope))];
    milestones.splice(0, milestones.length, {
      title: `${shortProjectLabel} build and verification`,
      scope: allScope,
    });
  } else {
    // Keep the final verification phase even when a user asks for fewer phases than the plan has
    // topics. Merge adjacent implementation topics instead of dropping requirements or delivery.
    while (milestones.length > count) {
      const right = milestones.splice(milestones.length - 2, 1)[0]!;
      const left = milestones[milestones.length - 2]!;
      const combinedTitle = `${left.title} and ${right.title}`;
      milestones[milestones.length - 2] = {
        title: combinedTitle.length > 64 ? `${combinedTitle.slice(0, 61).trim()}…` : combinedTitle,
        scope: [...new Set([...left.scope, ...right.scope])],
      };
    }
  }

  const dbAnswer = Object.entries(userAnswers).find(([question]) =>
    /database/i.test(question),
  )?.[1];
  const authAnswer = Object.entries(userAnswers).find(([question]) =>
    /auth|identity|login/i.test(question),
  )?.[1];
  if (dbAnswer)
    milestones
      .find((milestone) => /data model/.test(milestone.title))
      ?.scope.push(`Selected database: ${dbAnswer}`);
  if (authAnswer)
    milestones
      .find((milestone) => /identity/.test(milestone.title))
      ?.scope.push(`Selected identity strategy: ${authAnswer}`);

  return Array.from({ length: count }, (_, index) => {
    const source = milestones[index % milestones.length]!;
    const part = Math.floor(index / milestones.length) + 1;
    const title = part > 1 ? `${source.title} — work package ${part}` : source.title;
    const covered = source.scope.length ? source.scope : [requirements.objective];
    const prerequisites =
      index > 0 ? [`Phase ${index} is completed and its deliverables are reviewed`] : [];
    const scopeSize = covered.length;
    const complexity: ProjectPhase["complexity"] =
      scopeSize > 12
        ? "Expert"
        : scopeSize > 6
          ? "Advanced"
          : scopeSize > 2
            ? "Intermediate"
            : "Beginner";
    return {
      id: `phase-${index + 1}-${crypto.randomUUID()}`,
      phaseNumber: index + 1,
      title,
      objective: `Implement and verify ${title.toLowerCase()} for ${requirements.projectName || "this project"}, using the approved requirements below.`,
      description: covered.join("\n"),
      requirementsCovered: covered,
      dependencies: index > 0 ? [index] : [],
      prerequisites,
      expectedOutput: `A reviewable deliverable addressing: ${covered.join("; ")}`,
      filesAffected: { create: [], modify: [], doNotBreak: [] },
      technologies: [
        ...new Set([...requirements.techStack, ...requirements.database, ...requirements.apis]),
      ],
      complexity,
      completionCriteria: [
        "Deliverables address the listed scope",
        "Unverified behavior and open decisions are clearly documented",
      ],
      prompt: "",
      versions: [],
      currentVersion: 1,
      status: "Not Started",
      generationStatus: "waiting",
      updatedAt: new Date().toISOString(),
    };
  });
}

export function resolveSelectedModel(selection: string): {
  providerId: "openai" | "anthropic" | "google" | "deepseek" | "groq" | "mintdesk";
  modelId: string;
} {
  const normalized = selection.toLowerCase();
  if (normalized.includes("mintdesk sonnet"))
    return { providerId: "mintdesk", modelId: "sonnet-5.5" };
  if (normalized.includes("mintdesk opus")) return { providerId: "mintdesk", modelId: "opus-5.5" };
  if (normalized.includes("mintdesk haiku"))
    return { providerId: "mintdesk", modelId: "haiku-4.5" };
  if (normalized.includes("mintdesk codex")) return { providerId: "mintdesk", modelId: "codex" };
  if (normalized.includes("mintdesk gpt-4o")) return { providerId: "mintdesk", modelId: "gpt-4o" };
  if (normalized.includes("gpt-4o")) return { providerId: "openai", modelId: "gpt-4o" };
  if (normalized.includes("gemini 3.8"))
    return { providerId: "google", modelId: "gemini-3.8-flash" };
  if (normalized.includes("gemini 3.1"))
    return { providerId: "google", modelId: "gemini-3.1-pro-preview" };
  if (normalized.includes("deepseek v4.1"))
    return { providerId: "deepseek", modelId: "deepseek-flash" };
  if (normalized.includes("deepseek v4"))
    return { providerId: "deepseek", modelId: "deepseek-v4-pro" };
  if (normalized.includes("groq")) return { providerId: "groq", modelId: "qwen/qwen3.8-27b" };
  if (normalized.includes("claude sonnet 5.5"))
    return { providerId: "anthropic", modelId: "claude-sonnet-5-5" };
  throw new Error(
    "Select a supported provider model. Ensemble and simulator selections are not single provider models.",
  );
}
