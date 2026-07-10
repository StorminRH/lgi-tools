'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Popover } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { TypeIcon } from '@/components/ui/type-icon';
import { apiFetch, type ApiResult } from '@/lib/api-client';
import {
  createSavedPlanEndpoint,
  deleteSavedPlanEndpoint,
  favoriteSavedPlanEndpoint,
  MAX_SAVED_PLAN_NAME_LEN,
  renameSavedPlanEndpoint,
  savedPlansEndpoint,
  type SavedPlanRow,
  type SavedPlansResponse,
} from '../api-contract';
import { captureTemplate } from '../template-manifest';
import { usePricing } from './PricingProvider';

// Saved build templates (3.7.23): the PlannerHead's click-popover, cloned from
// the multibuy panel idiom. Save captures the planner's full configuration
// (captureTemplate — inputs only); the list spans ALL blueprints (favorites
// first, the server's order); loading navigates to the template's own planner
// page with ?plan=, where TemplateLoader replays it. Every mutating endpoint
// echoes the full updated list, so the panel re-renders without a refetch.

const inputClass =
  'border border-border bg-bg px-2 py-1 font-mono text-[12px] text-text ' +
  'placeholder:text-faint focus:border-border-active focus:outline-none';

const actionClass =
  'cursor-pointer font-mono text-[11px] text-faint transition-colors hover:text-name ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

// One list row. Load is the row's primary action (the name button); the
// side actions are favorite, rename (inline edit), and the two-step delete —
// ✕ arms the row into a red "confirm?" and only the second press deletes.
function TemplateRow({
  row,
  busy,
  armed,
  editing,
  onLoad,
  onFavorite,
  onStartRename,
  onCommitRename,
  onDelete,
}: {
  row: SavedPlanRow;
  busy: boolean;
  armed: boolean;
  editing: boolean;
  onLoad: () => void;
  onFavorite: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(row.name);
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={onFavorite}
        disabled={busy}
        aria-label={row.favorite ? `Unfavorite ${row.name}` : `Favorite ${row.name}`}
        aria-pressed={row.favorite}
        className={`${actionClass} ${row.favorite ? 'text-isk hover:text-isk' : ''}`}
      >
        {row.favorite ? '★' : '☆'}
      </button>
      {editing ? (
        <input
          type="text"
          value={draft}
          maxLength={MAX_SAVED_PLAN_NAME_LEN}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename(draft);
          }}
          onBlur={() => onCommitRename(draft)}
          aria-label={`Rename ${row.name}`}
          // Entering the inline edit is an explicit user action; focus follows it.
          autoFocus
          className={`${inputClass} h-6 min-w-0 flex-1`}
        />
      ) : (
        <button
          type="button"
          onClick={onLoad}
          disabled={busy}
          className="group/load flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left disabled:cursor-not-allowed"
        >
          <TypeIcon typeId={row.productTypeId} size={16} />
          <span className="truncate font-mono text-[11px] text-text transition-colors group-hover/load:text-isk">
            {row.name}
          </span>
          <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-faint">
            {row.productName}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onStartRename}
        disabled={busy || editing}
        aria-label={`Rename ${row.name}`}
        className={actionClass}
      >
        ✎
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={armed ? `Confirm deleting ${row.name}` : `Delete ${row.name}`}
        className={`${actionClass} ${armed ? 'text-tone-red hover:text-tone-red' : ''}`}
      >
        {armed ? 'confirm?' : '✕'}
      </button>
    </li>
  );
}

