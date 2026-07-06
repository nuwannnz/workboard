import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { healthRoutes } from './health.routes';
import { HealthController } from '../controllers/health.controller';
import { HealthService } from '../services/health.service';
import { HealthRepository } from '../repositories/health.repository';

/**
 * Integration test for GET /health through the full layer stack
 * (route → controller → service → repository), per contracts/health-api.md.
 * The repository's connectivity probe is stubbed to exercise both branches.
 */
function buildApp(reachable: boolean) {
  const repo = new HealthRepository();
  vi.spyOn(repo, 'isReachable').mockResolvedValue(reachable);
  const controller = new HealthController(new HealthService(repo));

  const app = express();
  app.use(express.json());
  app.use(healthRoutes(controller));
  return app;
}

async function callHealth(app: express.Express) {
  // Minimal in-process HTTP call without extra deps.
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

describe('GET /health', () => {
  it('returns 200 healthy when persistence is reachable', async () => {
    const { status, body } = await callHealth(buildApp(true));
    expect(status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('workboard-backend');
    expect(body.checks.persistence).toBe('healthy');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 503 unhealthy when persistence is unreachable', async () => {
    const { status, body } = await callHealth(buildApp(false));
    expect(status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.persistence).toBe('unhealthy');
  });
});
