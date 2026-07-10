import { describe, it, expect, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { Note } from '@workboard/shared';
import { AuthContext, type AuthApi } from '../auth/auth-context';
import type { ApiClient } from '../auth/api-client';
import { useNotes } from './use-notes';

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * A mock api-client whose GET returns a scripted notes list and whose write verbs are scripted
 * per test — so the optimistic-then-rollback paths are driven deterministically (FR-018)
 * without a network or backend.
 */
function mockAuth(
  initial: Note[],
  write: (method: string, path: string, init?: RequestInit) => Response,
): AuthApi {
  const apiClient: ApiClient = {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(200, { notes: initial });
      return write(method, path, init);
    },
    get: async () => jsonResponse(200, { notes: initial }),
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

function sampleNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'srv-1',
    title: 'Server note',
    markdown: '',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('useNotes', () => {
  it('loads the notes list on mount', async () => {
    const auth = mockAuth([sampleNote()], () => jsonResponse(500, {}));
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.notes.map((n) => n.id)).toEqual(['srv-1']);
  });

  it('optimistically prepends and selects a created note, swapping in the server note', async () => {
    const auth = mockAuth([], () => jsonResponse(201, sampleNote({ id: 'srv-new' })));
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.createNote();
    });

    expect(result.current.notes.map((n) => n.id)).toEqual(['srv-new']);
    expect(result.current.selectedId).toBe('srv-new');
    expect(result.current.error).toBeNull();
  });

  it('rolls back and surfaces an error when the create fails (FR-018)', async () => {
    const auth = mockAuth([], () => jsonResponse(500, { error: 'boom' }));
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    let created: unknown = 'x';
    await act(async () => {
      created = await result.current.createNote();
    });

    expect(created).toBeNull();
    expect(result.current.notes).toEqual([]);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('optimistically deletes a note and reinstates it on failure (FR-017)', async () => {
    const auth = mockAuth([sampleNote({ id: 'a' }), sampleNote({ id: 'b', updatedAt: '2026-07-09T00:00:00.000Z' })], () =>
      jsonResponse(500, {}),
    );
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteNote('a');
    });
    expect(ok).toBe(false);
    expect(result.current.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(result.current.error).toBeTruthy();
  });

  it('optimistically renames a note in the list with rollback (FR-015)', async () => {
    const auth = mockAuth([sampleNote({ id: 'a', title: 'Old' })], (method) =>
      method === 'PATCH' ? jsonResponse(200, sampleNote({ id: 'a', title: 'New' })) : jsonResponse(500, {}),
    );
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.rename('a', 'New');
    });
    expect(result.current.notes.find((n) => n.id === 'a')?.title).toBe('New');
  });
});
