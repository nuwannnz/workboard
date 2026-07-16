import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { NotesBucketStack } from './notes-bucket-stack';
import { AuthStack } from './auth-stack';
import { ApiStack } from './api-stack';

/**
 * The WorkBoard backend stack: DynamoDB, Cognito, and the single backend
 * Lambda + API Gateway — all as code (Principle V). The frontend is served by
 * Vercel (stage 006), so there is no web-hosting construct here. Stack outputs
 * surface the values the frontend build consumes via environment, never committed.
 */
export class WorkboardStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const data = new DataStack(this, 'Data');
    const notes = new NotesBucketStack(this, 'Notes');
    const auth = new AuthStack(this, 'Auth');
    const api = new ApiStack(this, 'Api', {
      table: data.table,
      userPool: auth.userPool,
      notesBucket: notes.bucket,
    });

    new CfnOutput(this, 'ApiBaseUrl', { value: api.restApi.url });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
    new CfnOutput(this, 'NotesBucketName', { value: notes.bucket.bucketName });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
    });
  }
}
