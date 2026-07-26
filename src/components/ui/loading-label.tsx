import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * The shared inline loading label — one home for the dense terminal-style
 * "LOADING…" line that page/section Suspense fallbacks and the Convex
 * <AuthLoading> wrappers show while a hole streams in. The dominant pattern
 * (caption size, tracked uppercase, muted interface face) lives here so wording
 * and markup can't drift per call site (audit C4). Pass `label` for a
 * context-specific line; `className` extends the wrapper (e.g. `block` + padding
 * to seat it inside a card or under a page head). It is for compact inline
 * status only. A portrait, row, card, figure, or section fallback uses Skeleton
 * shapes that reserve the content's geometry and preserve the shell's rhythm.
 */
export function LoadingLabel({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn(eyebrow(), className)}>
      {label}
    </span>
  );
}
