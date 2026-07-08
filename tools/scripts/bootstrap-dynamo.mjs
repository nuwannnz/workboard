// Creates the WorkBoard single table in DynamoDB Local for fully-local dev.
//
// DynamoDB Local runs with `-inMemory`, so the table must be (re)created on every start.
// The schema mirrors apps/infra/lib/data-stack.ts: PK/SK string keys, PAY_PER_REQUEST.
// Idempotent — a pre-existing table (ResourceInUseException) is treated as success.
//
// Usage (standalone): DYNAMODB_ENDPOINT=http://localhost:8000 node tools/scripts/bootstrap-dynamo.mjs
// Also imported by tools/scripts/dev-local.mjs.

import {
  DynamoDBClient,
  CreateTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';

/** @param {{ endpoint?: string, region?: string, tableName?: string }} [opts] */
export async function bootstrapDynamo(opts = {}) {
  const endpoint = opts.endpoint ?? process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
  const region = opts.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const tableName = opts.tableName ?? process.env.WORKBOARD_TABLE_NAME ?? 'WorkBoard';

  const client = new DynamoDBClient({
    endpoint,
    region,
    // DynamoDB Local ignores these but the SDK requires credentials to be present.
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
    return { tableName, created: true };
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      return { tableName, created: false };
    }
    throw err;
  } finally {
    client.destroy();
  }
}

// Allow running directly: `node tools/scripts/bootstrap-dynamo.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapDynamo()
    .then(({ tableName, created }) =>
      console.log(`DynamoDB Local: table "${tableName}" ${created ? 'created' : 'already exists'}.`),
    )
    .catch((err) => {
      console.error('Failed to bootstrap DynamoDB Local table:', err);
      process.exit(1);
    });
}
