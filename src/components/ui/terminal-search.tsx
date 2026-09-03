'use client';

import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Callout } from './callout';
import * as Combobox from './combobox';
import { scrollArea } from './scroll-area';
import { deriveTerminalDropdown } from './terminal-search-view';
import { eyebrow } from './type-roles';

export type ParseOk<Params> = { ok: true; params: Params };
export type ParseErr<Err> = { ok: false; error: Err };
export type ParseResult<Params, Err> = ParseOk<Params> | ParseErr<Err>;

export type TerminalSearchProps<Params, Err> = {
  initialValue: string;
  placeholder?: string;
  parse: (input: string) => ParseResult<Params, Err>;
  suggest: (input: string) => string[] | Promise<string[]>;
  errorMessage: (error: Err) => string;
  onSubmit: (params: Params, raw: string) => void;
  onClear: () => void;
  errorLabel?: string;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
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
  inputRef,
}: TerminalSearchProps<Params, Err>) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<Err | null>(null);
  const inputId = useId();
  const highlightedRef = useRef<string | null>(null);

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
          highlightedRef.current = null;
        }}
        onItemHighlighted={(v: string | undefined) => {
          highlightedRef.current = v ?? null;
        }}
        onOpenChange={(open: boolean) => {
          if (!open) highlightedRef.current = null;
        }}
        filter={null}
        mode="list"
      >
        <Combobox.Field
          ref={inputRef}
          id={inputId}
          type="text"
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          className="h-[30px] w-full"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && highlightedRef.current === null) {
              e.preventDefault();
              submitParsedString(value);
            }
          }}
        />
        {visibleSuggestions.length > 0 && (
          <Combobox.Panel
            className={`${scrollArea} max-h-[240px] w-[var(--anchor-width)] overflow-y-auto`}
            sideOffset={4}
          >
            <Combobox.List>
              {visibleSuggestions.map((s) => (
                <Combobox.Item
                  key={s}
                  value={s}
                  onClick={() => {
                    setValue(s);
                    submitParsedString(s);
                  }}
                  className="w-full px-2.5 py-2 text-ui font-data text-text"
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
        <div className={eyebrow({ className: 'mt-1' })}>
          {hint}
        </div>
      )}
    </>
  );
}
