import { useContext } from 'react';
import { AuthContext, type AuthApi } from './auth-context';

/** Access the session state machine + auth actions. Must be used inside `AuthProvider`. */
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
