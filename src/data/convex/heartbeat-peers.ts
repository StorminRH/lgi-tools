import { HEARTBEAT_MS } from '@/lib/sync-engine';

export const HEARTBEAT_PEER_TIMEOUT_MS = 3 * HEARTBEAT_MS;

type Presence = Parameters<typeof createHeartbeatPeers>[0] & { visible: boolean };

type PeerMessage =
  | (Presence & { kind: 'join' | 'state' })
  | { kind: 'leave'; tabId: string };

function parsePresence(input: object): Omit<Presence, 'tabId'> | null {
  if (!('visible' in input) || typeof input.visible !== 'boolean') return null;
  if (!('characterIdsHint' in input) || !Array.isArray(input.characterIdsHint)) return null;
  const characterIdsHint: number[] = [];
  for (const id of input.characterIdsHint) {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
    characterIdsHint.push(id);
  }
  return characterIdsHint.length > 0 ? { visible: input.visible, characterIdsHint } : null;
}

function parsePeerMessage(input: unknown): PeerMessage | null {
  if (typeof input !== 'object' || input === null) return null;
  if (!('tabId' in input) || typeof input.tabId !== 'string' || input.tabId === '') return null;
  if (!('kind' in input)) return null;
  if (input.kind === 'leave') return { kind: 'leave', tabId: input.tabId };
  if (input.kind !== 'join' && input.kind !== 'state') return null;
  const presence = parsePresence(input);
  return presence ? { kind: input.kind, tabId: input.tabId, ...presence } : null;
}

export function createHeartbeatPeers(local: { tabId: string; characterIdsHint: number[] }) {
  const peers = new Map<string, Presence & { receivedAt: number }>();

  const prune = (now: number) => {
    for (const [id, peer] of peers) {
      if (now - peer.receivedAt >= HEARTBEAT_PEER_TIMEOUT_MS) peers.delete(id);
    }
  };

  return {
    receive(input: unknown, now: number) {
      const message = parsePeerMessage(input);
      if (!message || message.tabId === local.tabId) return null;
      if (message.kind === 'leave') {
        return peers.delete(message.tabId) ? 'leave' : null;
      }
      peers.set(message.tabId, { ...message, receivedAt: now });
      return message.kind;
    },
    select(visible: boolean, now: number) {
      prune(now);
      let leader: Presence = { ...local, visible };
      const hints = new Set(local.characterIdsHint);
      for (const peer of peers.values()) {
        for (const id of peer.characterIdsHint) hints.add(id);
        if ((peer.visible && !leader.visible) ||
          (peer.visible === leader.visible && peer.tabId < leader.tabId)) {
          leader = peer;
        }
      }
      return {
        isLeader: leader.tabId === local.tabId,
        characterIdsHint: [...hints].sort((a, b) => a - b),
      };
    },
  };
}
