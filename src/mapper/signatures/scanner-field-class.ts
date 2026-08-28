import { cn } from '@/components/ui/cn';

const CHIP =
  'h-7 w-full min-w-0 max-w-full overflow-hidden border-border-idle bg-bg px-1.5 text-ui shadow-none';

const COMBO_FIELD =
  'w-full min-w-0 max-w-full overflow-hidden border-transparent bg-transparent px-1 shadow-none ' +
  'data-[popup-open]:border-isk data-[popup-open]:bg-transparent data-[popup-open]:shadow-none';

export function scannerSelectedFieldClass(selected: boolean): string {
  return selected
    ? cn(COMBO_FIELD, 'font-medium text-name')
    : CHIP;
}
