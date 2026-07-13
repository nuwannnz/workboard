import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createProjectsClient } from './projects-client';
import { append } from '../week/ordering';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Sort projects by manual `order`, breaking ties by `id` (mirrors the backend list sort). */
function byOrderThenId(a: Project, b: Project): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

/**
 * Projects list data hook (contracts/projects-client-contract.md §use-projects). Loads the
 * owner's projects on mount, exposes them sorted by `order` then `id`, and provides optimistic
 * mutations with snapshot rollback so a card is never shown as saved when the write failed
 * (FR-018). US1 ships load + create; US5 layers edit/delete onto the same state.
 */
export function useProjects() {
  const { apiClient } = useAuth();
  const client = useMemo(() => createProjectsClient(apiClient), [apiClient]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadTokenRef = useRef(0);
  const mutationRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const mutationAtStart = mutationRef.current;
    setLoadStatus('loading');
    try {
      const loaded = await client.listProjects();
      if (token !== loadTokenRef.current) return; // superseded
      if (mutationRef.current !== mutationAtStart) {
        setLoadStatus('ready');
        return;
      }
      setProjects([...loaded].sort(byOrderThenId));
      setLoadStatus('ready');
    } catch {
      if (token !== loadTokenRef.current) return;
      setLoadStatus('error');
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...projects].sort(byOrderThenId), [projects]);

  /**
   * Optimistically create a project appended to the bottom of the card order: insert a temp
   * card immediately, then persist. On success the temp card is swapped for the server
   * project; on failure it is removed and an error surfaced (blank names are rejected by the
   * dialog before this runs).
   */
  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<boolean> => {
      const lastOrder = projects
        .map((p) => p.order)
        .sort()
        .at(-1);
      const tempId = nextTempId();
      const now = new Date().toISOString();
      const optimistic: Project = {
        id: tempId,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        color: input.color,
        order: append(lastOrder),
        createdAt: now,
        updatedAt: now,
      };
      mutationRef.current += 1;
      setError(null);
      setProjects((prev) => [...prev, optimistic]);

      try {
        const created = await client.createProject(input);
        setProjects((prev) => prev.map((p) => (p.id === tempId ? created : p)));
        return true;
      } catch {
        setProjects((prev) => prev.filter((p) => p.id !== tempId));
        setError('Could not save the project. Please try again.');
        return false;
      }
    },
    [client, projects],
  );

  /** Optimistically edit a project's fields, reverting to the snapshot on failure (FR-018). */
  const editProject = useCallback(
    async (id: string, patch: UpdateProjectInput): Promise<boolean> => {
      const snapshot = projects;
      const now = new Date().toISOString();
      const applied = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ) as Partial<Project>;
      mutationRef.current += 1;
      setError(null);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...applied, updatedAt: now } : p)));
      try {
        const updated = await client.updateProject(id, patch);
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return true;
      } catch {
        setProjects(snapshot);
        setError('Could not save the project. Please try again.');
        return false;
      }
    },
    [client, projects],
  );

  /**
   * Optimistically delete a project (removing its card immediately); on failure it is
   * reinstated and an error surfaced (FR-018). The cascade of its tasks is a backend concern —
   * the UI just stops showing the project.
   */
  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      const snapshot = projects;
      mutationRef.current += 1;
      setError(null);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      try {
        await client.deleteProject(id);
        return true;
      } catch {
        setProjects(snapshot);
        setError('Could not delete the project. Please try again.');
        return false;
      }
    },
    [client, projects],
  );

  return {
    projects: sorted,
    loadStatus,
    error,
    reload: load,
    createProject,
    editProject,
    deleteProject,
  };
}
