/** Room names include both tenant and resource IDs so a token never spans tenants. */
export function documentRoom(organizationId: string, documentId: string) {
  return `org:${organizationId}:doc:${documentId}`;
}

export function boardRoom(organizationId: string, projectId: string) {
  return `org:${organizationId}:project:${projectId}:board`;
}

export function parseRealtimeRoom(room: string) {
  const document = /^org:([0-9a-f-]{36}):doc:([0-9a-f-]{36})$/.exec(room);
  if (document?.[1] && document[2])
    return { kind: 'document' as const, organizationId: document[1], id: document[2] };
  const board = /^org:([0-9a-f-]{36}):project:([0-9a-f-]{36}):board$/.exec(room);
  if (board?.[1] && board[2])
    return { kind: 'board' as const, organizationId: board[1], id: board[2] };
  return null;
}
