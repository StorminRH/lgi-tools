import type { PeerChannelPort } from '../peer-channel';

class TestChannel implements PeerChannelPort {
  onmessage: PeerChannelPort['onmessage'] = null;
  onmessageerror: PeerChannelPort['onmessageerror'] = null;
  closed = false;
  failPosts = false;

  constructor(readonly name: string, private readonly bus: TestBus) {}

  postMessage(data: unknown) {
    if (this.closed || this.failPosts) throw new Error('channel unavailable');
    this.bus.send(this, data);
  }

  close() {
    this.closed = true;
  }

  /** Hands `data` to this channel's handler straight away, skipping the queue. */
  deliver(data: unknown) {
    if (!this.closed) this.onmessage?.(new MessageEvent('message', { data }));
  }
}

class TestBus {
  readonly channels: TestChannel[] = [];
  queue: Array<() => void> = [];
  unavailable = false;

  open = (name: string): TestChannel => {
    if (this.unavailable) throw new Error('BroadcastChannel unavailable');
    const channel = new TestChannel(name, this);
    this.channels.push(channel);
    return channel;
  };

  send(sender: TestChannel, data: unknown) {
    for (const receiver of this.channels) {
      if (receiver === sender || receiver.closed || receiver.name !== sender.name) continue;
      const cloned = structuredClone(data);
      this.queue.push(() => receiver.deliver(cloned));
    }
  }

  flush() {
    while (this.queue.length > 0) this.queue.shift()?.();
  }
}

/**
 * An in-memory BroadcastChannel for tests of peer-link consumers. Pass
 * `bus.open` as the opener. A post clones the message and queues it for every
 * other open channel with the same name, and `flush()` delivers the queue, so
 * a test decides when peers hear each other. `unavailable` makes `open` throw
 * as if BroadcastChannel were missing; a channel's `failPosts` makes its posts
 * throw, as does posting after `close()`.
 */
export function createBroadcastBus() {
  return new TestBus();
}

export type BroadcastBus = ReturnType<typeof createBroadcastBus>;
