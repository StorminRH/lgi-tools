'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Menu,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  menuRow,
  menuSeparator,
} from '@/components/ui/menu';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import {
  buildRadioValue,
  parseRadioSelection,
  runAsView,
  type BuildCharacter,
} from './run-as-state';

const FRAME_CLASSES = 'flex w-full min-w-0 items-center gap-3 text-left';

function InertRunAsFrame({ loading }: { loading: boolean }) {
  return (
    <div
      role={loading ? undefined : 'img'}
      className={FRAME_CLASSES}
      aria-label={loading ? undefined : 'Building character'}
    >
      {loading ? (
        <Skeleton label="Loading build character" className="size-12 rounded-full" />
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border-idle text-lead text-muted"
          >
            —
          </span>
          <span className="text-ui text-muted">Sign in to build with your skills</span>
        </>
      )}
    </div>
  );
}

function RunAsCharacterItems({ characters }: { characters: BuildCharacter[] | null }) {
  return (
    <>
      {(characters ?? []).map((c) => (
        <MenuRadioItem
          key={c.characterId}
          value={c.characterId}
          closeOnClick
          className={menuRow}
        >
          <CharacterPortrait characterId={c.characterId} name={c.name} src={c.portraitUrl} size={28} />
          <span className="truncate">{c.name}</span>
          <MenuRadioItemIndicator className="ml-auto pl-2 text-micro leading-none text-muted">
            ✓
          </MenuRadioItemIndicator>
        </MenuRadioItem>
      ))}
    </>
  );
}

export function RunAsFrame({
  buildCharacter,
  buildCharacterPending,
  buildCharacters,
  onSelect,
}: {
  buildCharacter: BuildCharacter | null;
  buildCharacterPending: boolean;
  buildCharacters: BuildCharacter[] | null;
  onSelect: (id: number | null) => void;
}) {
  const view = runAsView(useAuth(), {
    character: buildCharacter,
    pending: buildCharacterPending,
  });

  if (view.kind !== 'present') {
    return <InertRunAsFrame loading={view.kind === 'loading'} />;
  }

  return (
    <Menu
      label={`Building as ${view.name} — choose build character`}
      trigger={
        <>
          <CharacterPortrait
            characterId={view.characterId}
            name={view.name}
            src={view.portraitUrl}
            size={64}
            className="size-12"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-nav font-bold leading-tight text-name">{view.name}</span>
            <span className="flex items-center gap-1 font-data text-micro uppercase tracking-label text-muted">
              Change
              <span aria-hidden className="leading-none">
                ▾
              </span>
            </span>
          </span>
        </>
      }
      triggerClassName={`${FRAME_CLASSES} cursor-pointer rounded-ctl transition-opacity hover:opacity-80 data-[popup-open]:opacity-80`}
      className="min-w-60"
      align="start"
      sideOffset={4}
    >
      <MenuRadioGroup
        value={buildRadioValue(buildCharacter)}
        onValueChange={(value) => onSelect(parseRadioSelection(value as number))}
      >
        <MenuRadioItem value={0} closeOnClick className={menuRow}>
          <span className="truncate">Default (active character)</span>
          <MenuRadioItemIndicator className="ml-auto pl-2 text-micro leading-none text-muted">
            ✓
          </MenuRadioItemIndicator>
        </MenuRadioItem>
        <MenuSeparator className={menuSeparator} />
        <RunAsCharacterItems characters={buildCharacters} />
      </MenuRadioGroup>
    </Menu>
  );
}
