import { z } from 'zod';

/**
 * Note **metadata** — the authoritative record of a note's existence and attributes, stored as a
 * single DynamoDB item and returned as each element of the `GET /notes` list. Stage 7 splits the
 * note in two: metadata lives in DynamoDB (this schema, **no `markdown`**), while the Markdown
 * **body** lives as one S3 object per note, pointed at by `bodyKey` (data-model.md §1, FR-001/FR-007).
 * The shape is the single source of truth shared by the backend and frontend so both validate
 * identically (Principle V).
 *
 * Ownership is **not** a field here — it is carried by the persisted key and derived from the
 * app `userId` resolved from the authenticated `sub`; it is never accepted from or returned to
 * the client (Principle IV, FR-011).
 *
 * The Note is the **single source of truth** for every link: `linkedProjectIds` /
 * `linkedTaskIds` live only here — nothing is denormalized onto the Task or Project (research §2).
 */
export const noteMetadataSchema = z.object({
  id: z.string(),
  // Empty allowed — the list shows "Untitled" for empty (FR-008). Auto-save creates a note
  // before the user types a title.
  title: z.string().default(''),
  linkedProjectIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  // S3 object key `users/<userId>/notes/<id>.md` (FR-003). Server-set; derivable from `id`, but
  // persisted explicitly for clarity/robustness (data-model.md §1).
  bodyKey: z.string(),
});

/**
 * Full **Note** — metadata plus the Markdown `body` composed back in from S3. Returned by
 * `POST /notes`, `PATCH /notes/:id`, and the new `GET /notes/:id` (contracts/notes-api.md).
 * A missing body object resolves to `markdown: ''` (FR-012), so the field defaults to empty.
 */
export const noteSchema = noteMetadataSchema.extend({
  markdown: z.string().default(''),
});

/**
 * `POST /notes` request body — a note may be created **empty** (auto-save-first flow,
 * FR-002/FR-008). Both fields optional; the server assigns `id`, timestamps, `bodyKey`, and
 * defaults `title`/`markdown` to `''` and the link arrays to `[]`.
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
 * and owner-validated by the service. A patch carrying `markdown` writes the S3 body first
 * (FR-004); a metadata-only patch skips S3 (research §3).
 */
export const updateNoteSchema = z
  .object({
    title: z.string(),
    markdown: z.string(),
    linkedProjectIds: z.array(z.string()),
    linkedTaskIds: z.array(z.string()),
  })
  .partial();

export type NoteMetadata = z.infer<typeof noteMetadataSchema>;
export type Note = z.infer<typeof noteSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
