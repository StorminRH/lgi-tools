import { cn } from './cn';

export function LoadingLabel({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center font-ui text-ui text-muted', className)}>
      {label}
    </span>
  );
}
