import { z } from 'zod';

/**
 * Project — a named, color-coded grouping of tasks owned by exactly one Account. Stage 4
 * replaces the Stage 1 stub with the full domain shape. The shape is the single source of
 * truth shared by the backend controller and the frontend client so both validate
 * identically (Principle V, data-model.md §Entity: Project).
 *
 * Ownership is **not** a field here — it is carried by the persisted key and derived from the
 * app `userId` resolved from the authenticated `sub`; it is never accepted from or returned to
 * the client (Principle IV, FR-016).
 */

/**
 * The closed project color palette (research §7, data-model.md §Color palette). A curated set
 * of tokens the frontend maps to concrete design-system classes for the card, detail header,
 * and Week badge. The list stays a closed enum validated identically on both sides.
 */
export const PROJECT_COLORS = [
  'slate',
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;

export const projectColorSchema = z.enum(PROJECT_COLORS);

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  color: projectColorSchema.default('slate'),
  order: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `POST /projects` request body. The server assigns `id` (ULID), `order` (appended after the
 * existing cards), `createdAt`/`updatedAt`, and defaults `color` when omitted. `name` must be
 * non-empty after trimming (FR-002).
 */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  color: projectColorSchema.default('slate'),
});

/**
 * `PATCH /projects/:id` request body. One partial-update surface serves edit (name /
 * description / color) and card reorder (`order`). Every field is optional, but `name` if
 * present must be non-empty (FR-002, Story 5.5).
 */
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string(),
    color: projectColorSchema,
    order: z.string().min(1),
  })
  .partial();

export type ProjectColor = z.infer<typeof projectColorSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
