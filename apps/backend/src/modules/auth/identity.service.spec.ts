import { describe, it, expect } from 'vitest';
import { IdentityService } from './identity.service';
import type { UserRepository, UserProfile } from './user.repository';

/**
 * Identity resolution + in-Lambda cache (research §12): the first resolve bootstraps via the
 * repository, a second resolve for the same `sub` is served from cache with no further
 * repository call, and distinct subs resolve to distinct ids.
 */
function fakeUsers() {
  const bound = new Map<string, string>();
  let calls = 0;
  const repo = {
    async getOrCreateUser(sub: string, email: string): Promise<UserProfile> {
      calls++;
      let id = bound.get(sub);
      if (!id) {
        id = `uuid-for-${sub}`;
        bound.set(sub, id);
      }
      return { id, cognitoSub: sub, email, createdAt: '2026-07-08T00:00:00.000Z' };
    },
    async resolveUserIdBySub(sub: string) {
      return bound.get(sub) ?? null;
    },
  } as unknown as UserRepository;
  return { repo, getCalls: () => calls };
}

describe('IdentityService.resolveUserId', () => {
  it('bootstraps on first resolve and serves subsequent resolves from cache', async () => {
    const { repo, getCalls } = fakeUsers();
    const service = new IdentityService(repo);

    const first = await service.resolveUserId('sub-A', 'a@example.com');
    expect(first).toBe('uuid-for-sub-A');
    expect(getCalls()).toBe(1);

    const second = await service.resolveUserId('sub-A', 'a@example.com');
    expect(second).toBe(first);
    // Cache hit — no additional repository call.
    expect(getCalls()).toBe(1);
  });

  it('resolves distinct subs to distinct ids', async () => {
    const { repo } = fakeUsers();
    const service = new IdentityService(repo);

    const a = await service.resolveUserId('sub-A', 'a@example.com');
    const b = await service.resolveUserId('sub-B', 'b@example.com');

    expect(a).not.toBe(b);
  });
});
