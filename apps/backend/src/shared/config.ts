/**
 * Runtime configuration sourced from environment variables (FR-017).
 * Nothing sensitive is committed; values come from the environment / CDK outputs.
 */
export interface AppConfig {
  region: string;
  tableName: string;
  /** Optional endpoint override for DynamoDB Local in development. */
  dynamoEndpoint?: string;
  port: number;
}

export function loadConfig(): AppConfig {
  return {
    region: process.env.AWS_REGION ?? 'us-east-1',
    tableName: process.env.WORKBOARD_TABLE_NAME ?? 'WorkBoard',
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    port: Number(process.env.PORT ?? 3000),
  };
}
