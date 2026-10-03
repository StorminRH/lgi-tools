import { cn } from '@/components/ui/cn';
import { itemImage, type EveImageDescriptor } from '@/data/eve-data/type-images';
import { RELATED_NODE_ROW_CLASS } from './industry-styles';

/**
 * Icon, name and quantity on one line while the tier's column has room; in a
 * narrow column the name takes its own full-width line under the icon and
 * quantity, so every tier can share the page and still read.
 */
const CARD = cn(
  'grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5',
  'border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left transition-opacity',
  "[grid-template-areas:'icon_name_qty'] @max-[14rem]:[grid-template-areas:'icon_._qty'_'name_name_name'] @max-[14rem]:px-2.5",
);

export interface NodeCardView {
  interactive: boolean;
  iconDesc: EveImageDescriptor;
  className: string;
}

export function nodeCardView(args: {
  onSelect?: () => void;
  icon?: EveImageDescriptor;
  typeId: number;
  selected: boolean;
  related: boolean;
  faded: boolean;
}): NodeCardView {
  const interactive = args.onSelect !== undefined;
  return {
    interactive,
    iconDesc: args.icon ?? itemImage(args.typeId),
    className: cn(
      CARD,
      'relative',
      args.faded && 'opacity-20',
      args.related && cn('bg-row-related', RELATED_NODE_ROW_CLASS),
      args.selected && 'bg-isk-selected shadow-selected-rail',
      interactive && 'cursor-pointer hover:bg-row-hover',
    ),
  };
}
