import type { SiteDetail } from '../types';

// Hover-revealed overlay anchored to the right edge of a resource card on
// /sites. Surfaces the top-3 resources by ISK plus the site's total — the
// "is this worth running?" answer without forcing an expand. Visibility is
// pure CSS (.card.resource:hover .resource-preview); this component just
// renders the always-mounted DOM the rule reveals.

function formatIsk(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  return `${(isk / 1_000_000).toFixed(1)}M`;
}

function previewLabel(siteType: SiteDetail['siteType']): string {
  switch (siteType) {
    case 'ore':  return 'Top ore';
    case 'gas':  return 'Top gas';
    default:     return 'Top resources';
  }
}

function footerLabel(siteType: SiteDetail['siteType']): string {
  switch (siteType) {
    case 'ore':  return 'Total ore value';
    case 'gas':  return 'Total gas value';
    default:     return 'Total value';
  }
}

export function ResourcePreview({ site }: { site: SiteDetail }) {
  const ranked = [...site.resources]
    .filter((r) => r.resourceKind !== 'ore' || (r.units ?? 0) > 0)
    .sort((a, b) => (b.effectiveIsk ?? 0) - (a.effectiveIsk ?? 0))
    .slice(0, 3);

  if (ranked.length === 0) return null;

  const total = site.resources.reduce((sum, r) => sum + (r.effectiveIsk ?? 0), 0);

  return (
    <div className="resource-preview" aria-hidden>
      <div className="resource-preview-label">{previewLabel(site.siteType)}</div>
      {ranked.map((r) => (
        <div key={r.id} className="resource-preview-row">
          <span>{r.resourceName}</span>
          <span className="val">{formatIsk(r.effectiveIsk)}</span>
        </div>
      ))}
      <div className="resource-preview-footer">
        <span>{footerLabel(site.siteType)}</span>
        <span className="val">{formatIsk(total)} ISK</span>
      </div>
    </div>
  );
}
