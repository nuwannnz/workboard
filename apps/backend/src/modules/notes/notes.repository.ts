import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NoteMetadata } from '@workboard/shared';
import { loadConfig } from '../../shared/config';

/** Persisted single-table Note metadata item — the domain metadata plus the owner-scoped key. */
interface NoteItem extends NoteMetadata {
  PK: string;
  SK: string;
}

/**
 * Ownership-enforced persistence for Note **metadata** (Principle IV, data-model.md §1). Every
 * key is built **solely** from the resolved `userId` — never from caller input — so a read or
 * write can only reach the owner's partition (`PK=USER#<userId>`, `SK=NOTE#<id>`) and a
 * foreign/missing id resolves as not-found with no disclosure (FR-011, SC-007). `PK`/`SK` are
 * never returned to callers. Stage 7 drops the inline `markdown` attribute — the body now lives
 * in S3 (see `note-body.repository.ts`) and only its `bodyKey` pointer is stored here, so every
 * Query transfers strictly less data (FR-007). The metadata is the sole store of its links
 * (research §2); the reverse "notes linked to project/task X" read is the same owner-partition
 * Query plus a `contains` filter — no GSI.
 */
export class NotesRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client?: DynamoDBClient, docClient?: DynamoDBDocumentClient) {
    const config = loadConfig();
    this.tableName = config.tableName;
    if (docClient) {
      this.docClient = docClient;
    } else {
      const ddb =
        client ??
        new DynamoDBClient({
          region: config.region,
          ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
        });
      this.docClient = DynamoDBDocumentClient.from(ddb, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
  }

  private static pk(userId: string): string {
    return `USER#${userId}`;
  }

  private static sk(id: string): string {
    return `NOTE#${id}`;
  }

  private static toNote(item: Record<string, unknown>): NoteMetadata {
    // Strip the owner-scoped key; never expose PK/SK.
    const { PK: _pk, SK: _sk, ...note } = item as unknown as NoteItem;
    return note;
  }

  /** List the owner's notes — a single partition Query on the `NOTE#` prefix. */
  async list(userId: string): Promise<NoteMetadata[]> {
    const res = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notePrefix)',
        ExpressionAttributeValues: {
          ':pk': NotesRepository.pk(userId),
          ':notePrefix': 'NOTE#',
        },
      }),
    );
    return (res.Items ?? []).map(NotesRepository.toNote);
  }

  /**
   * Reverse lookup: the owner's notes whose `linkedProjectIds` **or** `linkedTaskIds` contains
   * the given id — the same owner-partition Query plus a `contains` FilterExpression, no GSI
   * (research §2, FR-011). Exactly one of `projectId`/`taskId` is supplied.
   */
  async listByLinked(
    userId: string,
    ref: { projectId: string } | { taskId: string },
  ): Promise<NoteMetadata[]> {
    const attr = 'projectId' in ref ? 'linkedProjectIds' : 'linkedTaskIds';
    const id = 'projectId' in ref ? ref.projectId : ref.taskId;
    const res = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notePrefix)',
        FilterExpression: `contains(#linked, :id)`,
        ExpressionAttributeNames: { '#linked': attr },
        ExpressionAttributeValues: {
          ':pk': NotesRepository.pk(userId),
          ':notePrefix': 'NOTE#',
          ':id': id,
        },
      }),
    );
    return (res.Items ?? []).map(NotesRepository.toNote);
  }

  /** Persist a note's metadata under the owner's partition (body lives in S3). */
  async put(userId: string, note: NoteMetadata): Promise<NoteMetadata> {
    const item: NoteItem = {
      PK: NotesRepository.pk(userId),
      SK: NotesRepository.sk(note.id),
      ...note,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return note;
  }

  /** Fetch one note's metadata by id within the owner's partition, or `null` if not found. */
  async getById(userId: string, id: string): Promise<NoteMetadata | null> {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: NotesRepository.pk(userId), SK: NotesRepository.sk(id) },
      }),
    );
    return res.Item ? NotesRepository.toNote(res.Item) : null;
  }

  /**
   * Apply a partial update in place, returning the full updated note — or `null` if the id is
   * not in the caller's partition (a missing own item or another user's item both yield
   * not-found via the `attribute_exists(PK)` guard).
   */
  async update(userId: string, id: string, patch: Partial<NoteMetadata>): Promise<NoteMetadata | null> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];
    for (const [key, value] of entries) {
      names[`#${key}`] = key;
      values[`:${key}`] = value;
      sets.push(`#${key} = :${key}`);
    }

    try {
      const res = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: NotesRepository.pk(userId), SK: NotesRepository.sk(id) },
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes ? NotesRepository.toNote(res.Attributes) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null;
      throw err;
    }
  }

  /** Delete a note; returns `true` if it existed in the caller's partition, else `false`. */
  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: NotesRepository.pk(userId), SK: NotesRepository.sk(id) },
          ConditionExpression: 'attribute_exists(PK)',
        }),
      );
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }
}
