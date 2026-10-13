'use client';

import type { Ref } from 'react';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';

/**
 * Parses a typed system name for a picker that must not answer with one
 * system, such as a connection's own origin. A system identity readout
 * ('J120924 - C2') parses by its name, and the excluded system reads as no
 * match, because the server refuses a connection from a system to itself.
 */
export function parseDestinationSystem<P extends { system: { id: number } }>(
  parse: (input: string) => { ok: true; params: P } | { ok: false },
  input: string,
  excludeSystemId?: number,
): { ok: true; params: P } | { ok: false; error: SystemErr } {
  const direct = parse(input);
  const parsed = direct.ok
    ? direct
    : input.lastIndexOf(' - ') > 0
      ? parse(input.slice(0, input.lastIndexOf(' - ')))
      : direct;
  if (!parsed.ok) return { ok: false, error: { kind: 'not_found' } };
  if (parsed.params.system.id === excludeSystemId) {
    return { ok: false, error: { kind: 'not_found' } };
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

const noSystemMatches = () => 'No system matches that name.';
const ignoreClear = () => undefined;

/**
 * The mapper's system picker: a terminal search over every known system that
 * hands back the picked system's id. `excludeSystemId` reads as no match.
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
    <TerminalSearch<SystemParams, SystemErr>
      initialValue={initialValue}
      placeholder={placeholder}
      parse={(input) => parseDestinationSystem(parse, input, excludeSystemId)}
      suggest={suggest}
      inputRef={inputRef}
      errorMessage={noSystemMatches}
      onSubmit={(params) => onPick(params.system.id)}
      onClear={onClear}
      errorLabel={errorLabel}
    />
  );
}
