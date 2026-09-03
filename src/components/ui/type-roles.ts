import { cva } from 'class-variance-authority';

export const eyebrow = cva('font-ui uppercase', {
  variants: {
    size: {
      micro: 'text-micro',
      label: 'text-label',
    },
    tone: {
      muted: 'text-muted',
      faint: 'text-faint',
      isk: 'text-isk',
      callout: 'text-callout-label',
      inherit: '',
    },
    weight: {
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
    emphasis: {
      normal: 'tracking-wide',
      strong: 'tracking-eyebrow',
    },
  },
  defaultVariants: {
    size: 'label',
    tone: 'muted',
    weight: 'medium',
    emphasis: 'normal',
  },
});
