import { describe, it, expect, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Note } from '@workboard/shared';
import { notesRoutes } from './notes.routes';
import { NotesController } from './notes.controller';
import type { NotesService } from './notes.service';

/**
 * Notes HTTP surface (contracts/notes-api.md): the new `GET /notes/:id` returns the full note
 * (200) or 404, and a propagated body-write failure surfaces as a uniform `500` envelope that
 * never leaks S3 keys / storage internals (FR-016). Middleware is stubbed — `authenticate` is a
 * pass-through and `resolveIdentity` injects the owner `userId`, exactly as the gateway +
 * identity resolution would.
 */
const authenticate: RequestHandler = (_req, _res, next) => next();
const resolveIdentity: RequestHandler = (req, _res, next) => {
  (req as unknown as { auth: { userId: string } }).auth = { userId: 'user-A' };
  next();
};

function buildApp(service: Partial<NotesService>) {
  const controller = new NotesController(service as NotesService);
  const app = express();
  app.use(express.json());
  app.use(notesRoutes(authenticate, resolveIdentity, controller));
  return app;
}

async function call(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  } finally {
    server.close();
  }
}

const fullNote: Note = {
  id: 'n1',
  title: 'T',
  markdown: '# Body',
  bodyKey: 'users/user-A/notes/n1.md',
  linkedProjectIds: [],
  linkedTaskIds: [],
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
};

describe('GET /notes/:id (US1)', () => {
  it('returns 200 with the full note (metadata + markdown)', async () => {
    const app = buildApp({ getNoteById: vi.fn(async () => fullNote) });
    const res = await call(app, 'GET', '/notes/n1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'n1', markdown: '# Body' });
  });

  it('returns 404 for a foreign/unknown id (no disclosure)', async () => {
    const app = buildApp({ getNoteById: vi.fn(async () => null) });
    const res = await call(app, 'GET', '/notes/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NotFound' });
  });
});

describe('body-write failure → uniform 500, no key leakage (US2, FR-016)', () => {
  it('POST /notes maps a propagated body-write failure to 500', async () => {
    const app = buildApp({
      createNote: vi.fn(async () => {
        throw new Error('PutObject failed for users/user-A/notes/n1.md');
      }),
    });
    const res = await call(app, 'POST', '/notes', { markdown: 'x' });
    expect(res.status).toBe(500);
    // The envelope is uniform and never surfaces the S3 key / storage internals.
    expect(res.body).toEqual({ error: 'internal_error' });
    expect(JSON.stringify(res.body)).not.toContain('users/user-A');
  });

  it('PATCH /notes/:id maps a propagated body-write failure to 500', async () => {
    const app = buildApp({
      updateNote: vi.fn(async () => {
        throw new Error('PutObject failed for users/user-A/notes/n1.md');
      }),
    });
    const res = await call(app, 'PATCH', '/notes/n1', { markdown: 'x' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error' });
    expect(JSON.stringify(res.body)).not.toContain('users/user-A');
  });
});
