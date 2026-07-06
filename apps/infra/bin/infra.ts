import { App } from 'aws-cdk-lib';
import { WorkboardStack } from '../lib/workboard-stack';

/**
 * CDK entry (FR-009). Synthesizes the single WorkBoard skeleton stack. Account
 * and region come from the ambient AWS environment at deploy time.
 */
const app = new App();

new WorkboardStack(app, 'WorkBoardStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();
