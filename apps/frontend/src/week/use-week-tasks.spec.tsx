import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { Task } from '@workboard/shared';
import { AuthContext, type AuthApi } from '../auth/auth-context';
import type { ApiClient } from '../auth/api-client';
import { useWeekTasks } from './use-week-tasks';

afterEach(cleanup);

/** A minimal Response-like object exposing just what tasks-client reads (ok/status/json). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * A mock api-client whose GET always succeeds (empty week) and whose write verbs are
 * scripted per test — so we can drive the optimistic-then-rollback path deterministically
 * (FR-016) without a network or backend.
 */
function mockAuth(write: (method: string, path: string, init?: RequestInit) => Response): AuthApi {
  const apiClient: ApiClient = {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(200, { tasks: [] });
      return write(method, path, init);
    },
    get: async () => jsonResponse(200, { tasks: [] }),
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

function sampleTask(): Task {
  return {
    id: 'srv-1',
    title: 'Created',
    dueDate: '2026-07-08',
    status: 'open',
    priority: 'medium',
    labels: [],
    order: 'V',
    projectId: null,
    linkedNoteIds: [],
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };
}

describe('useWeekTasks optimistic add', () => {
  afterEach(() => vi.useRealTimers());

  it('rolls back and surfaces an error when the create fails (FR-016)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z')); // a Wednesday
    const auth = mockAuth(() => jsonResponse(500, { error: 'boom' }));
    const { result } = renderHook(() => useWeekTasks(), { wrapper: wrapper(auth) });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.loadStatus).toBe('ready');

    const wednesday = result.current.days.find((d) => d.isToday)?.date as string;
    let ok = true;
    await act(async () => {
      ok = await result.current.addTask(wednesday, 'Will fail');
    });

    expect(ok).toBe(false);
    // Optimistic card was removed on failure — the day is empty again.
    const day = result.current.days.find((d) => d.date === wednesday);
    expect(day?.tasks).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('replaces the optimistic card with the server task on success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
    const auth = mockAuth(() => jsonResponse(201, sampleTask()));
    const { result } = renderHook(() => useWeekTasks(), { wrapper: wrapper(auth) });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.addTask('2026-07-08', 'Created');
    });

    const day = result.current.days.find((d) => d.date === '2026-07-08');
    expect(day?.tasks.map((t) => t.id)).toEqual(['srv-1']);
    expect(result.current.error).toBeNull();
  });
});
