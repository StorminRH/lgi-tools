import { describe, expect, it } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

describe('EVE image variant rail', () => {
  const { expectSyntax, messagesFor } = createEslintRail(import.meta.url);
  const seededJsxVariant = 'const Probe = () => <span variant="render" />;';
  const seededPropertyVariant = "const descriptor = { typeId: 1, variant: 'render' };";
  const variantOwner = 'src/data/eve-data/type-images.ts';
  const variantOwnerTest = 'src/data/eve-data/type-images.test.ts';
  const featureJsxProbe = 'src/features/industry-planner/image-variant-probe.tsx';
  const featureTsProbe = 'src/features/industry-planner/image-variant-probe.ts';
  const typeImagesHint = '@/data/eve-data/type-images';

  it('rejects a seeded JSX rendition variant at a feature path', () =>
    expectSyntax(featureJsxProbe, seededJsxVariant, typeImagesHint));
  it('rejects a seeded descriptor property at a feature path', () =>
    expectSyntax(featureTsProbe, seededPropertyVariant, typeImagesHint));
  it.each([variantOwner, variantOwnerTest])(
    'allows descriptor properties inside resolver owner path %s',
    async (filePath) => {
      expect(await messagesFor(filePath, seededPropertyVariant, 'no-restricted-syntax')).toEqual([]);
    },
  );
});
