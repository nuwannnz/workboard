import { z } from 'zod';

/**
 * Note — markdown document. Shared shape only in Stage 1 (data-model.md).
 */
export const noteSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  markdown: z.string(),
  linkedProjectIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
});

export type Note = z.infer<typeof noteSchema>;
