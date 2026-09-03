'use client';

import { Button, Card, CardContent, Field, Input, Spinner } from '@nexora/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authClient } from '../../../lib/auth-client';

/** Matches the server's minimum. Stated up front, not discovered on submit. */
const MIN_PASSWORD_LENGTH = 12;

export function SignUpForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ password?: string }>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (password.length < MIN_PASSWORD_LENGTH) {
      // Client-side check for speed only. The server enforces the real rule -
      // this is cosmetic, exactly like every role check in the UI.
      setFieldErrors({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    setFieldErrors({});
    setPending(true);

    const { error: signUpError } = await authClient.signUp.email({ name, email, password });

    if (signUpError) {
      setError(signUpError.message ?? 'Could not create the account.');
      setPending(false);
      return;
    }

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
            We sent a confirmation link to <span className="text-fg font-medium">{email}</span>.
            Open it to finish setting up your account.
          </p>
          <p className="text-fg-subtle text-[12px]">
            No email? Check spam, or{' '}
            <button
              type="button"
              className="text-accent font-medium hover:underline"
              onClick={() => setSent(false)}
            >
              try a different address
            </button>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-fg-muted text-[13px]">Free while you are setting things up.</p>
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
          <Field label="Your name" required>
            {(props) => (
              <Input
                {...props}
                name="name"
                autoComplete="name"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <Field label="Work email" required>
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

          <Field
            label="Password"
            required
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={fieldErrors.password}
          >
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
            {pending ? <Spinner label="Creating account" /> : null}
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-fg-muted text-center text-[13px]">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
