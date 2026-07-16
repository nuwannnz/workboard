import { describe, it, expect, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { Note, NoteMetadata } from '@workboard/shared';
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

interface MockOptions {
  /** Response for a write verb (POST/PATCH/DELETE). */
  write?: (method: string, path: string, init?: RequestInit) => Response;
  /** Response for `GET /notes/:id` (the select-to-fetch body load). */
  getNote?: (id: string) => Response;
}

/**
 * A mock api-client that routes by verb + path: `GET /notes` returns the scripted **metadata**
 * list, `GET /notes/:id` returns a full note (select-to-fetch), and the write verbs are scripted
 * per test — so the optimistic-then-rollback paths and the on-select body fetch are driven
 * deterministically (FR-007/FR-012/FR-018) without a network or backend. `calls` counts the
 * body fetches so a test can assert exactly one per selection.
 */
function mockAuth(initial: NoteMetadata[], opts: MockOptions = {}) {
  const calls = { getNote: 0, listByPath: [] as string[] };
  const write = opts.write ?? (() => jsonResponse(500, {}));
  const apiClient: ApiClient = {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        const detail = path.match(/^\/notes\/([^/?]+)/);
        if (detail) {
          calls.getNote += 1;
          const id = decodeURIComponent(detail[1]);
          return opts.getNote ? opts.getNote(id) : jsonResponse(200, fullNote({ id }));
        }
        calls.listByPath.push(path);
        return jsonResponse(200, { notes: initial });
      }
      return write(method, path, init);
    },
    get: async () => jsonResponse(200, { notes: initial }),
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
  return { auth, calls };
}

function wrapper(auth: AuthApi) {
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  );
}

function metaNote(overrides: Partial<NoteMetadata> = {}): NoteMetadata {
  return {
    id: 'srv-1',
    title: 'Server note',
    bodyKey: 'users/u1/notes/srv-1.md',
    linkedProjectIds: [],
    linkedTaskIds: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function fullNote(overrides: Partial<Note> = {}): Note {
  return { ...metaNote(overrides as Partial<NoteMetadata>), markdown: '', ...overrides };
}

describe('useNotes', () => {
  it('loads the notes list on mount (metadata only)', async () => {
    const { auth } = mockAuth([metaNote()]);
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    expect(result.current.notes.map((n) => n.id)).toEqual(['srv-1']);
    // List elements carry no body content (FR-007).
    expect(result.current.notes[0]).not.toHaveProperty('markdown');
  });

  it('renders the list with zero body fetches; a single select issues exactly one (US4, FR-007/SC-004)', async () => {
    const { auth, calls } = mockAuth([metaNote({ id: 'a' }), metaNote({ id: 'b' })]);
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    // Loading + rendering the list fetched no bodies (list is metadata-only).
    expect(calls.getNote).toBe(0);

    act(() => result.current.select('a'));
    await waitFor(() => expect(result.current.bodyStatus).toBe('ready'));
    expect(calls.getNote).toBe(1); // exactly one GET /notes/:id on selection
  });

  it('fetches the full note body once when a note is selected (US1, FR-012)', async () => {
    const { auth, calls } = mockAuth([metaNote({ id: 'a' })], {
      getNote: (id) => jsonResponse(200, fullNote({ id, markdown: '# Loaded' })),
    });
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    act(() => result.current.select('a'));
    await waitFor(() => expect(result.current.bodyStatus).toBe('ready'));

    expect(calls.getNote).toBe(1);
    expect(result.current.selectedNote?.markdown).toBe('# Loaded');
  });

  it('surfaces a body-load error and retries via reloadSelectedNote', async () => {
    let fail = true;
    const { auth } = mockAuth([metaNote({ id: 'a' })], {
      getNote: (id) => (fail ? jsonResponse(500, {}) : jsonResponse(200, fullNote({ id, markdown: 'ok' }))),
    });
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    act(() => result.current.select('a'));
    await waitFor(() => expect(result.current.bodyStatus).toBe('error'));

    fail = false;
    act(() => result.current.reloadSelectedNote());
    await waitFor(() => expect(result.current.bodyStatus).toBe('ready'));
    expect(result.current.selectedNote?.markdown).toBe('ok');
  });

  it('optimistically prepends and selects a created note, seeding its body without a fetch', async () => {
    const { auth, calls } = mockAuth([], {
      write: () => jsonResponse(201, fullNote({ id: 'srv-new', markdown: '' })),
    });
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.createNote();
    });

    expect(result.current.notes.map((n) => n.id)).toEqual(['srv-new']);
    expect(result.current.selectedId).toBe('srv-new');
    expect(result.current.selectedNote?.id).toBe('srv-new');
    expect(result.current.error).toBeNull();
    // The created note's full body was seeded — no redundant GET /notes/:id.
    expect(calls.getNote).toBe(0);
  });

  it('rolls back and surfaces an error when the create fails (FR-018)', async () => {
    const { auth } = mockAuth([], { write: () => jsonResponse(500, { error: 'boom' }) });
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
    const { auth } = mockAuth(
      [metaNote({ id: 'a' }), metaNote({ id: 'b', updatedAt: '2026-07-09T00:00:00.000Z' })],
      { write: () => jsonResponse(500, {}) },
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
    const { auth } = mockAuth([metaNote({ id: 'a', title: 'Old' })], {
      write: (method) =>
        method === 'PATCH'
          ? jsonResponse(200, fullNote({ id: 'a', title: 'New' }))
          : jsonResponse(500, {}),
    });
    const { result } = renderHook(() => useNotes(), { wrapper: wrapper(auth) });
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));

    await act(async () => {
      await result.current.rename('a', 'New');
    });
    expect(result.current.notes.find((n) => n.id === 'a')?.title).toBe('New');
    // The renamed list element is still metadata-only (US4).
    expect(result.current.notes.find((n) => n.id === 'a')).not.toHaveProperty('markdown');
  });
});
