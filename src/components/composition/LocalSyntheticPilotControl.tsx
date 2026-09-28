'use client';

import { Button } from '@/components/ui/button';
import {
  SYNTHETIC_PILOT,
  SYNTHETIC_PILOT_MINT_PATH,
} from '@/platform/auth/synthetic-pilot';

export function LocalSyntheticPilotControl() {
  if (process.env.NODE_ENV !== 'development') return null;
  return (
    <form action={SYNTHETIC_PILOT_MINT_PATH} method="post">
      <Button type="submit" variant="ghost" size="sm">
        Reset and continue as {SYNTHETIC_PILOT.name}
      </Button>
    </form>
  );
}
