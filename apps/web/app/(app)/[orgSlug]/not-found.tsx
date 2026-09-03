import { EmptyState } from '@nexora/ui';

export default function OrgNotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This workspace does not exist, or you are not a member of it."
      action={{ label: 'Go to your workspaces', href: '/' }}
    />
  );
}
