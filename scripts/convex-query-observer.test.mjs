import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { observeConvexQueries } from '../docs/ux-check/lib/convex-query-observer.mjs';

function connect(page, url = 'ws://localhost:3210/api/1.45.0/sync') {
  const socket = Object.assign(new EventEmitter(), { url: () => url });
  page.emit('websocket', socket);
  return socket;
}

function send(socket, modifications) {
  socket.emit('framesent', {
    payload: JSON.stringify({ type: 'ModifyQuerySet', modifications }),
  });
}

const add = (queryId, systemId, udfPath = 'mapScan:watchSystemSignatures') => ({
  type: 'Add', queryId, udfPath, args: [{ mapId: 'map-a', systemId }],
});

describe('Convex query observation', () => {
  it('tracks only the requested query and removes its arguments on unsubscribe', () => {
    const page = new EventEmitter();
    const active = observeConvexQueries(page, 'mapScan:watchSystemSignatures');
    const socket = connect(page);
    send(socket, [add(1, 10), add(2, 20, 'mapChainSystems:watchMapSystems')]);
    expect(active()).toEqual([{ mapId: 'map-a', systemId: 10 }]);
    send(socket, [{ type: 'Remove', queryId: 1 }]);
    expect(active()).toEqual([]);
  });

  it('keeps reused query IDs isolated across sockets during reconnect', () => {
    const page = new EventEmitter();
    const active = observeConvexQueries(page, 'mapScan:watchSystemSignatures');
    const first = connect(page);
    const second = connect(page);
    send(first, [add(1, 10)]);
    send(second, [add(1, 20)]);
    send(first, [{ type: 'Remove', queryId: 1 }]);
    first.emit('close');
    expect(active()).toEqual([{ mapId: 'map-a', systemId: 20 }]);
    second.emit('close');
    expect(active()).toEqual([]);
  });

  it('ignores unrelated browser sockets', () => {
    const page = new EventEmitter();
    const active = observeConvexQueries(page, 'mapScan:watchSystemSignatures');
    connect(page, 'ws://localhost:3000/_next/webpack-hmr')
      .emit('framesent', { payload: 'ping' });
    expect(active()).toEqual([]);
  });
});
