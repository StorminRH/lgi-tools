'use client';

// The in-nav global search component. Spotlight-style cross-source navigator
// that consumes the registry in `src/data/search/`. Owns:
//
//   - the 280px → 440px width animation on focus
//   - the categorized dropdown (Sites / Tools / Commands / Recent)
//   - keyboard navigation (⌘K to focus, ↑/↓ to move, Enter to fire, Esc to close)
//   - recording rows into localStorage for the Recent source
//   - the command-with-side-effect contract (logout/login fire a form POST
//     or anchor click instead of router.push)
//
// The Sites source's data is seeded once on mount via setSiteSearchIndex
// (called here, fed by the `siteIndex` prop from AppHeaderShell).

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAll, type SearchResult, type SearchSection } from '@/data/search';
import { setSiteSearchIndex } from '@/features/wormhole-sites/search';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import { readRecents, pushRecent } from '@/features/search-recents/storage';
import type { Session } from '@/features/auth/types';

type Props = {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  session: Session | null;
  isAdmin: boolean;
  siteIndex: SiteSearchEntry[];
};

const DEBOUNCE_MS = 120;

export function GlobalSearch({ active, onActiveChange, session, isAdmin, siteIndex }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const logoutFormRef = useRef<HTMLFormElement | null>(null);
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<SearchResult[]>([]);

  // Seed the Sites source's data once. Subsequent rerenders don't re-set.
  useEffect(() => {
    setSiteSearchIndex(siteIndex);
  }, [siteIndex]);

  // Read localStorage Recents on mount; SSR-safe because the read is
  // inside useEffect.
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  // Debounce the query so fast typing doesn't run searchAll on every
  // keystroke. At today's source sizes this is overkill; the debounce
  // is here so future async sources don't make the UX choppy.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  // Dispatch the debounced query. AbortController isn't useful yet
  // (all sources are sync), but the contract is async-ready.
  useEffect(() => {
    let cancelled = false;
    searchAll(debounced, { session, isAdmin, recents }).then((next) => {
      if (cancelled) return;
      setSections(next);
      setActiveIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, session, isAdmin, recents]);

  // Global ⌘K (Ctrl-K on Win/Linux) focuses the input from anywhere.
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

  // Click-outside to close.
  useEffect(() => {
    if (!active) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        inputRef.current?.blur();
        onActiveChange(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [active, onActiveChange]);

  const flatRows = useMemo(() => sections.flatMap((s) => s.results), [sections]);

  function fireResult(result: SearchResult) {
    if (result.disabled) return;
    pushRecent(result);
    setRecents(readRecents());
    setValue('');
    onActiveChange(false);
    inputRef.current?.blur();

    if (result.command === 'logout') {
      logoutFormRef.current?.submit();
      return;
    }
    if (result.command === 'login') {
      window.location.href = result.href;
      return;
    }
    router.push(result.href);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      inputRef.current?.blur();
      onActiveChange(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatRows.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = flatRows[activeIndex];
      if (row) fireResult(row);
      return;
    }
  }

  const showDropdown = active && sections.length > 0;

  return (
    <div ref={wrapperRef} className="nav-host relative flex items-stretch">
      <div className={`nav-search ${active ? 'active' : ''}`}>
        <span className="ns-prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          className="ns-input"
          placeholder="Search tools, sites, resources…"
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => onActiveChange(true)}
          onKeyDown={handleKey}
        />
        {!active && <span className="ns-kbd-hint">⌘K</span>}
        {active && <span className="ns-esc-hint">esc</span>}
      </div>

      {showDropdown && (
        <div className="dropdown" role="listbox">
          {sections.map((section, sIdx) => {
            // Compute the flat-index offset for this section so row-level
            // activeIndex math matches keyboard navigation.
            const before = sections
              .slice(0, sIdx)
              .reduce((sum, s) => sum + s.results.length, 0);
            return (
              <Fragment key={section.name}>
                <div className="dd-section">
                  <div className="dd-section-label">
                    {section.name}
                    {section.name === 'Sites' && section.results.length > 0 && (
                      <span className="count">
                        {section.results.length} match{section.results.length === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                  {section.results.map((row, rIdx) => {
                    const flatIdx = before + rIdx;
                    const isActiveRow = flatIdx === activeIndex;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        role="option"
                        aria-selected={isActiveRow}
                        disabled={row.disabled}
                        className={`dd-row ${isActiveRow ? 'active' : ''} ${row.disabled ? 'disabled' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onMouseDown={(e) => {
                          // Use onMouseDown so blur doesn't fire first and
                          // close the dropdown before the click registers.
                          e.preventDefault();
                          fireResult(row);
                        }}
                      >
                        <span className={`dd-icon ${row.iconTone ?? ''}`}>{row.iconText}</span>
                        <span className="dd-name">
                          {renderLabel(row.label, row.matchRange)}
                        </span>
                        {row.sub && <span className="dd-sub">{row.sub}</span>}
                        <span className="dd-return">↵</span>
                      </button>
                    );
                  })}
                </div>
              </Fragment>
            );
          })}
          <div className="dd-footer">
            <span>
              Scope: <span style={{ color: 'var(--color-isk)' }}>all</span> · sites · tools · commands
            </span>
            <span>
              <span className="kbd">↑↓</span>
              <span className="kbd">↵</span>
              <span className="kbd">esc</span>
            </span>
          </div>
        </div>
      )}

      {/* Hidden form so command rows with `command: 'logout'` can submit a
          POST to /api/auth/logout without a synthetic anchor. */}
      {session && (
        <form ref={logoutFormRef} method="POST" action="/api/auth/logout" className="hidden" />
      )}
    </div>
  );
}

function renderLabel(label: string, range?: [number, number]) {
  if (!range) return label;
  const [start, end] = range;
  if (start < 0 || end > label.length || start >= end) return label;
  return (
    <>
      {label.slice(0, start)}
      <span className="match">{label.slice(start, end)}</span>
      {label.slice(end)}
    </>
  );
}
