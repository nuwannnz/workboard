import { describe, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { WorkboardStack } from './workboard-stack';

/**
 * CDK assertion tests: the synthesized template contains every backend resource —
 * DynamoDB, Lambda, API Gateway, Cognito — and NO frontend web hosting (the frontend
 * is served by Vercel; S3 + CloudFront were removed in stage 006).
 */
describe('WorkboardStack', () => {
  const app = new App();
  const stack = new WorkboardStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  it('provisions the DynamoDB single table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'WorkBoard',
    });
  });

  it('provisions the backend Lambda and API Gateway', () => {
    // With the web-hosting construct gone, the only function left is the Express
    // backend Lambda (no more bucket auto-delete / BucketDeployment helpers).
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
    });
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  it('hosts no frontend on AWS — Vercel serves it (no CloudFront, no web bucket)', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
  });

  it('enables CORS preflight on the API so the Vercel-hosted SPA can call it', () => {
    // defaultCorsPreflightOptions adds an unauthenticated OPTIONS method to each resource.
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'OPTIONS',
      AuthorizationType: 'NONE',
    });
  });

  it('provisions the Cognito user pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });

  it('attaches a Cognito authorizer with result caching', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'COGNITO_USER_POOLS',
      IdentitySource: 'method.request.header.Authorization',
      AuthorizerResultTtlInSeconds: 300,
    });
  });

  it('protects GET /me and the greedy proxy with the Cognito authorizer', () => {
    // GET /me
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
    // ANY /{proxy+}
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'ANY',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
  });

  it('leaves GET /health and POST /auth/resend-verification public (no authorizer)', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
      AuthorizationType: 'NONE',
    });
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'NONE',
    });
  });
});
