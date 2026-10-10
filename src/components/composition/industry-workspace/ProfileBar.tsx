'use client';

import { Button } from '@/components/ui/button';
import { floatIconTrigger } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { CheckIcon } from '@/components/ui/icons';
import { Menu, MenuItem, menuRow } from '@/components/ui/menu';
import { SwitcherMenu } from '@/components/ui/switcher-menu';
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
      <SwitcherMenu
        label={`Switch profile from ${selected.name}`}
        current={selected.name}
        className="flex min-w-64 flex-col"
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
                <span aria-hidden className={cn('flex w-3 text-isk', !current && 'invisible')}>
                  <CheckIcon size={12} />
                </span>
                <span className="truncate">{profile.name}</span>
              </span>
              <span className="shrink-0 font-data text-micro text-faint">
                {formatCount(profile.document.members.length, 'member')}
              </span>
            </MenuItem>
          );
        })}
      </SwitcherMenu>
      <Menu
        label={`Manage ${selected.name}`}
        trigger={<span aria-hidden>⋯</span>}
        triggerClassName={cn(floatIconTrigger, 'font-data text-h3')}
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
