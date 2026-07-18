import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('EVE image variant rail', () => {
  const eslint = new ESLint({ cwd: repoRoot });
  const seededJsxVariant = 'const Probe = () => <span variant="render" />;';
  const seededPropertyVariant = "const descriptor = { typeId: 1, variant: 'render' };";

  async function restrictedSyntaxMessages(source, filePath) {
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.messages.some((message) => message.fatal)).toBe(false);
    return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax');
  }

  it('rejects a seeded JSX rendition variant at a feature path', async () => {
    const messages = await restrictedSyntaxMessages(
      seededJsxVariant,
      'src/features/industry-planner/image-variant-probe.tsx',
    );

    expect(
      messages.some((message) => message.message.includes('@/data/eve-data/type-images')),
    ).toBe(true);
  });

  it('rejects a seeded descriptor property at a feature path', async () => {
    const messages = await restrictedSyntaxMessages(
      seededPropertyVariant,
      'src/features/industry-planner/image-variant-probe.ts',
    );

    expect(
      messages.some((message) => message.message.includes('@/data/eve-data/type-images')),
    ).toBe(true);
  });

  it.each([
    'src/data/eve-data/type-images.ts',
    'src/data/eve-data/type-images.test.ts',
  ])('allows descriptor properties inside resolver owner path %s', async (filePath) => {
    expect(await restrictedSyntaxMessages(seededPropertyVariant, filePath)).toEqual([]);
  });
});
