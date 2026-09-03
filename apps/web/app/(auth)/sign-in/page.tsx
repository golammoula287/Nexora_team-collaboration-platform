import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <SignInForm
      next={params.next ?? '/'}
      {...(params.error === undefined ? {} : { initialError: params.error })}
    />
  );
}
