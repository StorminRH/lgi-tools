import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

/** Shared ESLint probe helper for the syntax/import rail tests. */
export function createEslintRail(metaUrl = import.meta.url) {
  const repoRoot = fileURLToPath(new URL('..', metaUrl));
  const eslint = new ESLint({ cwd: repoRoot });

  async function messagesFor(filePath, code, ruleId) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((message) => message.ruleId === ruleId);
  }

  async function expectSyntax(filePath, code, fragment, present = true) {
    const messages = await messagesFor(filePath, code, 'no-restricted-syntax');
    expect(messages.some((message) => message.message.includes(fragment))).toBe(present);
  }

  async function expectImportHas(filePath, packageName, fragment) {
    const messages = await messagesFor(
      filePath,
      `import '${packageName}';\n`,
      'no-restricted-imports',
    );
    expect(messages.some((message) => message.message.includes(fragment))).toBe(true);
  }

  async function expectImportEmpty(filePath, packageName) {
    expect(
      await messagesFor(filePath, `import '${packageName}';\n`, 'no-restricted-imports'),
    ).toEqual([]);
  }

  async function expectImportNonEmpty(filePath, packageName) {
    expect(
      await messagesFor(filePath, `import '${packageName}';\n`, 'no-restricted-imports'),
    ).not.toEqual([]);
  }

  return {
    repoRoot,
    eslint,
    messagesFor,
    expectSyntax,
    expectImportHas,
    expectImportEmpty,
    expectImportNonEmpty,
  };
}
