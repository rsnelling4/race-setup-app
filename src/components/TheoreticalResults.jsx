import { useState, useMemo } from 'react';
import { analyzeSetup, analyzeSetupF8, simulateRace, VEH } from '../utils/raceSimulation';
import { computeGeometry } from './GeometryVisualizer';
import { useSync } from '../utils/SyncContext';

// ── Geo override builder (same logic as SetupOptimizer / Figure8Optimizer) ──
function buildGeoOverrides(geo) {
  if (!geo) return null;
  const overrides = {};
  if (geo.trackWidth?.front) overrides.trackWidthFront = Number(geo.trackWidth.front);
  if (geo.rearRollCenter)    overrides.rcHeightRear    = Number(geo.rearRollCenter);
  if (geo.rearSpringBase)    overrides.rearSpringBase  = Number(geo.rearSpringBase);
  const rf = computeGeometry(geo, 'RF');
  const lf = computeGeometry(geo, 'LF');
  if (rf?.rcHeight != null && lf?.rcHeight != null) {
    overrides.rcHeightFront = (rf.rcHeight + lf.rcHeight) / 2;
  } else if (rf?.rcHeight != null) {
    overrides.rcHeightFront = rf.rcHeight;
  } else if (lf?.rcHeight != null) {
    overrides.rcHeightFront = lf.rcHeight;
  }
  if (rf?.ic?.x != null && lf?.ic?.x != null) {
    overrides.icLateralFront = (Math.abs(rf.ic.x) + Math.abs(lf.ic.x)) / 2;
  } else if (rf?.ic?.x != null) {
    overrides.icLateralFront = Math.abs(rf.ic.x);
  }
  const wheelDispPerDegRoll = 0.383;
  if (rf?.fvsa != null && rf.fvsa > 0) overrides.slaJounceCoeffRF = (57.3 / rf.fvsa) * wheelDispPerDegRoll;
  if (lf?.fvsa != null && lf.fvsa > 0) overrides.slaDroopCoeffLF  = (57.3 / lf.fvsa) * wheelDispPerDegRoll;
  const spLF = Number(geo.springPickup?.LF);
  const spRF = Number(geo.springPickup?.RF);
  if (spLF > 0 || spRF > 0) {
    const spAvg = (spLF > 0 && spRF > 0) ? (spLF + spRF) / 2 : (spLF || spRF);
    overrides.mrFront = spAvg / 13.0;
  }
  if (geo.cgHeight)   overrides.cgHeight   = Number(geo.cgHeight);
  if (geo.frontBias)  overrides.frontBias  = Number(geo.frontBias) / 100;
  return Object.keys(overrides).length > 0 ? overrides : null;
}

// Build a setup object from a geo profile
function setupFromGeo(geo) {
  const s = {
    shocks:   { LF: 4, RF: 4, LR: 2, RR: 2 },
    springs:  { LF: 475, RF: 475, LR: 160, RR: 160 },
    camber:   { LF: 2.75, RF: -2.25 },
    caster:   { LF: 9.0, RF: 3.0 },
    toe:      -0.25,
    coldPsi:  { LF: 20, RF: 38, LR: 16, RR: 35 },
  };
  if (!geo) return s;
  // Springs
  if (geo.springs?.LF) s.springs.LF = parseFloat(geo.springs.LF);
  if (geo.springs?.RF) s.springs.RF = parseFloat(geo.springs.RF);
  if (geo.springs?.LR) s.springs.LR = parseFloat(geo.springs.LR);
  if (geo.springs?.RR) s.springs.RR = parseFloat(geo.springs.RR);
  // Camber
  if (geo.camber?.LF !== '' && geo.camber?.LF != null) s.camber.LF = parseFloat(geo.camber.LF);
  if (geo.camber?.RF !== '' && geo.camber?.RF != null) s.camber.RF = parseFloat(geo.camber.RF);
  // Caster
  if (geo.caster?.LF !== '' && geo.caster?.LF != null) s.caster.LF = parseFloat(geo.caster.LF);
  if (geo.caster?.RF !== '' && geo.caster?.RF != null) s.caster.RF = parseFloat(geo.caster.RF);
  // Toe
  if (geo.toe?.total !== '' && geo.toe?.total != null) s.toe = parseFloat(geo.toe.total) / 2; // total → per-side
  return s;
}

