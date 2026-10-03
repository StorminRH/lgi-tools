export function emptyDataText(needsReconnect: boolean): string {
  return needsReconnect ? 'Nothing synced for this character.' : 'Awaiting first sync.';
}
