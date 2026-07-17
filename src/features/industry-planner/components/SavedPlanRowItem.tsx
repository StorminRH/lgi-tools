'use client';

// One saved-template list row, shared by the planner's TemplatesMenu popover
// and the /industry/templates manager page (moved out of TemplatesMenu in 3.7.24,
// behavior unchanged). Load is the row's primary action (the name button); the
// side actions are favorite, rename (inline edit), and the two-step delete —
// ✕ arms the row into a red "confirm?" and only the second press deletes.
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { TypeIcon } from '@/components/type-icon';
import { MAX_SAVED_PLAN_NAME_LEN, type SavedPlanRow } from '../api-contract';
import { savedPlanRowLabels } from '../saved-plans-view';

const actionClass =
  'cursor-pointer font-mono text-ui leading-none text-faint transition-colors hover:text-name ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/** Renders one saved-plan row with load, favorite, rename, and delete actions supplied by its controller. */
export function SavedPlanRowItem({
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
  const labels = savedPlanRowLabels(row, armed);
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={onFavorite}
        disabled={busy}
        aria-label={labels.favoriteAria}
        aria-pressed={row.favorite}
        className={`${actionClass} ${labels.favoriteClass}`}
      >
        {labels.favoriteGlyph}
      </button>
      {editing ? (
        <Input
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
          size="sm"
          className="h-6 min-w-0 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={onLoad}
          disabled={busy}
          className="group/load flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left disabled:cursor-not-allowed"
        >
          <TypeIcon typeId={row.productTypeId} size={16} />
          <span className="truncate font-mono text-ui text-text transition-colors group-hover/load:text-isk">
            {row.name}
          </span>
          <span className="ml-auto shrink-0 truncate font-mono text-micro text-faint">
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
        aria-label={labels.deleteAria}
        className={`${actionClass} ${labels.deleteClass}`}
      >
        {armed ? <span className="text-ui">confirm?</span> : '✕'}
      </button>
    </li>
  );
}
