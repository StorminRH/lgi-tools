import type { Metadata } from 'next';
import Link from 'next/link';
import { PhosphorTopbar } from '../mock-nav';

export const metadata: Metadata = { title: 'Redesign — Industry A (Phosphor)' };

// Industry landing mockup A — "PHOSPHOR". Per the redesign brief: no sample
// builds. The page is search-first, shows only recent searches (mock entries
// to demonstrate the treatment), and carries designed placeholders for the
// upcoming active-jobs feature (ghosted job rows + job-slot meters).

const RECENT = [
  { mark: 'T2', name: 'Sabre', sub: 'T2 destroyer blueprint', when: '12m ago', margin: '+11.2%', warm: false },
  { mark: 'DR', name: 'Hammerhead II', sub: 'T2 drone blueprint', when: '26m ago', margin: '+18.4%', warm: false },
  { mark: 'RX', name: 'Fullerides', sub: 'Composite reaction', when: '1h ago', margin: '+21.0%', warm: false },
  { mark: 'EX', name: 'Hulk', sub: 'Exhumer blueprint', when: '2h ago', margin: '+7.9%', warm: true },
  { mark: 'T3', name: 'Loki', sub: 'T3 strategic cruiser', when: '3h ago', margin: '+9.6%', warm: false },
];

export default function IndustryMockA() {
  return (
    <div className="rda">
      <div className="rda-sheet">
        <PhosphorTopbar />

        <header className="rda-page-head">
          <div>
            <h1 className="rda-page-title">Industry Planner</h1>
            <p className="rda-page-sub">
              Build costs and margins at live Jita rates.
            </p>
          </div>
          <span className="rda-feedchip">
            <span className="rda-led" />
            Prices 4m old
          </span>
        </header>

        <div className="rda-cmdwrap">
          <button type="button" className="rda-cmd">
            <span className="rda-cmd-gt">&gt;</span>
            <span className="rda-cmd-text">
              Search any blueprint or reaction to plan its build…
            </span>
            <span className="rda-kbd">⌘K</span>
          </button>
        </div>

        <div className="rda-dash">
          <section className="rda-panel">
            <div className="rda-panel-head">
              <span className="rda-panel-title">Recent searches</span>
              <span className="rda-panel-hint">Stored locally</span>
            </div>
            {RECENT.map((r) => (
              <Link key={r.name} href="/industry" className="rda-row">
                <span className="rda-row-mark">{r.mark}</span>
                <span className="rda-row-main">
                  <span className="rda-row-name">{r.name}</span>
                  <br />
                  <span className="rda-row-sub">{r.sub}</span>
                </span>
                <span className="rda-row-when">{r.when}</span>
                <span className={`rda-row-margin${r.warm ? ' warm' : ''}`}>{r.margin}</span>
              </Link>
            ))}
          </section>

          <section className="rda-panel">
            <div className="rda-panel-head">
              <span className="rda-panel-title">Active jobs</span>
              <span className="rda-badge-preview">Preview</span>
              <span className="rda-panel-hint">Ships in v4.x</span>
            </div>
            <div className="rda-job">
              <div className="rda-job-top">
                <span className="rda-job-name">Sabre ×5</span>
                <span className="rda-job-kind">Manufacturing</span>
                <span className="rda-job-eta">ETA 11h 24m</span>
              </div>
              <div className="rda-track">
                <div className="rda-fill p64" />
              </div>
            </div>
            <div className="rda-job">
              <div className="rda-job-top">
                <span className="rda-job-name">Fullerides ×40</span>
                <span className="rda-job-kind">Reaction</span>
                <span className="rda-job-eta">ETA 2d 4h</span>
              </div>
              <div className="rda-track">
                <div className="rda-fill p23" />
              </div>
            </div>
            <p className="rda-empty">
              <b>Job tracking is on the way.</b> Link your character and your
              industry queue will appear here — progress, ETAs, and delivery
              alerts.
            </p>
          </section>
        </div>

        <div className="rda-slots">
          <div className="rda-slot">
            Manufacturing slots <b>—/10</b>
          </div>
          <div className="rda-slot">
            Science slots <b>—/10</b>
          </div>
          <div className="rda-slot">
            Reaction slots <b>—/10</b>
          </div>
        </div>
      </div>
    </div>
  );
}
