import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from './auth-context';
import { useAuth } from './use-auth';
import type { CognitoClient } from './cognito-client';
import type { TokenBundle, TokenStore } from '../platform/platform';

/**
 * Login + session rehydration (FR-005/FR-006, Story 2.4/2.5): generic failure on wrong
 * creds, `unverified` routing reason, `unavailable` on provider error, success persists
 * the bundle, and mount rehydrates from the store (silently refreshing an expired token).
 */
function makeIdToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function bundle(idToken: string, refreshToken = 'refresh-abc'): TokenBundle {
  return { accessToken: 'access-abc', idToken, refreshToken };
}

function fakeStore(initial: TokenBundle | null = null): TokenStore {
  return {
    load: vi.fn().mockResolvedValue(initial),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function makeWrapper(cognito: Partial<CognitoClient>, store: TokenStore) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider cognito={cognito as CognitoClient} tokenStore={store}>
      {children}
    </AuthProvider>
  );
}

describe('AuthProvider login()', () => {
  beforeEach(() => vi.clearAllMocks());

  async function render(cognito: Partial<CognitoClient>, store = fakeStore(null)) {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(cognito, store) });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    return { result, store };
  }

  it('returns a generic invalid reason on wrong credentials', async () => {
    const authenticate = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad'), { name: 'NotAuthorizedException' }));
    const { result } = await render({ authenticate });

    let outcome: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      outcome = await result.current.login({ email: 'user@example.com', password: 'wrongpass1' });
    });

    expect(outcome).toEqual({ ok: false, reason: 'invalid' });
    expect(result.current.status).toBe('unauthenticated');
  });

  it('returns the unverified reason so the UI can route to verify', async () => {
    const authenticate = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { name: 'UserNotConfirmedException' }));
    const { result } = await render({ authenticate });

    let outcome: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      outcome = await result.current.login({ email: 'user@example.com', password: 'abcd1234' });
    });

    expect(outcome).toEqual({ ok: false, reason: 'unverified' });
  });

  it('returns unavailable on a provider/network error', async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = await render({ authenticate });

    let outcome: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      outcome = await result.current.login({ email: 'user@example.com', password: 'abcd1234' });
    });

    expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('authenticates, persists the bundle, and sets the user on success', async () => {
    const idToken = makeIdToken({ sub: 'sub-1', email: 'user@example.com', exp: nowSec() + 3600 });
    const tokens = bundle(idToken);
    const authenticate = vi.fn().mockResolvedValue(tokens);
    const store = fakeStore(null);
    const { result } = await render({ authenticate }, store);

    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.login({ email: 'user@example.com', password: 'abcd1234' });
    });

    expect(outcome).toEqual({ ok: true });
    expect(store.save).toHaveBeenCalledWith(tokens);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual({ id: 'sub-1', email: 'user@example.com' });
  });
});

describe('AuthProvider rehydration on mount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves authenticated from a valid stored bundle without refreshing', async () => {
    const idToken = makeIdToken({ sub: 'sub-2', email: 'a@b.com', exp: nowSec() + 3600 });
    const refreshSession = vi.fn();
    const store = fakeStore(bundle(idToken));
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper({ refreshSession }, store),
    });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual({ id: 'sub-2', email: 'a@b.com' });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('silently refreshes an expired access token when the refresh token is valid', async () => {
    const expired = makeIdToken({
      sub: 'sub-3',
      email: 'c@d.com',
      'cognito:username': 'c@d.com',
      exp: nowSec() - 10,
    });
    const fresh = makeIdToken({ sub: 'sub-3', email: 'c@d.com', exp: nowSec() + 3600 });
    const freshBundle = bundle(fresh, 'refresh-new');
    const refreshSession = vi.fn().mockResolvedValue(freshBundle);
    const store = fakeStore(bundle(expired, 'refresh-old'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper({ refreshSession }, store),
    });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(refreshSession).toHaveBeenCalledWith('refresh-old', 'c@d.com');
    expect(store.save).toHaveBeenCalledWith(freshBundle);
    expect(result.current.user).toEqual({ id: 'sub-3', email: 'c@d.com' });
  });

  it('resolves unauthenticated and clears when refresh fails', async () => {
    const expired = makeIdToken({ sub: 'sub-4', email: 'e@f.com', exp: nowSec() - 10 });
    const refreshSession = vi.fn().mockRejectedValue(new Error('refresh expired'));
    const store = fakeStore(bundle(expired, 'refresh-old'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper({ refreshSession }, store),
    });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(store.clear).toHaveBeenCalled();
  });

  it('resolves unauthenticated when there is no stored session', async () => {
    const store = fakeStore(null);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper({}, store),
    });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
  });
});
