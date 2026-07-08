import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, UpdateTaskInput } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createTasksClient } from './tasks-client';
import { append, between } from './ordering';
import { startOfWeek, weekDays, addWeeks, todayDate, isToday } from './week';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** One rendered day column: its date, today marker, and its tasks in manual order. */
export interface WeekDay {
  date: string;
  isToday: boolean;
  tasks: Task[];
}

/** Sort a day's tasks by manual `order`, breaking ties by `id` (research §4). */
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
 * Week data hook (contracts/tasks-client-contract.md). Holds the displayed week
 * (`referenceMonday`) and its tasks, loads the window on mount / navigation, groups tasks by
 * day sorted by `order` then `id`, and exposes optimistic mutations with rollback so the
 * board never shows an unsaved change as saved (FR-016). US1 ships load + inline add; later
 * stories layer move/reorder/edit/complete/delete onto the same state.
 */
export function useWeekTasks() {
  const { apiClient } = useAuth();
  const client = useMemo(() => createTasksClient(apiClient), [apiClient]);

  const [referenceMonday, setReferenceMonday] = useState(() => startOfWeek(todayDate()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekDays(referenceMonday), [referenceMonday]);

  // Guards a stale in-flight load from applying after a newer navigation.
  const loadTokenRef = useRef(0);
  // Bumped by every mutation so a load that was in flight when a mutation happened can't
  // clobber the optimistic (or just-persisted) result with its now-stale snapshot — a
  // read-after-write race when the user acts before the initial/navigation load resolves.
  const mutationRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const mutationAtStart = mutationRef.current;
    setLoadStatus('loading');
    const window = weekDays(referenceMonday);
    try {
      const loaded = await client.listWeek(window[0], window[6]);
      if (token !== loadTokenRef.current) return; // superseded by a newer navigation
      // A mutation raced this load → keep the authoritative optimistic state; a later
      // navigation/reload reconciles with the server.
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
  }, [client, referenceMonday]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The seven day columns with their grouped, ordered tasks. */
  const weekViewDays = useMemo<WeekDay[]>(
    () =>
      days.map((date) => ({
        date,
        isToday: isToday(date),
        tasks: tasks.filter((t) => t.dueDate === date).sort(byOrderThenId),
      })),
    [days, tasks],
  );

  /**
   * Optimistically add a task at the bottom of `day`: insert a temp card immediately, then
   * persist. On success the temp card is swapped for the server task; on failure it is
   * removed and an error surfaced (FR-004 blank titles are rejected before any of this).
   */
  const addTask = useCallback(
    async (day: string, rawTitle: string): Promise<boolean> => {
      const title = rawTitle.trim();
      if (!title) return false;

      const lastOrder = tasks
        .filter((t) => t.dueDate === day)
        .map((t) => t.order)
        .sort()
        .at(-1);
      const tempId = nextTempId();
      const now = new Date().toISOString();
      const optimistic: Task = {
        id: tempId,
        title,
        dueDate: day,
        status: 'open',
        priority: 'medium',
        labels: [],
        order: append(lastOrder),
        projectId: null,
        linkedNoteIds: [],
        createdAt: now,
        updatedAt: now,
      };
      mutationRef.current += 1;
      setError(null);
      setTasks((prev) => [...prev, optimistic]);

      try {
        const created = await client.create({ title, dueDate: day });
        setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
        return true;
      } catch {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        setError('Could not save the task. Please try again.');
        return false;
      }
    },
    [client, tasks],
  );

  /**
   * Optimistically move a task to `toDay` at position `index`: set the new `dueDate` and a
   * fractional `order` between the drop neighbors, persist, and roll back the whole task list
   * on failure (research §8, FR-005/FR-010/FR-016). `index` is the position among the target
   * day's tasks *excluding* the moved card.
   */
  const moveTask = useCallback(
    async (id: string, toDay: string, index: number): Promise<boolean> => {
      const snapshot = tasks;
      const target = tasks
        .filter((t) => t.dueDate === toDay && t.id !== id)
        .sort(byOrderThenId);
      const prevOrder = index > 0 ? target[index - 1]?.order : undefined;
      const nextOrder = target[index]?.order;
      const order = between(prevOrder, nextOrder);
      const now = new Date().toISOString();

      mutationRef.current += 1;
      setError(null);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, dueDate: toDay, order, updatedAt: now } : t)),
      );

      try {
        const updated = await client.update(id, { dueDate: toDay, order });
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return true;
      } catch {
        setTasks(snapshot);
        setError('Could not move the task. Please try again.');
        return false;
      }
    },
    [client, tasks],
  );

  /**
   * Optimistically reorder a task within its own day to position `index` (among the day's
   * other tasks), computing a new `order` between the neighbors and rolling back on failure
   * (FR-006, SC-004, FR-016).
   */
  const reorderTask = useCallback(
    async (id: string, index: number): Promise<boolean> => {
      const snapshot = tasks;
      const task = tasks.find((t) => t.id === id);
      if (!task || task.dueDate === null) return false;
      const siblings = tasks
        .filter((t) => t.dueDate === task.dueDate && t.id !== id)
        .sort(byOrderThenId);
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

  /**
   * Optimistically edit a task's fields (title/description/dueDate/priority/labels). Changing
   * `dueDate` reschedules it to the matching day (FR-009/FR-010). Reverts on failure; the
   * dialog keeps a title-required error visible with the prior value (FR-004, Story 5.6).
   */
  const editTask = useCallback(
    async (id: string, patch: UpdateTaskInput): Promise<boolean> => {
      const snapshot = tasks;
      const now = new Date().toISOString();
      // Only apply defined fields so an omitted/undefined value can't clobber existing state.
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

  /** Optimistically toggle complete/reopen, keeping the card visible (FR-011). */
  const toggleComplete = useCallback(
    async (id: string): Promise<boolean> => {
      const current = tasks.find((t) => t.id === id);
      if (!current) return false;
      const status = current.status === 'completed' ? 'open' : 'completed';
      return editTask(id, { status });
    },
    [tasks, editTask],
  );

  /** Optimistically delete a task, reinstating it on failure (FR-012, FR-016). */
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

  const goToPrevWeek = useCallback(() => setReferenceMonday((m) => addWeeks(m, -1)), []);
  const goToNextWeek = useCallback(() => setReferenceMonday((m) => addWeeks(m, 1)), []);
  const goToCurrentWeek = useCallback(() => setReferenceMonday(startOfWeek(todayDate())), []);

  return {
    referenceMonday,
    days: weekViewDays,
    loadStatus,
    error,
    reload: load,
    addTask,
    moveTask,
    reorderTask,
    editTask,
    toggleComplete,
    deleteTask,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
