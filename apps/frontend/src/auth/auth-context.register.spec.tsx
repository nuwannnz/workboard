import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from './auth-context';
import { useAuth } from './use-auth';
import type { CognitoClient } from './cognito-client';
import type { TokenStore } from '../platform/platform';

/**
 * Register/verify auth-context behavior (contracts/auth-client-contract.md): neutral
 * outcome when the email already exists (no enumeration — the client maps it to success),
 * field-level errors from the shared schema on weak password / bad email, and verify
 * resolving success/failure.
 */
function fakeStore(): TokenStore {
  return { load: vi.fn().mockResolvedValue(null), save: vi.fn(), clear: vi.fn() };
}

function makeWrapper(cognito: Partial<CognitoClient>, store: TokenStore) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider cognito={cognito as CognitoClient} tokenStore={store}>
      {children}
    </AuthProvider>
  );
}

async function renderAuth(cognito: Partial<CognitoClient>) {
  const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(cognito, fakeStore()) });
  await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
  return result;
}

describe('AuthProvider register()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns neutral success when signUp resolves (existing email mapped by the client)', async () => {
    const signUp = vi.fn().mockResolvedValue(undefined);
    const result = await renderAuth({ signUp });

    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.register({ email: 'user@example.com', password: 'abcd1234' });
    });

    expect(signUp).toHaveBeenCalledWith('user@example.com', 'abcd1234');
    expect(outcome).toEqual({ ok: true });
  });

  it('rejects a weak password with a field error and never calls signUp', async () => {
    const signUp = vi.fn();
    const result = await renderAuth({ signUp });

    let outcome:
      | { ok: true }
      | { ok: false; fieldErrors?: Record<string, string> }
      | undefined;
    await act(async () => {
      outcome = await result.current.register({ email: 'user@example.com', password: 'short' });
    });

    expect(signUp).not.toHaveBeenCalled();
    expect(outcome?.ok).toBe(false);
    expect((outcome as { fieldErrors?: Record<string, string> }).fieldErrors).toHaveProperty(
      'password',
    );
  });

  it('rejects a bad email with a field error', async () => {
    const signUp = vi.fn();
    const result = await renderAuth({ signUp });

    let outcome:
      | { ok: true }
      | { ok: false; fieldErrors?: Record<string, string> }
      | undefined;
    await act(async () => {
      outcome = await result.current.register({ email: 'nope', password: 'abcd1234' });
    });

    expect(signUp).not.toHaveBeenCalled();
    expect((outcome as { fieldErrors?: Record<string, string> }).fieldErrors).toHaveProperty(
      'email',
    );
  });
});

describe('AuthProvider verify() / resendVerification()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves ok when the code is confirmed', async () => {
    const confirmRegistration = vi.fn().mockResolvedValue(undefined);
    const result = await renderAuth({ confirmRegistration });

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.verify({ email: 'user@example.com', code: '123456' });
    });

    expect(confirmRegistration).toHaveBeenCalledWith('user@example.com', '123456');
    expect(outcome?.ok).toBe(true);
  });

  it('resolves not-ok when the code is wrong', async () => {
    const confirmRegistration = vi.fn().mockRejectedValue(new Error('CodeMismatchException'));
    const result = await renderAuth({ confirmRegistration });

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.verify({ email: 'user@example.com', code: '000000' });
    });

    expect(outcome?.ok).toBe(false);
  });

  it('resendVerification always resolves, even when the provider errors (neutral)', async () => {
    const resendConfirmationCode = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await renderAuth({ resendConfirmationCode });

    await expect(
      act(async () => {
        await result.current.resendVerification('user@example.com');
      }),
    ).resolves.not.toThrow();
  });
});
