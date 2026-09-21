'use client';

import { useOthers, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import { documentRoom } from '@nexora/shared';
import { RealtimeRoom, realtimeConfigured } from '../../../../../components/realtime/room';
import { DocumentEditor } from './document-editor';
import type { DocumentEditorProps } from './document-editor';

export function RealtimeDocument(
  props: DocumentEditorProps & { organizationId: string; userId: string; userName: string },
) {
  if (!realtimeConfigured) return <DocumentEditor {...props} />;
  return (
    <RealtimeRoom
      orgSlug={props.orgSlug}
      roomId={documentRoom(props.organizationId, props.document.id)}
    >
      <ConnectedDocument {...props} />
    </RealtimeRoom>
  );
}

function ConnectedDocument(props: DocumentEditorProps & { userId: string; userName: string }) {
  const room = useRoom();
  const provider = getYjsProviderForRoom(room, { offlineSupport_experimental: true });
  const others = useOthers();
  const colors = ['#b45309', '#0f766e', '#7c3aed', '#0369a1', '#be123c'];
  const color = colors[[...props.userId].reduce((hash, char) => hash + char.charCodeAt(0), 0) % colors.length] ?? '#0369a1';
  return (
    <DocumentEditor
      {...props}
      collaboration={{ provider, name: props.userName, color }}
      collaborators={others.map((other) => ({
        id: other.connectionId,
        name: String(other.info?.name ?? 'Collaborator'),
      }))}
    />
  );
}
