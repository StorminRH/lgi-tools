'use client';

import { ActionForm } from '@/components/ui/action-form';
import {
  SYNTHETIC_PILOT,
  SYNTHETIC_PILOT_MINT_PATH,
} from '@/platform/auth/synthetic-pilot';

export function LocalSyntheticPilotControl() {
  if (process.env.NODE_ENV !== 'development') return null;
  return (
    <ActionForm action={SYNTHETIC_PILOT_MINT_PATH} variant="ghost">
      Reset and continue as {SYNTHETIC_PILOT.name}
    </ActionForm>
  );
}
