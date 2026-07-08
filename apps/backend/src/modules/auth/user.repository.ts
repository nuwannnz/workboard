import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from '../../shared/config';

/**
 * The app-level User profile (data-model.md §User). `id` is an app-generated UUID that is
 * the canonical owner key for all feature data; `cognitoSub` is stored but server-only.
 */
export interface UserProfile {
  id: string;
  cognitoSub: string;
  email: string;
  createdAt: string;
}

interface ProfileItem {
  PK: string;
  SK: string;
  id: string;
  cognitoSub: string;
  email: string;
  createdAt: string;
}

interface PointerItem {
  PK: string;
  SK: string;
  userId: string;
  createdAt: string;
}

/** A DynamoDB transaction cancelled by a failed condition (the concurrent-bootstrap race). */
function isTransactionCancelled(err: unknown): boolean {
  return (err as { name?: string }).name === 'TransactionCanceledException';
}

/**
 * Ownership + identity persistence (Principle IV, research §11). Holds two single-table
 * items per account: the **User profile** (`PK=USER#<userId>`, `SK=PROFILE`) and the
 * **auth pointer** (`PK=AUTH#<sub>`, `SK=AUTH#<sub>`) that resolves `sub → userId` in one
 * strongly-consistent `GetItem`. Refactors the Stage 2 sub-keyed profile so feature data
 * keys off the provider-independent app `userId`, never the Cognito `sub` (FR-014).
 */
export class UserRepository {
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
      this.docClient = DynamoDBDocumentClient.from(ddb);
    }
  }

  private static profileKey(userId: string) {
    return { PK: `USER#${userId}`, SK: 'PROFILE' };
  }

  private static pointerKey(sub: string) {
    return { PK: `AUTH#${sub}`, SK: `AUTH#${sub}` };
  }

  /**
   * Resolve the app `userId` bound to a Cognito `sub` via the auth pointer, or `null` if
   * the user has never been bootstrapped. Strongly consistent so a just-written pointer is
   * always visible to the resolving request.
   */
  async resolveUserIdBySub(sub: string): Promise<string | null> {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: UserRepository.pointerKey(sub),
        ConsistentRead: true,
      }),
    );
    return res.Item ? (res.Item as PointerItem).userId : null;
  }

  private async getProfileById(userId: string): Promise<UserProfile | null> {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: UserRepository.profileKey(userId),
        ConsistentRead: true,
      }),
    );
    if (!res.Item) return null;
    const item = res.Item as ProfileItem;
    return {
      id: item.id,
      cognitoSub: item.cognitoSub,
      email: item.email,
      createdAt: item.createdAt,
    };
  }

  /**
   * Get-or-bootstrap the User for an authenticated `sub`. If a pointer already exists the
   * bound profile is returned. Otherwise a new `userId` is generated and the profile +
   * pointer are written in a single `TransactWriteCommand`, each guarded by
   * `attribute_not_exists(PK)` so exactly one `userId` binds to a `sub` even under a
   * cold-start race — the loser re-reads the winner's pointer (research §11).
   */
  async getOrCreateUser(sub: string, email: string): Promise<UserProfile> {
    const existingId = await this.resolveUserIdBySub(sub);
    if (existingId) {
      const profile = await this.getProfileById(existingId);
      if (profile) return profile;
    }

    const userId = uuidv4();
    const createdAt = new Date().toISOString();
    const profileItem: ProfileItem = {
      ...UserRepository.profileKey(userId),
      id: userId,
      cognitoSub: sub,
      email,
      createdAt,
    };
    const pointerItem: PointerItem = {
      ...UserRepository.pointerKey(sub),
      userId,
      createdAt,
    };

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: profileItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: pointerItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return { id: userId, cognitoSub: sub, email, createdAt };
    } catch (err) {
      if (isTransactionCancelled(err)) {
        // A concurrent request won the bootstrap — adopt its binding.
        const racedId = await this.resolveUserIdBySub(sub);
        if (racedId) {
          const raced = await this.getProfileById(racedId);
          if (raced) return raced;
        }
      }
      throw err;
    }
  }
}
