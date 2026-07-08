import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAuth } from '../use-auth';
import { AuthLayout } from './auth-layout';

/**
 * VerifyScreen (T028, FR-003). Enter the emailed code to confirm the account, with a
 * Resend action for the "code expired / never arrived" edge cases. On success routes to
 * login. The email is carried from registration via the `?email=` query, but remains
 * editable so a returning unverified user can verify directly.
 */
export function VerifyScreen() {
  const { verify, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('submitting');
    const result = await verify({ email, code });
    setStatus('idle');
    if (result.ok) {
      navigate('/login?verified=1');
      return;
    }
    setError('That code is invalid or expired. Request a new one and try again.');
  }

  async function onResend() {
    setResent(false);
    await resendVerification(email);
    // Neutral acknowledgement — never discloses whether the email exists.
    setResent(true);
  }

  return (
    <AuthLayout
      title="Verify your email"
      description="Enter the verification code we emailed you."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
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
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {resent ? (
          <p role="status" className="text-sm text-muted-foreground">
            If that email needs a code, a new one is on its way.
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Verifying…' : 'Verify'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onResend}>
          Resend code
        </Button>
      </form>
    </AuthLayout>
  );
}
