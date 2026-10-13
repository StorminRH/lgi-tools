import { openPeerChannel, type PeerChannelPort } from '@/lib/peer-channel';
import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { type HeartbeatHost, startHeartbeatLoop } from './heartbeat-loop';
import { createHeartbeatPeers } from './heartbeat-peers';

type SessionHost = Parameters<typeof startHeartbeatSession>[0];
type SessionInput = Parameters<typeof startHeartbeatSession>[1];

function joinHeartbeatSession(host: SessionHost, input: SessionInput) {
  const tabId = host.createTabId();
  let active = true;
  const peers = createHeartbeatPeers({ tabId, characterIdsHint: input.characterIdsHint });

  const advertise = (kind: 'join' | 'state' | 'leave') => {
    link.post(kind === 'leave'
      ? { kind, tabId }
      : { kind, tabId, visible: host.isVisible(), characterIdsHint: input.characterIdsHint });
  };

  const intervalBeat = () => {
    if (!active) return;
    const visible = host.isVisible();
    const selection = peers.select(visible, host.now());
    if (link.connected && !selection.isLeader) return;
    host.beat({
      reason: 'interval', visible, tabId,
      characterIdsHint: link.connected ? selection.characterIdsHint : input.characterIdsHint,
    });
  };

  const link = openPeerChannel({
    key: ['lgi-sync-heartbeat-v1', input.userId, input.dataset],
    open: host.openChannel,
    onMessage(data) {
      if (!active) return;
      const kind = peers.receive(data, host.now());
      if (kind === 'join') advertise('state');
      if (kind === 'leave') intervalBeat();
    },
  });
  advertise('join');

  const loop = startHeartbeatLoop({
    isVisible: host.isVisible,
    startInterval: host.startInterval,
    beat(reason, visible) {
      if (!active) return;
      if (reason === 'interval') {
        advertise('state');
        intervalBeat();
      } else {
        host.beat({ reason, visible, tabId, characterIdsHint: input.characterIdsHint });
      }
    },
  }, HEARTBEAT_MS);

  return {
    onVisibilityChange() {
      if (!active) return;
      advertise('state');
      loop.onVisibilityChange();
    },
    stop(sendLeave: boolean) {
      if (!active) return;
      active = false;
      loop.stop();
      advertise('leave');
      link.close();
      if (sendLeave) host.leave(tabId);
    },
  };
}

export function startHeartbeatSession(host: Omit<HeartbeatHost, 'beat'> & {
  now(): number;
  createTabId(): string;
  openChannel(name: string): PeerChannelPort;
  beat(input: {
    reason: Parameters<HeartbeatHost['beat']>[0];
    visible: boolean;
    characterIdsHint: number[];
    tabId: string;
  }): void;
  leave(tabId: string): void;
}, input: {
  dataset: SyncDataset;
  userId: string;
  characterIdsHint: number[];
}) {
  let session = input.characterIdsHint.length > 0 ? joinHeartbeatSession(host, input) : null;
  let stopped = false;

  return {
    onVisibilityChange() {
      session?.onVisibilityChange();
    },
    onPageHide(event: { persisted: boolean }) {
      session?.stop(!event.persisted);
      session = null;
      if (!event.persisted) stopped = true;
    },
    onPageShow(event: { persisted: boolean }) {
      if (event.persisted && !stopped && !session && input.characterIdsHint.length > 0) {
        session = joinHeartbeatSession(host, input);
      }
    },
    stop() {
      stopped = true;
      session?.stop(false);
      session = null;
    },
  };
}
