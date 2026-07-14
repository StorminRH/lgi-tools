import { ESI_ERROR_CEILING } from './types';

// Preserve the gate's deliberately pessimistic budget arithmetic in one home.
// A negative result is meaningful: it keeps dispatch closed when the conservative
// two-bucket self-count exceeds CCP's ceiling.
export function effectiveRemaining(echo: number | null, selfCount: number): number {
  return Math.min(echo ?? ESI_ERROR_CEILING, ESI_ERROR_CEILING - selfCount);
}
