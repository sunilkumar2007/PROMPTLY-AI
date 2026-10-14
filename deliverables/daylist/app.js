import {
  createTask,
  filterTasks,
  readTasks,
  removeTask,
  saveTasks,
  toggleTask,
  updateTask,
} from "./task-store.js";

const storage = window.localStorage;
let tasks = readTasks(storage);
let activeFilter = "all";
let query = "";
let sort = "created";
let editingId = null;
const form = document.querySelector("#task-form");
const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
const list = document.querySelector("#task-list");
const notice = document.querySelector("#notice");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    tasks = [createTask(readForm(form)), ...tasks];
    persist("Task added.");
    form.reset();
    form.elements.title.focus();
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});
document.querySelector("#sort").addEventListener("change", (event) => {
  sort = event.target.value;
  render();
});
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      const selected = item === button;
      item.setAttribute("aria-pressed", String(selected));
      item.classList.toggle("selected", selected);
    });
    render();
  }),
);

list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  if (action === "toggle") {
    tasks = toggleTask(tasks, id);
    persist(task.completed ? "Task reopened." : "Task completed.");
  }
  if (action === "edit") openEditor(task);
  if (action === "delete" && window.confirm(`Delete “${task.title}”?`)) {
    tasks = removeTask(tasks, id);
    persist("Task deleted.");
  }
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    tasks = updateTask(tasks, editingId, readForm(editForm));
    editDialog.close();
    persist("Changes saved.");
  } catch (error) {
    showNotice(error.message, true);
  }
});
document.querySelector("#cancel-edit").addEventListener("click", () => editDialog.close());
editDialog.addEventListener("close", () => {
  editingId = null;
});
document.querySelector("#clear-completed").addEventListener("click", () => {
  const completed = tasks.filter((task) => task.completed).length;
  if (!completed) return;
  if (window.confirm(`Remove ${completed} completed ${completed === 1 ? "task" : "tasks"}?`)) {
    tasks = tasks.filter((task) => !task.completed);
    persist("Completed tasks cleared.");
  }
});

function readForm(target) {
  return {
    title: target.elements.title.value,
    category: target.elements.category.value,
    priority: target.elements.priority.value,
    dueDate: target.elements.dueDate.value,
  };
}

function openEditor(task) {
  editingId = task.id;
  for (const key of ["title", "category", "priority", "dueDate"])
    editForm.elements[key].value = task[key] || "";
  editDialog.showModal();
  editForm.elements.title.focus();
}

function persist(message) {
  try {
    saveTasks(storage, tasks);
    render();
    showNotice(message);
  } catch {
    showNotice(
      "Could not save changes in this browser. Check available storage and try again.",
      true,
    );
  }
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.dataset.kind = isError ? "error" : "success";
  notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    notice.hidden = true;
  }, 3500);
}

function render() {
  const visibleTasks = filterTasks(tasks, { query, filter: activeFilter, sort });
  const activeCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - activeCount;
  document.querySelector("#total-count").textContent = String(tasks.length);
  document.querySelector("#active-count").textContent = String(activeCount);
  document.querySelector("#completed-count").textContent = String(completedCount);
  document.querySelector("#clear-completed").disabled = completedCount === 0;
  list.replaceChildren(...visibleTasks.map(taskCard));
  document.querySelector("#empty-state").hidden = visibleTasks.length > 0;
  document.querySelector("#empty-title").textContent = tasks.length
    ? "No tasks match this view"
    : "Your list is clear";
  document.querySelector("#empty-copy").textContent = tasks.length
    ? "Try another search or filter."
    : "Add a task to give your day a clear next step.";
}

function taskCard(task) {
  const article = document.createElement("article");
  article.className = `task-card${task.completed ? " is-complete" : ""}`;
  const check = document.createElement("button");
  check.className = "check-button";
  check.dataset.action = "toggle";
  check.dataset.id = task.id;
  check.setAttribute(
    "aria-label",
    task.completed ? `Mark ${task.title} active` : `Complete ${task.title}`,
  );
  check.setAttribute("aria-pressed", String(task.completed));
  check.textContent = task.completed ? "✓" : "";
  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("h3");
  title.textContent = task.title;
  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(badge(task.category, "category"), badge(task.priority, `priority ${task.priority}`));
  if (task.dueDate)
    meta.append(badge(formatDueDate(task.dueDate), isOverdue(task) ? "due overdue" : "due"));
  main.append(title, meta);
  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(actionButton("Edit", "edit", task.id), actionButton("Delete", "delete", task.id));
  article.append(check, main, actions);
  return article;
}

function badge(text, className) {
  const el = document.createElement("span");
  el.className = `badge ${className}`;
  el.textContent = text;
  return el;
}
function actionButton(label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}
function isOverdue(task) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return !task.completed && task.dueDate && task.dueDate < today;
}
function formatDueDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

render();
