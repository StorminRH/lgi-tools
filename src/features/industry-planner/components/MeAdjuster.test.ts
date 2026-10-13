import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { EFFICIENCY_TONE_CLASSES } from '../industry-styles';
import type { BuildPlanValue } from './planner-contexts';

const h = vi.hoisted(() => ({ plan: {} as Partial<BuildPlanValue> }));

vi.mock('./planner-contexts', () => ({ useBuildPlan: () => h.plan }));

import { EfficiencyStepperRows, NodeAdjusters } from './MeAdjuster';

function planWith(fields: Partial<BuildPlanValue>) {
  return {
    ownedMe: null,
    ownedTe: null,
    meOverrides: new Map<number, number>(),
    teOverrides: new Map<number, number>(),
    setMeOverride: vi.fn(),
    resetMeOverride: vi.fn(),
    setTeOverride: vi.fn(),
    resetTeOverride: vi.fn(),
    ...fields,
  };
}

const adjusters = (blueprintTypeId: number) =>
  renderToStaticMarkup(createElement(NodeAdjusters, { blueprintTypeId, name: 'Rifter' }));

/** The value and value tone a field's input shows. */
function field(html: string, unit: 'material efficiency' | 'time efficiency') {
  const match = new RegExp(`aria-label="Rifter ${unit}" class="([^"]*)" value="(\\d+)"`).exec(html);
  expect(match).not.toBeNull();
  return { value: Number(match![2]), className: match![1] };
}

type Stop = (e: { stopPropagation: () => void }) => void;
type Row = ReactElement<{ children: ReactElement }>;
type FieldWrapper = ReactElement<{ children: [ReactElement, StepperElement]; onClick: Stop; onKeyDown: Stop }>;
type StepperElement = ReactElement<{ onChange: (n: number) => void; trailing: ReactElement<{ onClick: Stop }> | null }>;

/** A popover field as its renderer returns it: the stop-propagation wrapper around its icon and stepper. */
const fieldOf = (row: Row) => {
  const el = row.props.children;
  return (el.type as (props: unknown) => FieldWrapper)(el.props);
};

/** The popover's ME and TE fields, rendered one level down from NodeAdjusters. */
function popoverFields(blueprintTypeId: number): [FieldWrapper, FieldWrapper] {
  const popover = NodeAdjusters({ blueprintTypeId, name: 'Rifter' }) as ReactElement<{ children: [Row, Row] }>;
  const [meRow, teRow] = popover.props.children;
  return [fieldOf(meRow), fieldOf(teRow)];
}

const stepperOf = (wrapper: FieldWrapper) => wrapper.props.children[1];

test('each field shows its override, else the owned research, else 0, in the tone of where the value came from', () => {
  h.plan = planWith({ ownedMe: new Map([[100, 7]]), ownedTe: new Map([[100, 0]]) });
  const owned = adjusters(100);
  expect(field(owned, 'material efficiency')).toEqual({ value: 7, className: expect.stringContaining(EFFICIENCY_TONE_CLASSES.owned.text) });
  // A held TE0 copy has no research to show off.
  expect(field(owned, 'time efficiency')).toEqual({ value: 0, className: expect.stringContaining(EFFICIENCY_TONE_CLASSES.unowned.text) });
  expect(owned).not.toContain('Reset Rifter');

  h.plan = planWith({ ownedMe: new Map([[100, 7]]), meOverrides: new Map([[100, 0]]) });
  const overridden = adjusters(100);
  expect(field(overridden, 'material efficiency')).toEqual({ value: 0, className: expect.stringContaining(EFFICIENCY_TONE_CLASSES.manual.text) });
  expect(overridden).toContain('aria-label="Reset Rifter material efficiency"');
  expect(overridden).not.toContain('aria-label="Reset Rifter time efficiency"');

  const unheld = adjusters(200);
  expect(field(unheld, 'material efficiency')).toEqual({ value: 0, className: expect.stringContaining(EFFICIENCY_TONE_CLASSES.unowned.text) });
  expect(unheld).not.toContain('Reset Rifter');
});

test('ME stops at 10 and TE at 20', () => {
  h.plan = planWith({ ownedMe: new Map([[100, 10]]), ownedTe: new Map([[100, 10]]) });
  const atMe = adjusters(100);
  expect(atMe).toMatch(/disabled=""[^>]*aria-label="Increase Rifter material efficiency"/);
  expect(atMe).not.toMatch(/disabled=""[^>]*aria-label="Increase Rifter time efficiency"/);

  h.plan = planWith({ ownedTe: new Map([[100, 20]]) });
  expect(adjusters(100)).toMatch(/disabled=""[^>]*aria-label="Increase Rifter time efficiency"/);
});

test('a field writes its own blueprint’s override, its reset clears it, and neither reaches the card behind', () => {
  const plan = planWith({ meOverrides: new Map([[100, 3]]), teOverrides: new Map([[100, 6]]) });
  h.plan = plan;
  const [me, te] = popoverFields(100);
  const stopPropagation = vi.fn();

  stepperOf(me).props.onChange(5);
  stepperOf(me).props.trailing!.props.onClick({ stopPropagation });
  expect(plan.setMeOverride).toHaveBeenCalledWith(100, 5);
  expect(plan.resetMeOverride).toHaveBeenCalledWith(100);
  expect(stopPropagation).toHaveBeenCalledOnce();

  stepperOf(te).props.onChange(12);
  stepperOf(te).props.trailing!.props.onClick({ stopPropagation });
  expect(plan.setTeOverride).toHaveBeenCalledWith(100, 12);
  expect(plan.resetTeOverride).toHaveBeenCalledWith(100);
  expect(plan.setMeOverride).toHaveBeenCalledOnce();
  expect(plan.resetMeOverride).toHaveBeenCalledOnce();

  me.props.onClick({ stopPropagation });
  me.props.onKeyDown({ stopPropagation });
  expect(stopPropagation).toHaveBeenCalledTimes(4);
});

test('a boxed field sits beside one glyph in its icon row; the popover’s inline field carries a small glyph of its own', () => {
  h.plan = planWith({ ownedMe: new Map([[100, 4]]) });
  const boxed = renderToStaticMarkup(createElement(EfficiencyStepperRows, { blueprintTypeId: 100, name: 'Rifter' }));
  expect(boxed.match(/industry-me\.png/g)).toHaveLength(1);
  expect(boxed.match(/industry-te\.png/g)).toHaveLength(1);
  expect(boxed).toMatch(
    /^<div class="flex items-center gap-2\.5"><span aria-hidden="true" class="inline-flex size-3\.5 shrink-0"><span[^>]*><span[^>]*industry-me\.png[^>]*><\/span><\/span><\/span><span class="inline-flex items-center gap-1"><div/,
  );
  expect(boxed).not.toContain('h-3 w-3');

  const inline = adjusters(100);
  expect(inline.match(/industry-me\.png/g)).toHaveLength(1);
  expect(inline.match(/industry-te\.png/g)).toHaveLength(1);
  expect(inline).toMatch(/Material Efficiency<\/span><span class="inline-flex items-center gap-1"><span class="inline-flex h-3 w-3 shrink-0"><span[^>]*><span[^>]*industry-me\.png/);
  expect(inline).not.toContain('size-3.5');
});
