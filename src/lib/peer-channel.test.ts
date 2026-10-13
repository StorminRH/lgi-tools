import { expect, test, vi } from 'vitest';
import { type BroadcastBus, createBroadcastBus } from './__tests__/broadcast-bus';
import { openPeerChannel } from './peer-channel';

function join(bus: BroadcastBus, key: readonly string[] = ['lgi-test-v1', 'user-a']) {
  const received: unknown[] = [];
  const onDisconnect = vi.fn();
  const link = openPeerChannel({
    key, open: bus.open, onMessage: (data) => received.push(data), onDisconnect,
  });
  return { link, received, onDisconnect };
}

test('reaches same-name peers from a post straight after opening and goes quiet once closed', () => {
  const bus = createBroadcastBus();
  const peer = join(bus);
  const otherUser = join(bus, ['lgi-test-v1', 'user-b']);
  const tab = join(bus);
  tab.link.post({ hello: 'joined' });
  expect(bus.channels.map((channel) => channel.name)).toEqual([
    '["lgi-test-v1","user-a"]',
    '["lgi-test-v1","user-b"]',
    '["lgi-test-v1","user-a"]',
  ]);
  expect(tab.link.connected).toBe(true);
  bus.flush();
  expect(peer.received).toEqual([{ hello: 'joined' }]);
  expect(otherUser.received).toEqual([]);
  expect(tab.received).toEqual([]);

  peer.link.post({ hello: 'welcome' });
  bus.flush();
  expect(tab.received).toEqual([{ hello: 'welcome' }]);

  const channel = bus.channels[2]!;
  const staleHandler = channel.onmessage;
  expect(tab.onDisconnect).not.toHaveBeenCalled();
  tab.link.close();
  expect(tab.link.connected).toBe(false);
  expect(channel.closed).toBe(true);
  expect(channel.onmessage).toBeNull();
  expect(channel.onmessageerror).toBeNull();
  expect(tab.onDisconnect).toHaveBeenCalledOnce();
  staleHandler?.(new MessageEvent('message', { data: 'late' }));
  tab.link.post('after close');
  tab.link.close();
  bus.flush();
  expect(tab.received).toEqual([{ hello: 'welcome' }]);
  expect(peer.received).toEqual([{ hello: 'joined' }]);
  expect(tab.onDisconnect).toHaveBeenCalledOnce();
});

test('drops the link for good when a post throws or a message cannot be read', () => {
  const bus = createBroadcastBus();
  const posting = join(bus);
  const reading = join(bus);
  const [postChannel, readChannel] = bus.channels;

  postChannel!.failPosts = true;
  posting.link.post('lost');
  expect(posting.link.connected).toBe(false);
  expect(postChannel!.closed).toBe(true);
  expect(postChannel!.onmessage).toBeNull();
  expect(posting.onDisconnect).toHaveBeenCalledOnce();
  posting.link.post('ignored');
  posting.link.close();
  expect(posting.onDisconnect).toHaveBeenCalledOnce();

  readChannel!.onmessageerror?.(new MessageEvent('messageerror'));
  expect(reading.link.connected).toBe(false);
  expect(readChannel!.closed).toBe(true);
  expect(readChannel!.onmessageerror).toBeNull();
  expect(reading.onDisconnect).toHaveBeenCalledOnce();
});

test('reports a link that could not open as down and makes posting a no-op', () => {
  const bus = createBroadcastBus();
  bus.unavailable = true;
  const { link, onDisconnect } = join(bus);
  expect(link.connected).toBe(false);
  expect(onDisconnect).toHaveBeenCalledOnce();
  link.post('nowhere');
  link.close();
  expect(onDisconnect).toHaveBeenCalledOnce();
  expect(bus.channels).toEqual([]);
});

test('closes cleanly when the port throws on close', () => {
  const port = {
    onmessage: null, onmessageerror: null, postMessage: vi.fn(),
    close: vi.fn(() => { throw new Error('already closed'); }),
  };
  const onDisconnect = vi.fn();
  const link = openPeerChannel({ key: ['k'], open: () => port, onMessage: vi.fn(), onDisconnect });
  link.close();
  expect(port.close).toHaveBeenCalledOnce();
  expect(port.onmessage).toBeNull();
  expect(link.connected).toBe(false);
  expect(onDisconnect).toHaveBeenCalledOnce();
});
