// One-command deploy: `npm run deploy`.
//
// The backend (API Gateway + Lambda, Cognito, DynamoDB) is CDK-managed on AWS; the frontend is
// served by Vercel. The frontend must be built with the deployed API URL + Cognito IDs, which
// only exist after the stack is deployed, so the order is:
//   1. Deploy the (web-less) CDK stack once and read its outputs (API URL, Cognito pool/client).
//   2. Build the frontend with those production values and publish it to Vercel — via the same
//      shared helper the CI pipeline uses (tools/scripts/deploy-frontend-vercel.mjs, FR-012).
//
// Requires AWS credentials configured (as for any `cdk deploy`) and a bootstrapped account,
// plus either VERCEL_TOKEN in the environment or a `vercel login` session with the project
// linked (`npx vercel link --cwd apps/frontend`).

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployFrontendToVercel } from './deploy-frontend-vercel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INFRA_DIR = path.join(ROOT, 'apps/infra');
const STACK_NAME = 'WorkBoardStack';

function log(msg) {
  console.log(`\x1b[36m[deploy]\x1b[0m ${msg}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

async function main() {
  const outputsFile = path.join(mkdtempSync(path.join(tmpdir(), 'wb-deploy-')), 'outputs.json');

  // 1. Deploy the backend stack and capture its outputs.
  log('deploying infrastructure (backend: API, Cognito, DynamoDB)…');
  await run(
    'npx',
    ['cdk', 'deploy', '--all', '--require-approval', 'never', '--outputs-file', outputsFile],
    { cwd: INFRA_DIR },
  );

  const outputs = JSON.parse(readFileSync(outputsFile, 'utf8'))[STACK_NAME] ?? {};
  const apiBaseUrl = String(outputs.ApiBaseUrl ?? '').replace(/\/$/, ''); // trim trailing slash
  const userPoolId = outputs.UserPoolId;
  const clientId = outputs.UserPoolClientId;
  if (!apiBaseUrl || !userPoolId || !clientId) {
    throw new Error(`Missing stack outputs (got ${JSON.stringify(outputs)})`);
  }
  log(`resolved outputs → API ${apiBaseUrl}, pool ${userPoolId}`);

  // 2. Build the frontend against the real, deployed values and publish it to Vercel.
  const url = await deployFrontendToVercel({
    apiBaseUrl,
    userPoolId,
    clientId,
    version: process.env.DEPLOY_APP_VERSION,
    token: process.env.VERCEL_TOKEN,
    prod: true,
  });

  log(`done → ${url}`);
}

main().catch((err) => {
  console.error('\n`npm run deploy` failed:', err.message ?? err);
  process.exit(1);
});
