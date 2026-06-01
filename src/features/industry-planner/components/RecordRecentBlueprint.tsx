'use client';

import { useEffect } from 'react';
import { recordRecentBlueprint } from '../recent-blueprints';

// Mounted on the planner detail page; records the blueprint being viewed into
// localStorage so the dashboard's "Recently viewed" can read it back. Renders
// nothing. The write runs client-side only (localStorage), so it never touches
// the static prerender. The typeId/name come from the already-resolved
// structure on the detail page — no extra fetch.
export function RecordRecentBlueprint({ typeId, name }: { typeId: number; name: string }) {
  useEffect(() => {
    recordRecentBlueprint({ typeId, name });
  }, [typeId, name]);
  return null;
}