// ── Traffic model ──
// 25 similar cars on track at the same time.
// Best lap: fastest clear lap (assumed ~5% of laps have zero traffic — start or restart gap).
// Average lap with traffic: based on pack density and passing time cost.
//   Pack density factor: with 25 cars on a 1/4-mile, average spacing = 52.7 ft ≈ ~0.8 car lengths.
//   Time lost per lap due to traffic (yellow, lapped car encounters, position racing): ~6–12%.
//   Modeled as bestLap × (1 + trafficPenalty), where trafficPenalty scales with pack density.
function trafficAvgLap(bestLap, numCars = 25) {
  // 1/4-mile = 1320 ft. Crown Vic ≈ 18 ft long. At 25 cars: track utilization ≈ 34%.
  // Empirical: 25-car short oval → avg lap 8–12% slower than best.
  // Scale: 10 cars → ~4%, 25 cars → ~9%, 40 cars → ~14%.
  const basePenalty = 0.09;
  const scaledPenalty = basePenalty * (numCars / 25);
  return bestLap * (1 + scaledPenalty);
}

// ── Helpers ──
function fmt(v, dec = 1) { return v != null ? v.toFixed(dec) : '—'; }
function pct(v) { return (v * 100).toFixed(1) + '%'; }

function balanceLabel(frontGripPct) {
  const dev = frontGripPct - VEH.frontBias;
  if (Math.abs(dev) < 0.02) return { text: 'Neutral', color: '#4ade80' };
  if (dev > 0.06)  return { text: 'Significant Push (understeer)', color: '#ef4444' };
  if (dev > 0.02)  return { text: 'Slight Push (understeer)', color: '#f59e0b' };
  if (dev < -0.06) return { text: 'Significant Loose (oversteer)', color: '#ef4444' };
  return { text: 'Slight Loose (oversteer)', color: '#60a5fa' };
}

function phaseDesc(phase, frontGripPct) {
  const push = frontGripPct > VEH.frontBias + 0.02;
  const loose = frontGripPct < VEH.frontBias - 0.02;
  const map = {
    Entry: {
      push:    'Car resists turning in — front washes toward outside wall. Driver must slow more or use extra steering input.',
      loose:   'Rear rotates aggressively on entry — natural lap shortener but requires catch on throttle.',
      neutral: 'Car rotates cleanly on corner entry. Front and rear loads balanced. Driver can be aggressive.',
    },
    Mid: {
      push:    'Front slides mid-corner — driver must feed steering correction. Tire heat will build unevenly on outside front.',
      loose:   'Rear drifts at steady throttle — requires constant wheel management. Carries corner exit speed penalty.',
      neutral: 'Car tracks predictably mid-corner. Both axles loaded in proportion. Consistent lap after lap.',
    },
    Exit: {
      push:    'Power-on understeer — car pushes wide as throttle is applied. Front tires doing more work than rear.',
      loose:   'Throttle-on oversteer — rear steps out at power application. RPM-limited corner exit.',
      neutral: 'Driver can apply power early. Front and rear traction balanced through exit. Maximum straight-line speed.',
    },
  };
  const feel = push ? 'push' : loose ? 'loose' : 'neutral';
  return map[phase]?.[feel] ?? '';
}

const CORNER_LABELS = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
const CORNERS = ['LF', 'RF', 'LR', 'RR'];

// ── Sub-components ──

function TireRow({ corner, imo }) {
  const tempColor = (t) => {
    if (t < 90)  return '#93c5fd';
    if (t < 100) return '#bfdbfe';
    if (t < 130) return '#4ade80';
    if (t < 150) return '#fbbf24';
    if (t < 170) return '#f97316';
    return '#ef4444';
  };
  return (
    <div className="tr-tire-row">
      <span className="tr-tire-label">{corner}</span>
      {['I','M','O'].map(z => (
        <span key={z} className="tr-tire-zone" style={{ color: tempColor(imo[z]) }}>
          <span className="tr-zone-label">{z}</span>
          <span className="tr-zone-val">{imo[z]}°</span>
        </span>
      ))}
    </div>
  );
}

