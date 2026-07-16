import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { loadConfig } from '../../shared/config';

/**
 * Ownership-enforced store for note **bodies** — one S3 object per note, sibling to
 * `notes.repository.ts` and following the same ownership-by-key rule (Principle IV,
 * contracts/note-body-store.md). The object key is built **solely** from the resolved `userId`
 * and `noteId` (`users/<userId>/notes/<noteId>.md`), never from any client-supplied value, so a
 * foreign id can only ever address the caller's own prefix (FR-011). Only `NotesService` calls
 * this; the two-store ordering (body-first write, best-effort delete) lives there, not here.
 *
 * The store propagates S3 errors to the service, which applies the ordering / best-effort policy,
 * with the one exception of a missing object on read: `getBody` translates `NoSuchKey`/404 into an
 * empty string so a note with a missing/interrupted body still opens (FR-012).
 */
export class NoteBodyStore {
  private readonly client: S3Client;
  private readonly bucket?: string;

  constructor(client?: S3Client, bucket?: string) {
    const config = loadConfig();
    this.bucket = bucket ?? config.notesBucket;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
        ...(config.s3ForcePathStyle ? { forcePathStyle: true } : {}),
      });
  }

  /** Owner-scoped object key — the sole store of ownership on the body (mirrors PK/SK). */
  keyFor(userId: string, noteId: string): string {
    return `users/${userId}/notes/${noteId}.md`;
  }

  /** Write (overwrite) the note's Markdown body. Propagates any S3 error to the caller. */
  async putBody(userId: string, noteId: string, markdown: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(userId, noteId),
        Body: markdown,
        ContentType: 'text/markdown',
      }),
    );
  }

  /**
   * Read the note's Markdown body. A missing object (`NoSuchKey` / `NotFound` / HTTP 404) resolves
   * to an empty string rather than an error (FR-012); any other S3 error propagates.
   */
  async getBody(userId: string, noteId: string): Promise<string> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(userId, noteId) }),
      );
      return (await res.Body?.transformToString()) ?? '';
    } catch (err) {
      if (NoteBodyStore.isMissing(err)) return '';
      throw err;
    }
  }

  /** Delete the note's body object. The caller wraps this best-effort (FR-009). */
  async deleteBody(userId: string, noteId: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(userId, noteId) }),
    );
  }

  private static isMissing(err: unknown): boolean {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
  }
}
