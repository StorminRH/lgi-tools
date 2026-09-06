import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS } from '@/lib/sync-engine';
import { HEARTBEAT_PEER_TIMEOUT_MS } from './heartbeat-peers';
import { startHeartbeatSession } from './heartbeat-session';

type Host = Parameters<typeof startHeartbeatSession>[0];
type Channel = ReturnType<Host['openChannel']>;
type Beat = Parameters<Host['beat']>[0];

class TestChannel implements Channel {
  onmessage: Channel['onmessage'] = null;
  onmessageerror: Channel['onmessageerror'] = null;
  closed = false;
  failPosts = false;

  constructor(readonly name: string, private bus: TestBus) {}

  postMessage(data: unknown) {
    if (this.closed || this.failPosts) throw new Error('channel unavailable');
    this.bus.send(this, data);
  }

  close() {
    this.closed = true;
  }

  deliver(data: unknown) {
    if (!this.closed) this.onmessage?.(new MessageEvent('message', { data }));
  }
}

class TestBus {
  channels: TestChannel[] = [];
  queue: Array<() => void> = [];
  unavailable = false;

  open = (name: string) => {
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

function participant(bus: TestBus, id: string, options: {
  visible?: boolean;
  hints?: number[];
  userId?: string;
} = {}) {
  let visible = options.visible ?? true;
  let generation = 0;
  const beats: Beat[] = [];
  const leaves: string[] = [];
  const session = startHeartbeatSession({
    now: () => Date.now(),
    createTabId: () => `${id}-${++generation}`,
    isVisible: () => visible,
    openChannel: bus.open,
    beat: (beat) => beats.push(beat),
    leave: (tabId) => leaves.push(tabId),
    startInterval(tick, ms) {
      const timer = setInterval(tick, ms);
      return () => clearInterval(timer);
    },
  }, {
    dataset: 'characterLocation', userId: options.userId ?? 'user-a',
    characterIdsHint: options.hints ?? [100],
  });
  return {
    session, beats, leaves,
    intervals: () => beats.filter((beat) => beat.reason === 'interval'),
    visibility(next: boolean) {
      visible = next;
      session.onVisibilityChange();
    },
  };
}

function advance(bus: TestBus, ms = HEARTBEAT_MS) {
  vi.advanceTimersByTime(ms);
  bus.flush();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('heartbeat participants', () => {
  it.each([1, 2, 3])('converges %i participants to one interval writer while each mounts', (count) => {
    const bus = new TestBus();
    const tabs = Array.from({ length: count }, (_, index) => participant(bus, `${index}`));
    bus.flush();
    expect(tabs.every((tab) => tab.beats[0]?.reason === 'mount')).toBe(true);
    advance(bus);
    expect(tabs.flatMap((tab) => tab.intervals())).toHaveLength(1);
    advance(bus);
    expect(tabs.flatMap((tab) => tab.intervals())).toHaveLength(2);
  });

  it('unions and deduplicates distinct current hints without changing direct beats', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a', { hints: [100, 200] });
    const second = participant(bus, 'b', { hints: [200, 300] });
    const third = participant(bus, 'c', { hints: [400] });
    bus.flush();
    advance(bus);
    expect(first.intervals()[0]?.characterIdsHint).toEqual([100, 200, 300, 400]);
    expect(second.beats[0]?.characterIdsHint).toEqual([200, 300]);
    expect(third.beats[0]?.characterIdsHint).toEqual([400]);
    second.visibility(true);
    expect(second.beats.at(-1)).toMatchObject({ reason: 'visible', characterIdsHint: [200, 300] });
  });

  it('prefers a visible peer and transfers to a hidden peer when all become hidden', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a', { visible: false });
    const second = participant(bus, 'b');
    bus.flush();
    advance(bus);
    expect(first.intervals()).toHaveLength(0);
    expect(second.intervals()).toHaveLength(1);
    second.visibility(false);
    bus.flush();
    advance(bus);
    expect(first.intervals()).toMatchObject([{ visible: false }]);
    expect(second.intervals()).toHaveLength(1);
    second.visibility(true);
    bus.flush();
    expect(second.beats.at(-1)).toMatchObject({ reason: 'visible', visible: true });
    advance(bus);
    expect(second.intervals()).toHaveLength(2);
  });

  it('rephases a returning tab interval while sending its direct visible beat', () => {
    const bus = new TestBus();
    const tab = participant(bus, 'a', { visible: false });
    advance(bus, 10_000);
    tab.visibility(true);
    advance(bus, 10_000);
    expect(tab.intervals()).toHaveLength(0);
    advance(bus, 10_000);
    expect(tab.intervals()).toHaveLength(1);
    expect(tab.beats.map((beat) => beat.reason)).toEqual(['mount', 'visible', 'interval']);
  });

  it('keeps an isolated hidden tab beating', () => {
    const bus = new TestBus();
    const tab = participant(bus, 'a', { visible: false });
    advance(bus);
    advance(bus);
    expect(tab.beats.map((beat) => beat.visible)).toEqual([false, false, false]);
  });

  it('sends the server-fenced leave and hands off immediately on graceful close', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a', { hints: [100] });
    const second = participant(bus, 'b', { hints: [200] });
    bus.flush();
    first.session.onPageHide({ persisted: false });
    bus.flush();
    expect(first.leaves).toEqual(['a-1']);
    expect(second.intervals()).toMatchObject([{ characterIdsHint: [200] }]);
    advance(bus);
    first.visibility(true);
    first.session.onPageShow({ persisted: true });
    expect(first.beats).toHaveLength(1);
    expect(second.intervals()).toHaveLength(2);
  });

  it('sends leaves when all tabs close before peer messages can be delivered', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a');
    const second = participant(bus, 'b');
    bus.flush();
    first.session.onPageHide({ persisted: false });
    second.session.onPageHide({ persisted: false });
    expect(first.leaves).toEqual(['a-1']);
    expect(second.leaves).toEqual(['b-1']);
    bus.flush();
    advance(bus);
    expect(first.beats).toHaveLength(1);
    expect(second.beats).toHaveLength(1);
  });

