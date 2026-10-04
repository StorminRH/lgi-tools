import type { CodexEntity } from '../api-contract';
import type { CodexDataBlockView, CodexSourceCatalogue } from '../components/CodexDataView';
import type { CodexDataLayout } from '../nodes';

export type PickerState =
  | { readonly step: 'source' }
  | { readonly step: 'entity'; readonly source: string }
  | {
      readonly step: 'fields';
      readonly source: string;
      readonly entity: CodexEntity;
      readonly fields: readonly string[];
      readonly layout: CodexDataLayout;
    };

export type FieldsState = Extract<PickerState, { step: 'fields' }>;

const LAYOUT_LABEL: Record<CodexDataLayout, string> = {
  infobox: 'Infobox',
  table: 'Table',
  inline: 'Inline',
  card: 'Card',
};

export const PICKER_START: PickerState = { step: 'source' };

export function sourceSummary(catalogue: CodexSourceCatalogue, id: string): CodexSourceCatalogue['sources'][number] {
  const source = catalogue.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`unknown Codex source ${id}`);
  return source;
}

export function chooseSource(source: string): PickerState {
  return { step: 'entity', source };
}

export function pickEntity(catalogue: CodexSourceCatalogue, source: string, entity: CodexEntity): FieldsState {
  const summary = sourceSummary(catalogue, source);
  const offered = new Set(summary.fields.map((field) => field.id));
  return {
    step: 'fields',
    source,
    entity,
    fields: summary.defaultFields.filter((field) => offered.has(field)),
    layout: summary.layouts[0]!,
  };
}

export function toggleField(catalogue: CodexSourceCatalogue, state: FieldsState, field: string): FieldsState {
  const chosen = new Set(state.fields);
  if (chosen.has(field)) chosen.delete(field);
  else chosen.add(field);
  const order = sourceSummary(catalogue, state.source).fields.map((candidate) => candidate.id);
  return { ...state, fields: order.filter((id) => chosen.has(id)) };
}

export function setLayout(catalogue: CodexSourceCatalogue, state: FieldsState, layout: string): FieldsState {
  const offered = sourceSummary(catalogue, state.source).layouts.find((candidate) => candidate === layout);
  return offered ? { ...state, layout: offered } : state;
}

export function back(state: PickerState): PickerState {
  return state.step === 'fields' ? chooseSource(state.source) : PICKER_START;
}

export function canInsert(state: FieldsState): boolean {
  return state.fields.length > 0 || state.layout === 'card';
}

export type DataNode =
  | { type: 'dataInline'; attrs: { source: string; key: string; fields: string[] } }
  | { type: 'dataBlock'; attrs: { source: string; key: string; fields: string[]; layout: Exclude<CodexDataLayout, 'inline'> } };

export function toNode(state: FieldsState): DataNode {
  const attrs = { source: state.source, key: state.entity.key, fields: [...state.fields] };
  return state.layout === 'inline'
    ? { type: 'dataInline', attrs }
    : { type: 'dataBlock', attrs: { ...attrs, layout: state.layout } };
}

export function layoutOptions(catalogue: CodexSourceCatalogue, source: string) {
  return sourceSummary(catalogue, source).layouts.map((layout) => ({ value: layout, label: LAYOUT_LABEL[layout] }));
}

export function previewView(catalogue: CodexSourceCatalogue, state: FieldsState): CodexDataBlockView {
  const summary = sourceSummary(catalogue, state.source);
  return {
    source: summary.id,
    sourceLabel: summary.label,
    provenance: summary.provenance,
    icon: summary.icon,
    title: state.entity.title,
    href: state.entity.href,
    rows: state.entity.values.filter((row) => state.fields.includes(row.field)),
  };
}
