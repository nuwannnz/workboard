import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../shared/config';

/**
 * DynamoDB data-access abstraction (Principle IV, FR-011). All persistence
 * access flows through the Repository layer — services never touch the SDK
 * directly. Stage 1 exposes only a lightweight connectivity probe used by the
 * health check; feature repositories are added in later stages.
 */
export class HealthRepository {
  private readonly client: DynamoDBClient;
  /** Document client is created here so later feature repositories reuse it. */
  readonly docClient: DynamoDBDocumentClient;

  constructor(client?: DynamoDBClient) {
    const config = loadConfig();
    this.client =
      client ??
      new DynamoDBClient({
        region: config.region,
        ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
      });
    this.docClient = DynamoDBDocumentClient.from(this.client);
  }

  /**
   * Probes persistence connectivity. Returns true when DynamoDB is reachable,
   * false when it cannot be reached (drives the 503 unhealthy response).
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.client.send(new ListTablesCommand({ Limit: 1 }));
      return true;
    } catch {
      return false;
    }
  }
}
