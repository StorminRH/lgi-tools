import { cn } from '@/components/ui/cn';
import { itemImage, type EveImageDescriptor } from '@/data/eve-data/type-images';
import { RELATED_NODE_ROW_CLASS } from './industry-styles';

const CARD =
  'flex min-h-[72px] items-center gap-2.5 border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left transition-opacity';

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
