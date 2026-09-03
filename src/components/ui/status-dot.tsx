import { cn } from './cn';

export type StatusDotState = 'online' | 'offline' | 'vip';

export function StatusDot({ state, className }: { state: StatusDotState; className?: string }) {
  return <span aria-hidden className={cn('status-led', state, className)} />;
}
