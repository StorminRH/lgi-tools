'use client';

import { useEffect, useRef } from 'react';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { NavTools } from '@/components/NavTools';

// Mobile-only hamburger (globals.css reveals it below 1024px and hides the
// inline tool strip + login cluster there). A pure <details> disclosure so it
// needs no open/closed React state — the browser owns that, matching the
// Collapsible invariant. The panel reuses the same NavTools + LoginButton the
// desktop bar renders, restyled to stack vertically.
//
// The only client behaviour is closing the menu after a link tap: the header
// persists across client navigations, so a pure <details> would otherwise stay
// open after you'd already moved to the new page.
export function NavMenu() {
  const ref = useRef<HTMLDetailsElement>(null);

  // Close the menu after a link tap. Delegated on the <details> rather than a
  // JSX onClick (which would trip jsx-a11y on the panel div), and target-gated
  // to anchors so opening via the summary doesn't immediately re-close it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a')) el.open = false;
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, []);

  return (
    <details ref={ref} className="nav-menu">
      <summary className="nav-menu-toggle" aria-label="Menu">
        <svg className="nav-menu-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <line x1="2" y1="5" x2="16" y2="5" />
          <line x1="2" y1="9" x2="16" y2="9" />
          <line x1="2" y1="13" x2="16" y2="13" />
        </svg>
      </summary>
      <div className="nav-menu-panel">
        <NavTools />
        <div className="nav-menu-login">
          <LoginButton />
        </div>
      </div>
    </details>
  );
}
