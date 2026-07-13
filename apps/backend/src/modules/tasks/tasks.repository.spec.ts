import { describe, it, expect } from 'vitest';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Task } from '@workboard/shared';
import { TasksRepository } from './tasks.repository';

/**
 * Ownership enforcement (FR-014, SC-006): every key is built solely from the resolved
 * `userId`, so a read/write can only reach the owner's partition and a foreign/missing id
 * resolves as not-found — with no disclosure. `PK`/`SK` are never returned.
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
        const inPartition = [...store.values()].filter(
          (it) => it.PK === values[':pk'] && it.SK.startsWith(values[':taskPrefix']),
        );
        // Project-scoped read (queryByProject) vs. the week-window read (queryWindow).
        const items =
          ':projectId' in values
            ? inPartition.filter((it) => (it.projectId as string | null) === values[':projectId'])
            : inPartition.filter(
                (it) =>
                  (it.dueDate as string) >= values[':from'] &&
                  (it.dueDate as string) <= values[':to'],
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
  const repo = new TasksRepository(undefined, client as any);
  return { repo, store };
}

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'A task',
    dueDate: '2026-07-08',
    status: 'open',
    priority: 'medium',
    labels: [],
    order: 'V',
    projectId: null,
    linkedNoteIds: [],
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('TasksRepository ownership', () => {
  it('never returns PK/SK on read', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask());
    const got = await repo.getById('user-A', 't1');
    expect(got).not.toBeNull();
    expect(got).not.toHaveProperty('PK');
    expect(got).not.toHaveProperty('SK');
    expect(got?.title).toBe('A task');
  });

  it('queryWindow / getById never cross into another user’s partition', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask({ id: 'a1', title: "A's task" }));
    await repo.put('user-B', sampleTask({ id: 'b1', title: "B's task" }));

    const aWindow = await repo.queryWindow('user-A', '2026-07-06', '2026-07-12');
    expect(aWindow.map((t) => t.id)).toEqual(['a1']);

    // B's id is not-found in A's partition (no disclosure).
    expect(await repo.getById('user-A', 'b1')).toBeNull();
  });

  it('queryWindow filters to the [from,to] date window', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask({ id: 'in', dueDate: '2026-07-08' }));
    await repo.put('user-A', sampleTask({ id: 'out', dueDate: '2026-07-20' }));

    const window = await repo.queryWindow('user-A', '2026-07-06', '2026-07-12');
    expect(window.map((t) => t.id)).toEqual(['in']);
  });

  it('update/delete of a foreign or missing id resolve as not-found', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask({ id: 'a1' }));

    // Another user cannot update or delete A's task.
    expect(await repo.update('user-B', 'a1', { title: 'hacked' })).toBeNull();
    expect(await repo.delete('user-B', 'a1')).toBe(false);
    // A's task is untouched.
    expect((await repo.getById('user-A', 'a1'))?.title).toBe('A task');

    // Missing id → not-found.
    expect(await repo.update('user-A', 'nope', { title: 'x' })).toBeNull();
    expect(await repo.delete('user-A', 'nope')).toBe(false);
  });

  it('update applies a patch in place and returns the full task without keys', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask({ id: 'a1' }));
    const updated = await repo.update('user-A', 'a1', { dueDate: '2026-07-10', order: 'Vz' });
    expect(updated).toMatchObject({ id: 'a1', dueDate: '2026-07-10', order: 'Vz' });
    expect(updated).not.toHaveProperty('PK');
  });
});

describe('TasksRepository.queryByProject (Stage 4)', () => {
  it('returns all owner tasks with the projectId (backlog + scheduled), scoped to the user', async () => {
    const { repo } = makeRepo();
    // Backlog task (no dueDate) in project p1.
    await repo.put('user-A', sampleTask({ id: 'a-backlog', dueDate: null, projectId: 'p1' }));
    // Scheduled task in project p1.
    await repo.put('user-A', sampleTask({ id: 'a-sched', dueDate: '2026-07-08', projectId: 'p1' }));
    // A standalone task (no project) and a task in another project.
    await repo.put('user-A', sampleTask({ id: 'a-standalone', projectId: null }));
    await repo.put('user-A', sampleTask({ id: 'a-other', projectId: 'p2' }));
    // Another user's task in p1 must never appear.
    await repo.put('user-B', sampleTask({ id: 'b-p1', projectId: 'p1' }));

    const p1 = await repo.queryByProject('user-A', 'p1');
    expect(p1.map((t) => t.id).sort()).toEqual(['a-backlog', 'a-sched']);
  });

  it('a foreign user reading a projectId gets none of the owner’s tasks (no disclosure)', async () => {
    const { repo } = makeRepo();
    await repo.put('user-A', sampleTask({ id: 'a1', projectId: 'p1' }));
    expect(await repo.queryByProject('user-B', 'p1')).toEqual([]);
  });
});
