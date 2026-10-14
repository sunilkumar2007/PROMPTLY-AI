import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CONTEXT_TARGETS, ContextTarget, EMPTY_SHARED_CONTEXT, formatSharedContext, loadSharedContext, saveSharedContext, SharedContextProfile } from "@/lib/shared-context";

const FIELDS: Array<{ key: keyof SharedContextProfile; label: string; placeholder: string; hint: string }> = [
  { key: "about", label: "About you", placeholder: "Your role, location, experience, and relevant background…", hint: "Share only details that help AI tools give you better answers." },
  { key: "currentWork", label: "What you work on", placeholder: "Projects, goals, audience, or recurring tasks…", hint: "Keep this high level; add sensitive project material only when needed." },
  { key: "expertise", label: "Your expertise", placeholder: "Topics you know well and areas where you want more explanation…", hint: "This helps tools choose the right level of detail." },
  { key: "tools", label: "Tools and technologies", placeholder: "Preferred languages, frameworks, apps, or platforms…", hint: "These are preferences unless you mark them as requirements." },
  { key: "preferences", label: "How you like responses", placeholder: "Tone, structure, depth, examples, and formatting…", hint: "For example: concise first, explain tradeoffs, use practical examples." },
  { key: "constraints", label: "Constraints and non-negotiables", placeholder: "Budget, compatibility, accessibility, deadlines, or rules…", hint: "Separate fixed constraints from preferences where possible." },
  { key: "avoid", label: "What to avoid", placeholder: "Approaches, styles, assumptions, or output you do not want…", hint: "Keep rules clear and specific." },
  { key: "language", label: "Preferred language", placeholder: "e.g. English, Tamil, Hindi…", hint: "Leave blank if you want the tool to follow each request." },
];

export const SharedContextWorkspace: React.FC = () => {
  const [profile, setProfile] = useState<SharedContextProfile>(EMPTY_SHARED_CONTEXT);
  const [target, setTarget] = useState<ContextTarget>("plain");
  const [saved, setSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const output = useMemo(() => formatSharedContext(profile, target), [profile, target]);
  const targetInfo = CONTEXT_TARGETS.find((item) => item.id === target)!;

  useEffect(() => setProfile(loadSharedContext()), []);

  const update = (key: keyof SharedContextProfile, value: string | boolean) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    if (!saveSharedContext(profile)) {
      toast.error("Could not save shared context. Check browser storage and keep the profile under 12,000 characters.");
      return;
    }
    setProfile(loadSharedContext());
    setSaved(true);
    toast.success("Your shared context is saved on this device.");
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      toast.success(`Copied instructions for ${targetInfo.label}.`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard access was blocked. Select the preview text and copy it.");
    }
  };

  const handleDownload = () => {
    if (!output) return;
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = targetInfo.filename.split("/").pop() || "AI_CONTEXT.md";
    anchor.click();
    URL.revokeObjectURL(url);
    const downloadedName = targetInfo.filename.split("/").pop() || "AI_CONTEXT.md";
    toast.success(targetInfo.filename.includes("/")
      ? `Downloaded ${downloadedName}. Move it to ${targetInfo.filename}.`
      : `Downloaded ${downloadedName}.`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white"><Sparkles className="h-3.5 w-3.5" /> Shared context</span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">One context. Every tool.</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Write your background and preferences once. Promptly uses this profile in its AI workflows and reshapes it for the instruction format each tool expects.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${saved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}><Check className="h-3.5 w-3.5" />{saved ? "Saved on this device" : "Unsaved changes"}</span>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="checkbox" checked={profile.useInRequests} onChange={(event) => update("useInRequests", event.target.checked)} className="mt-0.5 h-4 w-4 accent-slate-900" />
          <span><span className="block text-sm font-semibold text-slate-800">Use this context in Promptly AI requests</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">When enabled, relevant fields are sent with prompt creation, project planning, and chat requests. Your profile is stored in this browser and is not uploaded until an AI request uses it.</span></span>
        </label>
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><p>Do not put passwords, API keys, private customer data, or other secrets here. You can turn off automatic use at any time.</p></div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div><h2 className="text-lg font-bold text-slate-900">Your canonical context</h2><p className="mt-1 text-xs text-slate-500">Keep stable preferences here. Add task-specific details in the project or prompt itself.</p></div>
          <div className="space-y-4">
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Profile name</span><input value={profile.name} onChange={(event) => update("name", event.target.value)} maxLength={80} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-900" /></label>
            {FIELDS.map((field) => <label key={field.key} className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{field.label}</span><textarea value={profile[field.key] as string} onChange={(event) => update(field.key, event.target.value)} maxLength={3000} placeholder={field.placeholder} rows={2} className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-900" /><span className="block text-[11px] text-slate-400">{field.hint}</span></label>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-[11px] text-slate-400">Saved locally · {Object.values(profile).reduce((size, value) => size + (typeof value === "string" ? value.length : 0), 0).toLocaleString()} characters</span><button type="button" onClick={handleSave} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700">Save shared context</button></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-24">
          <div className="space-y-4 border-b border-slate-100 p-5 sm:p-6">
            <div><h2 className="text-lg font-bold text-slate-900">Adapt for a tool</h2><p className="mt-1 text-xs text-slate-500">Choose a destination to preview its paste-ready text or project instruction file.</p></div>
            <select aria-label="Choose AI tool format" value={target} onChange={(event) => setTarget(event.target.value as ContextTarget)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-900">{CONTEXT_TARGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <div className="flex items-center justify-between gap-3"><p className="text-xs leading-relaxed text-slate-500">{targetInfo.hint}<span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suggested file path</span><span className="block break-all font-mono text-[11px] text-slate-500">{targetInfo.filename}</span></p><div className="flex shrink-0 gap-2"><button type="button" onClick={handleCopy} disabled={!output} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button><button type="button" onClick={handleDownload} disabled={!output} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"><Download className="h-3.5 w-3.5" />Download</button></div></div>
          </div>
          <pre className="max-h-[680px] min-h-72 overflow-auto whitespace-pre-wrap break-words bg-slate-50 p-5 text-xs leading-relaxed text-slate-700 sm:p-6">{output || "Add details to your shared context to see the adapted instructions here."}</pre>
        </section>
      </div>
    </div>
  );
};
