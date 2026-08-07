'use client';

// The outbound-arrow context seam, kept apart from the provider so the edge
// renderer depends only on this leaf — not on the provider's presence chain.
// Unit tests render edges against the empty default without mocking anything.
import { createContext, useContext } from 'react';
import type { OutboundArrow } from './pilot-path';

/** The stable empty mount set — the common no-off-map-pilots value. */
export const EMPTY_OUTBOUND_ARROWS: ReadonlyMap<string, OutboundArrow> = new Map();

/** Edge id → the arrow it carries; empty wherever no provider is mounted. */
export const OutboundArrowContext =
  createContext<ReadonlyMap<string, OutboundArrow>>(EMPTY_OUTBOUND_ARROWS);

/** The arrow one edge carries, or `null` for the overwhelmingly common none. */
export function useOutboundArrow(edgeId: string): OutboundArrow | null {
  return useContext(OutboundArrowContext).get(edgeId) ?? null;
}
