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

const FRAME_CLASSES =
  'relative flex w-[108px] shrink-0 flex-col items-center justify-center gap-1.5 p-2';

const HEADING = (
  <span className="whitespace-nowrap text-label uppercase tracking-wide text-muted">
    Build character
  </span>

);

function InertRunAsFrame({ loading }: { loading: boolean }) {
  return (
    <div
      role={loading ? undefined : 'img'}
      className={FRAME_CLASSES}
      aria-label={loading ? undefined : 'Building character'}
    >
      {HEADING}
      {loading ? (
        <Skeleton label="Loading build character" className="size-16 rounded-full" />
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-16 items-center justify-center rounded-full border border-border-idle text-lead text-muted"
          >
            —
          </span>

          <span className="text-label uppercase tracking-wide text-muted">Sign in</span>

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
          {HEADING}
          <CharacterPortrait
            characterId={view.characterId}
            name={view.name}
            src={view.portraitUrl}
            size={64}
          />
          <span className="flex max-w-full items-center gap-1 font-data text-label uppercase tracking-label text-muted">
            <span className="truncate">{view.name}</span>

            <span aria-hidden className="text-micro leading-none">
              ▾
            </span>

          </span>

        </>

      }
      triggerClassName={`${FRAME_CLASSES} cursor-pointer transition-opacity hover:opacity-80 data-[popup-open]:opacity-80`}
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
