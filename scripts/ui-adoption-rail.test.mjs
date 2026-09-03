import { describe, expect, it } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

const { messagesFor, expectSyntax } = createEslintRail(import.meta.url);
const productionProbe = 'src/features/industry-planner/ui-adoption-probe.tsx';
const previewProbe = 'src/app/(site)/preview/ui-adoption-probe.tsx';

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
  ...[
    'src/components/composition/account/AdminForceLogoutForm.tsx',
    'src/components/composition/account/AdminReassignCharacterForm.tsx',
    'src/components/composition/account/AdminUnlinkCharacterForm.tsx',
    'src/components/composition/account/RoleToggleForm.tsx',
    'src/components/composition/account/UnlinkCharacterForm.tsx',
  ].map((filePath) => [
    filePath,
    '<Button title="Disabled reason">Action</Button>',
    'No native title forwarded through Button',
  ]),
  [
    'src/features/wormhole-sites/components/SitesTable.tsx',
    '<details><summary>Site</summary></details>',
    'No raw <details>',
  ],
];

const tokenExemptionHomes = [
  ...[
    'src/components/ui/access-gate.tsx',
    'src/components/ui/banner.tsx',
    'src/components/ui/button.tsx',
    'src/components/ui/checkbox.tsx',
    'src/components/ui/chip-toggle.tsx',
    'src/components/ui/chip.tsx',
    'src/components/ui/confirm-dialog.tsx',
    'src/components/ui/copy-button.tsx',
    'src/components/ui/dropdown-panel.ts',
    'src/components/ui/field.tsx',
    'src/components/ui/pagination.tsx',
    'src/components/ui/pill.tsx',
    'src/components/ui/switch.tsx',
  ].map((filePath) => [
    filePath,
    "export const recipe = 'bg-pill-green-bg';",
    'No pill/chip tone token',
    "export const foreignRecipe = 'text-empty';",
    'No empty-state token',
  ]),
  [
    'src/components/ui/empty-state.tsx',
    "export const recipe = 'text-empty';",
    'No empty-state token',
    "export const foreignRecipe = 'skeleton-shimmer';",
    'No skeleton token',
  ],
  [
    'src/components/ui/skeleton.tsx',
    "export const recipe = 'skeleton-shimmer';",
    'No skeleton token',
    "export const foreignRecipe = 'text-empty';",
    'No empty-state token',
  ],
  [
    'src/components/ui/progress-bar.tsx',
    "export const recipe = '--pct';",
    'No progress custom property',
    "export const foreignRecipe = 'text-empty';",
    'No empty-state token',
  ],
  [
    'src/components/ui/loading-toast.tsx',
    "toast.loading('Loading');",
    'Do not call toast.loading directly',
    "export const foreignRecipe = 'text-empty';",
    'No empty-state token',
  ],
];

async function restrictedMessages(filePath, code) {
  return messagesFor(filePath, code, 'no-restricted-syntax');
}

