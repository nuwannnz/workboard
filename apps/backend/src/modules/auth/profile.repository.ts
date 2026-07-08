import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../../shared/config';

/** The owned account-profile item (data-model.md §Account Profile). */
export interface AccountProfile {
  id: string;
  email: string;
  createdAt: string;
}

/** Persisted single-table shape for the profile item. */
interface ProfileItem {
  PK: string;
  SK: string;
  email: string;
  createdAt: string;
}

/**
 * Ownership-enforced access to the representative protected resource — the account
 * profile (Principle IV, FR-011). The `PK` is derived **solely** from the authenticated
 * `sub`; there is no caller-supplied owner and no cross-user/admin path, so a request can
 * only ever reach its own partition and cross-user access resolves as not-found (SC-003).
 */
export class ProfileRepository {
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

  private static pk(sub: string): string {
    return `USER#${sub}`;
  }

  private static sk(sub: string): string {
    return `PROFILE#${sub}`;
  }

  /**
   * Get-or-create the profile for the authenticated subject. The key is constructed
   * entirely from `sub` — never from caller input — so a read for one user can never
   * resolve into another user's partition.
   */
  async getOrCreateProfile(sub: string, email: string): Promise<AccountProfile> {
    const key = { PK: ProfileRepository.pk(sub), SK: ProfileRepository.sk(sub) };

    const existing = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: key }),
    );
    if (existing.Item) {
      const item = existing.Item as ProfileItem;
      return { id: sub, email: item.email, createdAt: item.createdAt };
    }

    const item: ProfileItem = { ...key, email, createdAt: new Date().toISOString() };
    await this.docClient.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return { id: sub, email: item.email, createdAt: item.createdAt };
  }
}
