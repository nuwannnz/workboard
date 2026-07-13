import { describe, it, expect } from 'vitest';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Project } from '@workboard/shared';
import { ProjectsRepository } from './projects.repository';

/**
 * Ownership enforcement (FR-016, SC-006): every key is built solely from the resolved
 * `userId`, so a read/write can only reach the owner's partition and a foreign/missing id
 * resolves as not-found — with no disclosure. `PK`/`SK` are never returned. Uses the fake
 * DynamoDB doc-client pattern from the Stage 3 tasks.repository.spec.ts.
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
        const values = command.input.ExpressionAttributeValues as Record<string, string>;
        const items = [...store.values()].filter(
          (it) => it.PK === values[':pk'] && it.SK.startsWith(values[':projectPrefix']),
        );
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
  const repo = new ProjectsRepository(undefined, client as any);
  return { repo, store };
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'A project',
    color: 'slate',
    order: 'V',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProjectsRepository ownership', () => {
  it('builds PK/SK solely from userId and never returns them on read', async () => {
    const { repo, store } = makeRepo();
    await repo.put('user-A', sampleProject());
    // The persisted key is derived only from the passed userId.
    expect([...store.keys()]).toEqual(['USER#user-A|PROJECT#p1']);

    const got = await repo.getById('user-A', 'p1');
    expect(got).not.toBeNull();
    expect(got).not.toHaveProperty('PK');
    expect(got).not.toHaveProperty('SK');
    expect(got?.name).toBe('A project');
  });

  it('list only returns the owner’s PROJECT# items', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleProject({ id: 'a1', name: "A's project" }));
    await repo.put('user-B', sampleProject({ id: 'b1', name: "B's project" }));

    const aProjects = await repo.list('user-A');
    expect(aProjects.map((p) => p.id)).toEqual(['a1']);

    // B's id is not-found in A's partition (no disclosure).
    expect(await repo.getById('user-A', 'b1')).toBeNull();
  });

  it('update/delete of a foreign or missing id resolve as not-found', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleProject({ id: 'a1' }));

    expect(await repo.update('user-B', 'a1', { name: 'hacked' })).toBeNull();
    expect(await repo.delete('user-B', 'a1')).toBe(false);
    expect((await repo.getById('user-A', 'a1'))?.name).toBe('A project');

    expect(await repo.update('user-A', 'nope', { name: 'x' })).toBeNull();
    expect(await repo.delete('user-A', 'nope')).toBe(false);
  });

  it('update applies a patch in place and returns the full project without keys', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleProject({ id: 'a1' }));
    const updated = await repo.update('user-A', 'a1', { name: 'Renamed', color: 'blue' });
    expect(updated).toMatchObject({ id: 'a1', name: 'Renamed', color: 'blue' });
    expect(updated).not.toHaveProperty('PK');
  });
});
