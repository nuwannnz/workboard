import { z } from 'zod';
import {
  noteMetadataSchema,
  noteSchema,
  createNoteSchema,
  updateNoteSchema,
  type Note,
  type NoteMetadata,
  type CreateNoteInput,
  type UpdateNoteInput,
} from '@workboard/shared';
import type { ApiClient } from '../auth/api-client';

/** `GET /notes` envelope — metadata only, no bodies (contracts/notes-api.md, FR-007). */
const listResponseSchema = z.object({ notes: z.array(noteMetadataSchema) });

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/** A link update rejected because a project/task target isn't the caller's (`400`). */
export class InvalidLinkTargetError extends Error {
  constructor(readonly ids: string[]) {
    super('Invalid link target');
    this.name = 'InvalidLinkTargetError';
  }
}

/**
 * Typed wrapper over the Stage 2 `api-client` for the Notes `/notes` endpoints
 * (contracts/notes-client-contract.md §Data client). Requests carry the id token via the
 * api-client (which also handles the one-shot `401` refresh); any other non-2xx **rejects** so
 * the hook can roll back an optimistic change and surface a failure (FR-006/FR-018). A
 * `400 InvalidLinkTarget` from a link update rejects **distinctly** so the link UI can show
 * "that project/task isn't available". Responses are parsed with the shared `noteSchema`.
 */
export interface NotesClient {
  listNotes(): Promise<NoteMetadata[]>;
  listByLinkedProject(projectId: string): Promise<NoteMetadata[]>;
  listByLinkedTask(taskId: string): Promise<NoteMetadata[]>;
  getNote(id: string): Promise<Note>;
  createNote(input?: CreateNoteInput): Promise<Note>;
  updateNote(id: string, patch: UpdateNoteInput): Promise<Note>;
  deleteNote(id: string): Promise<void>;
}

export function createNotesClient(api: ApiClient): NotesClient {
  async function listWith(query = ''): Promise<NoteMetadata[]> {
    const res = await api.request(`/notes${query}`, { method: 'GET' });
    if (!res.ok) throw new Error(`listNotes failed: ${res.status}`);
    return listResponseSchema.parse(await res.json()).notes;
  }

  return {
    listNotes() {
      return listWith();
    },

    async getNote(id) {
      const res = await api.request(`/notes/${encodeURIComponent(id)}`, { method: 'GET' });
      if (!res.ok) throw new Error(`getNote failed: ${res.status}`);
      return noteSchema.parse(await res.json());
    },

    listByLinkedProject(projectId) {
      const q = new URLSearchParams({ linkedProjectId: projectId }).toString();
      return listWith(`?${q}`);
    },

    listByLinkedTask(taskId) {
      const q = new URLSearchParams({ linkedTaskId: taskId }).toString();
      return listWith(`?${q}`);
    },

    async createNote(input = {}) {
      const body = createNoteSchema.parse(input);
      const res = await api.request('/notes', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createNote failed: ${res.status}`);
      return noteSchema.parse(await res.json());
    },

    async updateNote(id, patch) {
      const body = updateNoteSchema.parse(patch);
      const res = await api.request(`/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // A link-target rejection is surfaced distinctly so the link UI can react (US3).
        if (res.status === 400) {
          const problem = (await res.json().catch(() => null)) as
            | { error?: string; details?: string[] }
            | null;
          if (problem?.error === 'InvalidLinkTarget') {
            throw new InvalidLinkTargetError(problem.details ?? []);
          }
        }
        throw new Error(`updateNote failed: ${res.status}`);
      }
      return noteSchema.parse(await res.json());
    },

    async deleteNote(id) {
      const res = await api.request(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`deleteNote failed: ${res.status}`);
    },
  };
}
