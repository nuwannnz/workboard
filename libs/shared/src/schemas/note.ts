import { z } from 'zod';

/**
 * Note — a titled Markdown document owned by exactly one Account, and the carrier of the
 * product's final entity relationship: a note links to the owner's projects and tasks. Stage 5
 * replaces the Stage 1 stub with the full domain shape. The shape is the single source of truth
 * shared by the backend controller and the frontend client so both validate identically
 * (Principle V, data-model.md §Entity: Note).
 *
 * Ownership is **not** a field here — it is carried by the persisted key and derived from the
 * app `userId` resolved from the authenticated `sub`; it is never accepted from or returned to
 * the client (Principle IV, FR-018).
 *
 * The Note is the **single source of truth** for every link: `linkedProjectIds` /
 * `linkedTaskIds` live only here — nothing is denormalized onto the Task or Project (research §2).
 */
export const noteSchema = z.object({
  id: z.string(),
  // Empty allowed — the Stage 1 `min(1)` is dropped; the list shows "Untitled" for empty
  // (FR-008, research §7). Auto-save creates a note before the user types a title.
  title: z.string().default(''),
  markdown: z.string().default(''),
  linkedProjectIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `POST /notes` request body — a note may be created **empty** (auto-save-first flow,
 * FR-002/FR-008). Both fields optional; the server assigns `id`, timestamps, and defaults
 * `title`/`markdown` to `''` and the link arrays to `[]`.
 */
export const createNoteSchema = z.object({
  title: z.string().optional(),
  markdown: z.string().optional(),
});

/**
 * `PATCH /notes/:id` request body. One partial-update surface serves three callers
 * (research §5): content auto-save (`{ title?, markdown? }`), rename (`{ title }`), and
 * link add/remove (`{ linkedProjectIds?, linkedTaskIds? }`). Every field is optional and
 * `title` may be an **empty** string (FR-008). Link arrays, when present, are de-duplicated
 * and owner-validated by the service.
 */
export const updateNoteSchema = z
  .object({
    title: z.string(),
    markdown: z.string(),
    linkedProjectIds: z.array(z.string()),
    linkedTaskIds: z.array(z.string()),
  })
  .partial();

export type Note = z.infer<typeof noteSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
