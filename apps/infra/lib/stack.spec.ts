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

  it('provisions the Cognito user pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });
});
