import { existsSync } from 'node:fs';
import { createApp } from './app';
import { loadConfig } from './shared/config';

/**
 * Local server entry (FR-006). Starts the shared Express app with `listen`.
 *
 * Load `apps/backend/.env` (if present) before reading config so `nx serve backend` and
 * `npm run local` both pick up the local DynamoDB endpoint, Cognito emulator settings, and
 * `AUTH_LOCAL_VERIFY`. This file is the local entry only — never the Lambda handler — so
 * env-file loading has no effect on the deployed runtime. Nx runs from the repo root.
 */
const envFile = 'apps/backend/.env';
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { port } = loadConfig();
const app = createApp();

app.listen(port, () => {
  console.log(`workboard-backend listening on http://localhost:${port} (GET /health)`);
});
