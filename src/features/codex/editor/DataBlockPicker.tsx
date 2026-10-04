'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import * as Combobox from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchIcon } from '@/components/ui/icons';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Popover } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented';
import { useSourceSearch } from '@/platform/search/use-source-search';
import { apiFetch } from '@/transport/api-client';
import {
  codexSourceEntityEndpoint,
  codexSourceSearchEndpoint,
  type CodexEntity,
  type CodexSourceHit,
} from '../api-contract';
import {
  CODEX_SOURCE_ICONS,
  CodexDataView,
  type CodexDataBlockView,
  type CodexSourceCatalogue,
} from '../components/CodexDataView';
import {
  back,
  canInsert,
  chooseSource,
  layoutOptions,
  pickEntity,
  PICKER_START,
  previewView,
  setLayout,
  sourceSummary,
  toggleField,
  toNode,
  type DataNode,
  type FieldsState,
  type PickerState,
} from './data-block-picker-state';

const STEPS = ['Source', 'Entity', 'Fields & layout'] as const;
const STEP_INDEX = { source: 0, entity: 1, fields: 2 } as const;
const SEARCH_DEBOUNCE_MS = 250;
const STEP_FOCUS = '[role="checkbox"], [role="combobox"], button';

const eyebrowLabel = 'text-label font-semibold uppercase tracking-eyebrow text-muted';

function stepTone(index: number, current: number) {
  if (index === current) return { dot: 'border-isk bg-isk text-isk-ink', label: 'text-name' };
  if (index < current) return { dot: 'border-isk/40 bg-isk/10 text-isk', label: 'text-text' };
  return { dot: 'border-border-active text-faint', label: 'text-faint' };
}