  it('sends the final leave even while a crashed peer remains cached', () => {
    const bus = new TestBus();
    const crashed = participant(bus, 'a');
    const survivor = participant(bus, 'b');
    bus.flush();
    crashed.session.stop();
    bus.queue = [];
    survivor.session.onPageHide({ persisted: false });
    expect(survivor.leaves).toEqual(['b-1']);
  });

  it('expires a crashed leader and its hints using local receipt time', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a', { hints: [100] });
    const second = participant(bus, 'b', { hints: [200] });
    bus.flush();
    first.session.stop();
    bus.queue = [];
    advance(bus, HEARTBEAT_PEER_TIMEOUT_MS - 1);
    expect(second.intervals()).toHaveLength(0);
    advance(bus, 1);
    expect(second.intervals()).toMatchObject([{ characterIdsHint: [200] }]);
  });

  it('ignores malformed, empty-hint, and self messages', () => {
    const bus = new TestBus();
    const tab = participant(bus, 'z');
    const channel = bus.channels[0];
    for (const data of [
      null, 'state', {}, { kind: 'other', tabId: 'a' },
      { kind: 'state', tabId: 'a', visible: 'true', characterIdsHint: [1] },
      { kind: 'state', tabId: 'a', visible: true, characterIdsHint: [NaN] },
      { kind: 'state', tabId: 'a', visible: true, characterIdsHint: ['1'] },
      { kind: 'state', tabId: 'a', visible: true, characterIdsHint: [] },
      { kind: 'state', tabId: 'z-1', visible: true, characterIdsHint: [999] },
    ]) channel?.deliver(data);
    advance(bus);
    expect(tab.intervals()).toMatchObject([{ characterIdsHint: [100] }]);
  });

  it('falls back independently if BroadcastChannel is unavailable', () => {
    const bus = new TestBus();
    bus.unavailable = true;
    const first = participant(bus, 'a');
    const second = participant(bus, 'b');
    advance(bus);
    expect(first.intervals()).toHaveLength(1);
    expect(second.intervals()).toHaveLength(1);
  });

  it.each(['post', 'receive'])('falls back when channel %s fails', (failure) => {
    const bus = new TestBus();
    participant(bus, 'a', { hints: [200] });
    const second = participant(bus, 'b');
    bus.flush();
    const channel = bus.channels[1];
    if (!channel) throw new Error('missing test channel');
    if (failure === 'post') channel.failPosts = true;
    else channel.onmessageerror?.(new MessageEvent('messageerror'));
    advance(bus);
    expect(channel.closed).toBe(true);
    expect(second.intervals()).toMatchObject([{ characterIdsHint: [100] }]);
  });

  it('suspends in bfcache and rejoins with a fresh ID and immediate beat', () => {
    const bus = new TestBus();
    const tab = participant(bus, 'a');
    tab.session.onPageShow({ persisted: false });
    expect(tab.beats).toHaveLength(1);
    tab.session.onPageHide({ persisted: true });
    tab.visibility(true);
    advance(bus, HEARTBEAT_PEER_TIMEOUT_MS);
    expect(tab.beats).toHaveLength(1);
    expect(tab.leaves).toEqual([]);
    expect(bus.channels[0]?.closed).toBe(true);
    tab.session.onPageShow({ persisted: true });
    expect(tab.beats.map((beat) => beat.tabId)).toEqual(['a-1', 'a-2']);
    expect(tab.beats[1]?.reason).toBe('mount');
    expect(bus.channels[1]?.closed).toBe(false);
    advance(bus);
    expect(tab.intervals()).toHaveLength(1);
  });

  it('sends one leave for an isolated discarded document and stops all future beats', () => {
    const bus = new TestBus();
    const tab = participant(bus, 'a');
    tab.session.onPageHide({ persisted: false });
    tab.session.onPageHide({ persisted: false });
    tab.visibility(true);
    advance(bus);
    expect(tab.leaves).toEqual(['a-1']);
    expect(tab.beats).toHaveLength(1);
  });

  it('withdraws removed hints on cleanup without a beacon and ignores late restoration', () => {
    const bus = new TestBus();
    const first = participant(bus, 'a', { hints: [100] });
    const second = participant(bus, 'b', { hints: [200] });
    bus.flush();
    first.session.stop();
    first.session.onPageShow({ persisted: true });
    bus.flush();
    expect(first.leaves).toEqual([]);
    expect(second.intervals()).toMatchObject([{ characterIdsHint: [200] }]);
    const empty = participant(bus, 'empty', { hints: [] });
    empty.session.onPageShow({ persisted: true });
    advance(bus);
    expect(empty.beats).toEqual([]);
    expect(first.beats).toHaveLength(1);
    expect(bus.channels).toHaveLength(2);
  });

  it('isolates users and withdraws the old account before replacement', () => {
    const bus = new TestBus();
    const old = participant(bus, 'a', { userId: 'old', hints: [100] });
    const other = participant(bus, 'b', { userId: 'new', hints: [200] });
    bus.flush();
    advance(bus);
    expect(old.intervals()).toMatchObject([{ characterIdsHint: [100] }]);
    expect(other.intervals()).toMatchObject([{ characterIdsHint: [200] }]);
    old.session.stop();
    const replacement = participant(bus, 'a', { userId: 'new', hints: [300] });
    bus.flush();
    advance(bus);
    expect(old.intervals()).toHaveLength(1);
    expect(old.leaves).toEqual([]);
    expect(bus.channels[0]?.closed).toBe(true);
    expect(replacement.intervals()).toMatchObject([{ characterIdsHint: [200, 300] }]);
    expect(other.intervals()).toHaveLength(1);
  });
});
