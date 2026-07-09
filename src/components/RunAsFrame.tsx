'use client';

// The "Run-As" building-character frame in the industry planner's hero card. The
// frame renders the SELECTED build character (the ACCOUNT.8 pick, persisted in
// user_preferences) and falls back to mirroring the live active character when no
// pick is stored — the caret opens the selector menu listing the account's linked
// characters. Selection is display + a plumbing seam only this session; the
// skills/standings levers that make it change numbers are Phase 3.
//
// Shared zone (not a feature slice): it reads the auth session, which only the
// `shared` layer (src/components/*.tsx) may import from a feature — so the frame
// lives here beside the other identity-aware shells (live-character-card), and the
// planner feature composes it via @/components/RunAsFrame, threading the selection
// props from its pricing context.
import { CharacterPortrait } from '@/components/character-portrait';
import {
  Menu,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
} from '@/components/ui/menu';
import { useAuth } from '@/features/auth/components/AuthProvider';
import { runAsView, type BuildCharacter } from './run-as-state';

// The 108px square is the hero band's plane — HeroCard's item render is its exact
// twin, so the plain frame and the menu-trigger button must share one footprint.
const FRAME_CLASSES =
  'relative flex aspect-square w-[108px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[3px] border border-border p-2';

const CARET = (
  <span aria-hidden className="absolute right-1 top-1 text-[10px] leading-none text-muted">
    ▾
  </span>
);

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
    // Loading / anon: the pre-selector frame, unchanged — an inert labelled
    // square (role="img" so the aria-label is announced on a role-less div).
    return (
      <div role="img" className={FRAME_CLASSES} aria-label="Building character">
        {CARET}
        {view.kind === 'loading' ? (
          <span aria-hidden className="size-16 rounded-full border border-border-idle bg-bg-deep" />
        ) : (
          <>
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full border border-border-idle text-[18px] text-muted"
            >
              —
            </span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Sign in</span>
          </>
        )}
      </div>
    );
  }

  // Signed in: the whole frame is the menu trigger (a real button — its
  // aria-label carries the identity the old role="img" div announced). The rows
  // are menuitemradio (pick one of N); "Default" CLEARS the stored pick (writes
  // null, never the active id) so the mirror keeps following the active
  // character. needsReconnect rows are listed unfiltered — scope health never
  // gates selection (Phase 3 decides how missing data degrades).
  return (
    <Menu
      label={`Building as ${view.name} — choose build character`}
      trigger={
        <>
          {CARET}
          <CharacterPortrait
            characterId={view.characterId}
            name={view.name}
            src={view.portraitUrl}
            size={64}
          />
          <span className="max-w-full truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
            {view.name}
          </span>
        </>
      }
      triggerClassName={`${FRAME_CLASSES} cursor-pointer transition-opacity hover:opacity-80 data-[popup-open]:opacity-80`}
      className="run-as-menu-panel"
      align="start"
      sideOffset={4}
    >
      <MenuRadioGroup
        value={buildCharacter?.characterId ?? 0}
        onValueChange={(value) => onSelect(value === 0 ? null : (value as number))}
      >
        {/* value 0 is unreachable as a character id (ids are positive ints) —
            the sentinel for "no explicit pick". */}
        <MenuRadioItem value={0} closeOnClick className="account-menu-item flex items-center">
          <span className="truncate">Default (active character)</span>
          <MenuRadioItemIndicator className="ml-auto pl-2 text-[10px] leading-none text-muted">
            ✓
          </MenuRadioItemIndicator>
        </MenuRadioItem>
        <MenuSeparator className="account-menu-separator" />
        {(buildCharacters ?? []).map((c) => (
          <MenuRadioItem
            key={c.characterId}
            value={c.characterId}
            closeOnClick
            className="account-menu-item flex items-center gap-2"
          >
            <CharacterPortrait characterId={c.characterId} name={c.name} src={c.portraitUrl} size={28} />
            <span className="truncate">{c.name}</span>
            <MenuRadioItemIndicator className="ml-auto pl-2 text-[10px] leading-none text-muted">
              ✓
            </MenuRadioItemIndicator>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </Menu>
  );
}
