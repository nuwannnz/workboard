import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, UpdateTaskInput } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createTasksClient } from '../week/tasks-client';
import { append, between } from '../week/ordering';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Sort backlog tasks by manual `order`, breaking ties by `id` (mirrors the week board). */
function byOrderThenId(a: Task, b: Task): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

/**
 * One project's backlog data hook (contracts/projects-client-contract.md §use-project-tasks).
 * Loads `listByProject(projectId)`, exposes the backlog sorted by `order` then `id`, and
 * provides optimistic task CRUD with snapshot rollback — the same patterns as `use-week-tasks`
 * but scoped to a project and with an **optional** due date. A backlog task has no `dueDate`;
 * scheduling one (US4) sets its `dueDate` so it also appears on the Week board (FR-011/FR-013).
 */
export function useProjectTasks(projectId: string) {
  const { apiClient } = useAuth();
  const client = useMemo(() => createTasksClient(apiClient), [apiClient]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadTokenRef = useRef(0);
  const mutationRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const mutationAtStart = mutationRef.current;
    setLoadStatus('loading');
    try {
      const loaded = await client.listByProject(projectId);
      if (token !== loadTokenRef.current) return; // superseded
      if (mutationRef.current !== mutationAtStart) {
        setLoadStatus('ready');
        return;
      }
      setTasks(loaded);
      setLoadStatus('ready');
    } catch {
      if (token !== loadTokenRef.current) return;
      setLoadStatus('error');
    }
  }, [client, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backlog = useMemo(() => [...tasks].sort(byOrderThenId), [tasks]);

  /**
   * Optimistically add a backlog task by title (no due date): insert a temp card at the
   * bottom, then persist via `create({ title, projectId })`. On success the temp card is
   * swapped for the server task; on failure it is removed and an error surfaced.
   */
  const addBacklogTask = useCallback(
    async (rawTitle: string): Promise<boolean> => {
      const title = rawTitle.trim();
      if (!title) return false;

      const lastOrder = tasks
        .map((t) => t.order)
        .sort()
        .at(-1);
      const tempId = nextTempId();
      const now = new Date().toISOString();
      const optimistic: Task = {
        id: tempId,
        title,
        dueDate: null,
        status: 'open',
        priority: 'medium',
        labels: [],
        order: append(lastOrder),
        projectId,
        linkedNoteIds: [],
        createdAt: now,
        updatedAt: now,
      };
      mutationRef.current += 1;
      setError(null);
      setTasks((prev) => [...prev, optimistic]);

      try {
        const created = await client.create({ title, projectId });
        setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
        return true;
      } catch {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        setError('Could not save the task. Please try again.');
        return false;
      }
    },
    [client, projectId, tasks],
  );

  /** Optimistically edit a task's fields, reverting on failure (FR-018). */
  const editTask = useCallback(
    async (id: string, patch: UpdateTaskInput): Promise<boolean> => {
      const snapshot = tasks;
      const now = new Date().toISOString();
      const applied = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ) as Partial<Task>;
      mutationRef.current += 1;
      setError(null);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...applied, updatedAt: now } : t)));
      try {
        const updated = await client.update(id, patch);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return true;
      } catch {
        setTasks(snapshot);
        setError('Could not save the changes. Please try again.');
        return false;
      }
    },
    [client, tasks],
  );

  /** Optimistically toggle complete/reopen, keeping the card visible (FR-007). */
  const toggleComplete = useCallback(
    async (id: string): Promise<boolean> => {
      const current = tasks.find((t) => t.id === id);
      if (!current) return false;
      const status = current.status === 'completed' ? 'open' : 'completed';
      return editTask(id, { status });
    },
    [tasks, editTask],
  );

  /** Optimistically delete a backlog task, reinstating it on failure (FR-018). */
  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      const snapshot = tasks;
      mutationRef.current += 1;
      setError(null);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await client.remove(id);
        return true;
      } catch {
        setTasks(snapshot);
        setError('Could not delete the task. Please try again.');
        return false;
      }
    },
    [client, tasks],
  );

  /**
   * Schedule a backlog task onto the Week board by setting its due date (US4, FR-011); the
   * same record then also surfaces under that day. Clearing moves it back to backlog-only.
   */
  const scheduleTask = useCallback(
    (id: string, dueDate: string): Promise<boolean> => editTask(id, { dueDate }),
    [editTask],
  );
  const clearDueDate = useCallback(
    (id: string): Promise<boolean> => editTask(id, { dueDate: null }),
    [editTask],
  );

  /**
   * Optimistically reorder a backlog task to position `index` (among the other backlog tasks),
   * computing a fractional `order` between neighbors and rolling back on failure (US5, FR-009).
   */
  const reorderTask = useCallback(
    async (id: string, index: number): Promise<boolean> => {
      const snapshot = tasks;
      const siblings = tasks.filter((t) => t.id !== id).sort(byOrderThenId);
      const prevOrder = index > 0 ? siblings[index - 1]?.order : undefined;
      const nextOrder = siblings[index]?.order;
      const order = between(prevOrder, nextOrder);
      const now = new Date().toISOString();

      mutationRef.current += 1;
      setError(null);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, order, updatedAt: now } : t)));
      try {
        const updated = await client.update(id, { order });
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return true;
      } catch {
        setTasks(snapshot);
        setError('Could not reorder the task. Please try again.');
        return false;
      }
    },
    [client, tasks],
  );

  return {
    backlog,
    loadStatus,
    error,
    reload: load,
    addBacklogTask,
    editTask,
    toggleComplete,
    deleteTask,
    scheduleTask,
    clearDueDate,
    reorderTask,
  };
}
