'use client';

import { buttonVariants } from '@/components/ui/button';
import {
  SYNTHETIC_PILOT,
  SYNTHETIC_PILOT_MINT_PATH,
} from '@/platform/auth/synthetic-pilot';

export function LocalSyntheticPilotControl() {
  if (process.env.NODE_ENV !== 'development') return null;
  return (
    <a href={SYNTHETIC_PILOT_MINT_PATH} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      Continue as {SYNTHETIC_PILOT.name}
    </a>
  );
}
