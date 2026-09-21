'use client';

import { useBroadcastEvent, useEventListener, useOthers } from '@liveblocks/react';
import { boardRoom } from '@nexora/shared';
import { useRouter } from 'next/navigation';
import { RealtimeRoom, realtimeConfigured } from '../../../../../../components/realtime/room';
import { BoardView } from './board-view';
import type { ViewColumn, ViewTask } from './shared';

type Props = {
  orgSlug: string;
  organizationId: string;
  projectId: string;
  columns: ViewColumn[];
  tasks: ViewTask[];
  selected: Set<string>;
  onToggle: (taskId: string) => void;
};

export function RealtimeBoard(props: Props) {
  if (!realtimeConfigured || !props.organizationId) return <BoardView {...props} />;
  return (
    <RealtimeRoom orgSlug={props.orgSlug} roomId={boardRoom(props.organizationId, props.projectId)}>
      <ConnectedBoard {...props} />
    </RealtimeRoom>
  );
}

function ConnectedBoard(props: Props) {
  const router = useRouter();
  const broadcast = useBroadcastEvent();
  const others = useOthers();
  useEventListener(({ event }) => {
    if (
      event &&
      typeof event === 'object' &&
      !Array.isArray(event) &&
      event.type === 'BOARD_CHANGED'
    )
      router.refresh();
  });
  return (
    <>
      {others.length > 0 && (
        <p className="text-fg-muted text-xs" aria-label="People viewing this board">
          {others.length} other {others.length === 1 ? 'person' : 'people'} here
        </p>
      )}
      <BoardView {...props} onMoved={() => broadcast({ type: 'BOARD_CHANGED' })} />
    </>
  );
}
