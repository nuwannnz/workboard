import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

const backendEntry = fileURLToPath(new URL('../../backend/src/lambda.ts', import.meta.url));
const depsLockFilePath = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));

export interface ApiStackProps {
  table: dynamodb.ITable;
  userPool: cognito.IUserPool;
}

/**
 * The single Lambda packaging the Express backend + API Gateway in front of it
 * (FR-008). One Lambda serves the whole app via `@codegenie/serverless-express`.
 *
 * Stage 2 splits the previously catch-all proxy so a `CognitoUserPoolsAuthorizer`
 * (with result caching) verifies the id token at the API Gateway edge for protected
 * paths, before the request reaches the Lambda (FR-009, research.md §2/§10):
 *   - Public (no authorizer): `GET /health`, `POST /auth/resend-verification`.
 *   - Protected (Cognito authorizer): `GET /me`, greedy `ANY /{proxy+}`.
 * All methods still integrate the single backend Lambda; Express routes internally.
 */
export class ApiStack extends Construct {
  readonly restApi: apigateway.RestApi;
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
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        // Production trusts the gateway-verified claims; no in-process verification.
        AUTH_LOCAL_VERIFY: 'false',
      },
      bundling: {
        format: OutputFormat.CJS,
        target: 'node22',
        // AWS SDK v3 (incl. @aws-sdk/client-cognito-identity-provider) is provided by the
        // Lambda runtime. `aws-jwt-verify` is a local-dev-only fallback verifier — it is
        // dynamically imported behind AUTH_LOCAL_VERIFY so it never loads in the Lambda, so
        // we keep it out of the bundle to stay lean (T002).
        externalModules: ['@aws-sdk/*', 'aws-jwt-verify'],
      },
    });

    // Repository layer reads/writes go through this Lambda's role.
    props.table.grantReadWriteData(this.handler);

    this.restApi = new apigateway.RestApi(this, 'BackendApi', {
      restApiName: 'WorkBoardApi',
      deployOptions: { stageName: 'prod' },
      // The SPA is served from the Vercel domain and calls this API cross-origin. Requests
      // carry a Bearer id token (no cookies), so `*` origins are safe here; tighten to the
      // Vercel domain later if desired. This auto-adds the OPTIONS preflight to every path.
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // API Gateway error responses (e.g. the Cognito authorizer's 401, or a 5xx) don't include
    // CORS headers by default, so the browser masks them as opaque CORS failures — which would
    // break the client's refresh-on-401 retry. Add the headers to the default error responses.
    const corsErrorHeaders = {
      'Access-Control-Allow-Origin': "'*'",
      'Access-Control-Allow-Headers': "'Authorization,Content-Type'",
    };
    this.restApi.addGatewayResponse('Default4xxCors', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsErrorHeaders,
    });
    this.restApi.addGatewayResponse('Default5xxCors', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsErrorHeaders,
    });

    const integration = new apigateway.LambdaIntegration(this.handler);

    // Verify the Cognito id token at the edge, caching the authorizer result per token
    // for a modest TTL so revocation/expiry still take effect promptly (research.md §2).
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: Duration.seconds(300),
    });
    const protectedMethod: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- Public routes (no authorizer) ---
    this.restApi.root.addResource('health').addMethod('GET', integration);
    this.restApi.root
      .addResource('auth')
      .addResource('resend-verification')
      .addMethod('POST', integration);

    // --- Protected routes (Cognito authorizer) ---
    // Explicit `/me` plus a greedy proxy for all future feature routes. API Gateway
    // matches the specific public paths above ahead of this greedy protected proxy.
    this.restApi.root.addResource('me').addMethod('GET', integration, protectedMethod);
    this.restApi.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
      defaultMethodOptions: protectedMethod,
    });
  }
}
