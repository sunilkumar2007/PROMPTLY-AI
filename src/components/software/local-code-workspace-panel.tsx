import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import {
  applyReviewedWorkspaceFiles,
  reviewGeneratedWorkspaceFiles,
  type LocalWorkspaceChange,
  type LocalWorkspaceDirectoryHandle,
} from "@/lib/local-code-workspace";
import type { ProjectPhase } from "@/lib/software-projects.store";

type Props = {
  phase: ProjectPhase;
  directory: LocalWorkspaceDirectoryHandle | null;
  onDirectorySelected: (directory: LocalWorkspaceDirectoryHandle) => void;
  onApplied: (files: string[]) => Promise<void>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<LocalWorkspaceDirectoryHandle>;
};

export function LocalCodeWorkspacePanel({
  phase,
  directory,
  onDirectorySelected,
  onApplied,
}: Props) {
  const [changes, setChanges] = useState<LocalWorkspaceChange[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!directory || !phase.generatedCode) {
      setChanges([]);
      return () => {
        active = false;
      };
    }
    void reviewGeneratedWorkspaceFiles(directory, phase.generatedCode)
      .then((preview) => {
        if (active) setChanges(preview);
      })
      .catch((error) => {
        if (active)
          toast.error(
            error instanceof Error ? error.message : "Could not review the selected folder.",
          );
      });
    return () => {
      active = false;
    };
  }, [directory, phase.id, phase.generatedCode]);

  const connectFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      toast.error(
        "Folder editing requires a browser with the File System Access API. Download the ZIP instead.",
      );
      return;
    }
    setBusy(true);
    try {
      const selected = await picker({ mode: "readwrite" });
      onDirectorySelected(selected);
      toast.success(`Connected to ${selected.name}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Could not review this folder.");
    } finally {
      setBusy(false);
    }
  };

  const refreshPreview = async () => {
    if (!directory || !phase.generatedCode) return;
    setBusy(true);
    try {
      setChanges(await reviewGeneratedWorkspaceFiles(directory, phase.generatedCode));
      toast.success("Folder preview refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh the preview.");
    } finally {
      setBusy(false);
    }
  };

  const applyChanges = async () => {
    if (!directory || !changes.length) return;
    const overwriteCount = changes.filter((change) => change.previousContent !== null).length;
    if (
      overwriteCount &&
      !window.confirm(
        `This will update ${overwriteCount} existing file${overwriteCount === 1 ? "" : "s"} in "${directory.name}". New files will also be created. Apply the reviewed changes?`,
      )
    )
      return;
    setBusy(true);
    try {
      const written = await applyReviewedWorkspaceFiles(directory, changes);
      toast.success(
        `Applied ${written} reviewed file${written === 1 ? "" : "s"} to ${directory.name}.`,
      );
      setChanges(await reviewGeneratedWorkspaceFiles(directory, phase.generatedCode || ""));
      try {
        await onApplied(changes.map((change) => change.path));
      } catch {
        toast.error("Files were written, but Promptly could not save the applied-file record.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "File changes could not be applied.");
      await refreshPreview();
    } finally {
      setBusy(false);
    }
  };

  const outdated = Boolean(phase.generatedCodeOutdated);

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      aria-label="Apply generated source files"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Apply to a local project</h3>
          <p className="mt-1 text-xs text-slate-600">
            Review every file before writing. Existing files are checked again before changes are
            applied.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {directory && phase.generatedCode && (
            <button
              type="button"
              onClick={() => void refreshPreview()}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
            >
              Refresh preview
            </button>
          )}
          <button
            type="button"
            onClick={() => void connectFolder()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {busy
              ? "Reviewing…"
              : directory
                ? `Folder: ${directory.name}`
                : "Choose project folder"}
          </button>
        </div>
      </div>
      {!phase.generatedCode ? (
        <p className="text-xs text-slate-600">
          {directory
            ? `Connected to ${directory.name}. Relevant existing files will be included with the next code request.`
            : "Choose your project folder before generating code so Promptly can read the planned files and follow the project’s existing conventions."}
        </p>
      ) : outdated ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This output came from an older prompt. Generate current source files before applying it.
        </p>
      ) : directory && changes.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <span>
              {changes.filter((item) => item.previousContent === null).length} new ·{" "}
              {changes.filter((item) => item.previousContent !== null).length} updates
            </span>
            <button
              type="button"
              onClick={() => void applyChanges()}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Applying…" : "Apply reviewed files"}
            </button>
          </div>
          {changes.map((change) => (
            <details
              key={change.path}
              className="rounded-lg border border-slate-200"
              open={changes.length <= 3}
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-800">
                {change.previousContent === null ? "New file" : "Update"} · {change.path}
              </summary>
              <div className="grid gap-2 border-t border-slate-200 p-2 xl:grid-cols-2">
                {change.previousContent !== null && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">
                      Current file
                    </p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-800">
                      {change.previousContent}
                    </pre>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">
                    Generated file
                  </p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-800">
                    {change.content}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : directory ? (
        <p className="text-xs text-slate-600">No file changes are needed for this phase.</p>
      ) : (
        <p className="text-xs text-slate-600">
          Select a folder you control. Promptly will only write the named files shown in the review
          list; it does not delete files or run project commands.
        </p>
      )}
      {phase.codeGenerationAppliedAt && (
        <p className="text-[11px] text-slate-600">
          Last applied {new Date(phase.codeGenerationAppliedAt).toLocaleString()} ·{" "}
          {phase.codeGenerationAppliedFiles?.length || 0} file(s)
        </p>
      )}
    </section>
  );
}
