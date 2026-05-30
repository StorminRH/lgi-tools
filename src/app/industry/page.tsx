import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { SITE_URL } from '@/config/site-url';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Look up any Eve Online blueprint and see its full recursive material tree priced at live Jita rates, with build cost and profit margin before fees.',
  alternates: { canonical: `${SITE_URL}/industry` },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Full recursive material tree for any Eve Online blueprint, priced at live Jita rates with build cost and margin.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

// A frigate, a battlecruiser, and a capital — a quick spread of build depth to
// start from. These are the resolver's reference blueprints (eve-data
// REFERENCE_BLUEPRINT_TYPE_IDS); names are stable.
const EXAMPLES = [
  { id: 691, name: 'Rifter', note: 'T1 frigate' },
  { id: 24699, name: 'Drake', note: 'T1 battlecruiser' },
  { id: 23758, name: 'Archon', note: 'Carrier' },
];

export default function IndustryLandingPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-16 pb-20">
      <div className="w-full max-w-[680px]">
        <h1 className="font-display font-bold text-[28px] text-name leading-[1.1]">
          Industry Planner
        </h1>
        <p className="text-[13px] text-muted mt-3 leading-[1.6]">
          Look up any blueprint to see its full recursive material tree priced at live
          Jita rates — build cost and profit margin, before job fees. Search from the bar
          above (<span className="text-text">⌘K</span>), or start with one of these:
        </p>

        <div className="mt-5">
          <Card>
            <SectionHeader label="Example Blueprints" />
            {EXAMPLES.map((e) => (
              <Link
                key={e.id}
                href={`/industry/${e.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3.5 py-[10px] border-t border-border-soft first:border-t-0 hover:bg-[rgba(255,255,255,0.018)] no-underline"
              >
                <span className="text-name text-[13px]">{e.name}</span>
                <span className="text-[10px] text-muted uppercase tracking-[0.1em]">
                  {e.note}
                </span>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
