export interface LocalWorkspaceFileHandle {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface LocalWorkspaceDirectoryHandle {
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<LocalWorkspaceDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalWorkspaceFileHandle>;
  removeEntry?(name: string): Promise<void>;
}

export type GeneratedWorkspaceFile = { path: string; content: string };
export type LocalWorkspaceChange = GeneratedWorkspaceFile & { previousContent: string | null };

const MAX_FILE_COUNT = 200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 12_000_000;

export function validateWorkspacePath(input: string): string {
  const path = input.trim().replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.includes("\0"))
    throw new Error(`Unsafe generated file path: ${input || "(empty)"}`);
  const parts = path.split("/");
  if (
    parts.some(
      (part) =>
        !part || part === "." || part === ".." || /[<>:"|?*]/.test(part) || part.endsWith("."),
    )
  )
    throw new Error(`Unsafe generated file path: ${input}`);
  if (
    parts.some((part) =>
      [".git", "node_modules", ".aws", ".ssh", ".gnupg", "secrets"].includes(part.toLowerCase()),
    )
  )
    throw new Error(`Generated files cannot target protected path: ${input}`);
  if (isSensitivePath(parts.join("/")))
    throw new Error("Generated files cannot target a protected secrets or credential path.");
  return parts.join("/");
}

function isSensitivePath(path: string) {
  const lower = path.toLowerCase();
  return (
    /(^|\/)\.env(?:\.|$)/.test(lower) ||
    /(^|\/)(?:\.npmrc|\.pypirc|\.netrc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|tokens?(?:\.[^/]*)?|(?:api|private)[-_]?keys?(?:\.[^/]*)?|id_rsa|id_ed25519|google-services\.json)(\/|$)/.test(
      lower,
    ) ||
    /\.(?:pem|key|p12|pfx|secret)$/i.test(path)
  );
}

/** Parse only named code files; prose and unnamed snippets are never written to disk. */
export function parseGeneratedWorkspaceFiles(output: string): GeneratedWorkspaceFile[] {
  const files = new Map<string, string>();
  const fence = /```[\w+-]*(?:\s+(?:filepath|file)=([^\s`]+))\s*\r?\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let totalBytes = 0;
  while ((match = fence.exec(output))) {
    const path = validateWorkspacePath(match[1] || "");
    const content = (match[2] || "").replace(/\s+$/, "") + "\n";
    const size = new TextEncoder().encode(content).byteLength;
    if (!content.trim()) throw new Error(`Generated file is empty: ${path}`);
    if (size > MAX_FILE_BYTES) throw new Error(`Generated file is too large: ${path}`);
    if (files.has(path)) {
      if (files.get(path) !== content)
        throw new Error(
          `The model returned conflicting contents for ${path}. Regenerate and review it.`,
        );
      continue;
    }
    files.set(path, content);
    totalBytes += size;
    if (files.size > MAX_FILE_COUNT)
      throw new Error(`Too many generated files (limit ${MAX_FILE_COUNT}).`);
    if (totalBytes > MAX_TOTAL_BYTES)
      throw new Error("Generated files exceed the 12 MB review limit.");
  }
  if (!files.size) throw new Error("No named source files were found in this phase output.");
  return [...files].map(([path, content]) => ({ path, content }));
}

function notFound(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException
    ? error.name === "NotFoundError"
    : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "NotFoundError";
}

async function parentDirectory(
  root: LocalWorkspaceDirectoryHandle,
  parts: string[],
  create: boolean,
) {
  let directory = root;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, create ? { create: true } : undefined);
  }
  return directory;
}

async function readWorkspaceFile(
  root: LocalWorkspaceDirectoryHandle,
  path: string,
): Promise<string | null> {
  const parts = path.split("/");
  try {
    const parent = await parentDirectory(root, parts.slice(0, -1), false);
    return await (await parent.getFileHandle(parts.at(-1)!)).getFile().then((file) => file.text());
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

/** Read only plan-relevant, non-secret paths and cap total context sent to a model. */
export async function readRepositoryContext(
  root: LocalWorkspaceDirectoryHandle,
  plannedPaths: string[],
): Promise<string> {
  const paths = new Set([
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "src/App.tsx",
    "src/main.tsx",
    ...plannedPaths,
  ]);
  const blocks: string[] = [];
  let remaining = 24_000;
  for (const candidate of paths) {
    if (remaining <= 0) break;
    let path: string;
    try {
      path = validateWorkspacePath(candidate);
    } catch {
      continue;
    }
    if (isSensitivePath(path)) continue;
    const content = await readWorkspaceFile(root, path);
    if (content === null) continue;
    const bounded = content.slice(0, Math.min(5_000, remaining));
    blocks.push(`FILE ${path}\n${bounded}`);
    remaining -= bounded.length;
  }
  return blocks.join("\n\n");
}

export async function reviewGeneratedWorkspaceFiles(
  root: LocalWorkspaceDirectoryHandle,
  output: string,
): Promise<LocalWorkspaceChange[]> {
  const files = parseGeneratedWorkspaceFiles(output);
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      previousContent: await readWorkspaceFile(root, file.path),
    })),
  );
}

export async function applyReviewedWorkspaceFiles(
  root: LocalWorkspaceDirectoryHandle,
  changes: LocalWorkspaceChange[],
): Promise<number> {
  for (const change of changes) {
    const latest = await readWorkspaceFile(root, change.path);
    if (latest !== change.previousContent)
      throw new Error(`${change.path} changed after review. Refresh the preview before applying.`);
  }

  const applied: LocalWorkspaceChange[] = [];
  try {
    for (const change of changes) {
      const latest = await readWorkspaceFile(root, change.path);
      if (latest !== change.previousContent)
        throw new Error(`${change.path} changed after review. No more files were written.`);
      const parts = change.path.split("/");
      const parent = await parentDirectory(root, parts.slice(0, -1), true);
      const handle = await parent.getFileHandle(parts.at(-1)!, { create: true });
      const writable = await handle.createWritable();
      await writable.write(change.content);
      await writable.close();
      applied.push(change);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const change of applied.reverse()) {
      try {
        const parts = change.path.split("/");
        const parent = await parentDirectory(root, parts.slice(0, -1), false);
        if (change.previousContent === null) {
          await parent.removeEntry?.(parts.at(-1)!);
        } else {
          const handle = await parent.getFileHandle(parts.at(-1)!, { create: true });
          const writable = await handle.createWritable();
          await writable.write(change.previousContent);
          await writable.close();
        }
      } catch (rollbackError) {
        rollbackErrors.push(
          `${change.path}: ${rollbackError instanceof Error ? rollbackError.message : "rollback failed"}`,
        );
      }
    }
    const reason = error instanceof Error ? error.message : "write failed";
    if (rollbackErrors.length)
      throw new Error(
        `File application failed (${reason}). Some rollback steps also failed: ${rollbackErrors.join("; ")}`,
      );
    throw new Error(`File application failed and earlier writes were rolled back: ${reason}`);
  }
  return applied.length;
}
