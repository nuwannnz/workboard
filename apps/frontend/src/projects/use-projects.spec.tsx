import { describe, it, expect, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { Project } from '@workboard/shared';
import { AuthContext, type AuthApi } from '../auth/auth-context';
import type { ApiClient } from '../auth/api-client';
import { useProjects } from './use-projects';

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * A mock api-client whose GET always returns an empty projects list and whose write verbs are
 * scripted per test — so we can drive the optimistic-then-rollback path deterministically
 * (FR-018) without a network or backend.
 */
function mockAuth(write: (method: string, path: string, init?: RequestInit) => Response): AuthApi {
  const apiClient: ApiClient = {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(200, { projects: [] });
      return write(method, path, init);
    },
    get: async () => jsonResponse(200, { projects: [] }),
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

function sampleProject(): Project {
  return {
    id: 'srv-1',
    name: 'Launch',
    color: 'blue',
    order: 'V',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };
}

describe('useProjects', () => {
  it('loads the projects list on mount', async () => {
    const list = [sampleProject()];
    const apiClient: ApiClient = {
      async request() {
        return jsonResponse(200, { projects: list });
      },
      get: async () => jsonResponse(200, { projects: list }),
    };
    const auth = { ...mockAuth(() => jsonResponse(500, {})), apiClient };
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.projects.map((p) => p.id)).toEqual(['srv-1']);
  });

  it('optimistically appends a card and swaps it for the server project on success', async () => {
    const auth = mockAuth(() => jsonResponse(201, sampleProject()));
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.createProject({ name: 'Launch', color: 'blue' });
    });

    expect(result.current.projects.map((p) => p.id)).toEqual(['srv-1']);
    expect(result.current.error).toBeNull();
  });

  it('rolls back and surfaces an error when the create fails (FR-018)', async () => {
    const auth = mockAuth(() => jsonResponse(500, { error: 'boom' }));
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.createProject({ name: 'Will fail', color: 'slate' });
    });

    expect(ok).toBe(false);
    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });
});
