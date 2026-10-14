import type { SoftwareProject } from "./software-projects.store";

const STORAGE_KEY = "promptly_software_projects_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStoredProject(value: unknown): value is SoftwareProject {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["description"] === "string" &&
    isRecord(value["requirements"]) &&
    Array.isArray(value["phases"]) &&
    Array.isArray(value["questions"]) &&
    isRecord(value["userAnswers"]) &&
    typeof value["requirementsConfirmed"] === "boolean"
  );
}

function readProjects(): SoftwareProject[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredProject);
  } catch {
    return [];
  }
}

export async function listSoftwareProjects(): Promise<SoftwareProject[]> {
  return readProjects().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getSoftwareProject({
  data,
}: {
  data: { id: string };
}): Promise<SoftwareProject | null> {
  return readProjects().find((project) => project.id === data.id) || null;
}

export async function saveSoftwareProject({
  data,
}: {
  data: { project: SoftwareProject };
}): Promise<{ id: string; updated: true }> {
  if (typeof window === "undefined")
    throw new Error("Project saving is only available in the browser.");
  const serialized = JSON.stringify(data.project);
  if (serialized.length > 1_500_000)
    throw new Error("This project is too large to save (1.5 MB maximum).");
  const projects = readProjects().filter((project) => project.id !== data.project.id);
  projects.push(data.project);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    throw new Error(
      "Could not save this project in browser storage. Check available device storage.",
    );
  }
  return { id: data.project.id, updated: true };
}

export async function deleteSoftwareProject({
  data,
}: {
  data: { id: string };
}): Promise<{ id: string; deleted: true }> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(readProjects().filter((project) => project.id !== data.id)),
      );
    } catch {
      throw new Error(
        "Could not delete this project from browser storage. Check available device storage and try again.",
      );
    }
  }
  return { id: data.id, deleted: true };
}
