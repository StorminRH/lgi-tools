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

/** The display-face title of a dialog or card: semibold, tracked and uppercase. */
export const displayTitle = cva('font-display font-semibold tracking-copy uppercase', {
  variants: {
    size: {
      h2: 'text-h2',
      h3: 'text-h3',
      nav: 'text-nav',
    },
    tone: {
      name: 'text-name',
      danger: 'text-pill-red-text',
    },
    wrap: {
      true: 'min-w-0 break-words',
      false: '',
    },
  },
  defaultVariants: {
    size: 'h2',
    tone: 'name',
    wrap: false,
  },
});
