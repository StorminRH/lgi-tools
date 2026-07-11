import { cn } from './cn';
import { Popover, PopoverHeading } from './popover';

// Abstract data-quality badge: an abstract `level` → glyph (● ◐ ○) + tone.
// It does NOT know about prices, ESI, volume, or staleness — a feature maps
// its own signals to a level and hands it here (mirrors how `tone` props work
// across the UI primitives). When `reasons` are supplied the badge becomes the
// trigger of the shared Popover — house panel styling (neutral tone,
// PopoverHeading, the standard body text), same as every "?" help glyph — so
// the "why" is reachable by pointer, touch, and keyboard. The glyph itself is
// a CSS ::after pseudo-element (`.price-confidence--*` in globals.css), since
// neither the half-circle clip-path nor the ring is expressible as an inline
// style.

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

const ACCESSIBLE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unknown: 'Unknown confidence',
};

export function PriceConfidence({
  level,
  loading,
  reasons,
  label,
  className,
}: {
  level: ConfidenceLevel;
  // While true the badge spins instead of showing the level glyph — the same
  // visual language doubling as the "confirming live price" indicator. The
  // level is withheld (not yet confirmed), so no tone and no reasons popover.
  loading?: boolean;
  // Optional human-readable reasons shown in the hover/focus tooltip.
  reasons?: string[];
  // Accessible name override (defaults to the level's label).
  label?: string;
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={cn('price-confidence price-confidence--loading', className)}
        role="img"
        aria-busy="true"
        aria-label="Confirming price"
      />
    );
  }

  const name = label ?? ACCESSIBLE_LABEL[level];

  const badge = (
    <span
      className={cn('price-confidence', `price-confidence--${level}`, className)}
      role="img"
      aria-label={name}
    />
  );

  if (!reasons || reasons.length === 0) return badge;

  return (
    <Popover
      label={name}
      trigger={null}
      triggerClassName={cn('price-confidence', `price-confidence--${level}`, className)}
    >
      <PopoverHeading>{name}</PopoverHeading>
      <ul className="flex flex-col gap-1 font-body text-body leading-snug text-muted">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </Popover>
  );
}
