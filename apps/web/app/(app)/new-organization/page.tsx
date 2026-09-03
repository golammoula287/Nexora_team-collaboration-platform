import type { Metadata } from 'next';
import { CreateOrganizationForm } from './create-organization-form';

export const metadata: Metadata = { title: 'New organization' };

export default function NewOrganizationPage() {
  return (
    <main id="main" className="mx-auto max-w-[420px] px-4 py-16">
      <CreateOrganizationForm />
    </main>
  );
}
