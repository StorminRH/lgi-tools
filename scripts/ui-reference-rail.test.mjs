import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const configFile = fileURLToPath(new URL('../eslint.config.mjs', import.meta.url));
const rule = 'ui-reference/listed';
const primitive = 'src/components/ui/widget.tsx';
const primitiveCode = [
  'export function Widget() { return null; }',
  'export function WidgetPart() { return null; }',
  'export const widgetClass = "rounded-ctl";',
  'export type WidgetProps = { label: string };',
].join('\n');

const fixtures = [];

// Each fixture is its own lint root: the rule indexes imports once per cwd.
function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'ui-reference-'));
  fixtures.push(root);
  for (const [file, code] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), code);
  }
  return root;
}

async function missingNames(files) {
  const root = fixture(files);
  const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile });
  const [result] = await eslint.lintText(primitiveCode, { filePath: path.join(root, primitive) });
  return result.messages.filter((message) => message.ruleId === rule).map((message) => message.message.split('`')[1]);
}

afterAll(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

describe('UI reference rail', () => {
  it('reports a primitive the app imports when the reference does not render it', async () => {
    expect(
      await missingNames({
        'src/features/tool/View.tsx': "import { Widget, type WidgetProps } from '@/components/ui/widget';",
      }),
    ).toEqual(['Widget']);
  });

  it('passes once the reference imports the primitive', async () => {
    expect(
      await missingNames({
        'src/features/tool/View.tsx': "import { Widget } from '@/components/ui/widget';",
        'src/app/(site)/preview/primitives/widgets.tsx': "import { Widget } from '@/components/ui/widget';",
      }),
    ).toEqual([]);
  });

  it('follows aliased, namespace, and dynamic imports on both sides', async () => {
    expect(
      await missingNames({
        'src/features/tool/View.tsx': [
          "import { Widget as Tile } from '@/components/ui/widget';",
          "import * as W from '../../components/ui/widget';",
          'export const part = W.WidgetPart;',
        ].join('\n'),
        'src/app/(site)/preview/primitives/widgets.tsx': [
          "const Lazy = dynamic(() => import('@/components/ui/widget').then((m) => m.Widget));",
        ].join('\n'),
      }),
    ).toEqual(['WidgetPart']);
  });

  it('skips internal parts, root-layout mounts, test imports, and type-only imports', async () => {
    expect(
      await missingNames({
        'src/components/ui/panel.tsx': "import { WidgetPart } from './widget';",
        'src/app/layout.tsx': "import { Widget } from '@/components/ui/widget';",
        'src/features/tool/View.test.ts': "import { Widget } from '@/components/ui/widget';",
        'src/features/tool/types.ts': "import type { Widget } from '@/components/ui/widget';",
      }),
    ).toEqual([]);
  });
});
