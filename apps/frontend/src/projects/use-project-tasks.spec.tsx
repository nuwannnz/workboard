import { describe, it, expect, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { Task } from '@workboard/shared';
import { AuthContext, type AuthApi } from '../auth/auth-context';
import type { ApiClient } from '../auth/api-client';
import { useProjectTasks } from './use-project-tasks';

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** GET returns the seeded backlog; write verbs are scripted per test (FR-018). */
function mockAuth(
  backlog: Task[],
  write: (method: string, path: string, init?: RequestInit) => Response,
): AuthApi {
  const apiClient: ApiClient = {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(200, { tasks: backlog });
      return write(method, path, init);
    },
    get: async () => jsonResponse(200, { tasks: backlog }),
  };
  return {
    status: 'authenticated',
    user: { id: 'u1', email: 'u@example.com' },
    apiClient,
    register: async () => ({ ok: true }),
    verify: async () => ({ ok: true }),
    resendVerification: async () => undefined,
    login: async () => ({ ok: true }),
    logout: async () => undefined,
  };
}

function wrapper(auth: AuthApi) {
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  );
}

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'srv-1',
    title: 'Backlog item',
    dueDate: null,
    status: 'open',
    priority: 'medium',
    labels: [],
    order: 'V',
    projectId: 'p1',
    linkedNoteIds: [],
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('useProjectTasks', () => {
  it('loads the project backlog on mount, sorted by order then id', async () => {
    const backlog = [sampleTask({ id: 'b', order: 'W' }), sampleTask({ id: 'a', order: 'V' })];
    const auth = mockAuth(backlog, () => jsonResponse(500, {}));
    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.backlog.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('optimistically adds a backlog task (title, projectId, no dueDate) and swaps on success', async () => {
    const created = sampleTask({ id: 'srv-new', title: 'New' });
    const auth = mockAuth([], (method, path) => {
      if (method === 'POST' && path === '/tasks') return jsonResponse(201, created);
      return jsonResponse(500, {});
    });
    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.addBacklogTask('New');
    });

    expect(result.current.backlog.map((t) => t.id)).toEqual(['srv-new']);
    expect(result.current.backlog[0].dueDate).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('rolls back an add when the create fails (FR-018)', async () => {
    const auth = mockAuth([], () => jsonResponse(500, {}));
    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.addBacklogTask('Will fail');
    });

    expect(ok).toBe(false);
    expect(result.current.backlog).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('rolls back complete/reopen and delete on rejection', async () => {
    const auth = mockAuth([sampleTask({ id: 't1', status: 'open' })], () => jsonResponse(500, {}));
    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.toggleComplete('t1');
    });
    // Reverted to open after the failed PATCH.
    expect(result.current.backlog.find((t) => t.id === 't1')?.status).toBe('open');

    await act(async () => {
      await result.current.deleteTask('t1');
    });
    // Reinstated after the failed DELETE.
    expect(result.current.backlog.map((t) => t.id)).toEqual(['t1']);
    expect(result.current.error).toBeTruthy();
  });
});
