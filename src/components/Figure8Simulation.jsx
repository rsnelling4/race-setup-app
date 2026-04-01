import { useState } from 'react';
import { simulateRaceF8, DEFAULT_SETUP_F8, F8_BASELINE_SETUP } from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import NumericInput from './NumericInput';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];

// Recommended F8 setup — grid-search optimized (34,884 combos @ 75°F, best lap 23.152s)
const RECOMMENDED_F8_SETUP = {
  shocks: { LF: 1, RF: 1, LR: 1, RR: 1 },
  camber: { LF: -3.5, RF: -3.5 },
  caster: { LF: 5.0, RF: 5.0 },
  toe: -0.25,
  coldPsi: { LF: 35, RF: 35, LR: 30, RR: 30 },
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function formatTime(s) {
  return s.toFixed(3);
}

function formatMins(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

function tempColor(t) {
  if (t < 100) return 'var(--accent)';  // cold: below optimal grip window
  if (t < 165) return 'var(--green)';   // optimal: 100–165°F
  if (t < 185) return 'var(--yellow)';  // warm: grip starting to drop
  return 'var(--red)';                  // overheating
}

function deltaColor(delta) {
  if (delta <= 0) return 'var(--green)';
  if (delta < 0.1) return 'var(--yellow)';
  return 'var(--red)';
}

// ============ SETUP FORM ============
function SetupForm({ setup, onChange, onRun, onPreset }) {
  const updateShock = (corner, selectedLabel) => {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === selectedLabel);
    if (!found) return;
    const s = deepClone(setup);
    s.shocks[corner] = found.rating;
    onChange(s);
  };
  const updateCamber = (corner, val) => {
    const s = deepClone(setup);
    s.camber[corner] = parseFloat(val) || 0;
    onChange(s);
  };
  const updateCaster = (corner, val) => {
    const s = deepClone(setup);
    s.caster[corner] = parseFloat(val) || 0;
    onChange(s);
  };
  const updateToe = (val) => {
    const s = deepClone(setup);
    s.toe = parseFloat(val) || 0;
    onChange(s);
  };
  const updatePsi = (corner, val) => {
    const s = deepClone(setup);
    s.coldPsi[corner] = parseFloat(val) || 0;
    onChange(s);
  };

  const selectedShockLabel = (corner) => {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const match = list.find(s => s.rating === setup.shocks[corner]);
    return match ? shockLabel(match) : '';
  };

  return (
    <div className="sim-form">
      <div className="sim-presets">
        <button className="sim-preset-btn" onClick={() => onPreset('default')}>
          Load Default Setup
        </button>
        <button className="sim-preset-btn" onClick={() => onPreset('baseline')}>
          Load Baseline
        </button>
        <button className="sim-preset-btn accent" onClick={() => onPreset('f8')}>
          Load F8 Recommended
        </button>
      </div>

      <div className="sim-form-section">
        <h4>Shocks / Struts <span className="sim-hint">Rating: 0 = stiffest, 10 = softest</span></h4>
        <div className="sim-shock-grid">
          {[['LF', 'RF'], ['LR', 'RR']].map(([a, b]) => (
            <div key={a + b} className="sim-shock-row">
              {[a, b].map(c => {
                const list = (c === 'LF' || c === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
                const label = c === 'LF' || c === 'RF' ? 'Front Strut' : 'Rear Shock';
                return (
                  <div key={c} className="sim-shock-select-group">
                    <label className="sim-shock-label">{c} — {label}</label>
                    <select
                      className="sim-shock-select"
                      value={selectedShockLabel(c)}
                      onChange={e => updateShock(c, e.target.value)}
                    >
                      {list.map(s => (
                        <option key={s.part} value={shockLabel(s)}>
                          {shockLabel(s)}
                        </option>
                      ))}
                    </select>
                    <span className="sim-shock-detail">
                      {(() => {
                        const match = list.find(x => x.rating === setup.shocks[c]);
                        return match ? `${match.type} — ${match.use}` : '';
                      })()}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="sim-form-section">
        <h4>Camber (degrees) <span className="sim-hint">Symmetric recommended for figure 8 — both fronts equal negative</span></h4>
        <div className="sim-input-grid two-col">
          {['LF', 'RF'].map(c => (
            <div key={c} className="sim-input-group">
              <label>{c}</label>
              <NumericInput step="0.25"
                value={setup.camber[c]}
                onChange={num => updateCamber(c, num)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sim-form-section">
        <h4>Caster (degrees) <span className="sim-hint">Symmetric required — unequal caster (e.g. LF 5.5° vs RF 3.75°) causes heavy steering one direction and uneven tire temps L vs R. Match both sides.</span></h4>
        <div className="sim-input-grid two-col">
          {['LF', 'RF'].map(c => (
            <div key={c} className="sim-input-group">
              <label>{c}</label>
              <input
                type="number" step="0.25" min="0" max="10"
                value={setup.caster[c]}
                onChange={e => updateCaster(c, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sim-form-section">
        <h4>Toe (inches) <span className="sim-hint">Negative = toe out, positive = toe in</span></h4>
        <div className="sim-input-grid one-col">
          <div className="sim-input-group">
            <label>Front Toe</label>
            <NumericInput step="0.0625"
              value={setup.toe}
              onChange={num => updateToe(num)}
            />
            <span className="sim-input-hint">
              {setup.toe < 0 ? `${Math.abs(setup.toe)}" toe out` : setup.toe > 0 ? `${setup.toe}" toe in` : 'Zero toe'}
            </span>
          </div>
        </div>
      </div>

      <div className="sim-form-section">
        <h4>Cold Tire Pressures (PSI) <span className="sim-hint">Symmetric pressures recommended for balanced loading</span></h4>
        <div className="sim-input-grid four-col">
          {CORNERS.map(c => (
            <div key={c} className="sim-input-group">
              <label>{c}</label>
              <input
                type="number" min="10" max="50" step="0.5"
                value={setup.coldPsi[c]}
                onChange={e => updatePsi(c, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <button className="sim-run-btn" onClick={onRun}>
        Simulate Race
      </button>
    </div>
  );
}

// ============ SUMMARY CARD ============
function SummaryCard({ summary, label }) {
  const TARGET = 23.1;
  const gap = summary.best - TARGET;
  return (
    <div className="sim-summary-card">
      {label && <div className="sim-summary-label">{label}</div>}
      <div className="sim-summary-grid">
        <div className="sim-stat">
          <span className="sim-stat-label">Best Lap</span>
          <span className="sim-stat-value green">{formatTime(summary.best)}s</span>
          <span className="sim-stat-sub">Lap {summary.bestLapNum}</span>
        </div>
        <div className="sim-stat">
          <span className="sim-stat-label">Average</span>
          <span className="sim-stat-value">{formatTime(summary.avg)}s</span>
        </div>
        <div className="sim-stat">
          <span className="sim-stat-label">Worst Lap</span>
          <span className="sim-stat-value red">{formatTime(summary.worst)}s</span>
          <span className="sim-stat-sub">Lap {summary.worstLapNum}</span>
        </div>
        <div className="sim-stat">
          <span className="sim-stat-label">Total Race</span>
          <span className="sim-stat-value">{formatMins(summary.total)}</span>
        </div>
        <div className="sim-stat">
          <span className="sim-stat-label">Goal (23.1s)</span>
          <span className="sim-stat-value" style={{ color: gap <= 0 ? 'var(--green)' : 'var(--yellow)' }}>
            {gap <= 0 ? `✓ ${Math.abs(gap).toFixed(3)}s under` : `${gap.toFixed(3)}s off`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ LAP TIME CHART ============
function LapChart({ laps, bestTime }) {
  const worstTime = Math.max(...laps.map(l => l.time));
  const range = worstTime - bestTime;

  return (
    <div className="sim-lap-chart">
      {laps.map(l => {
        const pct = range > 0 ? ((l.time - bestTime) / range) : 0;
        const hue = 120 - pct * 120;
        return (
          <div key={l.lap} className="sim-lap-bar-row">
            <span className="sim-lap-num">{l.lap}</span>
            <div className="sim-lap-bar-bg">
              <div
                className="sim-lap-bar"
                style={{
                  width: `${Math.max(5, 100 - pct * 60)}%`,
                  background: `hsl(${hue}, 70%, 50%)`,
                }}
              />
            </div>
            <span className="sim-lap-time">{l.time.toFixed(2)}s</span>
          </div>
        );
      })}
    </div>
  );
}

// ============ I/M/O TEMP PROGRESSION ============
function TempChart({ laps }) {
  return (
    <div className="sim-temp-chart">
      <div className="sim-temp-header imo-header">
        <span>Lap</span>
        {CORNERS.map(c => (
          <span key={c} className="sim-temp-corner-group">
            <span className="sim-temp-corner-label">{c}</span>
            <span className="sim-temp-imo-labels">
              <span>I</span><span>M</span><span>O</span>
            </span>
          </span>
        ))}
      </div>
      {laps.filter((_, i) => i % 3 === 0 || i === laps.length - 1).map(l => (
        <div key={l.lap} className="sim-temp-row imo-row">
          <span className="sim-temp-lap">{l.lap}</span>
          {CORNERS.map(c => {
            const imo = l.tempsIMO[c];
            return (
              <span key={c} className="sim-temp-corner-group">
                <span className="sim-temp-val" style={{ color: tempColor(imo.I) }}>{imo.I}°</span>
                <span className="sim-temp-val" style={{ color: tempColor(imo.M) }}>{imo.M}°</span>
                <span className="sim-temp-val" style={{ color: tempColor(imo.O) }}>{imo.O}°</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============ DETAILED TABLE ============
function LapTable({ laps }) {
  return (
    <div className="sim-table-wrap">
      <table className="sim-table">
        <thead>
          <tr>
            <th rowSpan="2">Lap</th>
            <th rowSpan="2">Time</th>
            <th rowSpan="2">Δ Best</th>
            <th rowSpan="2">Corner</th>
            <th rowSpan="2">Peak</th>
            <th colSpan="3">RF</th>
            <th colSpan="3">RR</th>
            <th colSpan="3">LR</th>
            <th colSpan="3">LF</th>
          </tr>
          <tr>
            {CORNERS.flatMap(c =>
              ['I', 'M', 'O'].map(z => <th key={`${c}-${z}`} className="sim-imo-th">{z}</th>)
            )}
          </tr>
        </thead>
        <tbody>
          {laps.map((l) => {
            const best = Math.min(...laps.map(x => x.time));
            const delta = l.time - best;
            const order = ['RF', 'RR', 'LR', 'LF'];
            return (
              <tr key={l.lap} className={l.time === best ? 'best-lap' : ''}>
                <td>{l.lap}</td>
                <td className="mono">{l.time.toFixed(3)}</td>
                <td className="mono" style={{ color: deltaColor(delta) }}>
                  {delta === 0 ? '—' : `+${delta.toFixed(3)}`}
                </td>
                <td className="mono">{l.cornerMph} mph</td>
                <td className="mono">{l.peakMph} mph</td>
                {order.map(c => {
                  const imo = l.tempsIMO[c];
                  return ['I', 'M', 'O'].map(z => (
                    <td key={`${c}-${z}`} style={{ color: tempColor(imo[z]) }} className="mono sim-imo-td">
                      {imo[z]}
                    </td>
                  ));
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ COMPARE SUMMARY ============
function CompareSummary({ a, b }) {
  const diff = (va, vb) => {
    const d = vb - va;
    const sign = d > 0 ? '+' : '';
    const color = d > 0 ? 'var(--red)' : 'var(--green)';
    return <span style={{ color }}>{sign}{d.toFixed(3)}s</span>;
  };
  return (
    <div className="sim-compare">
      <h4>Comparison</h4>
      <div className="sim-compare-grid">
        <div></div><div className="sim-compare-head">Setup A</div><div className="sim-compare-head">Setup B</div><div>Δ</div>
        <div>Best Lap</div><div className="mono">{a.best.toFixed(3)}</div><div className="mono">{b.best.toFixed(3)}</div><div className="mono">{diff(a.best, b.best)}</div>
        <div>Average</div><div className="mono">{a.avg.toFixed(3)}</div><div className="mono">{b.avg.toFixed(3)}</div><div className="mono">{diff(a.avg, b.avg)}</div>
        <div>Total Race</div><div className="mono">{formatMins(a.total)}</div><div className="mono">{formatMins(b.total)}</div><div className="mono">{diff(a.total, b.total)}</div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function Figure8Simulation({ setup, setSetup, ambient, setAmbient, inflationTemp, setInflationTemp }) {
  const [numLaps, setNumLaps] = useState(25);
  const [resultA, setResultA] = useState(null);
  const [resultB, setResultB] = useState(null);
  const [activeResult, setActiveResult] = useState('A');

  const handlePreset = (type) => {
    if (type === 'default') setSetup(deepClone(DEFAULT_SETUP_F8));
    else if (type === 'baseline') setSetup(deepClone(F8_BASELINE_SETUP));
    else setSetup(deepClone(RECOMMENDED_F8_SETUP));
  };

  const handleRun = () => {
    const result = simulateRaceF8(setup, ambient, numLaps, inflationTemp);
    if (activeResult === 'A') {
      setResultA({ ...result, setup: deepClone(setup), ambient, inflationTemp, numLaps });
    } else {
      setResultB({ ...result, setup: deepClone(setup), ambient, inflationTemp, numLaps });
    }
  };

  const displayResult = activeResult === 'A' ? resultA : resultB;

  return (
    <div className="sim-page">
      <div className="sim-header">
        <h2>Figure 8 Race Simulation</h2>
        <p className="sim-subtitle">
          Physics-based simulation for figure 8 racing — both left and right turns each lap.
          Goal: break 23.1s. Symmetric setup recommended for balanced tire loading.
        </p>
      </div>

      <div className="sim-context-cards">
        <div className="sim-context-card">
          <h4>Vehicle</h4>
          <p>2008 Crown Vic P71 — 4100 lbs, 4.6L V8 (~300 HP), 3.73 gears, stripped + cage</p>
        </div>
        <div className="sim-context-card">
          <h4>Track</h4>
          <p>~0.25 mi figure 8 — two 149 ft radius loops (298 ft diameter), ~120° arc each, 350 ft straights, no banking, left AND right turns</p>
        </div>
        <div className="sim-context-card">
          <h4>Calibration</h4>
          <p>Baseline: 23.283s/lap @ 75°F (real-world run, Load Baseline setup). LF runs ~10°F hotter than RF due to asymmetric caster — symmetric model matches right-side temps. Goal: 23.1s</p>
        </div>
      </div>

      {/* Condition Inputs */}
      <div className="sim-conditions">
        <div className="sim-input-group">
          <label>Ambient Temp (°F)</label>
          <input
            type="number" min="30" max="120" step="5"
            value={ambient}
            onChange={e => setAmbient(parseFloat(e.target.value) || 65)}
          />
        </div>
        <div className="sim-input-group">
          <label>Tires Set At (°F)</label>
          <input
            type="number" min="30" max="120" step="1"
            value={inflationTemp}
            onChange={e => setInflationTemp(parseFloat(e.target.value) || 68)}
          />
        </div>
        <div className="sim-input-group">
          <label>Number of Laps</label>
          <input
            type="number" min="1" max="100" step="1"
            value={numLaps}
            onChange={e => setNumLaps(parseInt(e.target.value) || 20)}
          />
        </div>
        <div className="sim-input-group">
          <label>Save Result As</label>
          <div className="sim-ab-toggle">
            <button
              className={`sim-ab-btn ${activeResult === 'A' ? 'active' : ''}`}
              onClick={() => setActiveResult('A')}
            >
              Setup A
            </button>
            <button
              className={`sim-ab-btn ${activeResult === 'B' ? 'active' : ''}`}
              onClick={() => setActiveResult('B')}
            >
              Setup B
            </button>
          </div>
        </div>
      </div>

      <SetupForm
        setup={setup}
        onChange={setSetup}
        onRun={handleRun}
        onPreset={handlePreset}
      />

      {/* Results */}
      {displayResult && (
        <div className="sim-results">
          <h3 className="sim-results-title">
            Results — Setup {activeResult}
            {displayResult.ambient && (
              <span className="sim-results-cond">
                {displayResult.numLaps} laps @ {displayResult.ambient}°F ambient, set @ {displayResult.inflationTemp ?? 68}°F
              </span>
            )}
          </h3>

          <SummaryCard summary={displayResult.summary} />

          {resultA && resultB && (
            <CompareSummary a={resultA.summary} b={resultB.summary} />
          )}

          <div className="sim-charts-row">
            <div className="sim-chart-section">
              <h4>Lap Times</h4>
              <LapChart
                laps={displayResult.laps}
                bestTime={displayResult.summary.best}
              />
            </div>
            <div className="sim-chart-section">
              <h4>Tire Temperatures (I/M/O)</h4>
              <TempChart laps={displayResult.laps} />
            </div>
          </div>

          <div className="sim-detail-section">
            <h4>Detailed Lap Data</h4>
            <LapTable laps={displayResult.laps} />
          </div>
        </div>
      )}

      <div className="sim-disclaimer">
        <strong>Note:</strong> Figure 8 physics averages left and right turn loads — all tires work symmetrically.
        Symmetric camber (~-2.5° to -3.0° both fronts), equal caster (both sides matched), equal pressures,
        and balanced shocks are recommended. Unequal caster is the most common cause of the car turning
        better one direction than the other — higher caster on one side creates heavier steering effort
        and more tire scrub in the turns where that tire is on the outside.
        Results are directionally accurate for comparing setups.
      </div>
    </div>
  );
}
