import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { type HeartbeatHost, startHeartbeatLoop } from './heartbeat-loop';
import { createHeartbeatPeers } from './heartbeat-peers';

type SessionHost = Parameters<typeof startHeartbeatSession>[0];
type SessionInput = Parameters<typeof startHeartbeatSession>[1];
type Channel = ReturnType<SessionHost['openChannel']>;

function joinHeartbeatSession(host: SessionHost, input: SessionInput) {
  const tabId = host.createTabId();
  let active = true;
  let channel: Channel | null = null;
  const peers = createHeartbeatPeers({ tabId, characterIdsHint: input.characterIdsHint });

  const disconnect = () => {
    const previous = channel;
    channel = null;
    if (!previous) return;
    previous.onmessage = null;
    previous.onmessageerror = null;
    try {
      previous.close();
    } catch {
    }
  };

  const advertise = (kind: 'join' | 'state' | 'leave') => {
    try {
      channel?.postMessage(kind === 'leave'
        ? { kind, tabId }
        : { kind, tabId, visible: host.isVisible(), characterIdsHint: input.characterIdsHint });
    } catch {
      disconnect();
    }
  };

  const intervalBeat = () => {
    if (!active) return;
    const visible = host.isVisible();
    const selection = peers.select(visible, host.now());
    if (channel && !selection.isLeader) return;
    host.beat({
      reason: 'interval', visible, tabId,
      characterIdsHint: channel ? selection.characterIdsHint : input.characterIdsHint,
    });
  };

  try {
    channel = host.openChannel(JSON.stringify(['lgi-sync-heartbeat-v1', input.userId, input.dataset]));
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!active || !channel) return;
      const kind = peers.receive(event.data, host.now());
      if (kind === 'join') advertise('state');
      if (kind === 'leave') intervalBeat();
    };
    channel.onmessageerror = disconnect;
    advertise('join');
  } catch {
    disconnect();
  }

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
      disconnect();
      if (sendLeave) host.leave(tabId);
    },
  };
}

export function startHeartbeatSession(host: Omit<HeartbeatHost, 'beat'> & {
  now(): number;
  createTabId(): string;
  openChannel(name: string): Pick<BroadcastChannel, 'postMessage' | 'close'> & {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  };
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
