'use client';

import { createContext, useContext } from 'react';
import type { OutboundArrow } from './pilot-path';

export const EMPTY_OUTBOUND_ARROWS: ReadonlyMap<string, OutboundArrow> = new Map();

export const OutboundArrowContext =
  createContext<ReadonlyMap<string, OutboundArrow>>(EMPTY_OUTBOUND_ARROWS);

export function useOutboundArrow(edgeId: string): OutboundArrow | null {
  return useContext(OutboundArrowContext).get(edgeId) ?? null;
}
