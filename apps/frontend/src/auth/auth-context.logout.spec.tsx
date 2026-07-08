import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from './auth-context';
import { useAuth } from './use-auth';
import type { CognitoClient } from './cognito-client';
import type { TokenBundle, TokenStore } from '../platform/platform';

/**
 * Logout (FR-007, Story 4): `logout` calls the platform token store's `clear`, invokes
 * Cognito `signOut`, sets status `unauthenticated`, and clears the user — so no residual
 * credentials remain (important on desktop/shared devices).
 */
function makeIdToken(payload: Record<string, unknown>): string {
  return `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(payload))}.sig`;
}

function fakeStore(initial: TokenBundle | null): TokenStore {
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

describe('AuthProvider logout()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears the token store, signs out, and resets to unauthenticated', async () => {
    const idToken = makeIdToken({
      sub: 'sub-1',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const store = fakeStore({ accessToken: 'a', idToken, refreshToken: 'r' });
    const signOut = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper({ signOut }, store) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(signOut).toHaveBeenCalledOnce();
    expect(store.clear).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });
});
