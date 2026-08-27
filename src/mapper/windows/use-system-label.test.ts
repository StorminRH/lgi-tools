import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import { useSystemLabel } from './use-system-label';

const JITA = 30_000_142;
const HOLE = 31_000_001;

const assets = vi.hoisted(() => ({
  systemInfo: vi.fn<(id: number) => SystemDirectoryEntry | null>(() => null),
}));

vi.mock('../chain/use-universe-assets', () => ({
  useUniverseAssets: () => ({ systemInfo: assets.systemInfo }),
}));

function Probe({ systemId }: { readonly systemId: number | null }) {
  const label = useSystemLabel(systemId);
  return createElement('span', {
    'data-name': label?.name ?? '',
    'data-security': label?.security ?? '',
    'data-class': label?.className ?? '',
  });
}

function markup(systemId: number | null): string {
  return renderToStaticMarkup(createElement(Probe, { systemId }));
}

describe('useSystemLabel', () => {
  it('names any directory system, including k-space that is not a map node', () => {
    assets.systemInfo.mockImplementation((id) => {
      if (id === JITA) {
        return { id: JITA, name: 'Jita', whClassId: null, security: 0.946 };
      }
      if (id === HOLE) {
        return { id: HOLE, name: 'J123456', whClassId: 5, security: -1 };
      }
      return null;
    });

    expect(markup(JITA)).toContain('data-name="Jita"');
    expect(markup(JITA)).toContain('data-security="0.946"');
    expect(markup(HOLE)).toContain('data-name="J123456"');
    expect(markup(HOLE)).toContain('data-class="C5"');
    expect(markup(null)).toContain('data-name=""');

    assets.systemInfo.mockReturnValue(null);
    expect(markup(JITA)).toContain(`data-name="${JITA}"`);
    expect(markup(JITA)).toContain('data-security=""');
  });
});
