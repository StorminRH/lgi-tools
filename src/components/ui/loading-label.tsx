import { cn } from './cn';
import { eyebrow } from './type-roles';

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
