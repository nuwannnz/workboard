import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAuth } from '../use-auth';
import { AuthLayout } from './auth-layout';

/**
 * LoginScreen (T035, FR-005/FR-014/FR-015). A single generic "invalid email or password"
 * message (no enumeration), a guided path to Verify when the account is unverified, and a
 * "try again later" state on provider/network failure. On success the router redirects
 * into the protected shell. Shared shadcn/ui — identical on PWA and desktop.
 */
export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('submitting');
    const result = await login({ email, password });
    setStatus('idle');
    if (result.ok) {
      navigate('/');
      return;
    }
    if (result.reason === 'unverified') {
      navigate(`/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    if (result.reason === 'unavailable') {
      setError('Something went wrong. Please try again later.');
      return;
    }
    setError('Invalid email or password.');
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back. Sign in to your account."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