function PhaseCard({ phase, corners, frontGripPct }) {
  const bal = balanceLabel(frontGripPct);
  const desc = phaseDesc(phase, frontGripPct);
  return (
    <div className="tr-phase-card">
      <div className="tr-phase-header">
        <span className="tr-phase-name">{phase}</span>
        <span className="tr-phase-balance" style={{ color: bal.color }}>{bal.text}</span>
      </div>
      <p className="tr-phase-desc">{desc}</p>
      <div className="tr-phase-corners">
        {corners.map(([c, cd]) => (
          <div key={c} className="tr-phase-corner">
            <span className="tr-pc-label">{c}</span>
            <span className="tr-pc-load">{Math.round(cd.load)} lbs</span>
            <span className="tr-pc-temp">{Math.round(cd.estimatedTemp)}°F</span>
            <span className="tr-pc-mu" style={{ color: cd.mu > 0.97 ? '#4ade80' : cd.mu > 0.93 ? '#fbbf24' : '#ef4444' }}>
              μ {pct(cd.mu)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ value, low = 0.88, high = 1.0, label }) {
  const pctW = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  const color = value >= 0.97 ? '#4ade80' : value >= 0.93 ? '#fbbf24' : '#ef4444';
  return (
    <div className="tr-score-row">
      <span className="tr-score-label">{label}</span>
      <div className="tr-score-bar">
        <div className="tr-score-fill" style={{ width: pctW + '%', background: color }} />
      </div>
      <span className="tr-score-val" style={{ color }}>{pct(value)}</span>
    </div>
  );
}

// ── Main component ──
export default function TheoreticalResults() {
  const { geometry: geoProfiles = [] } = useSync();
  const [selectedGeoId, setSelectedGeoId] = useState('');
  const [ambient, setAmbient] = useState(75);
  const [trackType, setTrackType] = useState('oval');
  const [numCars, setNumCars] = useState(25);
  const [inflationTemp, setInflationTemp] = useState(85);

  const selectedGeo = useMemo(
    () => geoProfiles?.find(g => g.id === selectedGeoId) ?? null,
    [geoProfiles, selectedGeoId]
  );

  const results = useMemo(() => {
    if (!selectedGeo) return null;
    const setup = setupFromGeo(selectedGeo);
    const geoOverrides = buildGeoOverrides(selectedGeo);

    if (trackType === 'oval') {
      const analysis = analyzeSetup(setup, ambient, inflationTemp, geoOverrides);
      const sim = simulateRace(setup, ambient, 25, inflationTemp);
      return { analysis, sim, setup, trackType: 'oval' };
    } else {
      const analysis = analyzeSetupF8(setup, ambient, inflationTemp, geoOverrides);
      return { analysis, sim: null, setup, trackType: 'f8' };
    }
  }, [selectedGeo, ambient, trackType, inflationTemp]);

  // Derive final tire temps from simulation (last lap of 25) or equilibrium from analysis
  const finalTemps = useMemo(() => {
    if (!results) return null;
    if (results.sim) {
      const lastLap = results.sim.laps[results.sim.laps.length - 1];
      return lastLap.tempsIMO;
    }
    // F8: use equilibrium temps from analysis corners
    const out = {};
    for (const c of CORNERS) {
      const t = Math.round(results.analysis.corners[c].estimatedTemp);
      out[c] = { I: t, M: t, O: t };
    }
    return out;
  }, [results]);

  const bestLap = results?.sim
    ? results.sim.summary.best
    : results?.analysis?.lapTime ?? null;

  const avgLapWithTraffic = bestLap != null ? trafficAvgLap(bestLap, numCars) : null;

  // Phase-level corner data (same for all phases in equilibrium model — but we simulate Entry/Mid/Exit semantically)
  const phaseData = useMemo(() => {
    if (!results) return null;
    const { corners, frontGripPct } = results.analysis;
    // Entry: shocks moving (transient) — damperLLTD biased slightly vs spring
    // Mid: steady-state — springs dominate
    // Exit: throttle-on — rear loads slightly more
    // For this model we use a single equilibrium state and annotate the phase descriptions contextually.
    // The grip and load numbers are the same per-corner (equilibrium), but the narrative differs.
    const cornerPairs = CORNERS.map(c => [c, corners[c]]);
    return {
      frontGripPct,
      Entry: cornerPairs,
      Mid:   cornerPairs,
      Exit:  cornerPairs,
    };
  }, [results]);

  return (
    <div className="tr-root">
      <div className="tr-header">
        <h2 className="tr-title">Theoretical Results</h2>
        <p className="tr-subtitle">Physics-predicted corner feel, tire temperatures, and lap time estimates based on geometry profile and ambient conditions.</p>
      </div>

      {/* ── Controls ── */}
      <div className="tr-controls">
        <div className="tr-control-group">
          <label className="tr-label">Car Geometry Profile</label>
          <select
            className="tr-select"
            value={selectedGeoId}
            onChange={e => setSelectedGeoId(e.target.value)}
          >
            <option value="">— Select a profile —</option>
            {(geoProfiles ?? []).map(g => (
              <option key={g.id} value={g.id}>{g.title || g.name || g.id}</option>
            ))}
          </select>
        </div>

        <div className="tr-control-group">
          <label className="tr-label">Track Type</label>
          <div className="tr-toggle">
            <button
              className={`tr-toggle-btn${trackType === 'oval' ? ' active' : ''}`}
              onClick={() => setTrackType('oval')}
            >Oval</button>
            <button
              className={`tr-toggle-btn${trackType === 'f8' ? ' active' : ''}`}
              onClick={() => setTrackType('f8')}
            >Figure 8</button>
          </div>
        </div>

        <div className="tr-control-group">
          <label className="tr-label">Ambient Temp (°F)</label>
          <input
            type="number"
            className="tr-input"
            value={ambient}
            onChange={e => setAmbient(Number(e.target.value))}
            min={30} max={110} step={5}
          />
        </div>

        <div className="tr-control-group">
          <label className="tr-label">Inflation Temp (°F)</label>
          <input
            type="number"
            className="tr-input"
            value={inflationTemp}
            onChange={e => setInflationTemp(Number(e.target.value))}
            min={60} max={110} step={5}
          />
        </div>

        <div className="tr-control-group">
          <label className="tr-label">Cars on Track</label>
          <input
            type="number"
            className="tr-input"
            value={numCars}
            onChange={e => setNumCars(Number(e.target.value))}
            min={5} max={50} step={1}
          />
        </div>
      </div>

      {!results && (
        <div className="tr-empty">
          Select a car geometry profile to generate theoretical results.
        </div>
      )}

      {results && (
        <>
          {/* ── Lap Time Summary ── */}
          <div className="tr-section tr-laptimes">
            <h3 className="tr-section-title">Lap Time Estimates</h3>
            <div className="tr-laptime-grid">
              <div className="tr-laptime-card tr-laptime-best">
                <span className="tr-lt-label">Theoretical Best Lap</span>
                <span className="tr-lt-val">{fmt(bestLap, 3)}s</span>
                <span className="tr-lt-note">Clean lap, ideal conditions, no traffic</span>
              </div>
              <div className="tr-laptime-card tr-laptime-avg">
                <span className="tr-lt-label">Est. Average with Traffic</span>
                <span className="tr-lt-val">{fmt(avgLapWithTraffic, 3)}s</span>
                <span className="tr-lt-note">{numCars} cars on track · ~{pct((avgLapWithTraffic - bestLap) / bestLap)} slower</span>
              </div>
              {results.sim && (
                <div className="tr-laptime-card">
                  <span className="tr-lt-label">Simulated Best (25 laps)</span>
                  <span className="tr-lt-val">{fmt(results.sim.summary.best, 3)}s</span>
                  <span className="tr-lt-note">Lap {results.sim.summary.bestLapNum} — tires up to temp</span>
                </div>
              )}
              {results.sim && (
                <div className="tr-laptime-card">
                  <span className="tr-lt-label">Simulated Average (25 laps)</span>
                  <span className="tr-lt-val">{fmt(results.sim.summary.avg, 3)}s</span>
                  <span className="tr-lt-note">Includes cold-tire first laps</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Balance Overview ── */}
          <div className="tr-section tr-balance-section">
            <h3 className="tr-section-title">Handling Balance</h3>
            <div className="tr-balance-row">
              {(() => {
                const bal = balanceLabel(results.analysis.frontGripPct);
                return (
                  <>
                    <div className="tr-balance-gauge">
                      <span className="tr-bg-label">Overall Balance</span>
                      <span className="tr-bg-val" style={{ color: bal.color }}>{bal.text}</span>
                    </div>
                    <div className="tr-balance-stats">
                      <div className="tr-bs-row">
                        <span>Front Grip Share</span>
                        <span>{pct(results.analysis.frontGripPct)}</span>
                      </div>
                      <div className="tr-bs-row">
                        <span>LLTD (front bias)</span>
                        <span>{pct(results.analysis.ss.frontLLTD)}</span>
                      </div>
                      <div className="tr-bs-row">
                        <span>Body Roll at Apex</span>
                        <span>{fmt(results.analysis.roll * (trackType === 'oval' ? 0.813 : 0.498), 2)}°</span>
                      </div>
                      <div className="tr-bs-row">
                        <span>Roll Angle Imbalance</span>
                        <span style={{ color: results.analysis.rollAngleImbalance > 1.0 ? '#f59e0b' : '#4ade80' }}>
                          {fmt(results.analysis.rollAngleImbalance, 2)}°
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── Corner Phase Synopsis ── */}
          <div className="tr-section">
            <h3 className="tr-section-title">Corner Feel by Phase</h3>
            <p className="tr-section-note">Physics-predicted behavior at each stage of a corner. Based on equilibrium tire loads, LLTD, and camber at {trackType === 'oval' ? 'oval apex (0.813G)' : 'F8 loop apex (0.498G)'}.</p>
            <div className="tr-phases">
              {['Entry', 'Mid', 'Exit'].map(phase => (
                <PhaseCard
                  key={phase}
                  phase={phase}
                  corners={phaseData[phase]}
                  frontGripPct={phaseData.frontGripPct}
                />
              ))}
            </div>
          </div>

          {/* ── Tire Temperatures ── */}
          <div className="tr-section tr-temps-section">
            <h3 className="tr-section-title">Predicted Tire Temperatures (Equilibrium)</h3>
            <p className="tr-section-note">Inside / Middle / Outside at steady-state running temperature. {trackType === 'oval' ? '25-lap simulation.' : 'F8 equilibrium model.'}</p>
            <div className="tr-tire-grid">
              {CORNERS.map(c => (
                <div key={c} className="tr-tire-card">
                  <div className="tr-tc-header">{CORNER_LABELS[c]}</div>
                  {finalTemps && <TireRow corner={c} imo={finalTemps[c]} />}
                  <div className="tr-tc-meta">
                    <span>{Math.round(results.analysis.corners[c].load)} lbs</span>
                    <span>{fmt(results.analysis.corners[c].groundCamber, 2)}° gnd</span>
                    <span>{fmt(results.analysis.corners[c].hp, 1)} PSI hot</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Grip Factor Breakdown ── */}
          <div className="tr-section">
            <h3 className="tr-section-title">Grip Factors by Corner</h3>
            <div className="tr-grip-grid">
              {CORNERS.map(c => {
                const cd = results.analysis.corners[c];
                return (
                  <div key={c} className="tr-grip-card">
                    <div className="tr-gc-title">{c} — {CORNER_LABELS[c]}</div>
                    <ScoreBar value={cd.tempFactor}    label="Temperature" />
                    <ScoreBar value={cd.psiGripFactor} label="Pressure" />
                    <ScoreBar value={cd.camberFactor}  label="Camber" />
                    {cd.front && <ScoreBar value={cd.casterFactor} label="Caster" />}
                    {cd.front && <ScoreBar value={cd.toeFactor}    label="Toe" />}
                    <div className="tr-gc-total">
                      <span>Overall μ</span>
                      <span style={{ color: cd.mu > 0.97 ? '#4ade80' : cd.mu > 0.93 ? '#fbbf24' : '#ef4444' }}>
                        {pct(cd.mu)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Setup Used ── */}
          <div className="tr-section tr-setup-used">
            <h3 className="tr-section-title">Setup Inputs Used</h3>
            <div className="tr-setup-grid">
              <div className="tr-su-group">
                <div className="tr-su-title">Springs (lbs/in)</div>
                {CORNERS.map(c => (
                  <div key={c} className="tr-su-row"><span>{c}</span><span>{results.setup.springs[c]}</span></div>
                ))}
              </div>
              <div className="tr-su-group">
                <div className="tr-su-title">Shocks (click)</div>
                {CORNERS.map(c => (
                  <div key={c} className="tr-su-row"><span>{c}</span><span>{results.setup.shocks[c]}</span></div>
                ))}
              </div>
              <div className="tr-su-group">
                <div className="tr-su-title">Camber / Caster</div>
                {['LF','RF'].map(c => (
                  <div key={c} className="tr-su-row">
                    <span>{c}</span>
                    <span>{fmt(results.setup.camber[c], 2)}° / {fmt(results.setup.caster?.[c], 1)}°</span>
                  </div>
                ))}
              </div>
              <div className="tr-su-group">
                <div className="tr-su-title">Cold PSI</div>
                {CORNERS.map(c => (
                  <div key={c} className="tr-su-row"><span>{c}</span><span>{results.setup.coldPsi[c]}</span></div>
                ))}
              </div>
            </div>
            <div className="tr-su-note">Toe: {results.setup.toe < 0 ? `${Math.abs(results.setup.toe)}" toe out` : `${results.setup.toe}" toe in`}</div>
          </div>
        </>
      )}
    </div>
  );
}
