import { describe, it, expect } from 'vitest';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { NoteBodyStore } from './note-body.repository';

/**
 * Note body store ownership + missing-object behaviour (FR-011/FR-012, contracts/note-body-store.md).
 * Uses an in-memory fake S3 client — a `Map<key, { body, contentType }>` with `send()` dispatch on
 * Put/Get/DeleteObjectCommand — mirroring the fake DynamoDB doc-client in notes.repository.spec.ts.
 * The key is built solely from `userId` + `noteId`, so a foreign id can only ever address the
 * caller's own prefix.
 */
interface StoredObject {
  body: string;
  contentType?: string;
}

function fakeS3Client() {
  const store = new Map<string, StoredObject>();
  const client = {
    async send(command: unknown) {
      if (command instanceof PutObjectCommand) {
        const { Key, Body, ContentType } = command.input;
        store.set(Key as string, { body: String(Body), contentType: ContentType });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const obj = store.get(command.input.Key as string);
        if (!obj) {
          const err = new Error('The specified key does not exist.');
          err.name = 'NoSuchKey';
          throw err;
        }
        // Mirror the SDK v3 streaming Body → `transformToString()`.
        return { Body: { transformToString: async () => obj.body }, ContentType: obj.contentType };
      }
      if (command instanceof DeleteObjectCommand) {
        store.delete(command.input.Key as string);
        return {};
      }
      throw new Error(`unexpected command ${(command as object).constructor.name}`);
    },
  };
  return { client, store };
}

function makeStore() {
  const { client, store } = fakeS3Client();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyStore = new NoteBodyStore(client as any, 'test-notes-bucket');
  return { bodyStore, store };
}

describe('NoteBodyStore.keyFor', () => {
  it('builds users/<userId>/notes/<noteId>.md solely from userId + noteId (FR-003/FR-011)', () => {
    const { bodyStore } = makeStore();
    expect(bodyStore.keyFor('user-A', 'n1')).toBe('users/user-A/notes/n1.md');
  });
});

describe('NoteBodyStore put/get round-trip', () => {
  it('putBody then getBody returns the exact content', async () => {
    const { bodyStore, store } = makeStore();
    await bodyStore.putBody('user-A', 'n1', '# Hello');

    // Stored under the owner-scoped key with the Markdown content type.
    expect(store.get('users/user-A/notes/n1.md')).toEqual({
      body: '# Hello',
      contentType: 'text/markdown',
    });
    expect(await bodyStore.getBody('user-A', 'n1')).toBe('# Hello');
  });

  it('round-trips a large body beyond the DynamoDB 400 KB item limit (FR-013)', async () => {
    const { bodyStore } = makeStore();
    const big = 'x'.repeat(500 * 1024);
    await bodyStore.putBody('user-A', 'big', big);
    expect(await bodyStore.getBody('user-A', 'big')).toBe(big);
  });

  it('an empty body round-trips as empty', async () => {
    const { bodyStore } = makeStore();
    await bodyStore.putBody('user-A', 'n1', '');
    expect(await bodyStore.getBody('user-A', 'n1')).toBe('');
  });
});

describe('NoteBodyStore.getBody — missing object degrades to empty (FR-012)', () => {
  it('returns "" when the object does not exist (NoSuchKey)', async () => {
    const { bodyStore } = makeStore();
    expect(await bodyStore.getBody('user-A', 'never-written')).toBe('');
  });

  it("a foreign id addresses only the caller's own prefix — not-found ⇒ empty (FR-011)", async () => {
    const { bodyStore } = makeStore();
    await bodyStore.putBody('user-A', 'n1', 'A secret');
    // user-B asking for the same note id reads users/user-B/... — a different, empty key.
    expect(await bodyStore.getBody('user-B', 'n1')).toBe('');
  });
});

describe('NoteBodyStore.deleteBody', () => {
  it('removes the object; a subsequent read degrades to empty', async () => {
    const { bodyStore, store } = makeStore();
    await bodyStore.putBody('user-A', 'n1', 'bye');
    await bodyStore.deleteBody('user-A', 'n1');
    expect(store.has('users/user-A/notes/n1.md')).toBe(false);
    expect(await bodyStore.getBody('user-A', 'n1')).toBe('');
  });
});
