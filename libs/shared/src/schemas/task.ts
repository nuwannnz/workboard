import { z } from 'zod';

/**
 * Task — core work item. Stage 1 ships the shared shape only; runtime behavior
 * (CRUD, reopen flow) is deferred to later stages (FR-018, data-model.md).
 */
export const taskStatusSchema = z.enum(['open', 'completed']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  labels: z.array(z.string()).default([]),
  projectId: z.string().nullable(),
  linkedNoteIds: z.array(z.string()).default([]),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type Task = z.infer<typeof taskSchema>;
