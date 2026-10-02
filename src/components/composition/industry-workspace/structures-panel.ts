export function setStructuresPanelOpen(open: boolean): void {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('panel', 'structures');
  else url.searchParams.delete('panel');
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
