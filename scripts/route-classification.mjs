// Render-mode classification for one built app route, read from `next build`
// output. A route is 'partial' when its prerender postponed request-time
// work, 'static' when it did not, and 'dynamic' when nothing was prerendered.
//
// Two build layouts carry the postponed signal:
// - Without an adapter, each prerender writes `.next/server/app/<route>.meta`,
//   whose `postponed` key is present exactly when the render postponed.
// - With an adapter (Vercel sets NEXT_ADAPTER_PATH), prerender files move
//   under `.next/server/route-cache/`, so there is no `.meta` at that path.
//   The prerender manifest is written the same way in both layouts, and its
//   `compute` field is derived from the same postponed result: 'static' when
//   nothing postponed, 'resuming' or 'blocking' when something did.

function fromMeta(meta) {
  return 'postponed' in meta ? 'partial' : 'static';
}

function fromCompute(route, compute) {
  if (!compute) {
    throw new Error(
      `prerendered route "${route}" has no .meta file and no prerender-manifest compute value`,
    );
  }
  return compute === 'static' ? 'static' : 'partial';
}

export function classifyRoute({ route, prerender, metaFor }) {
  const entry = prerender.routes[route] ?? prerender.dynamicRoutes[route];
  if (!entry) return 'dynamic';
  const meta = metaFor(route);
  return meta ? fromMeta(meta) : fromCompute(route, entry.compute);
}
