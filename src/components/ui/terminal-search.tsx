'use client';

// Domain-agnostic terminal-style search input. Owns the visual shell (the field
// well + autocomplete dropdown + inline error Callout); the caller supplies the
// vocabulary via four callbacks (parse / suggest / errorMessage / onSubmit).
//
// Future features (sleeper lookup, killmail browsing, fits browser, …) reuse this
// primitive by writing their own ~50-line parser file. The presentation, focus
// management, click-outside-to-close, Enter-to-submit, suggestion-select-to-submit,
// and error display all come for free.
//
// Built on the shared Combobox primitive (Base UI Autocomplete), so the listbox,
// keyboard navigation, focus, and dismiss behaviour are the library's, not
// hand-rolled. Results come from the caller's `suggest`, so the combobox does no
// filtering of its own (`filter={null}`); the input text is controlled here.

import { useEffect, useId, useRef, useState } from 'react';
import { Callout } from './callout';
import * as Combobox from './combobox';
import { deriveTerminalDropdown } from './terminal-search-view';

type ParseOk<Params> = { ok: true; params: Params };
type ParseErr<Err> = { ok: false; error: Err };
type ParseResult<Params, Err> = ParseOk<Params> | ParseErr<Err>;

/**
 * Caller contract for rendering terminal search; the component owns presentation while callers own
 * domain data.
 */
export type TerminalSearchProps<Params, Err> = {
  initialValue: string;
  placeholder?: string;
  parse: (input: string) => ParseResult<Params, Err>;
  // Sync or async. An async suggest resolves latest-wins per keystroke; it
  // must be identity-stable (useCallback) or the suggestion effect re-fires
  // on every render.
  suggest: (input: string) => string[] | Promise<string[]>;
  errorMessage: (error: Err) => string;
  onSubmit: (params: Params, raw: string) => void;
  onClear: () => void;
  errorLabel?: string;
  // Hint shown beneath the input when nothing is typed yet.
  hint?: string;
};

type EmptyKind = 'empty';

/**
 * Renders the domain-neutral terminal search with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function TerminalSearch<Params, Err extends { kind: string }>({
  initialValue,
  placeholder,
  parse,
  suggest,
  errorMessage,
  onSubmit,
  onClear,
  errorLabel = 'Search',
  hint,
}: TerminalSearchProps<Params, Err>) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<Err | null>(null);
  const inputId = useId();
  // The currently keyboard-highlighted suggestion, tracked so Enter picks it when
  // one is highlighted and otherwise submits the typed value (the Combobox never
  // auto-highlights, so an un-arrowed Enter always parses what was typed).
  const highlightedRef = useRef<string | null>(null);

  // Suggestions land in state so `suggest` may be async (the system pickers
  // dispatch through the search engine). Sync and async returns both resolve
  // through the microtask below, latest-wins (the alive flag drops a stale
  // resolution — and keeps setState out of the effect's synchronous body,
  // which the react-hooks rules ban). Results are stored WITH the query they
  // answered: the derive below renders only the current input's resolution,
  // so neither an emptied input nor a rapid non-empty retype ever flashes a
  // prior query's list while the next one is in flight.
  const [suggestions, setSuggestions] = useState<{ query: string; items: string[] }>({
    query: '',
    items: [],
  });
  useEffect(() => {
    if (value.trim().length === 0) return;
    let alive = true;
    Promise.resolve(suggest(value)).then(
      (s) => {
        if (alive) setSuggestions({ query: value, items: s });
      },
      () => {
        if (alive) setSuggestions({ query: value, items: [] });
      },
    );
    return () => {
      alive = false;
    };
  }, [value, suggest]);

  const submitParsedString = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      setError(null);
      onClear();
      return;
    }
    const result = parse(trimmed);
    if (result.ok) {
      setError(null);
      onSubmit(result.params, trimmed);
    } else {
      // The `empty` discriminant is the parser's signal for clear; everything
      // else is a real error to surface in the Callout. Cast because the
      // primitive can't know the consumer's error union shape.
      const err = result.error;
      if ((err as { kind: string }).kind === ('empty' as EmptyKind)) {
        setError(null);
        onClear();
      } else {
        setError(err);
      }
    }
  };

  const { visibleSuggestions } = deriveTerminalDropdown(suggestions, value, error !== null);

  return (
    <div className="relative w-full">
      <label htmlFor={inputId} className="sr-only">
        {placeholder ?? 'Filter'}
      </label>
      <Combobox.Root
        items={visibleSuggestions}
        value={value}
        onValueChange={(next: string) => {
          setValue(next);
          setError(null);
          // A new query invalidates any prior highlight; clear it here so a stale
          // ref can't suppress the next Enter. Base UI doesn't reliably emit
          // onItemHighlighted(undefined) when the list changes under it, so we
          // don't depend on that callback alone.
          highlightedRef.current = null;
        }}
        onItemHighlighted={(v: string | undefined) => {
          highlightedRef.current = v ?? null;
        }}
        onOpenChange={(open: boolean) => {
          // A closed popup has no highlighted row; clear the ref so Enter after a
          // dismiss always submits the typed value.
          if (!open) highlightedRef.current = null;
        }}
        filter={null}
        mode="list"
      >
        <Combobox.Field
          id={inputId}
          type="text"
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          className="h-[30px] w-full"
          onKeyDown={(e) => {
            // Enter submits the typed value unless a suggestion is keyboard-
            // highlighted — in which case its own onClick (fired on Enter) submits
            // it, so we stay out of the way to avoid a double submit.
            if (e.key === 'Enter' && highlightedRef.current === null) {
              e.preventDefault();
              submitParsedString(value);
            }
          }}
        />
        {visibleSuggestions.length > 0 && (
          <Combobox.Panel className="max-h-[240px] w-[var(--anchor-width)] overflow-y-auto" sideOffset={4}>
            <Combobox.List>
              {visibleSuggestions.map((s) => (
                <Combobox.Item
                  key={s}
                  value={s}
                  onClick={() => {
                    setValue(s);
                    submitParsedString(s);
                  }}
                  className="w-full px-2.5 py-2 text-ui font-mono text-text"
                >
                  {s}
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Panel>
        )}
      </Combobox.Root>

      <SearchFooter error={error} hint={hint} errorLabel={errorLabel} errorMessage={errorMessage} />
    </div>
  );
}

// The error Callout, or the idle hint line when there's no error and a hint was
// given — one or the other beneath the input.
function SearchFooter<Err extends { kind: string }>({
  error,
  hint,
  errorLabel,
  errorMessage,
}: {
  error: Err | null;
  hint?: string;
  errorLabel: string;
  errorMessage: (error: Err) => string;
}) {
  return (
    <>
      {error && (
        <div className="mt-2">
          <Callout label={errorLabel}>{errorMessage(error)}</Callout>
        </div>
      )}
      {!error && hint && (
        <div className="mt-1 font-mono text-label text-muted tracking-wide uppercase">
          {hint}
        </div>
      )}
    </>
  );
}
