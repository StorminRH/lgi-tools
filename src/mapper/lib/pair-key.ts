// The canonical unordered system-pair key. Halo dedupe, edge pair-claiming,
// and the arrow mount lookup must agree byte-for-byte on this spelling —
// one owner, so the ordering convention can never drift between them.

/** The unordered endpoint key for one system pair: smaller id first, `>`-joined. */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}>${b}` : `${b}>${a}`;
}
