'use client';

// Domain-agnostic terminal-style search input. Owns the visual shell (input
// + autocomplete dropdown + inline error Callout); the caller supplies the
// vocabulary via four callbacks (parse / format / suggest / errorMessage).
//
// Future features (sleeper lookup, killmail browsing, fits browser, …)
// reuse this primitive by writing their own ~50-line parser file. The
// presentation, focus management, click-outside-to-close, Enter-to-submit,
// suggestion-click-to-submit, and error display all come for free.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Callout } from './callout';

type ParseOk<Params> = { ok: true; params: Params };
type ParseErr<Err> = { ok: false; error: Err };
type ParseResult<Params, Err> = ParseOk<Params> | ParseErr<Err>;

export type TerminalSearchProps<Params, Err> = {
  initialValue: string;
  placeholder?: string;
  parse: (input: string) => ParseResult<Params, Err>;
  suggest: (input: string) => string[];
  errorMessage: (error: Err) => string;
  onSubmit: (params: Params) => void;
  onClear: () => void;
  errorLabel?: string;
  // Hint shown beneath the input when nothing is typed yet.
  hint?: string;
};

type EmptyKind = 'empty';

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
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const suggestions = useMemo(() => suggest(value), [value, suggest]);

  // Click outside / Esc to close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const submitParsedString = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      setError(null);
      setOpen(false);
      onClear();
      return;
    }
    const result = parse(trimmed);
    if (result.ok) {
      setError(null);
      setOpen(false);
      onSubmit(result.params);
    } else {
      // The `empty` discriminant is the parser's signal for clear; everything
      // else is a real error to surface in the Callout. Cast through unknown
      // because the primitive can't know the consumer's error union shape.
      const err = result.error;
      if ((err as { kind: string }).kind === ('empty' as EmptyKind)) {
        setError(null);
        setOpen(false);
        onClear();
      } else {
        setError(err);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitParsedString(value);
  };

  const handleSuggestionClick = (s: string) => {
    setValue(s);
    setOpen(false);
    inputRef.current?.blur();
    submitParsedString(s);
  };

  const showDropdown = open && suggestions.length > 0 && error === null;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit} autoComplete="off">
        <label htmlFor={inputId} className="sr-only">
          {placeholder ?? 'Filter'}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="w-full font-mono text-[12px] px-3 py-2 bg-bg border border-border text-text placeholder:text-[#2a3a4a] focus:outline-none focus:border-[#2a3550]"
        />
      </form>

      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-[240px] overflow-y-auto bg-bg border border-[#1e2c3a] shadow-lg"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Use onMouseDown (not onClick) so the input doesn't blur first
                  // — that would have closed the dropdown via the outside-click
                  // listener before the click fired.
                  e.preventDefault();
                  handleSuggestionClick(s);
                }}
                className="w-full text-left font-mono text-[12px] px-3 py-1.5 text-text hover:bg-[#161e28] focus:bg-[#161e28] focus:outline-none transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2">
          <Callout label={errorLabel}>{errorMessage(error)}</Callout>
        </div>
      )}

      {!error && hint && (
        <div className="mt-1 font-mono text-[9px] text-muted tracking-[0.12em] uppercase">
          {hint}
        </div>
      )}
    </div>
  );
}
