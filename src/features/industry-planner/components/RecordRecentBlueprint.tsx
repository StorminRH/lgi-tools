'use client';

import { useEffect } from 'react';
import { recordRecentBlueprint } from '../recent-blueprints';

/** Records the blueprint on screen as this device's most recent. */
export function RecordRecentBlueprint({ typeId, productTypeId, name }: { typeId: number; productTypeId: number; name: string }) {
  useEffect(() => {
    recordRecentBlueprint({ typeId, productTypeId, name });
  }, [typeId, productTypeId, name]);
  return null;
}
