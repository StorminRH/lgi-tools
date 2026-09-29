'use client';

import { useDesignVariant } from '../../design-variant';
import { AnalystResearch } from './analyst/AnalystResearch';
import { CardsResearch } from './cards/CardsResearch';
import { LedgerResearch } from './ledger/LedgerResearch';

/** The research landing in whichever design is under review. */
export function ResearchWorkspace() {
  const variant = useDesignVariant();
  if (variant === 'cards') return <CardsResearch />;
  if (variant === 'analyst') return <AnalystResearch />;
  return <LedgerResearch />;
}
