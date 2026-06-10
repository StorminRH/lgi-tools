import type { Metadata } from 'next';
import Link from 'next/link';
import { PhosphorTopbar } from '../mock-nav';

export const metadata: Metadata = { title: 'Redesign — Home A (Phosphor)' };

// Home mockup A — "PHOSPHOR". Near-black terminal sheet with hairline rules,
// Geist at a legible 15px+ base, phosphor-green accent, and depth from
// layered surfaces + heavy soft shadows. Nav is a top bar with an animated
// hamburger panel (pure <details>, no JS).
export default function HomeMockA() {
  return (
    <div className="rda">
      <div className="rda-sheet">
        <PhosphorTopbar />

        <section className="rda-hero">
          <p className="rda-prompt">
            <span className="host">pilot@jita-4-4</span>:~$ lgi --list-tools
            <span className="rda-cursor" />
          </p>
          <h1 className="rda-h1">
            <span className="bracket">[&hairsp;</span>Lo-Gang<span className="bracket">&hairsp;]</span> Industries
          </h1>
          <p className="rda-lede">
            First-party tooling for wormhole pilots. Live Jita prices, every
            site in Anoikis, and the build math done for you — no ads, no
            accounts required.
          </p>
          <div className="rda-hero-actions">
            <Link href="/sites" className="rda-btn rda-btn-solid">
              Browse sites →
            </Link>
            <Link href="/industry" className="rda-btn rda-btn-ghost">
              Plan a build
            </Link>
          </div>
          <div className="rda-readout rda-mono">
            <span>
              price feed <b className="ok">LIVE</b>
            </span>
            <span>
              jita sync <b>4m ago</b>
            </span>
            <span>
              sites indexed <b>69</b>
            </span>
            <span>
              blueprints <b>4,312</b>
            </span>
          </div>
        </section>

        <section className="rda-section">
          <div className="rda-label">
            <span className="n">§</span> Tools
          </div>
          <div className="rda-grid">
            <Link href="/sites" className="rda-card">
              <span className="rda-card-idx">01</span>
              <span className="rda-card-title">Wormhole Sites</span>
              <p className="rda-card-desc">
                Every anomaly and signature in wormhole space — filter by
                class, site type, and ISK value, with live Jita pricing on ore
                and gas resources.
              </p>
              <span className="rda-card-foot">
                <span className="rda-tags">
                  <span className="rda-tag">Combat</span>
                  <span className="rda-tag green">Gas</span>
                  <span className="rda-tag amber">Ore</span>
                </span>
                <span className="rda-card-open">Open →</span>
              </span>
            </Link>

            <Link href="/industry" className="rda-card">
              <span className="rda-card-idx">02</span>
              <span className="rda-card-title">Industry Planner</span>
              <p className="rda-card-desc">
                Manufacturing profitability for blueprints and reactions —
                build cost, margin, and price confidence at live Jita rates.
              </p>
              <span className="rda-card-foot">
                <span className="rda-tags">
                  <span className="rda-tag">T1</span>
                  <span className="rda-tag">T2</span>
                  <span className="rda-tag">T3</span>
                  <span className="rda-tag green">Reactions</span>
                </span>
                <span className="rda-card-open">Open →</span>
              </span>
            </Link>

            <div className="rda-card soon">
              <span className="rda-card-idx">03</span>
              <span className="rda-card-title">Roll Calculator</span>
              <p className="rda-card-desc">
                Plan hole rolls with live mass tracking — know exactly which
                pass collapses the hole before you commit the battleship.
              </p>
              <span className="rda-card-foot">
                <span className="rda-tags">
                  <span className="rda-tag amber">In development</span>
                </span>
                <span className="rda-card-open rda-mono">v5.0</span>
              </span>
            </div>
          </div>
        </section>

        <div className="rda-stats">
          <div className="rda-stat">
            <div className="rda-stat-num">
              69<span className="unit">/69</span>
            </div>
            <div className="rda-stat-cap">wormhole sites catalogued, C1 through C6</div>
          </div>
          <div className="rda-stat">
            <div className="rda-stat-num">
              30<span className="unit">m</span>
            </div>
            <div className="rda-stat-cap">maximum age of any Jita price on the site</div>
          </div>
          <div className="rda-stat">
            <div className="rda-stat-num">
              0<span className="unit"> ads</span>
            </div>
            <div className="rda-stat-cap">built by pilots, for pilots — and it stays that way</div>
          </div>
        </div>

        <footer className="rda-foot">
          <span>© Lo-Gang Industries</span>
          <span>EVE Online and all related marks are property of CCP hf.</span>
          <span>v3.3.9</span>
        </footer>
      </div>
    </div>
  );
}
