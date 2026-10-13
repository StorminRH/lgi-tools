/** The slice of BroadcastChannel a peer link drives; tests inject a fake bus. */
export type PeerChannelPort = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
};

export interface PeerChannel {
  /** Read it each time: the link drops on its own when a post or a receive fails. */
  readonly connected: boolean;
  /** Does nothing once disconnected, and disconnects when postMessage throws. */
  post(message: unknown): void;
  /** Idempotent. */
  close(): void;
}

/**
 * Opens a cross-tab link named `JSON.stringify(key)` and wires its handlers
 * before returning, so a post straight after opening reaches peers. The link
 * goes down for good when `open` throws (no BroadcastChannel), on
 * `messageerror`, when a post throws, or on `close()`. Going down nulls the
 * handlers, swallows a throwing `port.close()`, then calls `onDisconnect`
 * exactly once. `onMessage` only hears messages while the link is up.
 */
export function openPeerChannel(input: {
  readonly key: readonly string[];
  readonly open: (name: string) => PeerChannelPort;
  readonly onMessage: (data: unknown) => void;
  readonly onDisconnect?: () => void;
}): PeerChannel {
  let port: PeerChannelPort | null = null;
  let down = false;
  const disconnect = () => {
    const previous = port;
    port = null;
    if (previous !== null) {
      previous.onmessage = null;
      previous.onmessageerror = null;
      try {
        previous.close();
      } catch {
      }
    }
    if (down) return;
    down = true;
    input.onDisconnect?.();
  };
  try {
    port = input.open(JSON.stringify(input.key));
    port.onmessage = (event) => {
      if (port !== null) input.onMessage(event.data);
    };
    port.onmessageerror = disconnect;
  } catch {
    disconnect();
  }
  return {
    get connected() {
      return port !== null;
    },
    post(message) {
      if (port === null) return;
      try {
        port.postMessage(message);
      } catch {
        disconnect();
      }
    },
    close: disconnect,
  };
}
