import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';
import { getEveNews } from '@/data/eve-news/queries';
import type { EveNewsItem } from '@/data/eve-news/types';
import { formatUtcDate } from '@/lib/format/time';

// The shared EVE news card — identical for anonymous and signed-in visitors.
// This is the degradation BOUNDARY: getEveNews() throws on a feed failure so the
// cache can serve last-good (see the accessor), and the try/catch here turns a
// cold-miss failure into an empty state rather than erroring the page. Headlines
// are rendered as plain JSX text (auto-escaped) and link out to eveonline.com —
// never raw feed HTML (`dangerouslySetInnerHTML` is lint-banned under the CSP).
export async function HomeNewsCard() {
  let items: EveNewsItem[] = [];
  try {
    items = await getEveNews();
  } catch {
    items = [];
  }

  return (
    <section>
      <SectionLabel className="mb-4">EVE News</SectionLabel>
      <Card>
        {items.length === 0 ? (
          <EmptyState>EVE news is unavailable right now — check back shortly.</EmptyState>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.url} className="border-b border-border-soft last:border-b-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3.5 py-3 hover:bg-row-hover transition-colors no-underline group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[13px] text-name leading-[1.45] group-hover:text-isk transition-colors">
                      {item.title}
                    </span>
                    {item.category ? <Pill tone="blue">{item.category}</Pill> : null}
                  </div>
                  {item.publishedAt ? (
                    <time
                      dateTime={item.publishedAt}
                      className="mt-1 block font-mono text-caption text-muted"
                    >
                      {formatUtcDate(item.publishedAt)}
                    </time>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
