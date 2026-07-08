import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './app-shell';
import { AuthContext, type AuthApi } from '../auth/auth-context';

afterEach(cleanup);

function authValue(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    status: 'authenticated',
    user: { id: 'sub-1', email: 'user@example.com' },
    apiClient: {
      request: async () => ({}) as unknown as Response,
      get: async () => ({}) as unknown as Response,
    },
    register: async () => ({ ok: true }),
    verify: async () => ({ ok: true }),
    resendVerification: async () => undefined,
    login: async () => ({ ok: true }),
    logout: async () => undefined,
    ...overrides,
  };
}

function renderShell(auth: AuthApi) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AppShell', () => {
  it('renders the four navigation placeholders', () => {
    renderShell(authValue());
    for (const label of ['Week', 'Projects', 'Notes', 'Overview']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('exposes a nav item test id for each area', () => {
    renderShell(authValue());
    for (const id of ['week', 'projects', 'notes', 'overview']) {
      expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument();
    }
  });

  it('logs out and redirects to /login', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderShell(authValue({ logout }));

    fireEvent.click(screen.getByTestId('logout'));

    expect(logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
  });
});
