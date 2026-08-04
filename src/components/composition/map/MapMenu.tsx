'use client';

import Link from 'next/link';
import { HamburgerGlyph } from '@/components/composition/HamburgerGlyph';
import { Menu, MenuLinkItem } from '@/components/ui/menu';
import { navigationMenuLink } from '@/components/ui/navigation-menu';
import { visibleNavTools } from '@/data/tools/registry';

/**
 * Renders map-safe navigation whose links always open away from the live atlas tab.
 */
export function MapMenu() {
  return (
    <Menu
      label="Atlas menu"
      trigger={<HamburgerGlyph />}
      triggerClassName="inline-flex size-10 cursor-pointer items-center justify-center rounded-ctl border border-border bg-section text-muted shadow-card transition-colors hover:border-border-active hover:text-name"
      popupProps={{ 'data-map-menu-panel': '' }}
      className="min-w-60"
      side="bottom"
      align="start"
      sideOffset={8}
    >
      <MenuLinkItem
        closeOnClick
        className={navigationMenuLink({ placement: 'menu' })}
        render={<Link href="/" target="_blank" rel="noreferrer" />}
      >
        <span className="font-data font-extrabold tracking-copy uppercase text-name">
          <span className="text-isk">[</span>
          <span className="px-[2px]">LGI</span>
          <span className="text-isk">]</span>
          <span className="text-muted font-normal">.tools</span>
        </span>
      </MenuLinkItem>
      {visibleNavTools().map((tool) =>
        tool.href ? (
          <MenuLinkItem
            key={tool.label}
            closeOnClick
            className={navigationMenuLink({ placement: 'menu' })}
            render={
              <Link href={tool.href} target="_blank" rel="noreferrer" />
            }
          >
            {tool.label}
          </MenuLinkItem>
        ) : null,
      )}
      <MenuLinkItem
        data-map-menu-attribution
        href="https://reactflow.dev"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="React Flow attribution"
        closeOnClick
        className="block border-t border-border-soft px-3 py-2 font-data text-micro text-muted transition-colors hover:text-isk data-[highlighted]:text-isk"
      >
        Built with React Flow
      </MenuLinkItem>
    </Menu>
  );
}
