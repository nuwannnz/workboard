import { z } from 'zod';

/**
 * Project — grouping of tasks. Shared shape only in Stage 1 (data-model.md).
 */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string(),
});

export type Project = z.infer<typeof projectSchema>;