export function TemplatesMenu({
  blueprintTypeId,
  productName,
}: {
  blueprintTypeId: number;
  productName: string;
}) {
  const ctx = usePricing();
  const router = useRouter();
  const [plans, setPlans] = useState<SavedPlanRow[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  // Refresh on every open (keeping the stale list up while the read runs);
  // closing resets the transient row states so a re-open starts clean.
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setEditingId(null);
      setArmedDeleteId(null);
      return;
    }
    apiFetch(savedPlansEndpoint, { cache: 'no-store' })
      .then((res) => {
        setListFailed(!res.ok);
        if (res.ok) setPlans(res.data.plans);
      })
      .catch(() => setListFailed(true));
  };

  // Shared completion for every mutating call: apply the echoed list on
  // success, otherwise surface the endpoint-specific error copy.
  const applyResult = (
    res: ApiResult<SavedPlansResponse> | null,
    errorFor: (status: number) => string,
  ) => {
    if (res?.ok) {
      setPlans(res.data.plans);
      return true;
    }
    toast.error(errorFor(res?.status ?? 0));
    return false;
  };

  const save = () => {
    const name = saveName.trim();
    if (name === '' || saving) return;
    setSaving(true);
    apiFetch(createSavedPlanEndpoint, {
      body: { name, snapshot: captureTemplate(ctx, blueprintTypeId) },
    })
      .catch(() => null)
      .then((res) => {
        setSaving(false);
        const ok = applyResult(res, (status) =>
          status === 401
            ? 'Sign in to save build templates'
            : status === 409
              ? 'Template limit reached — delete one first'
              : "Couldn't save the template",
        );
        if (ok) {
          setSaveName('');
          toast.success(`Saved "${name}"`);
        }
      });
  };

  const mutateRow = (
    id: string,
    call: () => Promise<ApiResult<SavedPlansResponse>>,
    failMsg: string,
  ) => {
    setBusyId(id);
    call()
      .catch(() => null)
      .then((res) => {
        setBusyId(null);
        applyResult(res, () => failMsg);
      });
  };

  const commitRename = (row: SavedPlanRow, draft: string) => {
    setEditingId(null);
    const name = draft.trim();
    if (name === '' || name === row.name) return;
    mutateRow(
      row.id,
      () => apiFetch(renameSavedPlanEndpoint, { body: { id: row.id, name } }),
      "Couldn't rename the template",
    );
  };

  const deleteRow = (row: SavedPlanRow) => {
    if (armedDeleteId !== row.id) {
      setArmedDeleteId(row.id);
      return;
    }
    setArmedDeleteId(null);
    mutateRow(
      row.id,
      () => apiFetch(deleteSavedPlanEndpoint, { body: { id: row.id } }),
      "Couldn't delete the template",
    );
  };

  // The roster settles to [] for an anonymous visitor (null = still loading) —
  // the same signed-out signal the multibuy panel derives, without importing
  // the auth surface.
  const signedOut = ctx.buildCharacters !== null && ctx.buildCharacters.length === 0;
  const emptyLine = listFailed
    ? "Couldn't load your saved templates"
    : signedOut
      ? 'Sign in to save build templates'
      : plans === null
        ? 'Loading…'
        : 'No saved templates yet';

  return (
    <Popover
      label="Saved templates"
      openOnHover={false}
      onOpenChange={onOpenChange}
      className="w-[320px]"
      triggerClassName="group inline-flex cursor-pointer items-baseline gap-2"
      trigger={
        <span className="inline-flex items-baseline gap-2 font-mono text-caption font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-name">
          <span className="tracking-normal text-isk">{'//'}</span>
          Templates
          <span className="inline-block text-[10px] text-muted">▾</span>
        </span>
      }
    >
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-isk">
        Saved templates
      </span>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={saveName}
          maxLength={MAX_SAVED_PLAN_NAME_LEN}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder={`e.g. ${productName} weekly`}
          aria-label="Template name"
          className={`${inputClass} h-7 min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={save}
          disabled={saveName.trim() === '' || saving}
          className="rounded-[3px] border border-isk-dim bg-pill-green-bg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-isk transition-colors hover:border-isk disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {plans !== null && plans.length > 0 ? (
        <ul className="flex max-h-[264px] flex-col gap-1.5 overflow-y-auto">
          {plans.map((row) => (
            <TemplateRow
              key={`${row.id}:${row.name}`}
              row={row}
              busy={busyId === row.id}
              armed={armedDeleteId === row.id}
              editing={editingId === row.id}
              onLoad={() => router.push(`/industry/${row.blueprintTypeId}?plan=${row.id}`)}
              onFavorite={() =>
                mutateRow(
                  row.id,
                  () =>
                    apiFetch(favoriteSavedPlanEndpoint, {
                      body: { id: row.id, favorite: !row.favorite },
                    }),
                  "Couldn't update the favorite",
                )
              }
              onStartRename={() => {
                setArmedDeleteId(null);
                setEditingId(row.id);
              }}
              onCommitRename={(draft) => commitRename(row, draft)}
              onDelete={() => deleteRow(row)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[10.5px] leading-snug text-muted">{emptyLine}</p>
      )}
    </Popover>
  );
}
