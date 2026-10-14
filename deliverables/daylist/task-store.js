export const PRIORITIES = ["low", "medium", "high"];
export const FILTERS = ["all", "active", "completed", "overdue"];

export function createTask(input, now = new Date()) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Add a task name before saving.");
  if (title.length > 160) throw new Error("Task names must be 160 characters or fewer.");
  const priority = PRIORITIES.includes(input.priority) ? input.priority : "medium";
  const dueDate = String(input.dueDate ?? "").trim();
  if (dueDate && !isValidDate(dueDate)) throw new Error("Choose a valid due date.");
  return {
    id: input.id || crypto.randomUUID(),
    title,
    category:
      String(input.category ?? "Personal")
        .trim()
        .slice(0, 32) || "Personal",
    priority,
    dueDate,
    completed: Boolean(input.completed),
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function updateTask(tasks, id, changes, now = new Date()) {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("This task no longer exists.");
  return tasks.map((item) =>
    item.id === id ? createTask({ ...item, ...changes, id, createdAt: item.createdAt }, now) : item,
  );
}

export function removeTask(tasks, id) {
  return tasks.filter((task) => task.id !== id);
}

export function toggleTask(tasks, id, now = new Date()) {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("This task no longer exists.");
  return updateTask(tasks, id, { completed: !task.completed }, now);
}

export function filterTasks(
  tasks,
  { query = "", filter = "all", sort = "created" } = {},
  today = dateOnly(new Date()),
) {
  if (!FILTERS.includes(filter)) throw new Error("Choose a valid task filter.");
  const needle = query.trim().toLocaleLowerCase();
  const visible = tasks.filter((task) => {
    const matchesText =
      !needle || `${task.title} ${task.category}`.toLocaleLowerCase().includes(needle);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && !task.completed) ||
      (filter === "completed" && task.completed) ||
      (filter === "overdue" && !task.completed && task.dueDate && task.dueDate < today);
    return matchesText && matchesFilter;
  });
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return visible.sort((a, b) => {
    if (sort === "due")
      return (
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        a.createdAt.localeCompare(b.createdAt)
      );
    if (sort === "priority")
      return (
        priorityRank[a.priority] - priorityRank[b.priority] ||
        a.createdAt.localeCompare(b.createdAt)
      );
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function readTasks(storage, key = "daylist.tasks.v1") {
  try {
    const value = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter(isTask) : [];
  } catch {
    return [];
  }
}

export function saveTasks(storage, tasks, key = "daylist.tasks.v1") {
  storage.setItem(key, JSON.stringify(tasks));
}

function isTask(task) {
  return (
    task &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.category === "string" &&
    PRIORITIES.includes(task.priority) &&
    typeof task.completed === "boolean" &&
    typeof task.createdAt === "string"
  );
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function dateOnly(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
