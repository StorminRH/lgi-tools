'use client';

// Client filter layout for /sites (handoff §4). Owns the multi-select filter
// state — Class chips + Type rows — plus the Cards/Table view toggle, and
// renders the persistent left rail beside the results. The priced site cards
// and the sortable table are rendered SERVER-side (live prices, collapsible
// detail) and handed in as nodes: the card grid filters by rendering only the
// matching card nodes (grouped into type sections); the table — a single server
// node — is filtered by toggling row visibility in an effect. Counts and the
// "N of M" meta derive from the lightweight per-site metadata, so they stay
// live as the selection changes. No URL/searchParams for the filters: the page
// stays static and the selection survives the table's sort navigations.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import type { SiteType, WormholeClass } from '../types';
import { SITE_TYPE_LABEL } from './wormhole-styles';

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];
const CLASS_CHIPS: WormholeClass[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const TYPE_ROWS: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];

export interface SiteFilterMeta {
  id: number;
  type: SiteType;
  clsSet: WormholeClass[];
}

export interface SiteCardItem {
  meta: SiteFilterMeta;
  node: ReactNode;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function SitesFilterLayout({
  cards,
  table,
  total,
}: {
  cards: SiteCardItem[];
  table: ReactNode;
  total: number;
}) {
  const [cls, setCls] = useState<WormholeClass[]>([]);
  const [types, setTypes] = useState<SiteType[]>([]);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const tableRef = useRef<HTMLDivElement>(null);

  const clsMatch = (set: WormholeClass[]) => cls.length === 0 || cls.some((c) => set.includes(c));
  const typeMatch = (t: SiteType) => types.length === 0 || types.includes(t);
  const matches = (m: SiteFilterMeta) => clsMatch(m.clsSet) && typeMatch(m.type);

  const filteredCount = cards.filter((c) => matches(c.meta)).length;
  // Type counts recompute against the class selection (not the type selection),
  // so each row shows how many sites that type would add at the current classes.
  const typeCount = (t: SiteType) =>
    cards.filter((c) => c.meta.type === t && clsMatch(c.meta.clsSet)).length;

  // Apply the filter to the server-rendered table rows. No dep array: re-runs
  // after every render, so it re-applies after a sort navigation swaps the rows
  // as well as on a filter change. A no-op (ref null) when the table isn't shown.
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.sites-table-row').forEach((details) => {
      const rowType = details.getAttribute('data-site-type') as SiteType | null;
      const rowCls = (details.getAttribute('data-site-cls') ?? '')
        .split(',')
        .filter(Boolean) as WormholeClass[];
      const ok =
        (cls.length === 0 || cls.some((c) => rowCls.includes(c))) &&
        (types.length === 0 || (rowType != null && types.includes(rowType)));
      const wrapper = details.parentElement;
      if (wrapper) wrapper.hidden = !ok;
    });
  });

  const reset = () => {
    setCls([]);
    setTypes([]);
  };

  return (
    <>
      <PageHead
        crumb="sites"
        title="Wormhole Sites"
        meta={
          <>
            <span aria-live="polite">
              <b className="text-name font-semibold">{filteredCount}</b> of {total} sites
            </span>
            <span>
              jita <b className="text-isk font-semibold">live</b>
            </span>
          </>
        }
      />

      <div className="w-full max-w-[1080px] mx-auto px-7 pb-16">
        <div className="sites-rail-layout">
          <aside className="sites-rail-pane">
            <div className="sites-rail-groups">
              <div role="group" aria-label="Filter by class">
                <span className="sites-fl">Class</span>
                <div className="sites-cls">
                  {CLASS_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={cls.includes(c)}
                      className={`sites-chip ${c.toLowerCase()}${cls.includes(c) ? ' on' : ''}`}
                      onClick={() => setCls(toggle(cls, c))}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div role="group" aria-label="Filter by site type">
                <span className="sites-fl">Type</span>
                <div className="sites-types">
                  {TYPE_ROWS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={types.includes(t)}
                      className={`sites-type ${t}${types.includes(t) ? ' on' : ''}`}
                      onClick={() => setTypes(toggle(types, t))}
                    >
                      <span className="dot" />
                      <span className="tl">{SITE_TYPE_LABEL[t]}</span>
                      <span className="count">{typeCount(t)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="sites-reset" onClick={reset}>
                reset filters
              </button>
            </div>
          </aside>

          <div>
            <div className="flex justify-end mb-4">
              <div className="inline-flex border border-border-idle rounded-[3px] overflow-hidden">
                {(['cards', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`font-mono text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors ${
                      view === v ? 'text-isk bg-pill-green-bg' : 'text-muted hover:text-name'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {filteredCount === 0 ? (
              <EmptyState>
                No sites match —{' '}
                <button type="button" className="sites-reset" onClick={reset}>
                  reset filters
                </button>
              </EmptyState>
            ) : view === 'cards' ? (
              SECTION_ORDER.map((type) => {
                const sectionCards = cards.filter((c) => c.meta.type === type && matches(c.meta));
                if (sectionCards.length === 0) return null;
                return (
                  <section key={type} className="mb-12 last:mb-0">
                    <div className="w-full flex items-center gap-3.5 mb-5">
                      <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted whitespace-nowrap">
                        {SITE_TYPE_LABEL[type]} Sites
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="sites-grid">{sectionCards.map((c) => c.node)}</div>
                  </section>
                );
              })
            ) : (
              <div ref={tableRef}>{table}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
