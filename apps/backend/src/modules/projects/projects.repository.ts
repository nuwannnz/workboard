import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Project } from '@workboard/shared';
import { loadConfig } from '../../shared/config';

/** Persisted single-table Project item — the domain Project plus the owner-scoped key. */
interface ProjectItem extends Project {
  PK: string;
  SK: string;
}

/**
 * Ownership-enforced persistence for Projects (Principle IV, data-model.md §Entity: Project).
 * Every key is built **solely** from the resolved `userId` — never from caller input — so a
 * read or write can only reach the owner's partition (`PK=USER#<userId>`, `SK=PROJECT#<id>`)
 * and a foreign/missing id resolves as not-found with no disclosure (FR-016, SC-006). `PK`/`SK`
 * are never returned to callers.
 */
export class ProjectsRepository {
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
    return `PROJECT#${id}`;
  }

  private static toProject(item: Record<string, unknown>): Project {
    // Strip the owner-scoped key; never expose PK/SK.
    const { PK: _pk, SK: _sk, ...project } = item as unknown as ProjectItem;
    return project;
  }

  /** List the owner's projects — a single partition Query on the `PROJECT#` prefix. */
  async list(userId: string): Promise<Project[]> {
    const res = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :projectPrefix)',
        ExpressionAttributeValues: {
          ':pk': ProjectsRepository.pk(userId),
          ':projectPrefix': 'PROJECT#',
        },
      }),
    );
    return (res.Items ?? []).map(ProjectsRepository.toProject);
  }

  /** Persist a fully-formed project under the owner's partition. */
  async put(userId: string, project: Project): Promise<Project> {
    const item: ProjectItem = {
      PK: ProjectsRepository.pk(userId),
      SK: ProjectsRepository.sk(project.id),
      ...project,
    };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return project;
  }

  /** Fetch one project by id within the owner's partition, or `null` if not found. */
  async getById(userId: string, id: string): Promise<Project | null> {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: ProjectsRepository.pk(userId), SK: ProjectsRepository.sk(id) },
      }),
    );
    return res.Item ? ProjectsRepository.toProject(res.Item) : null;
  }

  /**
   * Apply a partial update in place, returning the full updated project — or `null` if the id
   * is not in the caller's partition (a missing own item or another user's item both yield
   * not-found via the `attribute_exists(PK)` guard).
   */
  async update(userId: string, id: string, patch: Partial<Project>): Promise<Project | null> {
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
          Key: { PK: ProjectsRepository.pk(userId), SK: ProjectsRepository.sk(id) },
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes ? ProjectsRepository.toProject(res.Attributes) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null;
      throw err;
    }
  }

  /** Delete a project; returns `true` if it existed in the caller's partition, else `false`. */
  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: ProjectsRepository.pk(userId), SK: ProjectsRepository.sk(id) },
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
