import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAuth } from '../use-auth';
import { AuthLayout } from './auth-layout';

/**
 * RegisterScreen (T027, FR-002/FR-014/FR-015). Field-level validation from the shared
 * schema, a neutral "check your email" outcome (no enumeration), and a "try again later"
 * state on provider/network failure. Built from the shared shadcn/ui design system so the
 * PWA and desktop render identically.
 */
export function RegisterScreen() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setStatus('submitting');
    const result = await register({ email, password });
    if (result.ok) {
      // Neutral outcome — proceed to verification regardless of whether the email is new.
      navigate(`/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
      setStatus('idle');
      return;
    }
    setStatus('error');
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Register with your email and a password."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
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
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.password}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least 8 characters, including a lowercase letter and a digit.
            </p>
          )}
        </div>

        {status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            Something went wrong. Please try again later.
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
