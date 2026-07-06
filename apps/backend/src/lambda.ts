import serverlessExpress from '@codegenie/serverless-express';
import { createApp } from './app';

/**
 * Serverless entry (FR-008). Wraps the identical Express app from `app.ts` in
 * the API Gateway → Lambda adapter. The single Lambda in the CDK stack points
 * its handler at this module's `handler` export.
 */
export const handler = serverlessExpress({ app: createApp() });
