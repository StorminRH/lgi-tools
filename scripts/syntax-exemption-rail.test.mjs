import { expect, test } from 'vitest';
import { createEslintRail } from './__tests__/eslint-rail.mjs';

const { eslint } = createEslintRail(import.meta.url);

// A later matching config block replaces no-restricted-syntax outright, so
// each owner block must keep every canonical rail except its own exemptions.
const productionProbe = 'src/features/industry-planner/syntax-exemption-probe.tsx';
const testProbe = 'src/features/industry-planner/syntax-exemption-probe.test.ts';

const ssoHost = "Don't hand-write EVE SSO URLs";
const bareFetch = 'No bare `fetch`';
const rawButton = 'No raw <button>';
const liveRegion = 'No hand-built alert/status region';
const toneToken = 'No pill/chip tone token';
const rawDetails = 'No raw <details>';
const datasetTtl = 'Dataset TTL constants';
const imageVariant = 'EVE type-image';

const productionOwners = [
  ['src/components/ui/card.tsx', []],
  ['src/platform/esi/index.ts', ["Don't hand-write ESI URLs"]],
  ['src/lib/env.ts', ['readEnv()']],
  ['src/components/ui/tones.ts', ['No raw hex']],
  [
    'src/app/(site)/preview/primitives/page.tsx',
    ['No raw hex', 'No raw arbitrary font sizes', 'No raw arbitrary radii'],
  ],
  ['src/app/opengraph-image.tsx', ['No inline `style` attributes']],
  ['src/lib/esi-datasets/entries.ts', [datasetTtl]],
  ['src/data/eve-data/type-images.ts', [imageVariant]],
  ['src/lib/fetch-with-timeout.ts', [bareFetch]],
  ['src/transport/api-client.ts', [bareFetch]],
  ['src/platform/auth/eve-sso-constants.ts', [ssoHost]],
  ['src/platform/auth/eve-sso.ts', [ssoHost]],
  ['src/proxy.ts', [ssoHost]],
  ['src/components/ui/banner.tsx', [rawButton, toneToken]],
  ['src/components/ui/button.tsx', [rawButton, toneToken]],
  ['src/components/ui/pagination.tsx', [rawButton, toneToken]],
  ['src/components/ui/copy-button.tsx', [rawButton, liveRegion, toneToken]],
  ['src/components/ui/collapsible.tsx', [rawDetails]],
  ['src/components/ui/confirm-dialog.tsx', [liveRegion, toneToken]],
  ['src/components/ui/skeleton.tsx', [liveRegion, 'No skeleton token']],
  ['src/components/ui/input.tsx', ['No visible raw <input>', 'No raw <textarea>']],
  ['src/components/ui/static-table.tsx', ['No raw <table>']],
  ...[
    'src/components/ui/access-gate.tsx',
    'src/components/ui/checkbox.tsx',
    'src/components/ui/chip-toggle.tsx',
    'src/components/ui/dropdown-panel.ts',
    'src/components/ui/field.tsx',
    'src/components/ui/pill.tsx',
    'src/components/ui/switch.tsx',
  ].map((filePath) => [filePath, [toneToken]]),
  ['src/components/ui/empty-state.tsx', ['No empty-state token']],
  ['src/components/ui/progress-bar.tsx', ['No progress custom property']],
  ['src/components/ui/loading-toast.tsx', ['Do not call toast.loading directly']],
  ['src/components/composition/NavTools.tsx', ['No native title attribute']],
  ['src/components/composition/account/LoginButton.tsx', [rawButton]],
  ...[
    'src/components/composition/account/AdminForceLogoutForm.tsx',
    'src/components/composition/account/AdminReassignCharacterForm.tsx',
    'src/components/composition/account/AdminUnlinkCharacterForm.tsx',
    'src/components/composition/account/RoleToggleForm.tsx',
    'src/components/composition/account/UnlinkCharacterForm.tsx',
  ].map((filePath) => [filePath, ['No native title forwarded through Button']]),
  ['src/features/wormhole-sites/components/SitesTable.tsx', [rawDetails]],
];

const testOwners = [
  ['src/lib/esi-datasets/freshness.test.ts', [datasetTtl]],
  ['src/data/eve-data/type-images.test.ts', [imageVariant]],
];

async function syntaxEntries(filePath) {
  const config = await eslint.calculateConfigForFile(filePath);
  const [, ...entries] = config.rules['no-restricted-syntax'];
  return entries;
}

function entryKeys(entries) {
  return entries.map(({ selector, message }) => `${selector} => ${message}`).sort();
}

async function expectCanonicalMinus(canonicalProbe, filePath, exemptions) {
  const canonical = await syntaxEntries(canonicalProbe);
  const isExempt = (entry) => exemptions.some((fragment) => entry.message.includes(fragment));
  for (const fragment of exemptions) {
    expect(canonical.some((entry) => entry.message.includes(fragment)), fragment).toBe(true);
  }
  expect(entryKeys(await syntaxEntries(filePath))).toEqual(
    entryKeys(canonical.filter((entry) => !isExempt(entry))),
  );
}

test.each(productionOwners)(
  '%s keeps every production syntax rail except its declared exemptions',
  (filePath, exemptions) => expectCanonicalMinus(productionProbe, filePath, exemptions),
);

test.each(testOwners)(
  '%s keeps every test syntax rail except its declared exemptions',
  (filePath, exemptions) => expectCanonicalMinus(testProbe, filePath, exemptions),
);
