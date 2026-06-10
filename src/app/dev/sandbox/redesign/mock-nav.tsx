import Link from 'next/link';

// Shared mock navigation for the redesign mockups. Server components only —
// the hamburger panel is a pure <details>/<summary> (the icon morph and panel
// slide-in are CSS on the [open] state), and the side rail expands on
// hover/focus with CSS alone. No client JS in either nav.

// Theme A — slim top bar with an animated hamburger menu that drops an
// elevated panel over the page.
export function PhosphorTopbar() {
  return (
    <nav className="rda-topbar">
      <details className="rda-menu">
        <summary aria-label="Menu">
          <span className="rda-menu-bar" />
          <span className="rda-menu-bar" />
          <span className="rda-menu-bar" />
        </summary>
        <div className="rda-menu-panel">
          <Link href="/sites" className="rda-menu-item">
            <span className="rda-menu-num">01</span>
            <span>
              <span className="rda-menu-name">Wormhole Sites</span>
              <span className="rda-menu-desc">69 anomalies & signatures, live loot prices</span>
            </span>
          </Link>
          <Link href="/industry" className="rda-menu-item">
            <span className="rda-menu-num">02</span>
            <span>
              <span className="rda-menu-name">Industry Planner</span>
              <span className="rda-menu-desc">Build costs & margins at Jita rates</span>
            </span>
          </Link>
          <span className="rda-menu-item soon">
            <span className="rda-menu-num">03</span>
            <span>
              <span className="rda-menu-name">Roll Calculator</span>
              <span className="rda-menu-desc">Mass tracking for hole rolls</span>
            </span>
            <span className="rda-menu-soon-tag">v5.0</span>
          </span>
          <div className="rda-menu-rule" />
          <Link href="/changelog" className="rda-menu-item">
            <span className="rda-menu-num">··</span>
            <span>
              <span className="rda-menu-name">Changelog</span>
            </span>
          </Link>
          <Link href="/contact" className="rda-menu-item">
            <span className="rda-menu-num">··</span>
            <span>
              <span className="rda-menu-name">Contact</span>
            </span>
          </Link>
          <div className="rda-menu-foot">
            <span>lgi.tools</span>
            <span>EVE time 17:42</span>
          </div>
        </div>
      </details>

      <Link href="/dev/sandbox/redesign/home-a" className="rda-wordmark">
        <span className="tick">[</span>LGI<span className="tick">]</span>
        <span className="dim">.tools</span>
      </Link>

      <span className="rda-topbar-spacer" />

      <span className="rda-feedchip">
        <span className="rda-led" />
        Jita feed live
      </span>
      <button type="button" className="rda-btn rda-btn-ghost">
        Log in with EVE
      </button>
    </nav>
  );
}

// Theme B — sticky holo side rail: 68px of glyphs at rest, expands to a full
// labelled nav on hover or keyboard focus.
export function HoloRail({ active }: { active: 'home' | 'industry' }) {
  return (
    <aside className="rdb-rail">
      <Link href="/dev/sandbox/redesign/home-b" className="rdb-rail-logo">
        <span className="rdb-glyph">LGI</span>
        <span className="rdb-rail-logotext">
          Lo-Gang<span className="dim">.tools</span>
        </span>
      </Link>

      <nav className="rdb-rail-nav">
        <span className="rdb-rail-cap">Console</span>
        <Link
          href="/dev/sandbox/redesign/home-b"
          className={`rdb-rail-item${active === 'home' ? ' active' : ''}`}
        >
          <span className="rdb-rail-ico">◉</span>
          <span className="rdb-rail-label">Overview</span>
        </Link>
        <Link href="/sites" className="rdb-rail-item">
          <span className="rdb-rail-ico">WH</span>
          <span className="rdb-rail-label">Wormhole Sites</span>
        </Link>
        <Link
          href="/dev/sandbox/redesign/industry-b"
          className={`rdb-rail-item${active === 'industry' ? ' active' : ''}`}
        >
          <span className="rdb-rail-ico">IN</span>
          <span className="rdb-rail-label">Industry Planner</span>
        </Link>
        <span className="rdb-rail-item soon">
          <span className="rdb-rail-ico">RC</span>
          <span className="rdb-rail-label">Roll Calculator</span>
        </span>

        <span className="rdb-rail-cap">Site</span>
        <Link href="/changelog" className="rdb-rail-item">
          <span className="rdb-rail-ico">CL</span>
          <span className="rdb-rail-label">Changelog</span>
        </Link>
        <Link href="/contact" className="rdb-rail-item">
          <span className="rdb-rail-ico">CT</span>
          <span className="rdb-rail-label">Contact</span>
        </Link>
      </nav>

      <div className="rdb-rail-foot">
        <span className="rdb-rail-item">
          <span className="rdb-rail-ico">ID</span>
          <span className="rdb-rail-label">Log in with EVE</span>
        </span>
      </div>
    </aside>
  );
}
