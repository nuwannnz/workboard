import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './app-shell';
import { AuthProvider } from '../auth/auth-context';
import { RequireAuth } from '../auth/require-auth';
import { useAuth } from '../auth/use-auth';
import { LoginScreen } from '../auth/screens/login-screen';
import { RegisterScreen } from '../auth/screens/register-screen';
import { VerifyScreen } from '../auth/screens/verify-screen';
import { WeekPage } from '../week/week-page';

/**
 * Public auth route wrapper: authenticated users visiting `/login|/register|/verify` are
 * redirected into the app; a neutral placeholder shows while the session rehydrates so
 * there is no flash (contracts/auth-client-contract.md §Protected routing).
 */
function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"
      >
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Routes only — public auth screens vs. the protected app shell (FR-008, research §4). */
export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginScreen />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterScreen />
          </PublicOnly>
        }
      />
      <Route
        path="/verify"
        element={
          <PublicOnly>
            <VerifyScreen />
          </PublicOnly>
        }
      />
      {/* Protected shell with nested feature routes (rendered via the shell's <Outlet/>). */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Week is the protected landing surface (contracts/tasks-client-contract.md). */}
        <Route path="/" element={<WeekPage />} />
        <Route path="/week" element={<WeekPage />} />
        {/* Unknown protected paths fall back to the Week board. */}
        <Route path="*" element={<Navigate to="/week" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Application root: the AuthProvider wraps the router so the whole shared codebase (PWA
 * and Tauri desktop) shares one session + one route tree (Principle II).
 */
export function AppRouter() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
