import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { setMemberCategories } from '@/features/industry-planner/profiles/assignments';

// Show dialog contents inline; the real popups only mount in a browser.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('div', { role: 'dialog' }, children),
  DialogHeader: ({ title, description }: { title: ReactNode; description?: ReactNode }) =>
    createElement('header', null, title, description),
  DialogClose: ({ children }: { children: ReactNode }) => createElement('button', null, children),
}));

import { DeleteProfileDialog, ProfileNameDialog, RemoveMemberDialog } from './ProfileDialogs';
import { type DialogContext, type DialogState, WorkspaceDialogs } from './WorkspaceDialogs';

const BUILDER = { characterId: 101, name: 'Builder', portraitUrl: 'p/101' };
const REACTOR = { characterId: 102, name: 'Reactor', portraitUrl: 'p/102' };

function profile(): IndustryProfileRow {
  let doc = emptyProfileDocument([
    { characterId: BUILDER.characterId, name: BUILDER.name },
    { characterId: REACTOR.characterId, name: REACTOR.name },
  ]);
  doc = setMemberCategories(doc, BUILDER.characterId, ['components', 'capital-ships']);
  return { id: 'caps', name: 'Production', revision: 2, document: doc, updatedAt: '2026-09-29T00:00:00.000Z' };
}

function context(results: { created?: string | null; removed?: boolean } = {}) {
  const ctx = {
    state: {
      profiles: [profile()],
      busy: false,
      create: vi.fn(async () => results.created ?? null),
      duplicate: vi.fn(async () => results.created ?? null),
      save: vi.fn(),
      remove: vi.fn(async () => results.removed ?? false),
    },
    roster: [BUILDER, REACTOR],
    nameOf: (id: number) => (id === BUILDER.characterId ? BUILDER.name : 'Someone'),
    onClose: vi.fn(),
    onSelectProfile: vi.fn(),
  } satisfies DialogContext;
  return ctx;
}

type Rendered = ReactElement<Record<string, unknown>>;

/** The concrete dialog element a dialog state opens, one component deep. */
function open(dialog: DialogState, ctx: DialogContext, current: IndustryProfileRow | null = profile()): Rendered {
  const outer = WorkspaceDialogs({ dialog, profile: current, ctx }) as Rendered;
  return (outer.type as (props: unknown) => Rendered)(outer.props);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('creating suggests a free name, can start with every linked character, and opens the new profile', async () => {
  const ctx = context({ created: 'new-id' });
  const create = open({ kind: 'create' }, ctx, null);
  expect(create.type).toBe(ProfileNameDialog);
  expect(create.props.initialName).toBe('Production 2');
  (create.props.onSubmit as (name: string, includeRoster: boolean) => void)('Capitals', true);
  await settle();
  expect(ctx.state.create).toHaveBeenCalledWith(
    'Capitals',
    emptyProfileDocument([
      { characterId: BUILDER.characterId, name: BUILDER.name },
      { characterId: REACTOR.characterId, name: REACTOR.name },
    ]),
  );
  expect(ctx.onSelectProfile).toHaveBeenCalledWith('new-id');

  // A refused create keeps the dialog open and the current profile selected.
  const refused = context({ created: null });
  (open({ kind: 'create' }, refused, null).props.onSubmit as (n: string, r: boolean) => void)('Solo', false);
  await settle();
  expect(refused.state.create).toHaveBeenCalledWith('Solo', emptyProfileDocument([]));
  expect(refused.onClose).not.toHaveBeenCalled();
  expect(refused.onSelectProfile).not.toHaveBeenCalled();

  const html = renderToStaticMarkup(createElement(ProfileNameDialog, { ...create.props } as never));
  expect(html).toContain('Start with all 2 linked characters');
  expect(html).toContain('value="Production 2"');
  const rename = renderToStaticMarkup(
    createElement(ProfileNameDialog, { ...open({ kind: 'rename' }, context()).props } as never),
  );
  expect(rename).not.toContain('linked characters');
});

test('rename, duplicate, delete and remove each act on the open profile', async () => {
  const ctx = context({ created: 'copy-id', removed: true });
  const current = profile();

  const rename = open({ kind: 'rename' }, ctx, current);
  (rename.props.onSubmit as (name: string) => void)('Capital line');
  expect(ctx.state.save).toHaveBeenCalledWith('caps', { name: 'Capital line', document: current.document });

  const duplicate = open({ kind: 'duplicate' }, ctx, current);
  expect(duplicate.props.initialName).toBe('Production copy');
  (duplicate.props.onSubmit as (name: string) => void)('Production copy');
  await settle();
  expect(ctx.state.duplicate).toHaveBeenCalledWith('caps', 'Production copy');
  expect(ctx.onSelectProfile).toHaveBeenLastCalledWith('copy-id');

  const remove = open({ kind: 'delete' }, ctx, current);
  expect(remove.type).toBe(DeleteProfileDialog);
  (remove.props.onConfirm as () => void)();
  await settle();
  expect(ctx.state.remove).toHaveBeenCalledWith('caps');
  expect(ctx.onSelectProfile).toHaveBeenLastCalledWith(null);

  const kept = context({ removed: false });
  (open({ kind: 'delete' }, kept, current).props.onConfirm as () => void)();
  await settle();
  expect(kept.onSelectProfile).not.toHaveBeenCalled();

  const member = open({ kind: 'remove-member', characterId: BUILDER.characterId }, ctx, current);
  expect(member.type).toBe(RemoveMemberDialog);
  expect(member.props).toMatchObject({ name: BUILDER.name, categoryCount: 2 });
  (member.props.onConfirm as () => void)();
  const saved = ctx.state.save.mock.calls.at(-1) as unknown as [string, { document: IndustryProfileRow['document'] }];
  expect(saved[1].document.members.map((m) => [m.characterId, m.categories])).toEqual([[REACTOR.characterId, []]]);

  // Nothing but create opens without a profile.
  expect(WorkspaceDialogs({ dialog: { kind: 'rename' }, profile: null, ctx })).toBeNull();
  expect(WorkspaceDialogs({ dialog: null, profile: current, ctx })).toBeNull();
});
