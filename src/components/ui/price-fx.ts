// Shared live-price refresh effect, used by every surface that confirms a price
// on view so they all flash identically. While the live value is being confirmed
// the figure fades and a soft light wave sweeps across it; once the live value
// lands it pulses a touch brighter, then holds solid in its tone. The classes
// live in globals.css (CSP-safe — keyframes, not inline style).
//
// `wasPending` latches true once a real pending cycle has been seen, so a figure
// that paints already-fresh doesn't pulse on first load for no reason.
export function priceFx(pending: boolean, wasPending: boolean): string {
  if (pending) return 'isk-fx-pending';
  return wasPending ? 'isk-fx-settle' : '';
}
