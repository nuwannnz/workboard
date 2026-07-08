import { z } from 'zod';

/**
 * User — the application-level identity that owns all feature data (Tasks now; Projects
 * and Notes later). Stage 3 promotes the User to an **app-generated UUID (`id`)** that is
 * independent of the identity provider (data-model.md §User, research §11).
 *
 * `cognitoSub` is **server-only**: it is stored on the persisted User record and used
 * solely to resolve the caller to their `userId` (authentication). It is deliberately NOT
 * part of this client-visible shape and is never returned via `/me` or used as a foreign
 * key on feature data (user requirement, FR-014).
 */
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string(),
});

export type User = z.infer<typeof userSchema>;
