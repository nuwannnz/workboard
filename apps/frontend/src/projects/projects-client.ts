import { z } from 'zod';
import {
  projectSchema,
  createProjectSchema,
  updateProjectSchema,
  type Project,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@workboard/shared';
import type { ApiClient } from '../auth/api-client';

/** `GET /projects` envelope (contracts/projects-api.md). */
const listResponseSchema = z.object({ projects: z.array(projectSchema) });

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/**
 * Typed wrapper over the Stage 2 `api-client` for the Projects `/projects` endpoints
 * (contracts/projects-client-contract.md §Data clients). Requests carry the id token via the
 * api-client (which also handles the one-shot `401` refresh); any other non-2xx **rejects** so
 * the hook can roll back an optimistic change and surface a failure (FR-018). Responses are
 * parsed with the shared `projectSchema` so client and server validate identically.
 */
export interface ProjectsClient {
  listProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, patch: UpdateProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;
}

export function createProjectsClient(api: ApiClient): ProjectsClient {
  return {
    async listProjects() {
      const res = await api.request('/projects', { method: 'GET' });
      if (!res.ok) throw new Error(`listProjects failed: ${res.status}`);
      return listResponseSchema.parse(await res.json()).projects;
    },

    async createProject(input) {
      const body = createProjectSchema.parse(input);
      const res = await api.request('/projects', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
      return projectSchema.parse(await res.json());
    },

    async updateProject(id, patch) {
      const body = updateProjectSchema.parse(patch);
      const res = await api.request(`/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`updateProject failed: ${res.status}`);
      return projectSchema.parse(await res.json());
    },

    async deleteProject(id) {
      const res = await api.request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`deleteProject failed: ${res.status}`);
    },
  };
}
