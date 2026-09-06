export function observeConvexQueries(page, udfPath) {
  const sockets = new Map();
  page.on('websocket', (socket) => {
    if (!/^\/api\/[^/]+\/sync$/.test(new URL(socket.url()).pathname)) return;
    const active = new Map();
    sockets.set(socket, active);
    socket.on('framesent', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type !== 'ModifyQuerySet') return;
      for (const change of message.modifications) {
        if (change.type === 'Add' && change.udfPath === udfPath) {
          active.set(change.queryId, change.args[0]);
        } else if (change.type === 'Remove') {
          active.delete(change.queryId);
        }
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  return () => [...sockets.values()].flatMap((active) => [...active.values()]);
}
