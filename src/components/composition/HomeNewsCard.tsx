import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';
import { getEveNews } from '@/data/eve-news/queries';
import type { EveNewsItem } from '@/data/eve-news/types';
import { formatUtcDate } from '@/lib/format/time';

export async function HomeNewsCard() {
  const items: EveNewsItem[] = await getEveNews();

  return (
    <section className="reveal reveal-6">
      <SectionLabel className="mb-cluster">EVE News</SectionLabel>
      {items.length === 0 ? (
        <Card>
          <EmptyState>EVE news is unavailable right now — check back shortly.</EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card as="li" hover key={item.url} className="flex">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 flex-col gap-3 px-5 py-4 no-underline group"
              >
                {item.category ? (
                  <Pill tone="blue" className="self-start">
                    {item.category}
                  </Pill>
                ) : null}
                <span className="flex-1 text-body text-name leading-[1.45] group-hover:text-isk transition-colors">
                  {item.title}
                </span>
                {item.publishedAt ? (
                  <time dateTime={item.publishedAt} className="block font-data text-micro text-muted">
                    {formatUtcDate(item.publishedAt)}
                  </time>
                ) : null}
              </a>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}
