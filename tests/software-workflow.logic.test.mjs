import test from "node:test";
import assert from "node:assert/strict";
import { planExactNPhases, resolveSelectedModel } from "../src/lib/software-workflow.logic.ts";
import {
  applyRequirementAnswers,
  evaluateRequirementCompleteness,
} from "../src/lib/software-documents.ts";
import {
  deleteSoftwareProject,
  getSoftwareProject,
  listSoftwareProjects,
  saveSoftwareProject,
} from "../src/lib/software-projects.local.ts";
import { isDevelopmentDemoToken } from "../src/lib/demo-auth.logic.ts";

const requirements = {
  projectName: "Inventory app",
  objective: "Track stock across warehouse locations.",
  targetUsers: ["Warehouse operators"],
  functionalRequirements: ["Create products", "Receive stock", "Transfer stock"],
  nonFunctionalRequirements: ["Audit changes"],
  modules: ["Catalog", "Stock movements"],
  techStack: ["TypeScript"],
  database: ["PostgreSQL"],
  apis: ["REST API"],
  auth: ["Supabase Auth"],
  security: ["Role-based access"],
  uiUx: [],
  integrations: [],
  constraints: [],
  items: [],
};

test("demo authentication is limited to the exact local development token", () => {
  assert.equal(isDevelopmentDemoToken("demo-token", "development"), true);
  assert.equal(isDevelopmentDemoToken("demo-token", "production"), false);
  assert.equal(isDevelopmentDemoToken("other-token", "development"), false);
  assert.equal(isDevelopmentDemoToken(undefined, "development"), false);
});

test("planner creates exactly the requested number of phases", () => {
  for (const count of [1, 5, 23, 100]) {
    assert.equal(planExactNPhases(requirements, {}, count).length, count);
  }
});

test("planner preserves ordered dependencies and includes project requirements", () => {
  const phases = planExactNPhases(
    requirements,
    { "Which database should we use?": "PostgreSQL" },
    8,
  );
  for (const [index, phase] of phases.entries()) {
    assert.equal(phase.phaseNumber, index + 1);
    assert.ok(phase.dependencies.every((dependency) => dependency < phase.phaseNumber));
    assert.ok(phase.description.length > 0);
  }
  assert.ok(phases.some((phase) => phase.description.includes("PostgreSQL")));
});

test("planner names phases from a To-Do app's actual requirements", () => {
  const todoRequirements = {
    ...requirements,
    projectName: "To-Do List",
    objective: "Build a responsive to-do list application.",
    functionalRequirements: [
      "Add, edit, delete, and complete tasks.",
      "Task title, description, priority, due date, and category.",
      "Search and filter tasks by All, Active, Completed, and Today.",
      "Sort tasks by priority and due date.",
      "Display total, completed, and pending task counts.",
      "Persist tasks after refreshing the page.",
      "Responsive desktop and mobile UI with accessible controls.",
      "Form validation, automated tests, and clear setup instructions.",
    ],
    modules: [],
    database: ["Local persistence"],
    auth: [],
    apis: [],
    integrations: [],
    nonFunctionalRequirements: ["Responsive desktop and mobile UI"],
    acceptanceCriteria: ["Tasks persist after refresh", "All filters return correct results"],
  };
  const phases = planExactNPhases(todoRequirements, {}, 8);
  const titles = phases.map((phase) => phase.title.toLowerCase());
  const compactPlan = planExactNPhases(todoRequirements, {}, 5);
  assert.ok(titles.some((title) => title.includes("to-do list foundation")));
  assert.ok(titles.some((title) => title.includes("task creation and updates")));
  assert.ok(titles.some((title) => title.includes("search, filters, and sorting")));
  assert.ok(titles.some((title) => title.includes("progress and task counts")));
  assert.ok(titles.some((title) => title.includes("data persistence")));
  assert.ok(titles.every((title) => !title.includes("product capabilities")));
  assert.match(compactPlan.at(-1).title, /verification and delivery/i);
  assert.ok(compactPlan.at(-1).description.includes("Tasks persist after refresh"));
  assert.equal(planExactNPhases(todoRequirements, {}, 1)[0].title.includes("verification"), true);
});

