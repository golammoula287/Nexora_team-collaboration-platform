'use client';

import { Button, Card, CardContent, Field, Input, Spinner } from '@nexora/ui';
import { createOrganizationSchema } from '@nexora/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '../../../lib/auth-client';

/** Turns a display name into a usable slug as the user types. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Once the user edits the slug themselves, stop overwriting it.
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    // The same schema the API validates with, so the two cannot disagree.
    const parsed = createOrganizationSchema.safeParse({ name, slug: effectiveSlug });
    if (!parsed.success) {
      const next: { name?: string; slug?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name') next.name = issue.message;
        if (field === 'slug') next.slug = issue.message;
      }
      setErrors(next);
      return;
    }

    setPending(true);

    const { error } = await authClient.organization.create({
      name: parsed.data.name,
      slug: parsed.data.slug,
    });

    if (error) {
      setErrors({
        form:
          error.message ?? 'Could not create the organization. That address may already be taken.',
      });
      setPending(false);
      return;
    }

    router.push(`/${parsed.data.slug}`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="text-fg-muted text-[13px]">
            You will be its owner. You can invite people straight afterwards.
          </p>
        </div>

        {errors.form ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-sm border px-3 py-2 text-[13px]"
          >
            {errors.form}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Workspace name" required error={errors.name}>
            {(props) => (
              <Input
                {...props}
                name="name"
                placeholder="Northwind Studio"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Workspace address"
            required
            hint="Used in every link: nexora.app/your-address"
            error={errors.slug}
          >
            {(props) => (
              <Input
                {...props}
                name="slug"
                placeholder="northwind"
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
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
            {pending ? <Spinner label="Creating workspace" /> : null}
            {pending ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
