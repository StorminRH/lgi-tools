import type { Metadata } from 'next';
import Link from 'next/link';
import { HoloRail } from '../mock-nav';

export const metadata: Metadata = { title: 'Redesign — Home B (Holo Console)' };

// Home mockup B — "HOLO CONSOLE". EVE bridge-console treatment: deep
// blue-black with nebula light, glass panels with corner brackets, ice-cyan
// accent, Chakra Petch display type. Nav is a sticky side rail that expands
// from glyphs to full labels on hover.
export default function HomeMockB() {
  return (
    <div className="rdb">
      <div className="rdb-stage">
        <HoloRail active="home" />

        <div className="rdb-main">
          <div className="rdb-conbar">
            <span>
              lgi://<span className="path">console/overview</span>
            </span>
            <span className="right">
              <span className="rdb-ledline">
                <span className="rdb-led" /> SDE <b>synced</b>
              </span>
              <span className="rdb-ledline">
                <span className="rdb-led" /> Jita feed <b>live</b>
              </span>
              <span>
                EVT <b>17:42</b>
              </span>
            </span>
          </div>

          <section className="rdb-hero">
            <p className="rdb-overline">{'// Fleet tooling console — EVE Online'}</p>
            <h1 className="rdb-h1">
              Lo-Gang <span className="thin">Industries</span>
            </h1>
            <p className="rdb-sub">
              Wormhole intelligence and industry math, wired straight to live
              Jita prices. Pick a module to begin.
            </p>
            <div className="rdb-sysline">
              <span className="rdb-seg">
                <span className="cy">▣</span> 69 signatures indexed
              </span>
              <span className="rdb-seg">
                price sync <b>T-4m</b>
              </span>
              <span className="rdb-seg">
                blueprints <b>4,312</b>
              </span>
              <span className="rdb-seg">
                uptime <b>99.9%</b>
              </span>
            </div>
          </section>

          <section className="rdb-section">
            <div className="rdb-seclabel">
              <span className="cy">◢</span> Modules
            </div>
            <div className="rdb-modules">
              <Link href="/sites" className="rdb-panel rdb-module">
                <span className="rdb-module-top">
                  <span className="rdb-module-title">Wormhole Sites</span>
                  <span className="rdb-status live">
                    <span className="rdb-led" /> Live
                  </span>
                </span>
                <p className="rdb-module-desc">
                  Every anomaly and signature in Anoikis, filterable by class,
                  type, and ISK value — with live loot pricing on ore and gas.
                </p>
                <span className="rdb-module-foot">
                  <span>C1 – C6 · Combat · Gas · Ore</span>
                  <span className="go">Engage ▸</span>
                </span>
              </Link>

              <Link href="/industry" className="rdb-panel rdb-module">
                <span className="rdb-module-top">
                  <span className="rdb-module-title">Industry Planner</span>
                  <span className="rdb-status live">
                    <span className="rdb-led" /> Live
                  </span>
                </span>
                <p className="rdb-module-desc">
                  Build cost, profit margin, and price confidence for any
                  blueprint or reaction, computed at current Jita rates.
                </p>
                <span className="rdb-module-foot">
                  <span>T1 · T2 · T3 · Reactions</span>
                  <span className="go">Engage ▸</span>
                </span>
              </Link>

              <div className="rdb-panel rdb-module dev-module">
                <span className="rdb-module-top">
                  <span className="rdb-module-title">Roll Calculator</span>
                  <span className="rdb-status dev">
                    <span className="rdb-led gold" /> In dev
                  </span>
                </span>
                <p className="rdb-module-desc">
                  Live mass tracking for hole rolls — know which pass collapses
                  the hole before the battleship jumps.
                </p>
                <span className="rdb-module-foot">
                  <span>Scheduled</span>
                  <span>v5.0</span>
                </span>
              </div>
            </div>
          </section>

          <section className="rdb-telemetry">
            <div className="rdb-panel rdb-tele">
              <div className="rdb-tele-num">
                69<span className="cy">/69</span>
              </div>
              <div className="rdb-tele-cap">Sites catalogued</div>
            </div>
            <div className="rdb-panel rdb-tele">
              <div className="rdb-tele-num">
                ≤30<span className="cy">m</span>
              </div>
              <div className="rdb-tele-cap">Max price age</div>
            </div>
            <div className="rdb-panel rdb-tele">
              <div className="rdb-tele-num">
                4,312
              </div>
              <div className="rdb-tele-cap">Blueprints resolved</div>
            </div>
            <div className="rdb-panel rdb-tele">
              <div className="rdb-tele-num">
                0<span className="cy"> ads</span>
              </div>
              <div className="rdb-tele-cap">Forever</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
