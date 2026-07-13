import { describe, it, expect, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import type { Note } from '@workboard/shared';
import { AuthContext, type AuthApi } from '../auth/auth-context';
import type { ApiClient } from '../auth/api-client';
import { useLinkedNotes } from './use-linked-notes';

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Records the GET paths so the test can assert the reverse query, and replies per path. */
function mockAuth(byPath: (path: string) => Note[]): { auth: AuthApi; paths: string[] } {
  const paths: string[] = [];
  const apiClient: ApiClient = {
    async request(path) {
      paths.push(path);
      return jsonResponse(200, { notes: byPath(path) });
    },
    get: async (path) => {
      paths.push(path);
      return jsonResponse(200, { notes: byPath(path) });
    },
  };
  const auth: AuthApi = {
    status: 'authenticated',
    user: { id: 'u1', email: 'u@example.com' },
    apiClient,
    register: async () => ({ ok: true }),
    verify: async () => ({ ok: true }),
    resendVerification: async () => undefined,
    login: async () => ({ ok: true }),
    logout: async () => undefined,
  };
  return { auth, paths };
}

function wrapper(auth: AuthApi) {
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  );
}

function note(id: string): Note {
  return {
    id,
    title: id,
    markdown: '',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

describe('useLinkedNotes', () => {
  it('loads the reverse list for a projectId', async () => {
    const { auth, paths } = mockAuth((path) => (path.includes('linkedProjectId=p1') ? [note('n1')] : []));
    const { result } = renderHook(() => useLinkedNotes({ projectId: 'p1' }), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.notes.map((n) => n.id)).toEqual(['n1']);
    expect(paths.some((p) => p.includes('linkedProjectId=p1'))).toBe(true);
  });

  it('loads the reverse list for a taskId', async () => {
    const { auth, paths } = mockAuth((path) => (path.includes('linkedTaskId=t1') ? [note('n2')] : []));
    const { result } = renderHook(() => useLinkedNotes({ taskId: 't1' }), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.notes.map((n) => n.id)).toEqual(['n2']);
    expect(paths.some((p) => p.includes('linkedTaskId=t1'))).toBe(true);
  });

  it('exposes a defined empty state when nothing links (US4.4)', async () => {
    const { auth } = mockAuth(() => []);
    const { result } = renderHook(() => useLinkedNotes({ projectId: 'none' }), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.notes).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });
});
