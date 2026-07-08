import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Task } from '@workboard/shared';
import { loadConfig } from '../../shared/config';

/** Persisted single-table Task item — the domain Task plus the owner-scoped key. */
interface TaskItem extends Task {
  PK: string;
  SK: string;
}

/**
 * Ownership-enforced persistence for Tasks (Principle IV, data-model.md §Task). Every key
 * is built **solely** from the resolved `userId` — never from caller input — so a read or
 * write can only reach the owner's partition (`PK=USER#<userId>`, `SK=TASK#<id>`) and a
 * foreign/missing id resolves as not-found with no disclosure (FR-014, SC-006). `PK`/`SK`
 * are never returned to callers.
 */
export class TasksRepository {
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
    return `TASK#${id}`;
  }

  private static toTask(item: Record<string, unknown>): Task {
    // Strip the owner-scoped key; never expose PK/SK.
    const { PK: _pk, SK: _sk, ...task } = item as unknown as TaskItem;
    return task;
  }

  /** List the owner's tasks with `dueDate` in `[from, to]` — a single partition Query. */
  async queryWindow(userId: string, from: string, to: string): Promise<Task[]> {
    const res = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :taskPrefix)',
        FilterExpression: '#dueDate BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#dueDate': 'dueDate' },
        ExpressionAttributeValues: {
          ':pk': TasksRepository.pk(userId),
          ':taskPrefix': 'TASK#',
          ':from': from,
          ':to': to,
        },
      }),
    );
    return (res.Items ?? []).map(TasksRepository.toTask);
  }

  /** Persist a fully-formed task under the owner's partition. */
  async put(userId: string, task: Task): Promise<Task> {
    const item: TaskItem = {
      PK: TasksRepository.pk(userId),
      SK: TasksRepository.sk(task.id),
      ...task,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return task;
  }

  /** Fetch one task by id within the owner's partition, or `null` if not found. */
  async getById(userId: string, id: string): Promise<Task | null> {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: TasksRepository.pk(userId), SK: TasksRepository.sk(id) },
      }),
    );
    return res.Item ? TasksRepository.toTask(res.Item) : null;
  }

  /**
   * Apply a partial update in place, returning the full updated task — or `null` if the id
   * is not in the caller's partition (a missing own item or another user's item both yield
   * not-found via the `attribute_exists(PK)` guard).
   */
  async update(userId: string, id: string, patch: Partial<Task>): Promise<Task | null> {
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
          Key: { PK: TasksRepository.pk(userId), SK: TasksRepository.sk(id) },
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes ? TasksRepository.toTask(res.Attributes) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null;
      throw err;
    }
  }

  /** Delete a task; returns `true` if it existed in the caller's partition, else `false`. */
  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: TasksRepository.pk(userId), SK: TasksRepository.sk(id) },
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
