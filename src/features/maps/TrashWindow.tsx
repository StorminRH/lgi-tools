'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import {
  mapLifecycleFailureMessage,
  requestMapPurge,
  restoreMap,
} from './map-lifecycle-client';

/** Creator-owned selected ids eligible for the one permanent-delete confirmation. */
export function selectedCreatorMapIds(
  maps: readonly DeletedRestorableMapRow[],
  selected: ReadonlySet<string>,
): string[] {
  return maps
    .filter((map) => selected.has(map.id) && map.provenance.kind === 'created')
    .map((map) => map.id);
}

/** Applies one lifecycle action serially and stops at the first refusal. */
export async function runMapLifecycleBatch(
  mapIds: Iterable<string>,
  action: (input: { readonly mapId: string }) => Promise<{ readonly ok: boolean }>,
): Promise<{ readonly succeeded: readonly string[]; readonly complete: boolean }> {
  const succeeded: string[] = [];
  for (const mapId of mapIds) {
    if (!(await action({ mapId })).ok) return { succeeded, complete: false };
    succeeded.push(mapId);
  }
  return { succeeded, complete: true };
}

/** Removes completed or no-longer-visible ids from controlled trash selection. */
export function pruneTrashSelection(
  selected: ReadonlySet<string>,
  removeIds: Iterable<string>,
): Set<string> {
  const next = new Set(selected);
  for (const mapId of removeIds) next.delete(mapId);
  return next;
}

function TrashMapRows({
  maps,
  selected,
  disabled,
  onCheckedChange,
}: {
  readonly maps: readonly DeletedRestorableMapRow[];
  readonly selected: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onCheckedChange: (mapId: string, checked: boolean) => void;
}) {
  if (maps.length === 0) {
    return <p className="font-ui text-ui text-muted">Trash is empty.</p>;
  }
  return maps.map((map) => (
    <label
      key={map.id}
      className="flex cursor-pointer items-center gap-3 rounded-ctl border border-border-soft bg-surface-sunk px-3 py-2"
    >
      <Checkbox
        checked={selected.has(map.id)}
        onCheckedChange={(checked) => onCheckedChange(map.id, checked)}
        label={`Select ${map.name}`}
        disabled={disabled}
      />
      <span className="min-w-0 flex-1 truncate font-ui text-ui text-name">
        {map.name}
      </span>
      <span className="font-data text-micro text-muted">
        {map.provenance.kind === 'created' ? 'Created by you' : 'Admin access'}
      </span>
    </label>
  ));
}

/** Controlled trash surface for multi-restore and creator-only purge requests. */
export function TrashWindow({
  open,
  onOpenChange,
  maps,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly maps: readonly DeletedRestorableMapRow[];
}) {
  const router = useRouter();
  const titleId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<'restore' | 'purge' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleSelected = useMemo(() => {
    const visible = new Set(maps.map((map) => map.id));
    return new Set([...selected].filter((mapId) => visible.has(mapId)));
  }, [maps, selected]);
  const creatorIds = useMemo(
    () => selectedCreatorMapIds(maps, visibleSelected),
    [maps, visibleSelected],
  );
  const permanentEligible =
    visibleSelected.size > 0 && creatorIds.length === visibleSelected.size;

  function setChecked(mapId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(mapId);
      else next.delete(mapId);
      return next;
    });
    setError(null);
  }

  async function restoreSelected() {
    setBusy('restore');
    setError(null);
    const result = await runMapLifecycleBatch(visibleSelected, restoreMap);
    setBusy(null);
    setSelected((current) => pruneTrashSelection(current, result.succeeded));
    if (result.complete) setSelected(new Set());
    else setError(mapLifecycleFailureMessage('restore'));
    router.refresh();
  }

  async function purgeSelected() {
    setBusy('purge');
    setError(null);
    const result = await runMapLifecycleBatch(creatorIds, requestMapPurge);
    setBusy(null);
    setSelected((current) => pruneTrashSelection(current, result.succeeded));
    if (result.complete) {
      setConfirmOpen(false);
      setSelected(new Set());
    } else {
      setError(mapLifecycleFailureMessage('purge'));
    }
    router.refresh();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy === null && !confirmOpen) onOpenChange(next);
        }}
        labelledBy={titleId}
        className="max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div className="flex flex-col gap-1">
            <DialogTitle
              id={titleId}
              className="font-display text-h2 font-semibold tracking-copy uppercase text-name"
            >
              Deleted maps
            </DialogTitle>
            <DialogDescription className="font-ui text-ui text-muted">
              Restore maps during their 30-day undo window.
            </DialogDescription>
          </div>
          <DialogClose render={<Button variant="ghost" size="sm" />} aria-label="Close trash">
            ×
          </DialogClose>
        </header>

        <div className="flex flex-col gap-2 px-4 py-4">
          <TrashMapRows
            maps={maps}
            selected={visibleSelected}
            disabled={busy !== null}
            onCheckedChange={setChecked}
          />
          {error !== null ? <Banner tone="warn">{error}</Banner> : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border-soft px-4 py-3">
          <Button
            variant="danger"
            size="sm"
            disabled={!permanentEligible || busy !== null}
            onClick={() => setConfirmOpen(true)}
          >
            Permanently delete
          </Button>
          <div className="flex items-center gap-2.5">
            <DialogClose render={<Button variant="secondary" size="sm" />} disabled={busy !== null}>
              Done
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              disabled={visibleSelected.size === 0 || busy !== null}
              onClick={() => void restoreSelected()}
            >
              {busy === 'restore' ? 'Restoring…' : 'Restore'}
            </Button>
          </div>
        </footer>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Permanently delete selected maps?"
        consequence={`${creatorIds.length} selected map${creatorIds.length === 1 ? '' : 's'} will enter the next scheduled purge. This cannot be undone after the sweep completes.`}
        busy={busy === 'purge'}
        error={error}
        confirmLabel="Permanently delete"
        confirmDisabled={!permanentEligible}
        onConfirm={() => void purgeSelected()}
      />
    </>
  );
}
