import { cn } from './cn';

/**
 * The shared inline loading label — one home for the dense terminal-style
 * "LOADING…" line that page/section Suspense fallbacks and the Convex
 * <AuthLoading> wrappers show while a hole streams in. The dominant pattern
 * (caption size, 0.12em tracking, uppercase, muted mono) lives here so wording
 * and markup can't drift per call site (audit C4). Pass `label` for a
 * context-specific line; `className` extends the wrapper (e.g. `block` + padding
 * to seat it inside a card or under a page head). It is NOT a skeleton box — a
 * section placeholder that needs to occupy space keeps its own bordered shell.
 */
export function LoadingLabel({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('font-mono text-label tracking-wide uppercase text-muted', className)}>
      {label}
    </span>
  );
}
