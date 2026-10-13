import { isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import { apiProblem, networkDown } from '@/transport/__tests__/failed-outcomes';
import { setCorpStructureRigsEndpoint } from '../api-contract';
import type { CorpStructurePageStructure } from '../types';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

import { CorpRigEditor } from './CorpRigEditor';

const STRUCTURE: CorpStructurePageStructure = {
  structureId: 1035466617946,
  typeId: 35825,
  systemId: 30002537,
  securityClass: 'low',
  name: 'Amamake - Home Raitaru',
  rigTypeIds: [43920],
  taxPct: 1,
};

type Props = Record<string, unknown> & { children?: unknown };

function* walk(node: unknown): Generator<Props> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
    return;
  }
  if (!isValidElement(node)) return;
  const props = node.props as Props;
  yield props;
  yield* walk(props.children);
}

test('a refused rig save says it did not save, and a save that got no answer asks for a connection check', async () => {
  rt.unmount();
  const onSaved = vi.fn();
  const render = () =>
    rt.render(CorpRigEditor, {
      corporationId: 98000001,
      structure: STRUCTURE,
      validRigs: [],
      onSaved,
      onClose: vi.fn(),
    }) as ReactElement;
  const find = (test: (props: Props) => boolean) => [...walk(render())].find(test);
  const save = () => (find((p) => p.children === 'Save')!.onClick as () => void)();
  const error = () => find((p) => p.label === 'Check')?.children ?? null;

  h.apiFetch.mockResolvedValueOnce(apiProblem(403, 'not_station_manager'));
  save();
  await settle();
  expect(h.apiFetch).toHaveBeenCalledWith(setCorpStructureRigsEndpoint, {
    body: { corporationId: 98000001, structureId: 1035466617946, rigTypeIds: [43920], taxPct: 1 },
    cache: 'no-store',
  });
  expect(error()).toBe("Couldn't save. Try again.");

  h.apiFetch.mockResolvedValueOnce(networkDown());
  save();
  await settle();
  expect(error()).toBe("Couldn't save. Check your connection and try again.");

  h.apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { structureId: 1035466617946, rigTypeIds: [43920], taxPct: 1 } });
  save();
  await settle();
  expect(onSaved).toHaveBeenCalledExactlyOnceWith({ rigTypeIds: [43920], taxPct: 1 });
});
