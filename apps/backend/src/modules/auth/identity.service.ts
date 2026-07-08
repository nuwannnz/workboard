import { UserRepository, type UserProfile } from './user.repository';

/**
 * Resolves the gateway-verified Cognito `sub` to the application `userId` at the request
 * boundary (research §12). Get-or-bootstraps via the User repository and caches the
 * **immutable** `sub → userId` mapping in an in-Lambda `Map`, so a warm container resolves
 * with zero DynamoDB reads and a cold container costs at most one lookup/bootstrap.
 *
 * The cache is process-scoped (module-level via the default instance) and only ever holds
 * a binding that already exists durably, so it can never serve a stale/incorrect id.
 */
export class IdentityService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly users: UserRepository = new UserRepository()) {}

  /** Resolve (and lazily bootstrap) the app `userId` for an authenticated subject. */
  async resolveUserId(sub: string, email: string): Promise<string> {
    const cached = this.cache.get(sub);
    if (cached) return cached;

    const user: UserProfile = await this.users.getOrCreateUser(sub, email);
    this.cache.set(sub, user.id);
    return user.id;
  }
}

/** Default process-scoped instance shared across warm invocations. */
export const identityService = new IdentityService();
