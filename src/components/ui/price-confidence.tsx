import { cn } from './cn';
import { Popover, PopoverHeading } from './popover';

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

  reasons?: string[];

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
    <Popover
      label={name}
      trigger={null}
      triggerClassName={cn('price-confidence', `price-confidence--${level}`, className)}
    >
      <PopoverHeading>{name}</PopoverHeading>

      <ul className="flex flex-col gap-1 font-ui text-body leading-snug text-muted">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>

        ))}
      </ul>

    </Popover>

  );
}
