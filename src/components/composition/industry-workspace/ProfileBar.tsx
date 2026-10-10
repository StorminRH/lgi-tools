'use client';

import { Button } from '@/components/ui/button';
import { floatSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Menu, MenuItem, menuRow } from '@/components/ui/menu';
import { scrollArea } from '@/components/ui/scroll-area';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { formatCount } from '@/lib/format/number';

export type ProfileAction = 'create' | 'rename' | 'duplicate' | 'delete';

/**
 * Which profile the workspace shows, and the actions on it. Switching is an
 * explicit choice here; nothing else on the site changes which profile is open.
 */
export function ProfileBar({
  profiles,
  selected,
  busy,
  onSelect,
  onAction,
}: {
  profiles: readonly IndustryProfileRow[];
  selected: IndustryProfileRow;
  busy: boolean;
  onSelect: (id: string) => void;
  onAction: (action: ProfileAction) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
      <Menu
        label={`Switch profile from ${selected.name}`}
        trigger={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{selected.name}</span>
            <span aria-hidden className="font-data text-label text-faint">⌄</span>
          </span>
        }
        triggerClassName={cn(
          floatSurface,
          'flex h-10 w-max max-w-full min-w-0 cursor-pointer items-center rounded-full px-4 font-display text-h3 font-bold tracking-copy text-name outline-none transition-colors hover:border-border-active focus-visible:border-border-active',
        )}
        className={`${scrollArea} flex min-w-64 flex-col rounded-card p-[5px] max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain`}
        surface="frosted"
        side="bottom"
        align="start"
        sideOffset={8}
      >
        {profiles.map((profile) => {
          const current = profile.id === selected.id;
          return (
            <MenuItem
              key={profile.id}
              closeOnClick
              aria-current={current ? 'true' : undefined}
              className={cn(menuRow, 'justify-between gap-4 rounded-ctl', current && 'bg-row-on text-name')}
              onClick={() => onSelect(profile.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn('w-3 font-data text-isk', !current && 'invisible')}>
                  ✓
                </span>
                <span className="truncate">{profile.name}</span>
              </span>
              <span className="shrink-0 font-data text-micro text-faint">
                {formatCount(profile.document.members.length, 'member')}
              </span>
            </MenuItem>
          );
        })}
      </Menu>
      <Menu
        label={`Manage ${selected.name}`}
        trigger={<span aria-hidden>⋯</span>}
        triggerClassName={cn(
          floatSurface,
          'flex size-10 cursor-pointer items-center justify-center rounded-full font-data text-h3 text-muted outline-none transition-colors hover:border-border-active hover:text-name focus-visible:border-border-active',
        )}
        className="flex min-w-48 flex-col rounded-card p-[5px]"
        surface="frosted"
        side="bottom"
        align="start"
        sideOffset={8}
      >
        <MenuItem closeOnClick disabled={busy} className={cn(menuRow, 'rounded-ctl')} onClick={() => onAction('rename')}>
          Rename…
        </MenuItem>
        <MenuItem closeOnClick disabled={busy} className={cn(menuRow, 'rounded-ctl')} onClick={() => onAction('duplicate')}>
          Duplicate…
        </MenuItem>
        <MenuItem
          closeOnClick
          disabled={busy}
          className={cn(menuRow, 'rounded-ctl')}
          onClick={() => onAction('delete')}
        >
          Delete…
        </MenuItem>
      </Menu>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction('create')}>
        + New profile
      </Button>
    </div>
  );
}
