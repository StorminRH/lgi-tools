'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll, type SearchResult, type SearchSection } from '@/platform/search';
import { setSiteSearchIndex } from '@/features/wormhole-sites/search';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import { readRecents, pushRecent } from '@/features/search-recents/storage';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/type-icon';
import * as Combobox from '@/components/ui/combobox';
import { Kbd } from '@/components/ui/kbd';
import { flattenSections, searchIconClass, searchRowImage, splitMatchRuns } from './global-search-view';

export type Props = {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  siteIndex: SiteSearchEntry[];
};

const DEBOUNCE_MS = 120;

export function GlobalSearch({ active, onActiveChange, siteIndex }: Props) {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [recents, setRecents] = useState<SearchResult[]>([]);

  useEffect(() => {
    setSiteSearchIndex(siteIndex);
  }, [siteIndex]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    const controller = new AbortController();
    searchAll(debounced, { session, isAdmin, recents, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setSections(next);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      });
    return () => {
      controller.abort();
    };
  }, [debounced, session, isAdmin, recents]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => flattenSections(sections), [sections]);
  const hasResults = sections.length > 0;

  const open = active && hasResults;

  function fireResult(result: SearchResult) {
    if (result.disabled) return;
    pushRecent(result);
    setRecents(readRecents());
    setValue('');
    onActiveChange(false);
    inputRef.current?.blur();
    if (result.onSelect) {
      result.onSelect(router);
      return;
    }
    router.push(result.href);
  }

  const dismiss = () => {
    setValue('');
    inputRef.current?.blur();
    onActiveChange(false);
  };

  return (
    <div className="nav-host flex items-stretch">
      <Combobox.Root
        items={items}
        value={value}
        onValueChange={(next: string) => setValue(next)}
        itemToStringValue={(row: SearchResult) => row.label}
        filter={null}
        mode="list"
        open={open}
        onOpenChange={(nextOpen: boolean) => {
          if (!nextOpen) dismiss();
        }}
      >
        <Combobox.Field
          ref={inputRef}
          data-search-input
          aria-label="Search"
          className="nav-search w-[480px] max-lg:w-full"
          prompt={<span className="shrink-0 font-data text-ui font-bold text-isk">&gt;</span>}

          trailing={<SearchHints active={active} />}
          type="text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Search tools, sites, resources…"
          onFocus={() => onActiveChange(true)}
        />

        {open && (
          <Combobox.Panel className="w-[min(640px,92vw)]" sideOffset={8}>
            <Combobox.List>
              {sections.map((section) => (
                <Combobox.Group key={section.name}>
                  <Combobox.GroupLabel>
                    <span>{section.name}</span>

                    {section.name === 'Sites' && section.results.length > 0 && (
                      <span className="font-normal text-muted">
                        {section.results.length} match{section.results.length === 1 ? '' : 'es'}
                      </span>

                    )}
                  </Combobox.GroupLabel>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-1">
                    {section.results.map((row) => (
                      <SearchRow key={row.id} row={row} fireResult={fireResult} />
                    ))}
                  </div>

                </Combobox.Group>

              ))}
            </Combobox.List>

            <SearchFooter />
          </Combobox.Panel>

        )}
      </Combobox.Root>

    </div>

  );
}

function SearchHints({ active }: { active: boolean }) {
  return <Kbd>{active ? 'esc' : '⌘K'}</Kbd>;

}

function SearchRowIcon({ row }: { row: SearchResult }) {
  const image = searchRowImage(row);
  if (image) {
    return (
      <TypeIcon
        {...image}
        size={22}
        mono={row.iconText ?? row.label.slice(0, 2)}
      />
    );
  }
  return (
    <span
      className={cn(
        'flex size-icon-lg shrink-0 items-center justify-center rounded-ctl border font-data text-ui font-bold',
        searchIconClass(row.iconTone),
      )}
    >
      {row.iconText}
    </span>

  );
}

function SearchRow({
  row,
  fireResult,
}: {
  row: SearchResult;
  fireResult: (result: SearchResult) => void;
}) {
  return (
    <Combobox.Item
      value={row}
      disabled={row.disabled}
      onClick={() => fireResult(row)}
      className={cn(
        'group flex items-center gap-2.5 border border-border-soft bg-section px-2.5 py-2',
        'data-[highlighted]:border-border-active',
        row.disabled && 'opacity-55',
      )}
    >
      <SearchRowIcon row={row} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-data text-ui text-name">
          {renderLabel(row.label, row.matchIndices)}
        </span>

        {row.sub && (
          <span className="truncate font-data text-label uppercase tracking-[0.07em] text-muted">
            {row.sub}
          </span>

        )}
      </span>

      <span className="shrink-0 text-ui text-isk opacity-0 group-data-[highlighted]:opacity-100">↵</span>

    </Combobox.Item>

  );
}

function renderLabel(label: string, indices?: number[]) {
  return (
    <>
      {splitMatchRuns(label, indices).map((run, i) =>
        run.matched ? (
          <span key={i} className="font-semibold text-isk">
            {run.text}
          </span>

        ) : (
          <Fragment key={i}>{run.text}</Fragment>

        ),
      )}
    </>

  );
}

function SearchFooter() {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border-soft px-2.5 pb-1 pt-2 text-label uppercase tracking-label text-faint">
      <span>
        Scope: <span className="text-isk">all</span> · sites · tools · commands

      </span>

      <span className="flex gap-1">
        <Kbd>↑↓</Kbd>

        <Kbd>↵</Kbd>

        <Kbd>esc</Kbd>

      </span>

    </div>

  );
}
