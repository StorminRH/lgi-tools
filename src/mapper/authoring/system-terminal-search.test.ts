import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { TerminalSearchProps } from '@/components/ui/terminal-search';
import type { SystemParams } from '@/components/use-system-search';

const h = vi.hoisted(() => {
  const known = new Map([['J120924', 31_000_001], ['J100001', 31_000_002]]);
  return {
    picker: null as TerminalSearchProps<SystemParams, DestinationErr> | null,
    parse: (input: string) => {
      const id = known.get(input);
      return id === undefined
        ? { ok: false as const, error: { kind: 'not_found' as const } }
        : { ok: true as const, params: { system: { id, name: input, security: null } } };
    },
    suggest: async (input: string) => [input],
  };
});

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: TerminalSearchProps<SystemParams, DestinationErr>) => {
    h.picker = props;
    return null;
  },
}));

vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: [], parse: h.parse, suggest: h.suggest }),
}));

import {
  parseDestinationSystem,
  SystemTerminalSearch,
  type DestinationErr,
} from './system-terminal-search';

function renderedPicker(props: Parameters<typeof SystemTerminalSearch>[0]) {
  renderToStaticMarkup(createElement(SystemTerminalSearch, props));
  const picker = h.picker;
  if (picker === null) throw new Error('the system picker did not render a terminal search');
  return picker;
}

test('a destination parses through its identity readout suffix and never as the excluded system', () => {
  expect(parseDestinationSystem(h.parse, 'J120924 - C2')).toEqual({
    ok: true,
    params: { system: { id: 31_000_001, name: 'J120924', security: null } },
  });
  expect(parseDestinationSystem(h.parse, 'unknown-system')).toEqual({
    ok: false,
    error: { kind: 'not_found' },
  });
  expect(parseDestinationSystem(h.parse, 'J120924', 31_000_001)).toEqual({
    ok: false,
    error: { kind: 'same_system' },
  });
  expect(parseDestinationSystem(h.parse, 'J120924 - C2', 31_000_001)).toEqual({
    ok: false,
    error: { kind: 'same_system' },
  });
  expect(parseDestinationSystem(h.parse, 'unknown-system', 31_000_001)).toEqual({
    ok: false,
    error: { kind: 'not_found' },
  });
});

test('the system picker starts empty, names the system it misses, and hands back the picked system id', () => {
  const onPick = vi.fn();
  const picker = renderedPicker({ placeholder: 'Search systems', onPick });

  expect(picker).toMatchObject({
    initialValue: '',
    placeholder: 'Search systems',
    errorLabel: 'System',
    suggest: h.suggest,
  });
  expect(picker.errorMessage({ kind: 'not_found' })).toBe('No system matches that name.');
  expect(picker.errorMessage({ kind: 'same_system' })).toBe("A system can't connect to itself.");
  expect(picker.parse('nowhere')).toEqual({ ok: false, error: { kind: 'not_found' } });

  // Clearing the field picks nothing.
  picker.onClear();
  expect(onPick).not.toHaveBeenCalled();

  const parsed = picker.parse('J120924 - C2');
  expect(parsed.ok).toBe(true);
  picker.onSubmit((parsed as { params: SystemParams }).params, 'J120924 - C2');
  expect(onPick.mock.calls).toEqual([[31_000_001]]);
});

test('the system picker refuses its excluded system as itself and keeps the caller\'s value, clear, label and input', () => {
  const onPick = vi.fn();
  const onClear = vi.fn();
  const inputRef = createRef<HTMLInputElement>();
  const picker = renderedPicker({
    placeholder: 'Search systems',
    initialValue: 'J100001 - C4',
    excludeSystemId: 31_000_001,
    errorLabel: 'Destination',
    inputRef,
    onPick,
    onClear,
  });

  expect(picker).toMatchObject({ initialValue: 'J100001 - C4', errorLabel: 'Destination', inputRef });
  expect(picker.parse('J120924')).toEqual({ ok: false, error: { kind: 'same_system' } });
  expect(picker.parse('nowhere')).toEqual({ ok: false, error: { kind: 'not_found' } });
  expect(picker.parse('J100001')).toEqual({
    ok: true,
    params: { system: { id: 31_000_002, name: 'J100001', security: null } },
  });

  picker.onClear();
  expect(onClear).toHaveBeenCalledOnce();
  expect(onPick).not.toHaveBeenCalled();
});
