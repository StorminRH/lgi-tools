'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Select, type SelectItems } from '@/components/ui/select';
import { Stepper } from '@/components/ui/stepper';
import { TerminalSearch, type ParseResult } from '@/components/ui/terminal-search';
import { SystemCombobox } from './combobox-sample';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const HUBS: SelectItems = [
  { value: 'jita', label: 'Jita IV - Moon 4' },
  { value: 'amarr', label: 'Amarr VIII (Oris)' },
  {
    group: 'Secondary hubs',
    options: [
      { value: 'dodixie', label: 'Dodixie IX - Moon 20' },
      { value: 'rens', label: 'Rens VI - Moon 8' },
      { value: 'hek', label: 'Hek VIII - Moon 12', disabled: true },
    ],
  },
];

type MeQuery = { me: number };
type MeError = { kind: 'empty' | 'range' | 'format' };

function parseMe(input: string): ParseResult<MeQuery, MeError> {
  const match = /^me\s*(\d+)$/i.exec(input);
  if (!match) return { ok: false, error: { kind: 'format' } };
  const me = Number(match[1]);
  return me > 10 ? { ok: false, error: { kind: 'range' } } : { ok: true, params: { me } };
}

const ME_SUGGESTIONS = ['me 0', 'me 5', 'me 8', 'me 10'];

export function FormsGroup() {
  const [hub, setHub] = useState('jita');
  const [centeredHub, setCenteredHub] = useState('amarr');
  const [runs, setRuns] = useState(10);
  const [efficiency, setEfficiency] = useState(8);
  const [lastQuery, setLastQuery] = useState('none yet');

  return (
    <ReferenceGroup
      id="forms"
      title="Forms"
      intro="Text entry, pickers, and numeric controls share one engraved field well."
    >
      <Specimen
        name="Field + Input + Textarea"
        source="field · input"
        note="Field owns the label, hint, and error wiring around any control; Input adds an optional prompt glyph and trailing slot."
        wide
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Structure name" hint="Shown in the build-location picker">
            <Input defaultValue="Sotiyo — Deklein" />
          </Field>
          <Field label="ESI callback URL" error="Must start with https://">
            <Input defaultValue="htp://lgi.tools/api" />
          </Field>
          <Field label="Filter" hint="Prompt glyph and trailing slot">
            <Input prompt placeholder="sites:gas class:c3" trailing={<Kbd>/</Kbd>} />
          </Field>
          <Field label="Feedback" hint="Markdown not supported · 500 char max">
            <Textarea rows={3} defaultValue="The industry planner saved me 40M ISK on a Praxis batch." />
          </Field>
          <Field label="Compact" hint="size=sm for dense rows">
            <Input size="sm" defaultValue="Tritanium" />
          </Field>
          <Field label="Disabled" disabled>
            <Input defaultValue="Read-only value" />
          </Field>
        </div>
      </Specimen>

      <Specimen
        name="Select"
        source="select"
        note="A field-styled trigger over a glass list, with optional groups, disabled options, and a centred alignment for narrow cells."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Variant label="grouped">
            <Select ariaLabel="Trade hub" value={hub} onValueChange={setHub} items={HUBS} />
          </Variant>
          <Variant label="centred · sm">
            <Select
              ariaLabel="Trade hub, centred"
              value={centeredHub}
              onValueChange={setCenteredHub}
              items={HUBS}
              size="sm"
              align="center"
            />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="Combobox"
        source="combobox"
        note="Autocomplete parts — Root, Field, Panel, List, Group, GroupLabel, Item — composed by the caller for search pickers."
      >
        <SystemCombobox />
      </Specimen>

      <Specimen
        name="TerminalSearch"
        source="terminal-search"
        note="A parse-on-submit query field with suggestions, an error callout, and a hint line."
      >
        <div className="flex flex-col gap-2">
          <TerminalSearch<MeQuery, MeError>
            initialValue=""
            placeholder="Try “me 8” or “me 12”"
            parse={parseMe}
            suggest={(input) => ME_SUGGESTIONS.filter((item) => item.startsWith(input.toLowerCase()))}
            errorMessage={(error) => (error.kind === 'range' ? 'ME tops out at 10.' : 'Use the form “me <number>”.')}
            onSubmit={(params) => setLastQuery(`ME ${params.me}`)}
            onClear={() => setLastQuery('cleared')}
            errorLabel="Query"
            hint="Enter to apply"
          />
          <span className="font-ui text-label text-faint">Last applied: {lastQuery}</span>
        </div>
      </Specimen>

      <Specimen
        name="Stepper"
        source="stepper"
        note="Base UI number field with a boxed default and a compact inline variant for table cells."
      >
        <div className="flex flex-wrap items-end gap-8">
          <Variant label="default">
            <Stepper ariaLabel="Runs" value={runs} onChange={setRuns} min={1} max={500} />
          </Variant>
          <Variant label="inline · trailing">
            <Stepper
              ariaLabel="Material efficiency"
              value={efficiency}
              onChange={setEfficiency}
              max={10}
              variant="inline"
              trailing={<span className="text-faint">ME</span>}
            />
          </Variant>
        </div>
      </Specimen>
    </ReferenceGroup>
  );
}
