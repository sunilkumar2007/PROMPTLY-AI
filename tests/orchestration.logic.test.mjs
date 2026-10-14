import test from "node:test";
import assert from "node:assert/strict";
import {
  selectConflictSafeOrchestrationBatch,
  selectReadyOrchestrationPhases,
} from "../src/lib/orchestration.logic.ts";

const phase = (id, phaseNumber, dependencies = []) => ({ id, phaseNumber, dependencies });

test("parallel scheduler starts only independent work and waits for dependencies", () => {
  const phases = [phase("setup", 1), phase("api", 2, [1]), phase("ui", 3)];
  const eligible = new Set(phases.map(({ id }) => id));
  const first = selectReadyOrchestrationPhases(phases, eligible, new Set(), new Set(), 4);
  assert.deepEqual(
    first.map(({ id }) => id),
    ["setup", "ui"],
  );

  const afterSetup = selectReadyOrchestrationPhases(
    phases,
    eligible,
    new Set([1]),
    new Set(["setup", "ui"]),
    4,
  );
  assert.deepEqual(
    afterSetup.map(({ id }) => id),
    ["api"],
  );
});

test("scheduler respects the concurrency limit and deterministic phase order", () => {
  const phases = [phase("p4", 4), phase("p2", 2), phase("p1", 1), phase("p3", 3)];
  const selected = selectReadyOrchestrationPhases(
    phases,
    new Set(phases.map(({ id }) => id)),
    new Set(),
    new Set(),
    2,
  );
  assert.deepEqual(
    selected.map(({ id }) => id),
    ["p1", "p2"],
  );
});

test("missing dependencies and dependency cycles never become ready", () => {
  const phases = [phase("a", 1, [2]), phase("b", 2, [1]), phase("orphan", 3, [99])];
  const selected = selectReadyOrchestrationPhases(
    phases,
    new Set(phases.map(({ id }) => id)),
    new Set(),
    new Set(),
    4,
  );
  assert.deepEqual(selected, []);
});

test("parallel batches skip overlapping file targets and preserve independent work", () => {
  const phases = [
    { ...phase("a", 1), filesAffected: { create: ["src/App.tsx"], modify: [] } },
    { ...phase("b", 2), filesAffected: { create: ["src/app.tsx"], modify: [] } },
    { ...phase("c", 3), filesAffected: { create: [], modify: ["src/styles.css"] } },
  ];
  assert.deepEqual(
    selectConflictSafeOrchestrationBatch(phases, 3).map(({ id }) => id),
    ["a", "c"],
  );
});

test("a phase without declared file targets runs alone", () => {
  const phases = [
    { ...phase("unknown", 1), filesAffected: { create: [], modify: [] } },
    { ...phase("known", 2), filesAffected: { create: ["src/App.tsx"], modify: [] } },
  ];
  assert.deepEqual(
    selectConflictSafeOrchestrationBatch(phases, 4).map(({ id }) => id),
    ["unknown"],
  );
});
