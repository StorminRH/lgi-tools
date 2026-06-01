'use client';

import { useEffect } from 'react';
import { recordRecentBlueprint } from '../recent-blueprints';

// Mounted on the planner detail page; records the blueprint being viewed into
// localStorage so the dashboard's "Recently viewed" can read it back. Renders
// nothing. The write runs client-side only (localStorage), so it never touches
// the static prerender. typeId (the blueprint, for the link), productTypeId
// (the produced item, for the row icon), and name all come from the
// already-resolved structure on the detail page — no extra fetch.
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
