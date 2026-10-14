import test from "node:test";
import assert from "node:assert/strict";
import {
  canApproveProjectFile,
  canContinueWithProjectFiles,
  getAffectedProjectDocuments,
  PROJECT_MARKDOWN_FILES,
  evaluateRequirementCompleteness,
} from "../src/lib/software-documents.ts";

const completeRequirements = {
  projectName: "Field Service Planner",
  objective: "Schedule field technicians and track the outcomes of their visits.",
  businessObjectives: ["Reduce missed appointments"],
  targetUsers: ["Dispatchers and field technicians"],
  functionalRequirements: ["Create appointments", "Assign technicians", "Record visit outcomes"],
  nonFunctionalRequirements: ["Support 500 concurrent users"],
  modules: ["Scheduling", "Technician assignments"],
  techStack: ["TypeScript"],
  database: ["PostgreSQL"],
  apis: [],
  auth: ["Technician and dispatcher roles"],
  security: ["Protect customer addresses"],
  uiUx: [],
  integrations: [],
  constraints: [],
  platformRequirements: ["Web"],
  acceptanceCriteria: ["Dispatchers can assign and reschedule a visit"],
  assumptions: [],
  requirementDependencies: [],
  items: [],
};

const approvedFile = (filename) => ({
  filename,
  content: `# ${filename}\n\nA reviewed, requirement-linked project document with enough content to pass the local Markdown shape checks.`,
  version: 1,
  status: "completed",
  validation: { valid: true, issues: [] },
  review: { status: "reviewed", summary: "No findings.", findings: [] },
  verification: { status: "passed", summary: "Verified.", evidence: ["Requirements section"] },
  approved: true,
});

test("a project document requires successful review and verification before approval", () => {
  const file = approvedFile("REQUIREMENTS.md");
  assert.equal(canApproveProjectFile(file), true);
  assert.equal(canApproveProjectFile({ ...file, review: undefined }), false);
  assert.equal(
    canApproveProjectFile({
      ...file,
      review: { ...file.review, findings: [{ severity: "high" }] },
    }),
    false,
  );
  assert.equal(
    canApproveProjectFile({ ...file, verification: { ...file.verification, status: "failed" } }),
    false,
  );
  assert.equal(
    canApproveProjectFile({ ...file, validation: { valid: false, issues: ["bad"] } }),
    false,
  );
});

test("phase planning is blocked until all nine approved project files are present", () => {
  const files = PROJECT_MARKDOWN_FILES.map(approvedFile);
  assert.equal(files.length, 9);
  assert.equal(canContinueWithProjectFiles(files), true);
  assert.equal(canContinueWithProjectFiles(files.slice(1)), false);
  assert.equal(
    canContinueWithProjectFiles(
      files.map((file, index) => (index === 4 ? { ...file, approved: false } : file)),
    ),
    false,
  );
});

test("upstream document changes invalidate every dependent document in dependency order", () => {
  assert.deepEqual(getAffectedProjectDocuments("REQUIREMENTS.md"), [
    "ARCHITECTURE.md",
    "TECH_STACK.md",
    "DATABASE.md",
    "UI_UX.md",
    "IMPLEMENTATION_PLAN.md",
    "PROMPT_SPEC.md",
    "TESTING.md",
  ]);
  assert.deepEqual(getAffectedProjectDocuments("AGENTS.md"), [
    "IMPLEMENTATION_PLAN.md",
    "PROMPT_SPEC.md",
    "TESTING.md",
  ]);
});

test("completeness gate asks only unresolved essentials and flags conflicts and vague targets", () => {
  const emptyGate = evaluateRequirementCompleteness(
    { ...completeRequirements, businessObjectives: [], targetUsers: [] },
    {},
  );
  assert.equal(emptyGate.complete, false);
  assert.ok(emptyGate.questions.some((question) => question.id === "required-businessObjectives"));
  assert.ok(emptyGate.questions.some((question) => question.id === "required-targetUsers"));

  const conflicting = {
    ...completeRequirements,
    objective: "The planner must work offline and be online only.",
    functionalRequirements: ["Make scheduling easy"],
    nonFunctionalRequirements: ["100% uptime"],
  };
  const gate = evaluateRequirementCompleteness(conflicting, {});
  assert.ok(gate.questions.some((question) => question.group === "Resolve a conflict"));
  assert.ok(
    gate.questions.some((question) => question.group === "Clarify an ambiguous requirement"),
  );
  assert.ok(gate.questions.some((question) => question.group === "Review feasibility"));

  const answers = Object.fromEntries(
    gate.questions.map((question) => [question.question, "Use the stated practical target"]),
  );
  const answeredGate = evaluateRequirementCompleteness(conflicting, answers);
  assert.ok(
    !answeredGate.questions.some(
      (question) => question.group === "Clarify an ambiguous requirement",
    ),
  );
  assert.ok(!answeredGate.questions.some((question) => question.group === "Review feasibility"));
});