test("model routing uses explicit supported provider IDs", () => {
  assert.deepEqual(resolveSelectedModel("Claude Sonnet 5.5 (Anthropic)"), {
    providerId: "anthropic",
    modelId: "claude-sonnet-5-5",
  });
  assert.deepEqual(resolveSelectedModel("Qwen 3.8 (Groq)"), {
    providerId: "groq",
    modelId: "qwen/qwen3.8-27b",
  });
  assert.deepEqual(resolveSelectedModel("MintDesk Sonnet 5.5"), {
    providerId: "mintdesk",
    modelId: "sonnet-5.5",
  });
  assert.deepEqual(resolveSelectedModel("MintDesk Codex"), {
    providerId: "mintdesk",
    modelId: "codex",
  });
  assert.throws(
    () => resolveSelectedModel("Concurrent Multi-API Ensemble"),
    /supported provider model/i,
  );
});

test("every model exposed by the project workflow resolves to a supported server model", () => {
  const models = [
    ["Claude Sonnet 5.5 (Anthropic)", "anthropic", "claude-sonnet-5-5"],
    ["GPT-4o (OpenAI)", "openai", "gpt-4o"],
    ["Qwen 3.8 (Groq)", "groq", "qwen/qwen3.8-27b"],
    ["MintDesk Sonnet 5.5", "mintdesk", "sonnet-5.5"],
    ["MintDesk Opus 5.5", "mintdesk", "opus-5.5"],
    ["MintDesk Haiku 4.5", "mintdesk", "haiku-4.5"],
    ["MintDesk Codex", "mintdesk", "codex"],
    ["MintDesk GPT-4o", "mintdesk", "gpt-4o"],
    ["Gemini 3.8 Flash (Google)", "google", "gemini-3.8-flash"],
    ["Gemini 3.1 Pro Preview (Google)", "google", "gemini-3.1-pro-preview"],
    ["DeepSeek V4.1 Flash", "deepseek", "deepseek-flash"],
    ["DeepSeek V4 Pro", "deepseek", "deepseek-v4-pro"],
  ];
  for (const [label, providerId, modelId] of models) {
    assert.deepEqual(resolveSelectedModel(label), { providerId, modelId }, label);
  }
});

test("clarification questions use the actual project requirements", () => {
  const todoRequirements = {
    projectName: "To Do List",
    objective: "Help people keep track of tasks.",
    businessObjectives: [],
    targetUsers: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    modules: ["Task list"],
    techStack: [],
    database: [],
    apis: [],
    auth: [],
    security: [],
    uiUx: [],
    integrations: [],
    constraints: [],
    platformRequirements: [],
    acceptanceCriteria: [],
    items: [],
  };
  const gate = evaluateRequirementCompleteness(todoRequirements, {});
  const outcomes = gate.questions.find((question) => question.id === "required-businessObjectives");
  assert.match(outcomes.question, /To Do List/);
  assert.match(outcomes.question, /personal tasks/);
  assert.doesNotMatch(outcomes.whyItMatters, /useful business objectives document/);

  const answers = { [outcomes.question]: "Organize personal tasks and reminders" };
  assert.deepEqual(applyRequirementAnswers(todoRequirements, answers).businessObjectives, [
    "Organize personal tasks and reminders",
  ]);
});

test("software projects save and load locally without a remote database", async () => {
  const originalWindow = globalThis.window;
  const entries = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value),
    },
  };
  const project = {
    id: "local-project",
    name: "Local project",
    description: "Project test fixture",
    updatedAt: new Date().toISOString(),
    requirements: requirements,
    questions: [],
    userAnswers: {},
    requirementsConfirmed: true,
    phases: [],
  };
  try {
    await saveSoftwareProject({ data: { project } });
    assert.equal((await getSoftwareProject({ data: { id: project.id } })).name, project.name);
    assert.equal((await listSoftwareProjects()).length, 1);
    await deleteSoftwareProject({ data: { id: project.id } });
    assert.equal((await listSoftwareProjects()).length, 0);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("local project loading ignores malformed storage and incomplete project records", async () => {
  const originalWindow = globalThis.window;
  const entries = new Map([
    [
      "promptly_software_projects_v1",
      JSON.stringify([
        null,
        { id: "partial", name: "Incomplete" },
        {
          id: "valid",
          name: "Valid",
          description: "",
          requirements,
          questions: [],
          userAnswers: {},
          requirementsConfirmed: true,
          phases: [],
        },
      ]),
    ],
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value),
    },
  };
  try {
    assert.deepEqual(
      (await listSoftwareProjects()).map((project) => project.id),
      ["valid"],
    );
    entries.set("promptly_software_projects_v1", "{malformed json");
    assert.deepEqual(await listSoftwareProjects(), []);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("project deletion reports browser-storage failures instead of claiming success", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: () => "[]",
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    },
  };
  try {
    await assert.rejects(
      deleteSoftwareProject({ data: { id: "project-1" } }),
      /Could not delete this project from browser storage/,
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
