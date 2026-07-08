import { z } from 'zod';
import {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  type Task,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@workboard/shared';
import type { ApiClient } from '../auth/api-client';

/** `GET /tasks` envelope (contracts/tasks-api.md). */
const listResponseSchema = z.object({ tasks: z.array(taskSchema) });

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/**
 * Typed wrapper over the Stage 2 `api-client` for the Week board's `/tasks` endpoints
 * (contracts/tasks-client-contract.md). Requests carry the id token via the api-client
 * (which also handles the one-shot `401` refresh); any other non-2xx **rejects** so the
 * hook can roll back an optimistic change and surface a failure (FR-016). Responses are
 * parsed with the shared schemas so the client and server validate identically.
 */
export interface TasksClient {
  listWeek(from: string, to: string): Promise<Task[]>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: string, patch: UpdateTaskInput): Promise<Task>;
  remove(id: string): Promise<void>;
}

export function createTasksClient(api: ApiClient): TasksClient {
  return {
    async listWeek(from, to) {
      const query = new URLSearchParams({ from, to }).toString();
      const res = await api.request(`/tasks?${query}`, { method: 'GET' });
      if (!res.ok) throw new Error(`listWeek failed: ${res.status}`);
      return listResponseSchema.parse(await res.json()).tasks;
    },

    async create(input) {
      const body = createTaskSchema.parse(input);
      const res = await api.request('/tasks', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      return taskSchema.parse(await res.json());
    },

    async update(id, patch) {
      const body = updateTaskSchema.parse(patch);
      const res = await api.request(`/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      return taskSchema.parse(await res.json());
    },

    async remove(id) {
      const res = await api.request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`remove failed: ${res.status}`);
    },
  };
}
