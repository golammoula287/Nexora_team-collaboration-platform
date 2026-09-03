'use client';

import { Button, Card, CardContent, Field, Input, Spinner } from '@nexora/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '../../../lib/auth-client';
import { withQuery } from '../../../lib/routes';

/**
 * Two screens in one: request a link, or - when arriving with a token - choose
 * the new password.
 */
export function ResetPasswordForm({ token }: { token?: string }) {
  return token ? <ChooseNewPassword token={token} /> : <RequestLink />;
}

function RequestLink() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    // Always report success, even for an unknown address. Anything else turns
    // this form into a way to test which emails have accounts.
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 pt-6 text-center">
          <MailCheck className="text-success mx-auto size-8" aria-hidden="true" />
          <h1 className="text-fg text-[16px] font-semibold">Check your email</h1>
          <p className="text-fg-muted text-[13px]">
            If an account exists for <span className="text-fg font-medium">{email}</span>, a reset
            link is on its way. It expires in an hour.
          </p>
          <Link
            href="/sign-in"
            className="text-accent inline-block text-[13px] font-medium hover:underline"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-fg-muted text-[13px]">We will email you a link to choose a new one.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Spinner label="Sending" /> : null}
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>

        <p className="text-fg-muted text-center text-[13px]">
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function ChooseNewPassword({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }

    setPending(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });

    if (resetError) {
      setError(resetError.message ?? 'That link is invalid or has expired.');
      setPending(false);
      return;
    }

    // Every other session was revoked server-side, so sign in fresh.
    router.push(withQuery('/sign-in', { reset: '1' }));
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-fg-muted text-[13px]">This signs you out everywhere else.</p>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-sm border px-3 py-2 text-[13px]"
          >
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="New password" required hint="At least 12 characters.">
            {(props) => (
              <Input
                {...props}
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Spinner label="Saving" /> : null}
            {pending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
