'use client';

import type { Ref } from 'react';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';

/** A destination pick fails as no match, or as the excluded origin system. */
export type DestinationErr = SystemErr | { kind: 'same_system' };

/**
 * Parses a typed system name for a picker that must not answer with one
 * system, such as a connection's own origin. A system identity readout
 * ('J120924 - C2') parses by its name, and the excluded system fails as
 * 'same_system', because the server refuses a connection from a system to
 * itself.
 */
export function parseDestinationSystem<P extends { system: { id: number } }>(
  parse: (input: string) => { ok: true; params: P } | { ok: false },
  input: string,
  excludeSystemId?: number,
): { ok: true; params: P } | { ok: false; error: DestinationErr } {
  const direct = parse(input);
  const parsed = direct.ok
    ? direct
    : input.lastIndexOf(' - ') > 0
      ? parse(input.slice(0, input.lastIndexOf(' - ')))
      : direct;
  if (!parsed.ok) return { ok: false, error: { kind: 'not_found' } };
  if (parsed.params.system.id === excludeSystemId) {
    return { ok: false, error: { kind: 'same_system' } };
  }
  return parsed;
}

export interface SystemTerminalSearchProps {
  readonly placeholder: string;
  readonly onPick: (systemId: number) => void;
  readonly initialValue?: string;
  readonly onClear?: () => void;
  readonly errorLabel?: string;
  readonly excludeSystemId?: number;
  readonly inputRef?: Ref<HTMLInputElement>;
}

function destinationErrorMessage(error: DestinationErr): string {
  switch (error.kind) {
    case 'same_system':
      return "A system can't connect to itself.";
    case 'not_found':
      return 'No system matches that name.';
  }
}
const ignoreClear = () => undefined;

/**
 * The mapper's system picker: a terminal search over every known system that
 * hands back the picked system's id. `excludeSystemId` fails as a system
 * that can't connect to itself.
 */
export function SystemTerminalSearch({
  placeholder,
  onPick,
  initialValue = '',
  onClear = ignoreClear,
  errorLabel = 'System',
  excludeSystemId,
  inputRef,
}: SystemTerminalSearchProps) {
  const { parse, suggest } = useSystemSearch();
  return (
    <TerminalSearch<SystemParams, DestinationErr>
      initialValue={initialValue}
      placeholder={placeholder}
      parse={(input) => parseDestinationSystem(parse, input, excludeSystemId)}
      suggest={suggest}
      inputRef={inputRef}
      errorMessage={destinationErrorMessage}
      onSubmit={(params) => onPick(params.system.id)}
      onClear={onClear}
      errorLabel={errorLabel}
    />
  );
}
