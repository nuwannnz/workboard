import { describe, it, expect } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ProfileRepository } from './profile.repository';

/**
 * Profile-repository ownership (FR-011, SC-003): the `PK` is derived solely from the
 * authenticated `sub`; the profile is created lazily at `PK=USER#<sub>, SK=PROFILE#<sub>`;
 * and a request can never resolve into another user's partition.
 */
interface StoredItem {
  PK: string;
  SK: string;
  email: string;
  createdAt: string;
}

function fakeDocClient(store = new Map<string, StoredItem>()) {
  const keyOf = (k: { PK: string; SK: string }) => `${k.PK}|${k.SK}`;
  const commands: { PK: string; SK: string }[] = [];
  const client = {
    commands,
    async send(command: unknown) {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { PK: string; SK: string };
        commands.push(key);
        return { Item: store.get(keyOf(key)) };
      }
      if (command instanceof PutCommand) {
        const item = command.input.Item as StoredItem;
        store.set(keyOf(item), item);
        return {};
      }
      throw new Error(`unexpected command ${(command as object).constructor.name}`);
    },
  };
  return { client, store, commands };
}

describe('ProfileRepository.getOrCreateProfile', () => {
  it('creates the profile at PK=USER#<sub>, SK=PROFILE#<sub> derived only from sub', async () => {
    const { client, store, commands } = fakeDocClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ProfileRepository(undefined, client as any);

    const profile = await repo.getOrCreateProfile('sub-A', 'a@example.com');

    expect(profile).toEqual({
      id: 'sub-A',
      email: 'a@example.com',
      createdAt: expect.any(String),
    });
    expect(store.get('USER#sub-A|PROFILE#sub-A')).toMatchObject({
      PK: 'USER#sub-A',
      SK: 'PROFILE#sub-A',
      email: 'a@example.com',
    });
    // Only ever addressed its own partition.
    expect(commands.every((k) => k.PK === 'USER#sub-A')).toBe(true);
  });

  it('returns the existing profile on subsequent access (get-or-create)', async () => {
    const { client } = fakeDocClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ProfileRepository(undefined, client as any);

    const first = await repo.getOrCreateProfile('sub-A', 'a@example.com');
    const second = await repo.getOrCreateProfile('sub-A', 'a@example.com');

    expect(second).toEqual(first);
  });

  it('never resolves into another user’s partition (cross-user is not-found → own item)', async () => {
    const { client, store } = fakeDocClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ProfileRepository(undefined, client as any);

    await repo.getOrCreateProfile('sub-A', 'a@example.com');
    // User B accesses with their own sub — cannot read A's item; gets/creates only their own.
    const bProfile = await repo.getOrCreateProfile('sub-B', 'b@example.com');

    expect(bProfile.id).toBe('sub-B');
    expect(bProfile.email).toBe('b@example.com');
    expect(store.get('USER#sub-B|PROFILE#sub-B')).toMatchObject({ email: 'b@example.com' });
    // A's item is untouched and never returned to B.
    expect(store.get('USER#sub-A|PROFILE#sub-A')?.email).toBe('a@example.com');
  });
});
