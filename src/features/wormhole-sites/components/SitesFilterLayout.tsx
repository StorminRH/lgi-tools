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
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipToggle, ChipToggleGroup } from '@/components/ui/chip-toggle';
import { Dot } from '@/components/ui/dot';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { SegmentedControl } from '@/components/ui/segmented';
import { eyebrow } from '@/components/ui/type-roles';
import { sitesDetailMode, sitesView } from '@/lib/preferences';
import { matchesClassFilter, matchesFilter } from '../site-filter';
import type { SiteType, WormholeClass } from '../types';
import {
  CLASS_CHIP_TONE,
  SITE_TYPE_CHIP_TONE,
  SITE_TYPE_DOT_TONE,
  SITE_TYPE_LABEL,
} from './wormhole-styles';

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];
const CLASS_CHIPS: WormholeClass[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const TYPE_ROWS: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];
const DETAIL_OPTIONS = [
  { value: 'lightbox', label: 'Lightbox' },
  { value: 'expand', label: 'Expand' },
] as const;
const VIEW_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
] as const;

/** Catalogue filter metadata listing available site types, classes, and result counts. */
export interface SiteFilterMeta {
  id: number;
  type: SiteType;
  clsSet: WormholeClass[];
}

/**
 * One caller-supplied site card item; its value is the stable control key and its label or marker
 * is presentation-ready.
 */
export interface SiteCardItem {
  meta: SiteFilterMeta;
  node: ReactNode;
}

interface SitesFilterState {
  cls: WormholeClass[];
  types: SiteType[];
  reset: () => void;
}

const SitesFilterContext = createContext<SitesFilterState | null>(null);

function useSitesFilter(): SitesFilterState {
  const value = useContext(SitesFilterContext);
  if (!value) throw new Error('Sites results must render inside SitesFilterLayout');
  return value;
}

/**
 * Owns the static catalogue chrome and filter state while a request-time child selects the saved
 * result view.
 */
export function SitesFilterLayout({
  sites,
  total,
  children,
}: PropsWithChildren<{
  sites: SiteFilterMeta[];
  total: number;
}>) {
  const [cls, setCls] = useState<WormholeClass[]>([]);
  const [types, setTypes] = useState<SiteType[]>([]);

  const matches = (m: SiteFilterMeta) => matchesFilter(m, { cls, types });
  const filteredCount = sites.filter(matches).length;
  // Type counts recompute against the class selection (not the type selection),
  // so each row shows how many sites that type would add at the current classes.
  const typeCount = (t: SiteType) =>
    sites.filter((site) => site.type === t && matchesClassFilter(site.clsSet, cls)).length;

  const reset = () => {
    setCls([]);
    setTypes([]);
  };

  return (
    <SitesFilterContext.Provider value={{ cls, types, reset }}>
      <PageHead
        crumb="sites"
        title="Wormhole Sites"
        meta={
          <>
            <span className={eyebrow()} aria-live="polite">
              <b className="text-name font-semibold">{filteredCount}</b> of {total} sites
            </span>
            <span className={eyebrow()}>
              jita <b className="text-isk font-semibold">live</b>
            </span>
          </>
        }
      />

      <div className="pb-16">
        <div className="grid items-start gap-[22px] split:grid-cols-[224px_1fr]">
          <Card className="p-4 split:sticky split:top-[110px]">
            <div className="flex flex-col gap-5">
              <div>
                <span className="text-label uppercase tracking-wide text-muted">Class</span>
                <ChipToggleGroup
                  label="Filter by class"
                  value={cls}
                  onValueChange={(next) => setCls(next as WormholeClass[])}
                  className="mt-2 grid grid-cols-3 gap-2"
                >
                  {CLASS_CHIPS.map((c) => (
                    <ChipToggle
                      key={c}
                      value={c}
                      tone={CLASS_CHIP_TONE[c]}
                      appearance="filter"
                      className="w-full justify-center px-2 py-1.5 text-ui"
                    >
                      {c}
                    </ChipToggle>
                  ))}
                </ChipToggleGroup>
              </div>

              <div>
                <span className="text-label uppercase tracking-wide text-muted">Type</span>
                <ChipToggleGroup
                  label="Filter by site type"
                  value={types}
                  onValueChange={(next) => setTypes(next as SiteType[])}
                  className="mt-2 flex-col items-stretch"
                >
                  {TYPE_ROWS.map((t) => (
                    <ChipToggle
                      key={t}
                      value={t}
                      tone={SITE_TYPE_CHIP_TONE[t]}
                      appearance="row"
                      className="w-full gap-2"
                    >
                      <Dot
                        tone={SITE_TYPE_DOT_TONE[t]}
                        size="md"
                        className={`shadow-none transition-opacity ${
                          types.includes(t) ? 'opacity-100' : 'opacity-[0.45]'
                        }`}
                      />
                      <span className="flex-1 text-left">{SITE_TYPE_LABEL[t]}</span>
                      <span className="text-faint">{typeCount(t)}</span>
                    </ChipToggle>
                  ))}
                </ChipToggleGroup>
              </div>

              <Button variant="bare" type="button" className="text-ui text-faint underline underline-offset-3 hover:text-isk" onClick={reset}>
                reset filters
              </Button>
            </div>
          </Card>

          <div>{children}</div>
        </div>
      </div>
    </SitesFilterContext.Provider>
  );
}

