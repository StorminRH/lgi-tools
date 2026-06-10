import type { Metadata } from 'next';
import Link from 'next/link';
import { HoloRail } from '../mock-nav';

export const metadata: Metadata = { title: 'Redesign — Industry B (Holo Console)' };

// Industry landing mockup B — "HOLO CONSOLE". Same brief as mockup A (no
// sample builds; recent searches + active-jobs placeholders) in the holo
// treatment: glass panels, corner brackets, segmented slot meters, and the
// side-rail nav.

const RECENT = [
  { mark: 'T2', name: 'Sabre', sub: 'T2 DESTROYER · BPO', when: 'T-12m', margin: '+11.2%', gold: false },
  { mark: 'DR', name: 'Hammerhead II', sub: 'T2 DRONE · BPC', when: 'T-26m', margin: '+18.4%', gold: false },
  { mark: 'RX', name: 'Fullerides', sub: 'COMPOSITE REACTION', when: 'T-1h', margin: '+21.0%', gold: false },
  { mark: 'EX', name: 'Hulk', sub: 'EXHUMER · BPO', when: 'T-2h', margin: '+7.9%', gold: true },
  { mark: 'T3', name: 'Loki', sub: 'T3 STRATEGIC CRUISER', when: 'T-3h', margin: '+9.6%', gold: false },
];

export default function IndustryMockB() {
  return (
    <div className="rdb">
      <div className="rdb-stage">
        <HoloRail active="industry" />

        <div className="rdb-main">
          <div className="rdb-conbar">
            <span>
              lgi://<span className="path">console/industry</span>
            </span>
            <span className="right">
              <span className="rdb-ledline">
                <span className="rdb-led" /> Jita feed <b>T-4m</b>
              </span>
              <span>
                EVT <b>17:42</b>
              </span>
            </span>
          </div>

          <header className="rdb-page-head">
            <h1 className="rdb-page-title">Industry Planner</h1>
            <p className="rdb-page-sub">Manufacturing console // live Jita pricing</p>
          </header>

          <div className="rdb-section">
            <button type="button" className="rdb-search">
              <span className="rdb-search-gt">&gt;</span>
              <span className="rdb-search-text">
                Query blueprint or reaction
                <span className="rdb-block-cursor" />
              </span>
              <span className="rdb-kbd">⌘K</span>
            </button>
          </div>

          <div className="rdb-dash">
            <section className="rdb-panel">
              <div className="rdb-panel-head">
                <span className="rdb-panel-title">Recent queries</span>
                <span className="rdb-panel-hint">Local buffer</span>
              </div>
              {RECENT.map((r) => (
                <Link key={r.name} href="/industry" className="rdb-row">
                  <span className="rdb-row-mark">{r.mark}</span>
                  <span className="rdb-row-main">
                    <span className="rdb-row-name">{r.name}</span>
                    <br />
                    <span className="rdb-row-sub">{r.sub}</span>
                  </span>
                  <span className="rdb-row-when">{r.when}</span>
                  <span className={`rdb-row-margin${r.gold ? ' gold' : ''}`}>{r.margin}</span>
                </Link>
              ))}
            </section>

            <section className="rdb-panel">
              <div className="rdb-panel-head">
                <span className="rdb-panel-title">Active jobs</span>
                <span className="rdb-badge">Awaiting link-up</span>
                <span className="rdb-panel-hint">v4.x</span>
              </div>

              <div className="rdb-slotmeter">
                <div className="rdb-slotmeter-cap">
                  <span>MFG slots</span>
                  <b>—/10</b>
                </div>
                <div className="rdb-segs">
                  <span className="rdb-segbox on" />
                  <span className="rdb-segbox on" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                  <span className="rdb-segbox" />
                </div>
              </div>

              <div className="rdb-ghost">
                <div className="rdb-ghost-top">
                  <span className="rdb-ghost-name">Sabre ×5</span>
                  <span className="rdb-ghost-kind">Manufacturing</span>
                  <span className="rdb-ghost-eta">ETA 11:24:00</span>
                </div>
                <div className="rdb-track">
                  <div className="rdb-fill p64" />
                </div>
              </div>
              <div className="rdb-ghost">
                <div className="rdb-ghost-top">
                  <span className="rdb-ghost-name">Fullerides ×40</span>
                  <span className="rdb-ghost-kind">Reaction</span>
                  <span className="rdb-ghost-eta">ETA 52:10:00</span>
                </div>
                <div className="rdb-track">
                  <div className="rdb-fill p23" />
                </div>
              </div>

              <p className="rdb-note">
                <span className="gold">▲ PREVIEW</span> — job telemetry goes
                live once character link-up ships. Your industry queue,
                progress, and delivery alerts will stream here.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
