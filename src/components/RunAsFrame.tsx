'use client';

// The "Run-As" building-character frame in the industry planner's hero card: a
// rectangular portrait frame that MIRRORS the current active character read-only
// (via the canonical useAuth session — no parallel notion of "active character"),
// with an inert dropdown caret. This is the display seam for the future Run-As
// feature (character selection + skills/standings application); the caret renders
// but does nothing this session.
//
// Shared zone (not a feature slice): it reads the auth session, which only the
// `shared` layer (src/components/*.tsx) may import from a feature — so the frame
// lives here beside the other identity-aware shells (live-character-card), and the
// planner feature composes it via @/components/RunAsFrame.
import { CharacterPortrait } from '@/components/character-portrait';
import { useAuth } from '@/features/auth/components/AuthProvider';
import { runAsView } from './run-as-state';

export function RunAsFrame() {
  const view = runAsView(useAuth());
  // FUTURE (Run-As identity switch): wrap this frame's trigger in <Menu> from
  // @/components/ui/menu, listing the building characters, and make the caret the
  // menu trigger. Inert visual stub this session — no menu is wired and the caret
  // is a plain glyph that does nothing on click.
  return (
    <div
      // role="img" so the aria-label is actually announced — on a role-less div
      // it's ignored. The frame reads as one labelled avatar (the inner portrait
      // and caret are atomic under it). Becomes a real button when the Run-As
      // dropdown is wired.
      role="img"
      className="relative flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-[3px] border border-border px-3 py-2"
      aria-label={view.kind === 'present' ? `Building as ${view.name}` : 'Building character'}
      title={view.kind === 'present' ? view.name : undefined}
    >
      <span aria-hidden className="absolute right-1 top-1 text-[10px] leading-none text-muted">
        ▾
      </span>
      {view.kind === 'present' ? (
        <CharacterPortrait
          characterId={view.characterId}
          name={view.name}
          src={view.portraitUrl}
          size={64}
        />
      ) : view.kind === 'loading' ? (
        <span aria-hidden className="size-16 rounded-full border border-border-idle bg-bg-deep" />
      ) : (
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-full border border-border-idle text-[18px] text-muted"
        >
          —
        </span>
      )}
      {view.kind === 'anon' && (
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Sign in</span>
      )}
    </div>
  );
}
