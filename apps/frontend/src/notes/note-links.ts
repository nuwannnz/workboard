/**
 * Pure link helpers (contracts §Linking a note, research §4) — no React, no network — so they
 * unit-test independently (Principle III). Links are single-sourced on the note; the client
 * de-duplicates before persisting and **resolves stale ids away at display time** (FR-014).
 */

/** Remove duplicate ids while preserving first-seen order (US3.4). */
export function dedup(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Map link ids to the caller's known projects/tasks, **omitting** ids that no longer resolve
 * (stale — the project/task was deleted; FR-014). Preserves the order of `ids`.
 */
export function resolve<T extends { id: string }>(ids: string[], items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
}

/** Drop unresolved (stale) ids from an array, keeping only ids the caller still owns (FR-014). */
export function pruneStale(ids: string[], items: { id: string }[]): string[] {
  const known = new Set(items.map((item) => item.id));
  return ids.filter((id) => known.has(id));
}
