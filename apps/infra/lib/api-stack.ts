import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

const backendEntry = fileURLToPath(new URL('../../backend/src/lambda.ts', import.meta.url));
const depsLockFilePath = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));

export interface ApiStackProps {
  table: dynamodb.ITable;
}

/**
 * The single Lambda packaging the Express backend + API Gateway in front of it
 * (FR-008, T035). One Lambda serves the whole app via `@codegenie/serverless-express`;
 * the AWS SDK v3 is provided by the Lambda runtime so it is externalized.
 */
export class ApiStack extends Construct {
  readonly restApi: apigateway.LambdaRestApi;
  readonly handler: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id);

    this.handler = new NodejsFunction(this, 'BackendFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: backendEntry,
      handler: 'handler',
      depsLockFilePath,
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        WORKBOARD_TABLE_NAME: props.table.tableName,
      },
      bundling: {
        format: OutputFormat.CJS,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Repository layer reads/writes go through this Lambda's role.
    props.table.grantReadWriteData(this.handler);

    this.restApi = new apigateway.LambdaRestApi(this, 'BackendApi', {
      handler: this.handler,
      proxy: true,
      restApiName: 'WorkBoardApi',
      deployOptions: { stageName: 'prod' },
    });
  }
}
