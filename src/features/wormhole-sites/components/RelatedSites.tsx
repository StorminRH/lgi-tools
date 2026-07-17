import Link from 'next/link';
import type { SiteSearchEntry } from '../queries';
import { SITE_TYPE_LABEL } from './wormhole-styles';

/** Renders deterministic related wormhole-site links without owning selection policy. */
export function RelatedSites({ sites }: { sites: SiteSearchEntry[] }) {
  if (sites.length === 0) return null;

  return (
    <section className="mt-6 w-full border-t border-border-idle pt-4" aria-labelledby="related-sites">
      <h2
        id="related-sites"
        className="mb-2 font-mono text-label tracking-label uppercase text-muted"
      >
        Related sites
      </h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {sites.map((site) => (
          <Link
            key={site.id}
            href={`/sites/${site.id}`}
            className="rounded-ctl border border-border-idle bg-section px-3 py-2 hover:border-border-active hover:bg-row-hover"
          >
            <span className="block font-semibold text-name">{site.name}</span>
            <span className="mt-0.5 block font-mono text-label tracking-label uppercase text-muted">
              {site.wormholeClass ? `${site.wormholeClass} · ` : ''}
              {SITE_TYPE_LABEL[site.siteType]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
