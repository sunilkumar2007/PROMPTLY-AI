import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePromptTask,
  normalizeCopyReadyPrompt,
  selectPromptContext,
  selectPromptStrategy,
  validateCompiledPrompt,
  validatePromptOutput,
} from "../src/lib/prompt-intelligence.logic.ts";

function createTask(overrides = {}) {
  return normalizePromptTask({
    userGoal: "Create a TypeScript inventory dashboard with searchable stock levels.",
    category: "Coding",
    detailLevel: "Professional",
    targetTool: "generic",
    now: "2026-10-13T12:00:00.000Z",
    ...overrides,
  });
}

test("removes Markdown report headings from the copy-ready prompt", () => {
  assert.equal(
    normalizeCopyReadyPrompt(
      "# Prompt\n\nCreate an image.\n\n### Output Format\nReturn one image prompt.",
    ),
    "Create an image.\n\nReturn one image prompt.",
  );
  assert.equal(
    normalizeCopyReadyPrompt("```markdown\n## Concept\nMake a clear image prompt.\n```"),
    "Make a clear image prompt.",
  );
});

test("normalizes a request into bounded, explicit task data", () => {
  const task = createTask({
    constraintsText: "Use TypeScript\nDo not add paid services",
    acceptanceCriteriaText: 'At least 3 bullet points\nInclude the phrase "edge cases"',
    outputFormat: "Markdown checklist",
  });

  assert.equal(task.taskType, "coding");
  assert.equal(task.targetModel, "gemini-3.8-flash");
  assert.deepEqual(task.constraints, ["Use TypeScript", "Do not add paid services"]);
  assert.deepEqual(task.acceptanceCriteria, [
    "At least 3 bullet points",
    'Include the phrase "edge cases"',
  ]);
  assert.equal(task.outputFormat, "Markdown checklist");
  assert.equal(task.executionMode, "generate_and_evaluate");
  assert.throws(() => createTask({ userGoal: "short" }), /at least 8 characters/i);
});

test("selects an appropriate strategy and only relevant shared context", () => {
  const task = createTask();
  const strategy = selectPromptStrategy(task);
  const context = selectPromptContext(task, {
    name: "Test",
    about: "Warehouse product manager",
    currentWork: "Planning a company fundraising event",
    expertise: "Inventory operations",
    tools: "TypeScript, React, PostgreSQL",
    preferences: "Be concise and include examples",
    constraints: "Avoid paid services",
    avoid: "Do not use tables",
    language: "English",
    useInRequests: true,
    updatedAt: "",
  });

  assert.equal(strategy.id, "code-generation-with-constraints");
  assert.ok(context.sources.some((source) => source.id === "tools"));
  assert.ok(context.sources.some((source) => source.id === "preferences"));
  assert.ok(
    context.sources.every(
      (source) => source.source === "shared-context" && source.version === "unspecified",
    ),
  );
  assert.ok(context.excludedSources.some((source) => source.label === "Current work and goals"));

  const disabled = selectPromptContext(task, {
    name: "Test",
    about: "private",
    currentWork: "work",
    expertise: "skills",
    tools: "stack",
    preferences: "style",
    constraints: "rule",
    avoid: "avoid",
    language: "English",
    useInRequests: false,
    updatedAt: "",
  });
  assert.equal(disabled.sources.length, 0);
  assert.ok(disabled.excludedSources.every((source) => source.reason.includes("turned off")));
});

test("compiled prompt checks report structure and goal overlap without claiming quality", () => {
  const task = createTask();
  const validation = validateCompiledPrompt(
    "Create a TypeScript inventory dashboard. Define the goal, constraints, acceptance criteria, edge cases, and response format. Return a useful prompt for building the inventory dashboard.",
    task,
  );
  assert.equal(validation.status, "passed");
  assert.ok(validation.limitations[0].includes("do not prove"));
});

test("output validation checks measurable criteria and leaves semantic checks for review", () => {
  const task = createTask({
    acceptanceCriteriaText:
      'Include the phrase "edge cases"\nAt least 3 bullet points\nExplain why the chosen architecture is safe',
    outputFormat: "Markdown",
  });
  const validation = validatePromptOutput(
    "# Inventory plan\n\n- First item\n- Second item\n- Edge cases are covered.",
    task,
  );

  assert.equal(validation.checks.find((check) => check.id === "criterion-1")?.status, "passed");
  assert.equal(validation.checks.find((check) => check.id === "criterion-2")?.status, "passed");
  assert.equal(
    validation.checks.find((check) => check.id === "criterion-3")?.status,
    "needs-review",
  );
  assert.equal(validation.status, "needs-review");
});

test("JSON output requirements are validated with the runtime parser", () => {
  const task = createTask({ outputFormat: "Valid JSON" });
  assert.equal(
    validatePromptOutput('{"ok":true}', task).checks.find((check) => check.id === "output-format")
      ?.status,
    "passed",
  );
  assert.equal(
    validatePromptOutput("not json", task).checks.find((check) => check.id === "output-format")
      ?.status,
    "failed",
  );
});
