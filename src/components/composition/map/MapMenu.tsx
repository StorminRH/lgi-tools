import Link from 'next/link';
import { deriveNavToolItem, visibleNavTools } from '@/data/tools/registry';

/**
 * Map-route tool menu: home/wordmark row plus every visible nav tool. Links open
 * in a new tab so a live map is never navigated away from.
 */
export function MapMenu() {
  return (
    <nav
      aria-label="Map tools"
      className="rounded-ctl border border-border bg-section/95 px-3 py-2 shadow-btn-bezel backdrop-blur-sm"
    >
      <ul className="flex flex-col gap-1">
        <li>
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="font-data font-extrabold text-lead tracking-copy uppercase text-name inline-flex items-center"
          >
            <span className="text-isk">[</span>
            <span className="px-[2px]">LGI</span>
            <span className="text-isk">]</span>
            <span className="text-muted font-normal">.tools</span>
          </Link>
        </li>
        {visibleNavTools().map((tool) => {
          const item = deriveNavToolItem(tool, null);
          if (item.kind === 'soon') {
            return (
              <li key={item.label}>
                <span className="block px-1 py-0.5 text-nav text-muted">
                  {item.label}
                </span>
              </li>
            );
          }
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block px-1 py-0.5 text-nav text-name hover:text-isk"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
