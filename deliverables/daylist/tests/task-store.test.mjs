import test from "node:test";
import assert from "node:assert/strict";
import {
  createTask,
  filterTasks,
  readTasks,
  removeTask,
  saveTasks,
  toggleTask,
  updateTask,
} from "../task-store.js";

const fixedNow = new Date("2026-10-14T10:00:00.000Z");
const sample = (values = {}) =>
  createTask(
    { id: "a", title: "Buy milk", category: "Home", priority: "medium", ...values },
    fixedNow,
  );

test("creates trimmed tasks with safe defaults and rejects empty or oversized titles", () => {
  assert.equal(sample({ title: "  Buy milk  " }).title, "Buy milk");
  assert.equal(createTask({ title: "Plan" }, fixedNow).priority, "medium");
  assert.throws(() => createTask({ title: "   " }, fixedNow), /task name/i);
  assert.throws(() => createTask({ title: "x".repeat(161) }, fixedNow), /160/);
});

test("validates due dates and constrains priority and category", () => {
  assert.throws(() => sample({ dueDate: "2026-02-30" }), /valid due date/i);
  assert.equal(sample({ priority: "urgent", category: "" }).priority, "medium");
  assert.equal(sample({ category: "" }).category, "Personal");
  assert.equal(sample({ dueDate: "2026-10-15" }).dueDate, "2026-10-15");
});

test("updates a task, retains creation time, and reports missing IDs", () => {
  const original = sample();
  const changed = updateTask(
    [original],
    "a",
    { title: "Buy oat milk", priority: "high" },
    new Date("2026-10-15T10:00:00Z"),
  );
  assert.equal(changed[0].title, "Buy oat milk");
  assert.equal(changed[0].createdAt, original.createdAt);
  assert.notEqual(changed[0].updatedAt, original.updatedAt);
  assert.throws(() => updateTask([], "missing", { title: "Nope" }), /no longer exists/i);
});

test("completes, reopens, and deletes tasks", () => {
  const original = sample();
  assert.equal(toggleTask([original], "a", fixedNow)[0].completed, true);
  assert.equal(toggleTask([sample({ completed: true })], "a", fixedNow)[0].completed, false);
  assert.deepEqual(removeTask([original], "a"), []);
});

test("searches title and category, filters state and overdue items, and sorts", () => {
  const tasks = [
    sample({
      id: "late",
      title: "Pay bill",
      category: "Finance",
      dueDate: "2026-10-13",
      priority: "high",
    }),
    sample({
      id: "later",
      title: "Call home",
      category: "Family",
      dueDate: "2026-10-20",
      priority: "low",
    }),
    sample({
      id: "done",
      title: "Old task",
      category: "Archive",
      completed: true,
      dueDate: "2026-10-01",
    }),
  ];
  assert.equal(filterTasks(tasks, { query: "HOME" }).length, 1);
  assert.deepEqual(
    filterTasks(tasks, { filter: "overdue" }, "2026-10-14").map((x) => x.id),
    ["late"],
  );
  assert.equal(filterTasks(tasks, { filter: "active" }).length, 2);
  assert.equal(filterTasks(tasks, { filter: "completed" }).length, 1);
  assert.deepEqual(
    filterTasks(tasks, { sort: "priority" }).map((x) => x.id),
    ["late", "done", "later"],
  );
  assert.deepEqual(
    filterTasks(tasks, { sort: "due" }).map((x) => x.id),
    ["done", "late", "later"],
  );
  assert.throws(() => filterTasks(tasks, { filter: "invalid" }), /valid task filter/i);
});

test("persists tasks and safely ignores malformed or incomplete stored data", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveTasks(storage, [sample()]);
  assert.equal(readTasks(storage)[0].title, "Buy milk");
  values.set("daylist.tasks.v1", "{");
  assert.deepEqual(readTasks(storage), []);
  values.set("daylist.tasks.v1", JSON.stringify([{ title: "incomplete" }, sample()]));
  assert.deepEqual(
    readTasks(storage).map((x) => x.id),
    ["a"],
  );
});
