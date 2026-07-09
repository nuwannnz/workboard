import { z } from 'zod';

/**
 * Task — the product's core work item and Stage 3's first persisted feature data.
 * The shape is the single source of truth shared by the backend controller and the
 * frontend client so both validate identically (Principle V, data-model.md §Task).
 *
 * Ownership is **not** a field here — it is carried by the persisted key and derived
 * from the app `userId` resolved from the authenticated `sub`; it is never accepted from
 * or returned to the client (Principle IV, FR-014).
 */
export const taskStatusSchema = z.enum(['open', 'completed']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);

/** A date-only calendar day `YYYY-MM-DD` (no time-of-day, so tasks never jump columns
 * across timezones — research §5, FR-010). Validates both the format and a real date. */
export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    );
  }, 'dueDate must be a real calendar date');

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().nullable(),
  status: taskStatusSchema.default('open'),
  priority: taskPrioritySchema.default('medium'),
  labels: z.array(z.string()).default([]),
  order: z.string(),
  projectId: z.string().nullable(),
  linkedNoteIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `POST /tasks` request body (inline add). The server assigns `id`, `order` (appended to
 * the day or the project backlog), `status='open'`, timestamps, and defaults
 * `priority='medium'` (contracts). `title` must be non-empty after trimming (FR-004).
 *
 * Stage 4 widens this so the backlog is "just tasks": `dueDate` is **optional** (omitted →
 * backlog-only) and `projectId` is a new **optional** field binding the task to a project
 * (data-model.md Request-schema changes). A Week inline-add supplies `dueDate`; a backlog
 * inline-add supplies `projectId` and omits `dueDate`.
 */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  dueDate: dueDateSchema.optional(),
  projectId: z.string().optional(),
  description: z.string().optional(),
  priority: taskPrioritySchema.default('medium'),
  labels: z.array(z.string()).optional(),
});

/**
 * `PATCH /tasks/:id` request body. One partial-update surface serves edit, reschedule
 * (`dueDate`), move/reorder (`dueDate?`+`order`), and complete/reopen (`status`). Every
 * field is optional, but `title` if present must be non-empty (FR-004, Story 5.6).
 *
 * Stage 4 widens this so a scheduled task can return to backlog-only and a task can be
 * bound/unbound from a project: `dueDate` accepts a `YYYY-MM-DD` value **or `null`** (clear →
 * backlog, leaves the Week board — FR-013), and `projectId` accepts a string **or `null`**
 * (bind/unbind).
 */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string(),
    dueDate: dueDateSchema.nullable(),
    projectId: z.string().nullable(),
    priority: taskPrioritySchema,
    labels: z.array(z.string()),
    status: taskStatusSchema,
    order: z.string().min(1),
  })
  .partial();

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
