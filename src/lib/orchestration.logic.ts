export interface SchedulablePhase {
  id: string;
  phaseNumber: number;
  dependencies: number[];
}

/** Pick only approved, unprocessed phases whose every declared dependency exists and completed. */
export function selectReadyOrchestrationPhases<T extends SchedulablePhase>(
  phases: T[],
  eligibleIds: ReadonlySet<string>,
  completedNumbers: ReadonlySet<number>,
  processedIds: ReadonlySet<string>,
  limit: number,
): T[] {
  const existingNumbers = new Set(phases.map((phase) => phase.phaseNumber));
  const boundedLimit = Math.max(1, Math.min(4, Math.floor(limit)));
  return phases
    .filter(
      (phase) =>
        eligibleIds.has(phase.id) &&
        !processedIds.has(phase.id) &&
        phase.dependencies.every(
          (dependency) => existingNumbers.has(dependency) && completedNumbers.has(dependency),
        ),
    )
    .sort((a, b) => a.phaseNumber - b.phaseNumber)
    .slice(0, boundedLimit);
}

export interface FileAwarePhase extends SchedulablePhase {
  filesAffected?: { create?: string[]; modify?: string[] };
}

/** Keep concurrent provider requests to phases with declared, disjoint file targets. */
export function selectConflictSafeOrchestrationBatch<T extends FileAwarePhase>(
  phases: T[],
  limit: number,
): T[] {
  const boundedLimit = Math.max(1, Math.min(4, Math.floor(limit)));
  const selected: T[] = [];
  const reserved = new Set<string>();
  for (const phase of phases) {
    const targets = new Set(
      [...(phase.filesAffected?.create || []), ...(phase.filesAffected?.modify || [])]
        .map((path) => path.trim().replace(/\\/g, "/").toLowerCase())
        .filter(Boolean),
    );
    // Missing file declarations make conflicts unknowable. Run that phase alone.
    if (!targets.size) {
      if (!selected.length) selected.push(phase);
      break;
    }
    if ([...targets].some((path) => reserved.has(path))) continue;
    selected.push(phase);
    for (const path of targets) reserved.add(path);
    if (selected.length >= boundedLimit) break;
  }
  return selected;
}
