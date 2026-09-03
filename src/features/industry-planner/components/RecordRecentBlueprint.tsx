'use client';

import { useEffect } from 'react';
import { recordRecentBlueprint } from '../recent-blueprints';

export function RecordRecentBlueprint({
  typeId,
  productTypeId,
  name,
}: {
  typeId: number;
  productTypeId: number;
  name: string;
}) {
  useEffect(() => {
    recordRecentBlueprint({ typeId, productTypeId, name });
  }, [typeId, productTypeId, name]);
  return null;
}
