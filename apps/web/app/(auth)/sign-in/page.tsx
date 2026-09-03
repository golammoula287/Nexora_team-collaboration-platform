import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../lib/api.server';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Bounce an already-signed-in visitor, but only on a real session check -
  // proxy.ts cannot tell a valid cookie from a revoked one.
  const api = await serverApi();
  const me = await api.me.$get();
  if (me.ok) redirect('/');

  return (
    <SignInForm
      next={params.next ?? '/'}
      {...(params.error === undefined ? {} : { initialError: params.error })}
    />
  );
}
