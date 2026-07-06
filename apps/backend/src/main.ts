import { createApp } from './app';
import { loadConfig } from './shared/config';

/**
 * Local server entry (FR-006). Starts the shared Express app with `listen`.
 */
const { port } = loadConfig();
const app = createApp();

app.listen(port, () => {
  console.log(`workboard-backend listening on http://localhost:${port} (GET /health)`);
});
