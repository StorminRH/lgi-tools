export function listenForAtlasReturn(host: {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now: () => number;
  refresh: () => boolean;
}): () => void {
  let lastRefreshAt = Number.NEGATIVE_INFINITY;
  const refresh = () => {
    const now = host.now();
    if (host.document.visibilityState !== 'visible' || now - lastRefreshAt < 5_000) return;
    if (host.refresh()) lastRefreshAt = now;
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) refresh();
  };

  host.document.addEventListener('visibilitychange', refresh);
  host.window.addEventListener('focus', refresh);
  host.window.addEventListener('pageshow', onPageShow);
  return () => {
    host.document.removeEventListener('visibilitychange', refresh);
    host.window.removeEventListener('focus', refresh);
    host.window.removeEventListener('pageshow', onPageShow);
  };
}
