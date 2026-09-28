import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

export type { ClassValue };

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      font: ['ui', 'data', 'display'],
      spacing: [
        'icon-xs',
        'icon-sm',
        'icon-md',
        'icon-lg',
        'cluster',
        'section',
        'region',
        'page',
      ],
      container: ['reading', 'frame'],
    },
    classGroups: {
      'font-size': [
        {
          text: [
            'micro',
            'label',
            'ui',
            'nav',
            'body',
            'lead',
            'h3',
            'stat',
            'h2',
            'title',
            'display',
            'hero',
            'mega',
          ],
        },
      ],
      tracking: [
        {
          tracking: ['optical', 'copy', 'label', 'wide', 'eyebrow'],
        },
      ],
      rounded: [{ rounded: ['ctl', 'card', 'panel', 'sheet'] }],
      shadow: [
        {
          shadow: [
            'field-inset',
            'field-focus',
            'btn-bezel',
            'card-edge',
            'dd',
            'card-hover',
            'float',
            'cta-glow',
            'popover-green',
            'toast',
            'status-info',
            'status-warn',
            'dot-orange',
            'dot-blue',
            'selected-rail',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
