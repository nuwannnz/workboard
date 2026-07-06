import { z } from 'zod';

/**
 * User / Account — authenticated owner of all data, backed by Cognito.
 * `id` is the Cognito subject (`sub`). Shared shape only in Stage 1 (data-model.md).
 */
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

export type User = z.infer<typeof userSchema>;
