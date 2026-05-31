import { cn } from './cn';
import { HoverPopover } from './hover-popover';

// Abstract data-quality badge: an abstract `level` → glyph (● ◐ ○) + tone.
// It does NOT know about prices, ESI, volume, or staleness — a feature maps
// its own signals to a level and hands it here (mirrors how `tone` props work
// across the UI primitives). When `reasons` are supplied it wraps the badge in
// the shared HoverPopover (the same tooltip base the PriceFreshness chip uses)
// so the "why" is reachable by pointer and keyboard. The glyph itself is a CSS
// ::after pseudo-element (`.price-confidence--*` in globals.css), since neither
// the half-circle clip-path nor the ring is expressible as a CSP-safe style.

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

const ACCESSIBLE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unknown: 'Unknown confidence',
};

export function PriceConfidence({
  level,
  reasons,
  label,
  className,
}: {
  level: ConfidenceLevel;
  // Optional human-readable reasons shown in the hover/focus tooltip.
  reasons?: string[];
  // Accessible name override (defaults to the level's label).
  label?: string;
  className?: string;
}) {
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
    <HoverPopover label={name} trigger={badge}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted mb-1">{name}</div>
      <ul className="flex flex-col gap-0.5 text-[11px] text-text">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </HoverPopover>
  );
}
