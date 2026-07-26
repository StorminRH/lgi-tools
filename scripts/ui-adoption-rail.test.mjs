import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });
const productionProbe = 'src/features/industry-planner/ui-adoption-probe.tsx';
const previewProbe = 'src/app/preview/ui-adoption-probe.tsx';

const exemptionHomes = [
  ['src/components/ui/banner.tsx', '<button type="button">Dismiss</button>', 'No raw <button>'],
  ['src/components/ui/button.tsx', '<button type="button">Go</button>', 'No raw <button>'],
  ['src/components/ui/pagination.tsx', '<button type="button">2</button>', 'No raw <button>'],
  [
    'src/components/ui/copy-button.tsx',
    '<><button type="button">Copy</button><span role="status" /></>',
    ['No raw <button>', 'No hand-built alert/status region'],
  ],
  ['src/components/ui/collapsible.tsx', '<details><summary>Open</summary></details>', 'No raw <details>'],
  [
    'src/components/ui/content-browser-nav.tsx',
    '<details><summary>Group</summary></details>',
    'No raw <details>',
  ],
  [
    'src/components/ui/content-browser.tsx',
    '<details><summary>Browse</summary></details>',
    'No raw <details>',
  ],
  [
    'src/components/ui/confirm-dialog.tsx',
    '<p role="alert">Problem</p>',
    'No hand-built alert/status region',
  ],
  [
    'src/components/ui/skeleton.tsx',
    '<span role="status">Loading</span>',
    'No hand-built alert/status region',
  ],
  [
    'src/components/ui/input.tsx',
    '<><input type="text" /><textarea /></>',
    ['No visible raw <input>', 'No raw <textarea>'],
  ],
  [
    'src/components/ui/static-table.tsx',
    '<table><tbody /></table>',
    'No raw <table>',
  ],
  [
    'src/components/composition/NavTools.tsx',
    '<span title="Coming soon">Soon</span>',
    'No native title attribute',
  ],
  [
    'src/components/composition/account/LoginButton.tsx',
    '<button type="button">Log in</button>',
    'No raw <button>',
  ],
  [
    'src/features/devlog/components/CodeExcerpt.tsx',
    '<details><summary>Code</summary></details>',
    'No raw <details>',
  ],
  [
    'src/features/wormhole-sites/components/SitesTable.tsx',
    '<details><summary>Site</summary></details>',
    'No raw <details>',
  ],
];

async function restrictedMessages(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax');
}

describe('UI adoption syntax rail', () => {
  it.each([
    ['raw button', '<button type="button">Go</button>', 'No raw <button>'],
    ['visible input', '<input type="text" />', 'No visible raw <input>'],
    ['textarea', '<textarea />', 'No raw <textarea>'],
    ['table', '<table><tbody /></table>', 'No raw <table>'],
    ['details', '<details><summary>Open</summary></details>', 'No raw <details>'],
    ['native title', '<span title="Hint">Label</span>', 'No native title attribute'],
    ['button role', '<div role="button" />', "No role='button'"],
    [
      'object button role',
      "const props = { role: 'button' }; export default props;",
      "No object-authored role='button'",
    ],
    ['pressed role', '<div aria-pressed />', 'No raw pressed-button semantics'],
    ['status role', '<span role="status" />', 'No hand-built alert/status region'],
    [
      'action recipe constant',
      "const retryButtonClass = 'text-ui'; export default retryButtonClass;",
      'No ad-hoc action or heading class constants',
    ],
    [
      'empty-state token',
      "const className = 'text-empty'; export default className;",
      'No primitive-owned UI token',
    ],
    [
      'progress token',
      "const className = 'progress-fill [--pct:50%]'; export default className;",
      'No primitive-owned UI token',
    ],
    [
      'loading toast',
      "import { toast } from 'sonner'; toast.loading('Loading');",
      'Do not call toast.loading directly',
    ],
  ])('rejects %s in production and preview source', async (_name, code, message) => {
    for (const filePath of [productionProbe, previewProbe]) {
      const messages = await restrictedMessages(filePath, code);
      expect(messages.some((entry) => entry.message.includes(message))).toBe(true);
    }
  });

  it('keeps hidden server-action fields as the one raw-input carve-out', async () => {
    expect(
      await restrictedMessages(productionProbe, '<input type="hidden" name="id" value="1" />'),
    ).toEqual([]);
  });

  it('restores the pre-existing field rails inside preview source', async () => {
    const selectMessages = await restrictedMessages(previewProbe, '<select />');
    const classMessages = await restrictedMessages(
      previewProbe,
      "const inputClass = 'field'; export default inputClass;",
    );

    expect(selectMessages.some((entry) => entry.message.includes('No raw <select>'))).toBe(true);
    expect(
      classMessages.some((entry) => entry.message.includes('No ad-hoc field-style constants')),
    ).toBe(true);
  });

  it('lets primitive modules own tokens without lifting neighboring element rails', async () => {
    expect(
      await restrictedMessages(
        'src/components/ui/empty-state.tsx',
        "export const recipe = 'text-empty';",
      ),
    ).toEqual([]);

    const messages = await restrictedMessages(
      'src/components/ui/empty-state.tsx',
      '<button type="button">Wrong owner</button>',
    );
    expect(messages.some((entry) => entry.message.includes('No raw <button>'))).toBe(true);
  });

  it.each(exemptionHomes)(
    'lifts only the owned syntax in %s',
    async (filePath, allowedCode, allowedMessages) => {
      const messages = await restrictedMessages(filePath, allowedCode);
      for (const message of Array.isArray(allowedMessages) ? allowedMessages : [allowedMessages]) {
        expect(messages.some((entry) => entry.message.includes(message))).toBe(false);
      }

      const neighboringMessages = await restrictedMessages(
        filePath,
        '<div role="button">Wrong neighboring owner</div>',
      );
      expect(
        neighboringMessages.some((entry) => entry.message.includes("No role='button'")),
      ).toBe(true);
    },
  );
});
