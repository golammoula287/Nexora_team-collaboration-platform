'use client';

import { Button, Card, CardContent, Field, Input, Separator, Spinner } from '@nexora/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '../../../lib/auth-client';
import { safeNext } from '../../../lib/routes';

/**
 * Sign in.
 *
 * Errors are surfaced in one place with `role="alert"` so a screen reader
 * announces a failed attempt; the submit button reports its own busy state
 * rather than silently doing nothing.
 */
export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, setPending] = useState(false);
  const [socialPending, setSocialPending] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      callbackURL: next,
    });

    if (signInError) {
      // Deliberately not "no account with that email" - that confirms which
      // addresses are registered.
      setError(signInError.message ?? 'Could not sign in. Check your email and password.');
      setPending(false);
      return;
    }

    // safeNext refuses an off-origin target - ?next= is an open-redirect vector.
    router.push(safeNext(next));
    router.refresh();
  }

  async function signInWith(provider: 'google' | 'github' | 'microsoft') {
    setSocialPending(provider);
    setError(undefined);
    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL: next,
    });
    if (socialError) {
      setError(socialError.message ?? `Could not sign in with ${provider}.`);
      setSocialPending(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-fg-muted text-[13px]">Welcome back.</p>
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

          <Field label="Password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          <div className="flex justify-end">
            <Link
              href="/reset-password"
              className="text-fg-muted hover:text-fg text-[12px] hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Spinner label="Signing in" /> : null}
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-fg-subtle text-[11px] tracking-wider uppercase">or</span>
          <Separator className="flex-1" />
        </div>

        <div className="grid gap-2">
          {(['google', 'github', 'microsoft'] as const).map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              size="lg"
              className="w-full capitalize"
              onClick={() => signInWith(provider)}
              disabled={socialPending !== null}
              aria-busy={socialPending === provider}
            >
              {socialPending === provider ? (
                <Spinner label={`Signing in with ${provider}`} />
              ) : null}
              Continue with {provider}
            </Button>
          ))}
        </div>

        <p className="text-fg-muted text-center text-[13px]">
          New to Nexora?{' '}
          <Link href="/sign-up" className="text-accent font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
