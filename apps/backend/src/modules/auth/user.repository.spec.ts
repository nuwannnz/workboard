import { describe, it, expect } from 'vitest';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { UserRepository } from './user.repository';

/**
 * User-identity repository (data-model.md §User, research §11): the `sub → userId`
 * bootstrap is idempotent (exactly one `userId` per `sub`, even under a concurrent race),
 * `resolveUserIdBySub` returns the bound id, and distinct subs get distinct ids. The `PK`
 * is derived only from server-controlled values, never caller input (FR-014).
 */
interface StoredItem {
  PK: string;
  SK: string;
  [k: string]: unknown;
}

class ConditionalCheckError extends Error {
  constructor() {
    super('TransactionCanceledException');
    this.name = 'TransactionCanceledException';
  }
}

/** In-memory doc client honoring GetItem + atomic TransactWrite (attribute_not_exists). */
function fakeDocClient() {
  const store = new Map<string, StoredItem>();
  const keyOf = (k: { PK: string; SK: string }) => `${k.PK}|${k.SK}`;
  const client = {
    async send(command: unknown) {
      // Yield so concurrent (Promise.all) callers can interleave realistically.
      await Promise.resolve();
      if (command instanceof GetCommand) {
        const key = command.input.Key as { PK: string; SK: string };
        return { Item: store.get(keyOf(key)) };
      }
      if (command instanceof TransactWriteCommand) {
        const items = command.input.TransactItems ?? [];
        // Validate every condition first — the transaction is all-or-nothing.
        for (const t of items) {
          const put = t.Put;
          if (!put) continue;
          if (
            put.ConditionExpression === 'attribute_not_exists(PK)' &&
            store.has(keyOf(put.Item as { PK: string; SK: string }))
          ) {
            throw new ConditionalCheckError();
          }
        }
        for (const t of items) {
          const put = t.Put;
          if (!put) continue;
          const item = put.Item as StoredItem;
          store.set(keyOf(item), item);
        }
        return {};
      }
      throw new Error(`unexpected command ${(command as object).constructor.name}`);
    },
  };
  return { client, store };
}

function makeRepo() {
  const { client, store } = fakeDocClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = new UserRepository(undefined, client as any);
  return { repo, store };
}

describe('UserRepository', () => {
  it('bootstraps a User + auth pointer keyed on the app userId', async () => {
    const { repo, store } = makeRepo();

    const user = await repo.getOrCreateUser('sub-A', 'a@example.com');

    expect(user.email).toBe('a@example.com');
    expect(user.cognitoSub).toBe('sub-A');
    expect(user.id).toMatch(/[0-9a-f-]{36}/);
    // Profile keyed on USER#<userId>, pointer on AUTH#<sub>.
    expect(store.get(`USER#${user.id}|PROFILE`)).toMatchObject({ email: 'a@example.com' });
    expect(store.get('AUTH#sub-A|AUTH#sub-A')).toMatchObject({ userId: user.id });
  });

  it('is idempotent — repeated calls bind exactly one userId to a sub', async () => {
    const { repo } = makeRepo();

    const first = await repo.getOrCreateUser('sub-A', 'a@example.com');
    const second = await repo.getOrCreateUser('sub-A', 'a@example.com');

    expect(second.id).toBe(first.id);
  });

  it('binds exactly one userId under a concurrent cold-start race', async () => {
    const { repo, store } = makeRepo();

    const [a, b] = await Promise.all([
      repo.getOrCreateUser('sub-A', 'a@example.com'),
      repo.getOrCreateUser('sub-A', 'a@example.com'),
    ]);

    expect(a.id).toBe(b.id);
    const pointers = [...store.keys()].filter((k) => k.startsWith('AUTH#sub-A'));
    expect(pointers).toHaveLength(1);
  });

  it('resolveUserIdBySub returns the bound id (and null before bootstrap)', async () => {
    const { repo } = makeRepo();
    expect(await repo.resolveUserIdBySub('sub-A')).toBeNull();

    const user = await repo.getOrCreateUser('sub-A', 'a@example.com');
    expect(await repo.resolveUserIdBySub('sub-A')).toBe(user.id);
  });

  it('gives distinct subs distinct userIds', async () => {
    const { repo } = makeRepo();

    const a = await repo.getOrCreateUser('sub-A', 'a@example.com');
    const b = await repo.getOrCreateUser('sub-B', 'b@example.com');

    expect(a.id).not.toBe(b.id);
  });
});
