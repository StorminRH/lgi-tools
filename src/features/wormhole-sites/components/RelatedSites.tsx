import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { SiteSearchEntry } from '../queries';
import { SITE_TYPE_LABEL } from './wormhole-styles';

export function RelatedSites({ sites }: { sites: SiteSearchEntry[] }) {
  if (sites.length === 0) return null;

  return (
    <section className="mt-6 w-full border-t border-border-idle pt-4" aria-labelledby="related-sites">
      <h2 id="related-sites" className="mb-2 text-label tracking-label uppercase text-muted">
        Related sites
      </h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {sites.map((site) => (
          <Card key={site.id} hover>
            <Link href={`/sites/${site.id}`} className="block px-3 py-2">
              <span className="block font-semibold text-name">{site.name}</span>
              <span className="mt-0.5 block font-data text-label tracking-label uppercase text-muted">
                {site.wormholeClass ? `${site.wormholeClass} · ` : ''}
                {SITE_TYPE_LABEL[site.siteType]}
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
