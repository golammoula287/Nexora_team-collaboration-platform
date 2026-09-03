import { PageHeader } from '@nexora/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../../lib/api.server';
import { withQuery } from '../../../../lib/routes';
import { TwoFactorSetup } from './two-factor';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  const api = await serverApi();
  const response = await api.me.$get();

  if (response.status === 401) {
    redirect(withQuery('/sign-in', { next: '/account/settings' }));
  }

  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <PageHeader title="Security" description="How you sign in, and what protects the account." />

      {/* Whether 2FA is on is read by the client from the session, which is
          already loaded there - fetching it again here would be a second round
          trip for the same fact. */}
      <TwoFactorSetup enabled={false} />
    </main>
  );
}
