import { describe, expect, it } from 'vitest';
import { createEslintRail } from './eslint-rail.mjs';

describe('UI package import rail', () => {
  const { messagesFor } = createEslintRail(import.meta.url);

  async function restrictedImportMessages(filePath, packageName) {
    return messagesFor(filePath, `import '${packageName}';`, 'no-restricted-imports');
  }

  it.each([
    [
      'src/features/industry-planner/ui-import-probe.tsx',
      '@base-ui/react/dialog',
      'Base UI',
    ],
    [
      'src/features/industry-planner/ui-import-probe.tsx',
      'sonner',
      'sonner',
    ],
    [
      'src/features/industry-planner/ui-import-probe.tsx',
      '@base-ui-components/react',
      '@base-ui-components/react',
    ],
    ['src/components/ui/toast.tsx', '@base-ui/react/dialog', 'Base UI'],
    ['src/components/ui/dialog.tsx', 'sonner', 'sonner'],
    ['src/components/ui/card.tsx', '@base-ui/react/dialog', 'Base UI'],
  ])('rejects %s importing %s', async (filePath, packageName, messageFragment) => {
    const messages = await restrictedImportMessages(filePath, packageName);

    expect(messages.some((message) => message.message.includes(messageFragment))).toBe(
      true,
    );
  });

  it.each([
    ['src/components/ui/dialog.tsx', '@base-ui/react/dialog'],
    ['src/components/ui/drawer.tsx', '@base-ui/react/drawer'],
    ['src/components/ui/toast.tsx', 'sonner'],
  ])('allows %s importing %s', async (filePath, packageName) => {
    expect(await restrictedImportMessages(filePath, packageName)).toEqual([]);
  });
});
