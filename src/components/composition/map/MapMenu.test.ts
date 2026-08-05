import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { visibleNavTools } from '@/data/tools/registry';
import { MapMenu } from './MapMenu';

vi.mock('@/components/ui/menu', async () => {
  const { cloneElement, createElement: element } = await import('react');
  return {
    Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) =>
      element('div', null, trigger, children),
    MenuLinkItem: ({
      render,
      children,
      closeOnClick: _closeOnClick,
      ...anchorProps
    }: {
      render?: React.ReactElement;
      children: React.ReactNode;
      closeOnClick?: boolean;
    } & Record<string, unknown>) =>
      render !== undefined
        ? cloneElement(render, {}, children)
        : element('a', anchorProps, children),
  };
});

describe('MapMenu', () => {
  it('renders home and every visible tool as a new-tab link', () => {
    const markup = renderToStaticMarkup(createElement(MapMenu));
    const anchors = [...markup.matchAll(/<a [^>]+>/g)].map((match) => match[0]);

    expect(markup).toContain('[</span><span');
    expect(markup).toContain('data-map-menu-attribution');
    expect(markup).toContain('Built with React Flow');
    expect(markup).toContain('https://reactflow.dev');
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toMatch(/rel="(?:noopener )?noreferrer"/);
    }
    for (const tool of visibleNavTools()) {
      expect(markup).toContain(tool.label);
    }
  });
});
