import { choiceDial, type ChoiceDial, type StepDial } from '../lib/step-dial';
import type {
  CollapseWeight,
  EdgeFlavor,
  MotionConfig,
} from './motion-contract';

export const MOTION_STEP_DIALS: readonly StepDial<MotionConfig>[] = [
  {
    label: 'Fast',
    ariaLabel: 'Fast tempo',
    range: { min: 50, max: 500, step: 25 },
    valueClassName: 'w-12',
    read: (config) => config.tempo.fast,
    write: (config, fast) => ({ ...config, tempo: { ...config.tempo, fast } }),
  },
  {
    label: 'Mid',
    ariaLabel: 'Mid tempo',
    range: { min: 200, max: 1200, step: 50 },
    valueClassName: 'w-12',
    read: (config) => config.tempo.mid,
    write: (config, mid) => ({ ...config, tempo: { ...config.tempo, mid } }),
  },
  {
    label: 'Slow',
    ariaLabel: 'Slow tempo',
    range: { min: 400, max: 2000, step: 100 },
    valueClassName: 'w-12',
    read: (config) => config.tempo.slow,
    write: (config, slow) => ({ ...config, tempo: { ...config.tempo, slow } }),
  },
  {
    label: 'Overshoot',
    ariaLabel: 'Overshoot percent',
    range: { min: 0, max: 40, step: 2 },
    valueClassName: 'w-8',
    read: (config) => config.overshootPct,
    write: (config, overshootPct) => ({ ...config, overshootPct }),
  },
];

export const MOTION_CHOICE_DIALS: readonly ChoiceDial<MotionConfig>[] = [
  choiceDial<MotionConfig, EdgeFlavor>({
    label: 'Edge flavor',
    control: 'segmented',
    options: [
      { value: 'fade-with-child', label: 'Fade' },
      { value: 'grow-from-parent', label: 'Grow' },
    ],
    read: (config) => config.edgeFlavor,
    write: (config, edgeFlavor) => ({ ...config, edgeFlavor }),
  }),
  choiceDial<MotionConfig, CollapseWeight>({
    label: 'Collapse exit',
    control: 'segmented',
    options: [
      { value: 'ordinary', label: 'Ordinary' },
      { value: 'heavy', label: 'Heavy' },
    ],
    read: (config) => config.collapseWeight,
    write: (config, collapseWeight) => ({ ...config, collapseWeight }),
  }),
];