function StepRail({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 font-ui text-ui">
      {STEPS.map((label, index) => {
        const tone = stepTone(index, current);
        return (
          <li key={label} className="flex items-center gap-2" aria-current={index === current ? 'step' : undefined}>
            {index > 0 ? <span aria-hidden className="h-px w-5 bg-border-active" /> : null}
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full border font-data text-micro tabular-nums',
                tone.dot,
              )}
            >
              {index + 1}
            </span>
            <span className={tone.label}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SourceStep({
  catalogue,
  onChoose,
}: {
  catalogue: CodexSourceCatalogue;
  onChoose: (source: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      <div className={eyebrowLabel}>Choose a source</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {catalogue.sources.map((source) => {
          const Icon = CODEX_SOURCE_ICONS[source.icon];
          return (
            <Button
              key={source.id}
              variant="secondary"
              onClick={() => onChoose(source.id)}
              className="justify-start gap-2"
            >
              <Icon size={16} className="text-isk" />
              {source.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function useEntitySearch(source: string) {
  return useCallback(
    async (query: string, signal: AbortSignal): Promise<CodexSourceHit[]> => {
      const result = await apiFetch(codexSourceSearchEndpoint, { query: { source, q: query }, signal });
      return result.ok ? result.data.hits : [];
    },
    [source],
  );
}

function HitList({ hits }: { hits: readonly CodexSourceHit[] }) {
  if (hits.length === 0) return null;
  return (
    <Combobox.Panel className="z-dropdown w-[var(--anchor-width)] p-1" sideOffset={6}>
      <Combobox.List>
        {hits.map((hit) => (
          <Combobox.Item key={hit.key} value={hit.key} className="flex w-full items-center gap-3 px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate font-ui text-nav text-name">{hit.title}</span>
            <span className="font-data text-label text-faint">{hit.hint}</span>
          </Combobox.Item>
        ))}
      </Combobox.List>
    </Combobox.Panel>
  );
}

export function EntityStep({
  source,
  label,
  onPick,
}: {
  source: string;
  label: string;
  onPick: (hit: CodexSourceHit) => void;
}) {
  const [query, setQuery] = useState('');
  const search = useEntitySearch(source);
  const found = useSourceSearch(query.trim(), search, SEARCH_DEBOUNCE_MS);
  const searching = query.trim() !== '';
  const hits = searching ? found : [];
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      <Combobox.Root
        items={hits.map((hit) => hit.key)}
        value={query}
        onValueChange={(next, details) => {
          const picked = details.reason === 'item-press' ? hits.find((hit) => hit.key === next) : undefined;
          if (picked) onPick(picked);
          else setQuery(next);
        }}
        filter={null}
        mode="list"
      >
        <Combobox.Field
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}`}
          type="text"
          spellCheck={false}
          autoComplete="off"
          prompt={<SearchIcon size={16} />}
          className="w-full"
        />
        <HitList hits={hits} />
      </Combobox.Root>
      {searching && hits.length === 0 ? <EmptyState>No matches</EmptyState> : null}
    </div>
  );
}

export function handleFieldKey(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>, toggle: () => void) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  toggle();
}

function Preview({ view, layout }: { view: CodexDataBlockView; layout: FieldsState['layout'] }) {
  if (layout === 'inline') {
    return (
      <p className="font-ui text-nav text-text">
        <CodexDataView view={view} layout="inline" />
      </p>
    );
  }
  return <CodexDataView view={view} layout={layout === 'card' ? 'infobox' : layout} />;
}

function FieldList({
  catalogue,
  state,
  onChange,
}: {
  catalogue: CodexSourceCatalogue;
  state: FieldsState;
  onChange: (next: FieldsState) => void;
}) {
  const valueOf = new Map(state.entity.values.map((row) => [row.field, row.value]));
  const toggle = (field: string) => () => onChange(toggleField(catalogue, state, field));
  return (
    <ul className="flex flex-col">
      {sourceSummary(catalogue, state.source).fields.map((field) => {
        const on = state.fields.includes(field.id);
        return (
          <li key={field.id} onKeyDown={(event) => handleFieldKey(event, toggle(field.id))}>
            <label className="-mx-2 flex cursor-pointer items-center gap-2.5 rounded-ctl px-2 py-1.5 hover:bg-row-related">
              <Checkbox checked={on} onCheckedChange={toggle(field.id)} label={field.label} />
              <span className={cn('flex-1', on ? 'text-name' : 'text-text')}>{field.label}</span>
              <span className="max-w-[55%] break-words text-right font-data text-label tabular-nums text-faint">
                {valueOf.get(field.id)}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function FieldsStep({
  catalogue,
  state,
  onChange,
}: {
  catalogue: CodexSourceCatalogue;
  state: FieldsState;
  onChange: (next: FieldsState) => void;
}) {
  return (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_310px]">
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <div className={cn(eyebrowLabel, 'mb-2')}>Fields</div>
          <FieldList catalogue={catalogue} state={state} onChange={onChange} />
        </div>
        <div>
          <div className={cn(eyebrowLabel, 'mb-2')}>Layout</div>
          <SegmentedControl
            label="Layout"
            value={state.layout}
            onChange={(layout) => onChange(setLayout(catalogue, state, layout))}
            options={layoutOptions(catalogue, state.source)}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 border-t border-border-soft bg-bg-deep/40 px-4 py-4 sm:border-l sm:border-t-0">
        <div className="flex items-center justify-between">
          <span className={eyebrowLabel}>Preview</span>
          <span className="flex items-center gap-1.5 text-micro uppercase tracking-label text-isk">
            <span className="size-1.5 rounded-full bg-isk" />
            Live
          </span>
        </div>
        <Preview view={previewView(catalogue, state)} layout={state.layout} />
        <p className="text-label text-faint">
          {state.layout === 'card'
            ? 'Shows as the full site card on the page.'
            : 'Values come from the game data and update when it does.'}
        </p>
      </div>
    </div>
  );
}

function Breadcrumb({
  catalogue,
  state,
  onChange,
}: {
  catalogue: CodexSourceCatalogue;
  state: PickerState;
  onChange: () => void;
}) {
  if (state.step === 'source') return null;
  const chip = 'inline-flex items-center rounded-full border border-border bg-bg-deep/60 px-2.5 py-0.5 text-name';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2.5">
      <span className="text-muted">Inserting</span>
      <span className={chip}>{sourceSummary(catalogue, state.source).label}</span>
      {state.step === 'fields' ? (
        <>
          <span className="text-faint">›</span>
          <span className={cn(chip, 'font-data')}>{state.entity.title}</span>
        </>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onChange} className="ml-auto px-1 text-label uppercase tracking-label">
        Change
      </Button>
    </div>
  );
}

function StepBody({
  catalogue,
  state,
  onChange,
  onPick,
}: {
  catalogue: CodexSourceCatalogue;
  state: PickerState;
  onChange: (next: PickerState) => void;
  onPick: (source: string, hit: CodexSourceHit) => void;
}) {
  switch (state.step) {
    case 'source':
      return <SourceStep catalogue={catalogue} onChoose={(source) => onChange(chooseSource(source))} />;
    case 'entity':
      return (
        <EntityStep
          source={state.source}
          label={sourceSummary(catalogue, state.source).label}
          onPick={(hit) => onPick(state.source, hit)}
        />
      );
    case 'fields':
      return <FieldsStep catalogue={catalogue} state={state} onChange={onChange} />;
  }
}

export function PickerFooter({
  catalogue,
  state,
  onBack,
  onInsert,
}: {
  catalogue: CodexSourceCatalogue;
  state: PickerState;
  onBack: () => void;
  onInsert: (node: DataNode) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        {state.step === 'source' ? 'Cancel' : '← Back'}
      </Button>
      {state.step === 'fields' ? (
        <div className="flex items-center gap-2">
          <span className="text-ui text-faint">
            {state.fields.length} of {sourceSummary(catalogue, state.source).fields.length} fields
          </span>
          <Button variant="primary" size="sm" disabled={!canInsert(state)} onClick={() => onInsert(toNode(state))}>
            Insert block
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PickerStatus({ loading, problem }: { loading: string | null; problem: string | null }) {
  return (
    <>
      {loading ? <LoadingLabel label={`Loading ${loading}…`} className="px-4 pb-3" /> : null}
      {problem ? (
        <Banner tone="warn" className="mx-4 mb-3">
          {problem}
        </Banner>
      ) : null}
    </>
  );
}

export function createEntityLoader(show: {
  loading: (title: string | null) => void;
  problem: (text: string | null) => void;
  step: (next: PickerState) => void;
}) {
  let latest = 0;
  const cancel = () => {
    latest += 1;
    show.loading(null);
  };
  return {
    load: async (source: string, hit: CodexSourceHit, picked: (entity: CodexEntity) => void) => {
      const request = ++latest;
      show.loading(hit.title);
      show.problem(null);
      const result = await apiFetch(codexSourceEntityEndpoint, { query: { source, key: hit.key } });
      if (request !== latest) return;
      show.loading(null);
      if (result.ok) picked(result.data.entity);
      else show.problem(`Could not load ${hit.title}. Try again.`);
    },
    move: (next: PickerState) => {
      cancel();
      show.step(next);
    },
    cancel,
  };
}

function usePickEntity(catalogue: CodexSourceCatalogue, onStep: (state: PickerState) => void) {
  const [loading, setLoading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loader] = useState(() => createEntityLoader({ loading: setLoading, problem: setProblem, step: onStep }));
  useEffect(() => loader.cancel, [loader]);
  const pick = (source: string, hit: CodexSourceHit) =>
    loader.load(source, hit, (entity) => onStep(pickEntity(catalogue, source, entity)));
  return { loading, problem, pick, move: loader.move };
}

function useStepFocus(step: PickerState['step']) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>(STEP_FOCUS)?.focus();
  }, [step]);
  return body;
}

export function PickerPanel({
  catalogue,
  onInsert,
  onClose,
}: {
  catalogue: CodexSourceCatalogue;
  onInsert: (node: DataNode) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<PickerState>(PICKER_START);
  const { loading, problem, pick, move } = usePickEntity(catalogue, setState);
  const body = useStepFocus(state.step);
  const onBack = () => (state.step === 'source' ? onClose() : move(back(state)));
  return (
    <div className="flex flex-col font-ui text-ui text-text">
      <div className="border-b border-border-soft px-4 py-3">
        <StepRail current={STEP_INDEX[state.step]} />
      </div>
      <Breadcrumb catalogue={catalogue} state={state} onChange={() => move(PICKER_START)} />
      <div ref={body}>
        <StepBody catalogue={catalogue} state={state} onChange={setState} onPick={(source, hit) => void pick(source, hit)} />
      </div>
      <PickerStatus loading={loading} problem={problem} />
      <PickerFooter catalogue={catalogue} state={state} onBack={onBack} onInsert={onInsert} />
    </div>
  );
}

export function DataBlockPicker({
  catalogue,
  open,
  onOpenChange,
  onInsert,
  trigger,
  triggerClassName,
  anchor,
}: {
  catalogue: CodexSourceCatalogue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (node: DataNode) => void;
  trigger: ReactNode;
  triggerClassName: string;
  anchor: RefObject<HTMLElement | null>;
}) {
  const inserted = useRef(false);
  const change = (next: boolean) => {
    if (next) inserted.current = false;
    onOpenChange(next);
  };
  const insert = (node: DataNode) => {
    inserted.current = true;
    onInsert(node);
    onOpenChange(false);
  };
  return (
    <Popover
      label="Insert data block"
      trigger={trigger}
      triggerClassName={triggerClassName}
      open={open}
      onOpenChange={change}
      openOnHover={false}
      anchor={anchor}
      align="end"
      finalFocus={() => !inserted.current}
      className="w-[min(680px,var(--anchor-width))] gap-0 p-0"
    >
      <PickerPanel catalogue={catalogue} onInsert={insert} onClose={() => change(false)} />
    </Popover>
  );
}
