'use client';

import { LiveblocksProvider, RoomProvider } from '@liveblocks/react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';

export const realtimeConfigured = Boolean(process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY);

export function RealtimeRoom({
  orgSlug,
  roomId,
  children,
}: {
  orgSlug: string;
  roomId: string;
  children: ReactNode;
}) {
  return (
    <LiveblocksProvider
      authEndpoint={async (room) => {
        if (!room) throw new Error('A room is required.');
        const response = await api.orgs[':orgSlug']['liveblocks-auth'].$post({
          param: { orgSlug },
          json: { room },
        });
        if (!response.ok) throw new Error('Could not join the collaboration room.');
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          !('token' in result) ||
          typeof result.token !== 'string'
        ) {
          throw new Error('Invalid collaboration token.');
        }
        return { token: result.token };
      }}
    >
      <RoomProvider id={roomId} initialPresence={{}}>
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  );
}
