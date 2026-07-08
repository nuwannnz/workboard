import { describe, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { WorkboardStack } from './workboard-stack';

/**
 * Sample CDK assertion test (T031): the synthesized template contains every
 * skeleton resource — DynamoDB, Lambda, API Gateway, S3, CloudFront, Cognito.
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
    // The Express backend Lambda (a second Lambda-backed custom resource exists
    // for the web bucket's auto-delete, so assert on properties, not a count).
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
    });
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  it('provisions S3 + CloudFront static hosting', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  it('enables CORS preflight on the API so the CloudFront-hosted SPA can call it', () => {
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
