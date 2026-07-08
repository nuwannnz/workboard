import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './use-auth';

/**
 * Route guard (FR-008). Renders the protected children only when `authenticated`;
 * redirects to `/login` when `unauthenticated`; shows a neutral placeholder while the
 * session is still `loading` so there is no login flash during rehydration.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
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

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
