import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext, type AuthApi, type AuthStatus } from './auth-context';
import { RequireAuth } from './require-auth';

afterEach(cleanup);

/** Minimal AuthApi stub carrying just the status the guard reads. */
function authValue(status: AuthStatus): AuthApi {
  return {
    status,
    user: null,
    register: async () => ({ ok: true }),
    verify: async () => ({ ok: true }),
    resendVerification: async () => undefined,
    login: async () => ({ ok: true }),
    logout: async () => undefined,
  };
}

function renderGuard(status: AuthStatus) {
  return render(
    <AuthContext.Provider value={authValue(status)}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route
            path="/secret"
            element={
              <RequireAuth>
                <div>secret content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAuth', () => {
  it('renders the protected children when authenticated', () => {
    renderGuard('authenticated');
    expect(screen.getByText('secret content')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    renderGuard('unauthenticated');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('shows a neutral placeholder while loading (no flash of either page)', () => {
    renderGuard('loading');
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
