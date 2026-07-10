import { describe, it, expect } from 'vitest';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Note } from '@workboard/shared';
import { NotesRepository } from './notes.repository';

/**
 * Ownership enforcement (FR-018, SC-007): every key is built solely from the resolved `userId`,
 * so a read/write can only reach the owner's partition and a foreign/missing id resolves as
 * not-found — with no disclosure. `PK`/`SK` are never returned. Uses the fake DynamoDB
 * doc-client pattern from projects.repository.spec.ts, extended to model the `contains`
 * FilterExpression for the reverse linked-notes Query (research §2).
 */
interface StoredItem {
  PK: string;
  SK: string;
  [k: string]: unknown;
}

function fakeDocClient() {
  const store = new Map<string, StoredItem>();
  const keyOf = (k: { PK: string; SK: string }) => `${k.PK}|${k.SK}`;
  const client = {
    async send(command: unknown) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as StoredItem;
        store.set(keyOf(item), item);
        return {};
      }
      if (command instanceof GetCommand) {
        const key = command.input.Key as { PK: string; SK: string };
        return { Item: store.get(keyOf(key)) };
      }
      if (command instanceof QueryCommand) {
        const values = command.input.ExpressionAttributeValues as Record<string, unknown>;
        const names = (command.input.ExpressionAttributeNames ?? {}) as Record<string, string>;
        let items = [...store.values()].filter(
          (it) => it.PK === values[':pk'] && it.SK.startsWith(values[':notePrefix'] as string),
        );
        // Model `contains(#linked, :id)` for the reverse linked-notes lookup.
        if (command.input.FilterExpression?.includes('contains')) {
          const attr = names['#linked'];
          const id = values[':id'];
          items = items.filter((it) => (it[attr] as string[] | undefined)?.includes(id as string));
        }
        return { Items: items };
      }
      if (command instanceof UpdateCommand) {
        const key = command.input.Key as { PK: string; SK: string };
        const existing = store.get(keyOf(key));
        if (!existing) {
          const err = new Error('conditional check failed');
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
        const names = command.input.ExpressionAttributeNames as Record<string, string>;
        const vals = command.input.ExpressionAttributeValues as Record<string, unknown>;
        const updated = { ...existing };
        for (const [placeholder, attr] of Object.entries(names)) {
          updated[attr] = vals[placeholder.replace('#', ':')];
        }
        store.set(keyOf(key), updated);
        return { Attributes: updated };
      }
      if (command instanceof DeleteCommand) {
        const key = command.input.Key as { PK: string; SK: string };
        if (!store.has(keyOf(key))) {
          const err = new Error('conditional check failed');
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
        store.delete(keyOf(key));
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
  const repo = new NotesRepository(undefined, client as any);
  return { repo, store };
}

function sampleNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'A note',
    markdown: '',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('NotesRepository ownership', () => {
  it('builds PK/SK solely from userId and never returns them on read', async () => {
    const { repo, store } = makeRepo();
    await repo.put('user-A', sampleNote());
    expect([...store.keys()]).toEqual(['USER#user-A|NOTE#n1']);

    const got = await repo.getById('user-A', 'n1');
    expect(got).not.toBeNull();
    expect(got).not.toHaveProperty('PK');
    expect(got).not.toHaveProperty('SK');
    expect(got?.title).toBe('A note');
  });

  it('list only returns the owner’s NOTE# items', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'a1', title: "A's note" }));
    await repo.put('user-B', sampleNote({ id: 'b1', title: "B's note" }));

    const aNotes = await repo.list('user-A');
    expect(aNotes.map((n) => n.id)).toEqual(['a1']);

    // B's id is not-found in A's partition (no disclosure).
    expect(await repo.getById('user-A', 'b1')).toBeNull();
  });

  it('a read for a foreign id resolves as not-found — no disclosure', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'a1' }));
    expect(await repo.getById('user-B', 'a1')).toBeNull();
  });
});

describe('NotesRepository.listByLinked — reverse lookup (US4, research §2)', () => {
  it('returns only the owner’s notes whose linkedProjectIds contains the id', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'n1', linkedProjectIds: ['p1', 'p2'] }));
    await repo.put('user-A', sampleNote({ id: 'n2', linkedProjectIds: ['p2'] }));
    await repo.put('user-A', sampleNote({ id: 'n3', linkedProjectIds: [] }));
    await repo.put('user-B', sampleNote({ id: 'nb', linkedProjectIds: ['p1'] }));

    const linked = await repo.listByLinked('user-A', { projectId: 'p1' });
    expect(linked.map((n) => n.id)).toEqual(['n1']); // n2/n3 don't match, B is another partition
  });

  it('returns only the owner’s notes whose linkedTaskIds contains the id', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'n1', linkedTaskIds: ['t1'] }));
    await repo.put('user-A', sampleNote({ id: 'n2', linkedTaskIds: ['t9'] }));

    const linked = await repo.listByLinked('user-A', { taskId: 't1' });
    expect(linked.map((n) => n.id)).toEqual(['n1']);
  });

  it('a foreign linked id simply matches nothing (no disclosure)', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'n1', linkedProjectIds: ['p1'] }));
    expect(await repo.listByLinked('user-B', { projectId: 'p1' })).toEqual([]);
  });
});

describe('NotesRepository.delete (US5)', () => {
  it('deletes the owner’s note and is idempotent under retry', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'n1' }));
    expect(await repo.delete('user-A', 'n1')).toBe(true);
    expect(await repo.getById('user-A', 'n1')).toBeNull();
    // A second delete of the now-gone id is not-found (idempotent, FR-017).
    expect(await repo.delete('user-A', 'n1')).toBe(false);
  });

  it('a foreign/missing id returns false (no disclosure)', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleNote({ id: 'n1' }));
    expect(await repo.delete('user-B', 'n1')).toBe(false);
    // A's note is untouched.
    expect((await repo.getById('user-A', 'n1'))?.id).toBe('n1');
  });
});
