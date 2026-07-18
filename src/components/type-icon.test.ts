import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  blueprintImage,
  heroImage,
  itemImage,
  jobImage,
  nodeImage,
  type EveImageDescriptor,
} from '@/data/eve-data/type-images';
import { TypeIcon } from './type-icon';

function renderTypeIcon(image: EveImageDescriptor): string {
  return renderToStaticMarkup(
    createElement(TypeIcon, {
      ...image,
      size: 26,
      alt: 'Test item',
      mono: 'TI',
    }),
  );
}

describe('TypeIcon rendering', () => {
  it.each([
    ['item', itemImage(34), '/types/34/icon?size=32'],
    ['blueprint', blueprintImage(691), '/types/691/bp?size=32'],
    ['hero', heroImage(587, true), '/types/587/render?size=32'],
    ['node', nodeImage(691, 587), '/types/691/bp?size=32'],
    ['job fallback', jobImage(undefined, 691), '/types/691/bp?size=32'],
  ])('renders a resolved %s descriptor through the matching EVE image family', (_, image, path) => {
    expect(renderTypeIcon(image)).toContain(path);
  });
});