/**
 * Selects and filters the catalogue result mode after the server supplies the saved initial view.
 */
export function SitesResults({
  cards,
  table,
  initialView,
}: {
  cards: SiteCardItem[];
  table: ReactNode;
  // The server-read view cookie seeds the first result paint without a
  // cards↔table flip. Class and Type filters remain ephemeral.
  initialView: 'cards' | 'table';
}) {
  const { cls, types, reset } = useSitesFilter();
  const [view, setView] = usePreference(sitesView, { serverValue: initialView });
  const [detailMode, setDetailMode] = usePreference(sitesDetailMode);
  const tableRef = useRef<HTMLDivElement>(null);
  const matches = (meta: SiteFilterMeta) => matchesFilter(meta, { cls, types });
  const filteredCount = cards.filter((card) => matches(card.meta)).length;

  // Apply the filter to the server-rendered table rows. No dep array: re-runs
  // after every render, including after a sort navigation swaps the rows.
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-sites-row]').forEach((details) => {
      const rowType = details.getAttribute('data-site-type') as SiteType | null;
      const rowCls = (details.getAttribute('data-site-cls') ?? '')
        .split(',')
        .filter(Boolean) as WormholeClass[];
      const ok = matchesFilter({ type: rowType, clsSet: rowCls }, { cls, types });
      const wrapper = details.parentElement;
      if (wrapper) wrapper.hidden = !ok;
    });
  });

  return (
    <>
      <div className="flex justify-end items-center gap-3 mb-4">
        {view === 'cards' && (
          <SegmentedControl
            label="Site detail behavior"
            value={detailMode}
            onChange={(next) => setDetailMode(next as typeof detailMode)}
            options={DETAIL_OPTIONS}
          />
        )}
        <SegmentedControl
          label="Sites view"
          value={view}
          onChange={(next) => setView(next as typeof view)}
          options={VIEW_OPTIONS}
        />
      </div>

      {filteredCount === 0 ? (
        <EmptyState>
          No sites match —{' '}
          <Button
            variant="bare"
            type="button"
            className="text-ui text-faint underline underline-offset-3 hover:text-isk"
            onClick={reset}
          >
            reset filters
          </Button>
        </EmptyState>
      ) : view === 'cards' ? (
        SECTION_ORDER.map((type) => {
          const sectionCards = cards.filter(
            (card) => card.meta.type === type && matches(card.meta),
          );
          if (sectionCards.length === 0) return null;
          return (
            <section key={type} className="mb-12 last:mb-0">
              <div className="w-full flex items-center gap-3.5 mb-5">
                <span className="text-label font-semibold tracking-eyebrow uppercase text-muted whitespace-nowrap">
                  {SITE_TYPE_LABEL[type]} Sites
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid items-start gap-4 split:grid-cols-2">
                {sectionCards.map((card) => card.node)}
              </div>
            </section>
          );
        })
      ) : (
        <div ref={tableRef}>{table}</div>
      )}
    </>
  );
}