const rejectRawButton = ['raw button', '<button type="button">Go</button>', 'No raw <button>'];
const rejectVisibleInput = ['visible input', '<input type="text" />', 'No visible raw <input>'];
const rejectTextarea = ['textarea', '<textarea />', 'No raw <textarea>'];
const rejectTable = ['table', '<table><tbody /></table>', 'No raw <table>'];
const rejectDetails = ['details', '<details><summary>Open</summary></details>', 'No raw <details>'];
const rejectNativeTitle = ['native title', '<span title="Hint">Label</span>', 'No native title attribute'];
const rejectButtonTitle = ['button title', '<Button title="Hint">Action</Button>', 'No native title forwarded through Button'];
const rejectButtonRole = ['button role', '<div role="button" />', "No role='button'"];
const rejectObjectButtonRole = ['object button role', "const props = { role: 'button' }; export default props;", "No object-authored role='button'"];
const rejectPressedRole = ['pressed role', '<div aria-pressed />', 'No raw pressed-button semantics'];
const rejectStatusRole = ['status role', '<span role="status" />', 'No hand-built alert/status region'];
const rejectActionRecipe = ['action recipe constant', "const retryButtonClass = 'text-ui'; export default retryButtonClass;", 'No ad-hoc action or heading class constants'];
const rejectUpperButtonRecipe = ['uppercase button recipe constant', "const STEP_BTN = 'text-ui'; export default STEP_BTN;", 'No ad-hoc action or heading class constants'];
const rejectUpperBoxRecipe = ['uppercase box recipe constant', "const BOX_BTN = 'text-ui'; export default BOX_BTN;", 'No ad-hoc action or heading class constants'];
const rejectUpperSectionRecipe = ['uppercase section recipe constant', "const SECTION_HEAD = 'text-ui'; export default SECTION_HEAD;", 'No ad-hoc action or heading class constants'];
const rejectEmptyToken = ['empty-state token', "const className = 'text-empty'; export default className;", 'No empty-state token'];
const rejectPillToken = ['pill token', "const className = 'bg-pill-green-bg'; export default className;", 'No pill/chip tone token'];
const rejectProgressToken = ['progress token', "const className = 'progress-fill [--pct:50%]'; export default className;", 'No progress custom property'];
const rejectLoadingToast = ['loading toast', "import { toast } from 'sonner'; toast.loading('Loading');", 'Do not call toast.loading directly'];
const rejectRetiredFont = ['retired font role', "const className = 'font-mono'; export default className;", 'No retired font or tracking utility'];
const rejectRetiredTracking = ['retired tracking step', "const className = `text-ui tracking-emphasis`; export default className;", 'No retired font or tracking utility'];
const rejectVariantRetiredFont = ['variant-prefixed retired font role', "const className = 'md:hover:font-body'; export default className;", 'No retired font or tracking utility'];

describe('UI adoption syntax rail', () => {
  it.each([
    rejectRawButton,
    rejectVisibleInput,
    rejectTextarea,
    rejectTable,
    rejectDetails,
    rejectNativeTitle,
    rejectButtonTitle,
    rejectButtonRole,
    rejectObjectButtonRole,
    rejectPressedRole,
    rejectStatusRole,
    rejectActionRecipe,
    rejectUpperButtonRecipe,
    rejectUpperBoxRecipe,
    rejectUpperSectionRecipe,
    rejectEmptyToken,
    rejectPillToken,
    rejectProgressToken,
    rejectLoadingToast,
    rejectRetiredFont,
    rejectRetiredTracking,
    rejectVariantRetiredFont,
  ])('rejects %s in production and preview source', async (_name, code, message) => {
    await expectSyntax(productionProbe, code, message);
    await expectSyntax(previewProbe, code, message);
  });

  it('accepts current type roles, current tracking, and similarly named CSS properties', async () => {
    const code = [
      "const className = 'font-ui font-data font-display tracking-label tracking-optical';",
      "const property = 'var(--font-body)';",
      'export { className, property };',
    ].join('\n');

    for (const filePath of [productionProbe, previewProbe]) {
      const messages = await restrictedMessages(filePath, code);
      expect(
        messages.some((entry) =>
          entry.message.includes('No retired font or tracking utility')),
      ).toBe(false);
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

  it('keeps neighboring element rails active in token-owning primitives', async () => {
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

  it.each(tokenExemptionHomes)(
    'keeps the token exemption owner-specific in %s',
    async (filePath, allowedCode, allowedMessage, foreignCode, foreignMessage) => {
      const allowedMessages = await restrictedMessages(filePath, allowedCode);
      expect(
        allowedMessages.some((entry) => entry.message.includes(allowedMessage)),
      ).toBe(false);

      const foreignMessages = await restrictedMessages(filePath, foreignCode);
      expect(
        foreignMessages.some((entry) => entry.message.includes(foreignMessage)),
      ).toBe(true);
    },
  );
});
