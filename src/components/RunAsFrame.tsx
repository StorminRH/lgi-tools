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
import {
  buildRadioValue,
  parseRadioSelection,
  runAsView,
  type BuildCharacter,
} from './run-as-state';

// Borderless column on the hero band's 108px plane (the item render keeps its
// boxed square; this frame is heading / portrait / name, no box). The plain
// frame and the menu-trigger button must share one footprint, and the column
// centers vertically on the band like every other cluster.
const FRAME_CLASSES =
  'relative flex w-[108px] shrink-0 flex-col items-center justify-center gap-1.5 p-2';

// What the frame IS — the selector's heading, above the portrait in every state.
// nowrap: the label is a touch wider than the 108px column and centers over it,
// spilling harmlessly into the band's cluster gaps rather than wrapping tall.
const HEADING = (
  <span className="whitespace-nowrap font-mono text-label uppercase tracking-[0.14em] text-muted">
    Build character
  </span>
);

// Loading / anon: an inert labelled column, no menu (role="img" so the aria-label
// is announced on a role-less div). No caret — it appears only when the frame is
// actually openable.
function InertRunAsFrame({ loading }: { loading: boolean }) {
  return (
    <div role="img" className={FRAME_CLASSES} aria-label="Building character">
      {HEADING}
      {loading ? (
        <span aria-hidden className="size-16 rounded-full border border-border-idle bg-bg-deep" />
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-16 items-center justify-center rounded-full border border-border-idle text-lead text-muted"
          >
            —
          </span>
          <span className="text-label uppercase tracking-[0.14em] text-muted">Sign in</span>
        </>
      )}
    </div>
  );
}

// The linked-character radio rows below the Default option. needsReconnect rows
// are listed unfiltered — scope health never gates selection (Phase 3 decides how
// missing data degrades).
function RunAsCharacterItems({ characters }: { characters: BuildCharacter[] | null }) {
  return (
    <>
      {(characters ?? []).map((c) => (
        <MenuRadioItem
          key={c.characterId}
          value={c.characterId}
          closeOnClick
          className="account-menu-item flex items-center gap-2"
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

  // Signed in: the whole frame is the menu trigger (a real button — its
  // aria-label carries the identity the old role="img" div announced). The rows
  // are menuitemradio (pick one of N); "Default" CLEARS the stored pick (writes
  // null, never the active id) so the mirror keeps following the active character.
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
          <span className="flex max-w-full items-center gap-1 font-mono text-label uppercase tracking-[0.08em] text-muted">
            <span className="truncate">{view.name}</span>
            <span aria-hidden className="text-micro leading-none">
              ▾
            </span>
          </span>
        </>
      }
      triggerClassName={`${FRAME_CLASSES} cursor-pointer transition-opacity hover:opacity-80 data-[popup-open]:opacity-80`}
      className="run-as-menu-panel"
      align="start"
      sideOffset={4}
    >
      <MenuRadioGroup
        value={buildRadioValue(buildCharacter)}
        onValueChange={(value) => onSelect(parseRadioSelection(value as number))}
      >
        {/* value 0 is unreachable as a character id (ids are positive ints) —
            the sentinel for "no explicit pick". */}
        <MenuRadioItem value={0} closeOnClick className="account-menu-item flex items-center">
          <span className="truncate">Default (active character)</span>
          <MenuRadioItemIndicator className="ml-auto pl-2 text-micro leading-none text-muted">
            ✓
          </MenuRadioItemIndicator>
        </MenuRadioItem>
        <MenuSeparator className="account-menu-separator" />
        <RunAsCharacterItems characters={buildCharacters} />
      </MenuRadioGroup>
    </Menu>
  );
}
