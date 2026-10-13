import type { PillTone } from '@/components/ui/pill';
import { adminSection } from './admin-sections';

export interface AdminActionRow {
  id: 'statics' | 'users';
  title: string;
  status: string;
  href: string;
  cta: string;
  badge: { label: string; tone: PillTone } | null;
}

export interface StaticsVersions {
  pendingVersion: string | null;
  servingVersion: string;
}

export function deriveActionRows(input: { statics: StaticsVersions | null }): AdminActionRow[] {
  return [
    staticsRow(input.statics),
    {
      ...sectionRow('users'),
      status: '',
      cta: 'Open',
      badge: null,
    },
  ];
}

// Each row is named and linked as its page is in the rail.
function sectionRow(id: AdminActionRow['id']): Pick<AdminActionRow, 'id' | 'title' | 'href'> {
  const { title, href } = adminSection(id);
  return { id, title, href };
}

function staticsRow(statics: StaticsVersions | null): AdminActionRow {
  const row = sectionRow('statics');
  if (statics === null) return { ...row, status: 'statics unavailable', cta: 'Open', badge: null };
  const serving = statics.servingVersion === '' ? 'nothing promoted yet' : `serving v${statics.servingVersion}`;
  if (statics.pendingVersion === null) {
    return { ...row, status: `${serving} · no review waiting`, cta: 'Check feed', badge: null };
  }
  return {
    ...row,
    status: `v${statics.pendingVersion} waiting · ${serving}`,
    cta: 'Review',
    badge: { label: 'review', tone: 'orange' },
  };
}
