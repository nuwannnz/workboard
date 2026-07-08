import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';
import { AuthStack } from './auth-stack';
import { ApiStack } from './api-stack';
import { WebStack } from './web-stack';

/**
 * The full Stage 1 skeleton stack: DynamoDB, Cognito, the single backend
 * Lambda + API Gateway, and S3 + CloudFront hosting — all as code (Principle V,
 * FR-009/FR-010). Stack outputs (T037) surface the values later stages consume
 * via environment, never committed.
 */
export class WorkboardStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const data = new DataStack(this, 'Data');
    const auth = new AuthStack(this, 'Auth');
    const api = new ApiStack(this, 'Api', { table: data.table, userPool: auth.userPool });
    const web = new WebStack(this, 'Web');

    new CfnOutput(this, 'ApiBaseUrl', { value: api.restApi.url });
    new CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${web.distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'WebBucketName', { value: web.bucket.bucketName });
  }
}
