import { useState, useMemo } from 'react';
import { handlingConditions, cornerPhases } from '../utils/tireAnalysis';
import { analyzeSetup, DEFAULT_SETUP, RECOMMENDED_SETUP, PETE_SETUP, DYLAN_SETUP, JOSH_SETUP, JOEY_SETUP } from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import NumericInput from './NumericInput';

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const FRONT_SPRING_OPTIONS = [
  { value: 700, label: '700 lbs/in — Pre-2003 / Heavy Duty' },
  { value: 475, label: '475 lbs/in — Police / Taxi (P71 stock)' },
  { value: 440, label: '440 lbs/in — Civilian / Base' },
];

// ── Compact setup form (mirrored from SetupOptimizer) ────────────────────────
function CompactSetupForm({ setup, onChange }) {
  const update = (path, val) => {
    const s = deepClone(setup);
    const keys = path.split('.');
    let obj = s;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = val;
    onChange(s);
  };

  const updateShock = (corner, label) => {
    const isFront = corner === 'LF' || corner === 'RF';
    const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === label);
    if (!found) return;
    const s = deepClone(setup);
    s.shocks[corner] = found.rating;
    if (isFront && found.springRate) s.springs[corner] = found.springRate;
    onChange(s);
  };

  const selectedLabel = (corner) => {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const match = list.find(s => s.rating === setup.shocks[corner]);
    return match ? shockLabel(match) : '';
  };

  return (
    <div className="opt-form">
      <div className="opt-form-row">
        <div className="opt-form-col">
          <div className="opt-form-label">Shocks / Struts</div>
          {CORNERS.map(c => {
            const list = (c === 'LF' || c === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
            return (
              <div key={c} className="opt-form-field">
                <label>{c}</label>
                <select className="opt-select" value={selectedLabel(c)} onChange={e => updateShock(c, e.target.value)}>
                  {list.map(s => <option key={s.part} value={shockLabel(s)}>{shockLabel(s)}</option>)}
                </select>
              </div>
            );
          })}
          <div className="opt-form-label" style={{ marginTop: 12 }}>Front Spring Rates</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <select className="opt-select" value={setup.springs[c] ?? 475} onChange={e => update(`springs.${c}`, parseInt(e.target.value))}>
                {FRONT_SPRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Camber (°)</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <NumericInput step="0.25" className="opt-input" value={setup.camber[c]} onChange={num => update(`camber.${c}`, num)} />
            </div>
          ))}
          <div className="opt-form-label" style={{ marginTop: 12 }}>Caster (°)</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <input type="number" step="0.25" min="0" max="10" className="opt-input"
                value={setup.caster[c]} onChange={e => update(`caster.${c}`, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
          <div className="opt-form-label" style={{ marginTop: 12 }}>Toe (in) <span className="opt-form-hint">− = out</span></div>
          <div className="opt-form-field">
            <label>Front</label>
            <NumericInput step="0.0625" className="opt-input" value={setup.toe} onChange={num => update('toe', num)} />
          </div>
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Cold Pressures (PSI)</div>
          {CORNERS.map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <input type="number" step="0.5" min="10" max="50" className="opt-input"
                value={setup.coldPsi[c]} onChange={e => update(`coldPsi.${c}`, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Model-based recommendations ───────────────────────────────────────────────
// Generates specific, numeric recommendations from the analyzeSetup output
// rather than generic text. Each recommendation includes the current value,
// suggested change, and physics reason derived from the model.
function buildRecommendations(condition, phase, analysis, setup) {
  const { corners, ss, lapTime } = analysis;
  const isLoose = condition === 'loose';
  const isTight = condition === 'tight';
  const lltd = ss?.frontLLTD ?? 0.46;
  const recs = [];

  // ── PRESSURE recommendations ────────────────────────────────────────────────
  // For loose: want more rear grip and/or less front dominance
  // For tight: want more front grip and/or more rear rotation

  const rfCorner = corners?.RF;
  const lfCorner = corners?.LF;
  const rrCorner = corners?.RR;
  const lrCorner = corners?.LR;

  if (rfCorner && lfCorner && rrCorner && lrCorner) {
    const rfDev = rfCorner.psiDev;   // positive = over-inflated, negative = under
    const rrDev = rrCorner.psiDev;
    const lfDev = lfCorner.psiDev;
    const lrDev = lrCorner.psiDev;

    if (isTight) {
      // Tight: raise RF toward/past optimal = more front grip
      if (rfDev < -0.5) {
        recs.push({
          category: 'Tire Pressure',
          corner: 'RF',
          current: `${setup.coldPsi.RF} PSI cold (${rfCorner.hp?.toFixed(1)} hot, ${rfDev.toFixed(1)} PSI below optimal)`,
          suggestion: `Raise RF cold PSI to ${(setup.coldPsi.RF + Math.min(3, Math.abs(rfDev))).toFixed(1)}`,
          reason: `RF is under-inflated — less RF contact patch is reducing front grip. Raising toward optimal adds RF bite, which is exactly what fights understeer.`,
          priority: 1,
        });
      }
      // Tight: raise LF slightly for inside-front grip
      if (lfDev < -1.5) {
        recs.push({
          category: 'Tire Pressure',
          corner: 'LF',
          current: `${setup.coldPsi.LF} PSI cold (${lfDev.toFixed(1)} PSI below optimal)`,
          suggestion: `Raise LF cold PSI to ${(setup.coldPsi.LF + Math.min(2, Math.abs(lfDev))).toFixed(1)}`,
          reason: `LF is significantly under-inflated. More inside-front pressure improves LF contact patch, adding grip to the tire that's dragging through the entire corner.`,
          priority: 2,
        });
      }
      // Tight: raise RR slightly past optimal = less RR grip = rear rotates more
      if (phase === 'middle' || phase === 'exit') {
        recs.push({
          category: 'Tire Pressure',
          corner: 'RR',
          current: `${setup.coldPsi.RR} PSI cold`,
          suggestion: `Raise RR cold PSI by 1–2 PSI (to ~${(setup.coldPsi.RR + 1.5).toFixed(1)})`,
          reason: `Moving RR slightly past its optimal pressure reduces rear contact patch grip, causing the rear to reach its limit before the front — this rotates the car and breaks the understeer.`,
          priority: 3,
        });
      }
    }

    if (isLoose) {
      // Loose: lower RR toward/to optimal = more RR grip = rear plants
      if (rrDev > 0.5) {
        recs.push({
          category: 'Tire Pressure',
          corner: 'RR',
          current: `${setup.coldPsi.RR} PSI cold (${rrDev.toFixed(1)} PSI above optimal)`,
          suggestion: `Lower RR cold PSI to ${(setup.coldPsi.RR - Math.min(2, rrDev)).toFixed(1)}`,
          reason: `RR is over-inflated — smaller contact patch is reducing rear grip. Lowering toward optimal expands the RR footprint, planting the rear.`,
          priority: 1,
        });
      } else if (rrDev > -1.5) {
        // Near optimal — still suggest lowering a touch for rear stability
        recs.push({
          category: 'Tire Pressure',
          corner: 'RR',
          current: `${setup.coldPsi.RR} PSI cold (near optimal)`,
          suggestion: `Lower RR cold PSI by 1 PSI (to ${(setup.coldPsi.RR - 1).toFixed(1)})`,
          reason: `Moving RR slightly below optimal increases contact patch area, adding rear grip to combat oversteer.`,
          priority: 2,
        });
      }
      // Loose: raise LR for inside-rear stability
      if (lrDev < -1.0) {
        recs.push({
          category: 'Tire Pressure',
          corner: 'LR',
          current: `${setup.coldPsi.LR} PSI cold (${lrDev.toFixed(1)} PSI below optimal)`,
          suggestion: `Raise LR cold PSI to ${(setup.coldPsi.LR + Math.min(2, Math.abs(lrDev))).toFixed(1)}`,
          reason: `LR is under-inflated. More inside-rear pressure stabilizes the rear axle through the corner, reducing the tendency to oversteer.`,
          priority: 2,
        });
      }
      // Loose: lower RF slightly = less front dominance
      if (phase === 'entry' || phase === 'middle') {
        recs.push({
          category: 'Tire Pressure',
          corner: 'RF',
          current: `${setup.coldPsi.RF} PSI cold`,
          suggestion: `Lower RF cold PSI by 1 PSI (to ${(setup.coldPsi.RF - 1).toFixed(1)})`,
          reason: `Slightly reducing RF pressure lowers front turn-in aggression, which reduces the initial weight shift off the rear that triggers oversteer on entry.`,
          priority: 3,
        });
      }
    }
  }

  // ── TOE recommendations ─────────────────────────────────────────────────────
  // Toe-out helps turn-in (loosens), toe-in stabilizes (tightens).
  // Current toe is setup.toe (negative = toe-out).
  if (isTight && (phase === 'entry' || phase === 'middle')) {
    const currentToe = setup.toe ?? 0;
    if (currentToe > -0.25) {  // less than 1/4" toe-out — room to add
      recs.push({
        category: 'Front Toe',
        corner: 'Both',
        current: `${currentToe >= 0 ? '+' : ''}${currentToe.toFixed(4)}" (${currentToe >= 0 ? 'toe-in' : 'toe-out'})`,
        suggestion: `Add toe-out: set to ${(currentToe - 0.125).toFixed(4)}" (add ~1/8" more toe-out)`,
        reason: `More toe-out increases turn-in aggression — each front tire points slightly inward relative to direction of travel, creating a natural steering bias that helps the car rotate on entry and through mid-corner. This is one of the cheapest and fastest trackside adjustments.`,
        primary: true,
        priority: 2,
      });
    }
  }

  if (isLoose && phase === 'entry') {
    const currentToe = setup.toe ?? 0;
    if (currentToe < -0.125) {  // more than 1/8" toe-out — room to reduce
      recs.push({
        category: 'Front Toe',
        corner: 'Both',
        current: `${currentToe.toFixed(4)}" toe-out`,
        suggestion: `Reduce toe-out: set to ${(currentToe + 0.125).toFixed(4)}" (reduce ~1/8" toe-out)`,
        reason: `Less toe-out reduces turn-in aggression — the front tires are more aligned with direction of travel, which slows the initial yaw rotation on entry and gives the rear more time to settle before the car snaps into oversteer.`,
        primary: true,
        priority: 2,
      });
    }
  }

  // ── LLTD / SHOCK recommendations (secondary — only if pressure can't fix it) ─
  const targetLLTD = 0.46;
  const lltdGap = lltd - targetLLTD;

  if (isTight && lltdGap > 0.03) {
    const rfShock = setup.shocks.RF;
    const rrShock = setup.shocks.RR;
    recs.push({
      category: 'Shock / LLTD',
      corner: 'RF',
      current: `RF shock rating ${rfShock}, front LLTD = ${(lltd * 100).toFixed(1)}% (target 46%)`,
      suggestion: rfShock < 8
        ? `Soften RF shock by 1–2 steps (rating ${Math.min(10, rfShock + 2)}) — requires shock swap`
        : `RF is already at maximum softness — stiffen RR instead (requires shock swap)`,
      reason: `Front LLTD ${(lltd * 100).toFixed(1)}% is above the 46% oval target. Softening RF compression reduces front roll resistance, lowering front LLTD. Address pressure and toe first — shock swaps are a bigger commitment.`,
      primary: false,
      priority: 5,
    });
    if (rrShock > 1) {
      recs.push({
        category: 'Shock / LLTD',
        corner: 'RR',
        current: `RR shock rating ${rrShock}`,
        suggestion: `Stiffen RR shock (rating ${Math.max(1, rrShock - 2)}) — requires shock swap`,
        reason: `Stiffening RR compression increases rear roll resistance, raising rear LLTD and reducing understeer.`,
        primary: false,
        priority: 6,
      });
    }
  }

  if (isLoose && lltdGap < -0.03) {
    const rfShock = setup.shocks.RF;
    const rrShock = setup.shocks.RR;
    recs.push({
      category: 'Shock / LLTD',
      corner: 'RF',
      current: `RF shock rating ${rfShock}, front LLTD = ${(lltd * 100).toFixed(1)}% (target 46%)`,
      suggestion: rfShock > 1
        ? `Stiffen RF shock by 1–2 steps (rating ${Math.max(1, rfShock - 2)}) — requires shock swap`
        : `RF is already at maximum stiffness — soften RR instead (requires shock swap)`,
      reason: `Front LLTD ${(lltd * 100).toFixed(1)}% is below target. Stiffening RF shifts more load to the front, stabilizing the rear. Address pressure and toe first — shock swaps are a bigger commitment.`,
      primary: false,
      priority: 5,
    });
    if (rrShock < 10) {
      recs.push({
        category: 'Shock / LLTD',
        corner: 'RR',
        current: `RR shock rating ${rrShock}`,
        suggestion: `Soften RR shock (rating ${Math.min(10, rrShock + 2)}) — requires shock swap`,
        reason: `Softening RR reduces rear LLTD. The front carries a higher share, stabilizing the rear against oversteer.`,
        primary: false,
        priority: 6,
      });
    }
  }

  // Entry-specific shock recommendations (secondary)
  if (phase === 'entry') {
    if (isLoose) {
      recs.push({
        category: 'Shock (Entry)',
        corner: 'LR',
        current: `LR shock rating ${setup.shocks.LR}`,
        suggestion: `Soften LR rebound — requires shock swap`,
        reason: `On corner entry the car rolls left. Stiff LR rebound is slow to extend, momentarily unloading the rear and triggering oversteer. Softer rebound lets the rear axle stay planted.`,
        primary: false,
        priority: 6,
      });
    }
    if (isTight) {
      recs.push({
        category: 'Shock (Entry)',
        corner: 'LF',
        current: `LF shock rating ${setup.shocks.LF}`,
        suggestion: `Soften LF rebound — requires shock swap`,
        reason: `On entry the car rolls left, extending LF. Stiff LF rebound fights the roll, reducing RF loading and cutting front grip on turn-in.`,
        primary: false,
        priority: 6,
      });
    }
  }

  // Exit-specific shock recommendations (secondary)
  if (phase === 'exit') {
    if (isLoose) {
      recs.push({
        category: 'Shock (Exit)',
        corner: 'RR',
        current: `RR shock rating ${setup.shocks.RR}`,
        suggestion: `Stiffen RR rebound — requires shock swap`,
        reason: `Under throttle the rear squats. Soft RR rebound lets the RR bounce up and lose contact exactly when rear grip is most needed. Stiffer rebound holds the RR down.`,
        primary: false,
        priority: 6,
      });
    }
    if (isTight) {
      recs.push({
        category: 'Shock (Exit)',
        corner: 'RF',
        current: `RF shock rating ${setup.shocks.RF}`,
        suggestion: `Stiffen RF rebound — requires shock swap`,
        reason: `Under throttle, weight transfers rearward and unloads the front. Stiff RF rebound slows this unloading, keeping the RF engaged in steering on exit.`,
        primary: false,
        priority: 6,
      });
    }
  }

  // ── CAMBER recommendations (secondary — alignment shop required) ──────────────
  if (rfCorner) {
    const rfCamberDev = rfCorner.camberDev ?? 0;
    const rfGroundCamber = rfCorner.groundCamber ?? 0;
    const rfOptStatic = rfCorner.optStaticCamber;

    if (isTight && rfCamberDev > 0.3) {
      recs.push({
        category: 'Camber (alignment shop)',
        corner: 'RF',
        current: `RF static ${setup.camber.RF}°, ground-frame ${rfGroundCamber.toFixed(2)}° (${rfCamberDev.toFixed(2)}° from ideal)`,
        suggestion: rfOptStatic != null
          ? `Set RF static camber to ${rfOptStatic}° (model-optimal)`
          : `Add 0.25–0.5° negative camber to RF`,
        reason: `RF ground-frame camber is ${rfCamberDev.toFixed(2)}° from ideal. More negative RF camber improves outside-front contact patch in left turns. Requires alignment shop — address pressure and toe first.`,
        primary: false,
        priority: 7,
      });
    }

    if (isLoose && rfCamberDev < -0.3) {
      recs.push({
        category: 'Camber (alignment shop)',
        corner: 'RF',
        current: `RF static ${setup.camber.RF}°, ground-frame ${rfGroundCamber.toFixed(2)}° (${Math.abs(rfCamberDev).toFixed(2)}° past ideal)`,
        suggestion: rfOptStatic != null
          ? `Set RF static camber to ${rfOptStatic}° (model-optimal)`
          : `Reduce RF negative camber by 0.25°`,
        reason: `RF camber is past ideal — effective contact patch is reduced. Raising RF camber toward model-optimal reduces front bite, balancing grip ratio. Requires alignment shop.`,
        primary: false,
        priority: 7,
      });
    }
  }

  if (lfCorner) {
    const lfOptStatic = lfCorner.optStaticCamber;
    const lfGroundCamber = lfCorner.groundCamber ?? 0;
    const lfDev = lfCorner.camberDev ?? 0;

    if (isTight && lfDev > 0.5) {
      recs.push({
        category: 'Camber (alignment shop)',
        corner: 'LF',
        current: `LF static ${setup.camber.LF}°, ground-frame ${lfGroundCamber.toFixed(2)}°`,
        suggestion: lfOptStatic != null
          ? `Set LF static camber to ${lfOptStatic}° (model-optimal)`
          : `Raise LF camber toward 0° static`,
        reason: `LF is the inside-front in left turns. Too much negative camber overloads the inside edge. Raising toward 0° effective improves the inside-front contact patch. Requires alignment shop.`,
        primary: false,
        priority: 8,
      });
    }
  }

  // ── CASTER recommendations (secondary — alignment shop required) ──────────────
  if (isTight && (phase === 'entry' || phase === 'middle')) {
    const rfCaster = setup.caster.RF;
    if (rfCaster < 5.0) {
      recs.push({
        category: 'Caster (alignment shop)',
        corner: 'RF',
        current: `RF caster ${rfCaster}°`,
        suggestion: `Increase RF caster toward 5.0° — alignment shop required`,
        reason: `RF caster adds dynamic negative camber gain during steering input. At ${rfCaster}° the model gives ${(rfCaster * 0.18).toFixed(2)}° dynamic gain; at 5.0° it would be 0.90°. More RF grip on turn-in and mid-corner. Address pressure and toe first.`,
        primary: false,
        priority: 8,
      });
    }
  }

  // ── Sort: primary first (by priority), then secondary (by priority) ───────────
  const primary = recs.filter(r => r.primary !== false).sort((a, b) => a.priority - b.priority);
  const secondary = recs.filter(r => r.primary === false).sort((a, b) => a.priority - b.priority);
  return [...primary, ...secondary];
}

// ── Main component ───────────────────────────────────────────────────────────
export default function HandlingDiagnosis({ setup, setSetup, ambient, setAmbient, inflationTemp, setInflationTemp }) {
  const [condition, setCondition] = useState('');
  const [phase, setPhase] = useState('');
  const [setupConfirmed, setSetupConfirmed] = useState(false);

  const analysis = useMemo(
    () => analyzeSetup(setup, ambient, inflationTemp),
    [setup, ambient, inflationTemp]
  );

  const isDefaultSetup = useMemo(() => {
    return JSON.stringify(setup) === JSON.stringify(DEFAULT_SETUP);
  }, [setup]);

  const recs = useMemo(() => {
    if (!condition || !phase || (!setupConfirmed && isDefaultSetup)) return [];
    return buildRecommendations(condition, phase, analysis, setup);
  }, [condition, phase, setupConfirmed, isDefaultSetup, analysis, setup]);

  const handlePreset = (preset) => {
    const map = { recommended: RECOMMENDED_SETUP, pete: PETE_SETUP, dylan: DYLAN_SETUP, josh: JOSH_SETUP, joey: JOEY_SETUP };
    if (map[preset]) { setSetup(deepClone(map[preset])); setSetupConfirmed(true); }
  };

  const canShowRecs = condition && phase && (setupConfirmed || !isDefaultSetup);

  return (
    <div className="handling-section">
      <h2>Handling Diagnosis</h2>
      <p className="section-description">
        Enter your current setup, describe what the car is doing, and get specific numeric recommendations from the physics model.
      </p>

      {/* ── Setup section ── */}
      <div className="opt-section-block">
        <div className="opt-section-header">
          <span className="opt-section-title">Current Setup</span>
          <span className="opt-section-sub">Changes here sync with the Optimizer tab</span>
        </div>

        <div className="sim-preset-row" style={{ marginBottom: 10 }}>
          <button className="sim-preset-btn" onClick={() => handlePreset('recommended')}>Recommended</button>
          <button className="sim-preset-btn" onClick={() => handlePreset('pete')}>Pete</button>
          <button className="sim-preset-btn" onClick={() => handlePreset('dylan')}>Dylan</button>
          <button className="sim-preset-btn" onClick={() => handlePreset('josh')}>Josh</button>
          <button className="sim-preset-btn" onClick={() => handlePreset('joey')}>Joey</button>
        </div>

        <div className="opt-form-row" style={{ marginBottom: 10 }}>
          <div className="opt-form-field">
            <label style={{ marginRight: 8 }}>Ambient Temp (°F)</label>
            <input type="number" step="1" min="30" max="120" className="opt-input"
              value={ambient} onChange={e => setAmbient(parseFloat(e.target.value) || 65)} />
          </div>
        </div>

        <CompactSetupForm setup={setup} onChange={s => { setSetup(s); setSetupConfirmed(true); }} />

        {isDefaultSetup && !setupConfirmed && (
          <div className="handling-notice">
            <strong>Enter your setup above</strong> — or load a preset — before getting recommendations. Generic recommendations without your actual setup data are not useful.
            <button className="handling-confirm-btn" onClick={() => setSetupConfirmed(true)}>
              Use default setup anyway
            </button>
          </div>
        )}
      </div>

      {/* ── Symptom selection ── */}
      <div className="opt-section-block" style={{ marginTop: 16 }}>
        <div className="opt-section-header">
          <span className="opt-section-title">Symptom</span>
        </div>

        <div className="handling-inputs">
          <div className="handling-select-group">
            <label>What is the car doing?</label>
            <div className="button-group">
              {handlingConditions.map((c) => (
                <button key={c.value}
                  className={`select-button ${condition === c.value ? 'active' : ''}`}
                  onClick={() => setCondition(c.value)}
                >
                  <span className="btn-label">{c.label}</span>
                  <span className="btn-desc">{c.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="handling-select-group">
            <label>When does it happen?</label>
            <div className="button-group three-col">
              {cornerPhases.map((p) => (
                <button key={p.value}
                  className={`select-button ${phase === p.value ? 'active' : ''}`}
                  onClick={() => setPhase(p.value)}
                >
                  <span className="btn-label">{p.label}</span>
                  <span className="btn-desc">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Setup summary ── */}
      {(setupConfirmed || !isDefaultSetup) && (
        <div className="opt-section-block" style={{ marginTop: 16 }}>
          <div className="opt-section-header">
            <span className="opt-section-title">Model Analysis — Current Setup</span>
            <span className="opt-section-sub">@ {ambient}°F ambient</span>
          </div>
          <div className="hd-analysis-grid">
            <div className="hd-analysis-card">
              <div className="hd-ac-label">Est. Lap Time</div>
              <div className="hd-ac-value">{analysis.lapTime?.toFixed(3)}s</div>
            </div>
            <div className="hd-analysis-card">
              <div className="hd-ac-label">Front LLTD</div>
              <div className="hd-ac-value" style={{ color: Math.abs((analysis.ss?.frontLLTD ?? 0.46) - 0.46) < 0.03 ? 'var(--green)' : 'var(--yellow)' }}>
                {((analysis.ss?.frontLLTD ?? 0.46) * 100).toFixed(1)}%
                <span className="hd-ac-sub"> target 46%</span>
              </div>
            </div>
            <div className="hd-analysis-card">
              <div className="hd-ac-label">RF Hot PSI</div>
              <div className="hd-ac-value">{analysis.corners?.RF?.hp?.toFixed(1)} <span className="hd-ac-sub">opt {analysis.corners?.RF?.optHotPsi?.toFixed(1)}</span></div>
            </div>
            <div className="hd-analysis-card">
              <div className="hd-ac-label">LF Hot PSI</div>
              <div className="hd-ac-value">{analysis.corners?.LF?.hp?.toFixed(1)} <span className="hd-ac-sub">opt {analysis.corners?.LF?.optHotPsi?.toFixed(1)}</span></div>
            </div>
            <div className="hd-analysis-card">
              <div className="hd-ac-label">RF Ground Camber</div>
              <div className="hd-ac-value">{analysis.corners?.RF?.groundCamber?.toFixed(2)}°</div>
            </div>
            <div className="hd-analysis-card">
              <div className="hd-ac-label">LF Ground Camber</div>
              <div className="hd-ac-value">{analysis.corners?.LF?.groundCamber?.toFixed(2)}°</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {canShowRecs && condition && phase && (
        <div className="handling-results" style={{ marginTop: 16 }}>
          <h3>
            {condition === 'loose' ? 'Oversteer' : 'Understeer'} —{' '}
            {cornerPhases.find(p => p.value === phase)?.label}
          </h3>

          {recs.length === 0 ? (
            <div className="handling-tip">
              The model does not identify a clear issue for this symptom with the current setup. The LLTD, pressures, and camber are all near their targets. Look to driver technique or track conditions.
            </div>
          ) : (() => {
            const primaryRecs = recs.filter(r => r.primary !== false);
            const secondaryRecs = recs.filter(r => r.primary === false);
            let num = 0;
            return (
              <>
                <p className="handling-desc" style={{ marginBottom: 12 }}>
                  Start with tire pressure and toe — they are the fastest, cheapest adjustments and cover most balance issues. Only move to the secondary section if pressure and toe are maxed out and the problem persists.
                </p>

                {primaryRecs.length > 0 && (
                  <>
                    <div className="hd-tier-label primary">Pressure &amp; Toe — Try these first</div>
                    <div className="hd-recs-list">
                      {primaryRecs.map((r, i) => {
                        num++;
                        return (
                          <div key={i} className="hd-rec-card">
                            <div className="hd-rec-header">
                              <span className="hd-rec-num">{num}</span>
                              <span className="hd-rec-category">{r.category}</span>
                              <span className="hd-rec-corner">{r.corner}</span>
                            </div>
                            <div className="hd-rec-body">
                              <div className="hd-rec-row">
                                <span className="hd-rec-field">Current</span>
                                <span className="hd-rec-val current">{r.current}</span>
                              </div>
                              <div className="hd-rec-row">
                                <span className="hd-rec-field">Suggested</span>
                                <span className="hd-rec-val suggested">{r.suggestion}</span>
                              </div>
                              <div className="hd-rec-reason">{r.reason}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {secondaryRecs.length > 0 && (
                  <>
                    <div className="hd-tier-label secondary">If pressure &amp; toe aren't enough — bigger changes</div>
                    <div className="hd-recs-list">
                      {secondaryRecs.map((r, i) => {
                        num++;
                        return (
                          <div key={i} className="hd-rec-card hd-rec-secondary">
                            <div className="hd-rec-header">
                              <span className="hd-rec-num">{num}</span>
                              <span className="hd-rec-category">{r.category}</span>
                              <span className="hd-rec-corner">{r.corner}</span>
                            </div>
                            <div className="hd-rec-body">
                              <div className="hd-rec-row">
                                <span className="hd-rec-field">Current</span>
                                <span className="hd-rec-val current">{r.current}</span>
                              </div>
                              <div className="hd-rec-row">
                                <span className="hd-rec-field">Suggested</span>
                                <span className="hd-rec-val suggested">{r.suggestion}</span>
                              </div>
                              <div className="hd-rec-reason">{r.reason}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {!condition && !phase && (setupConfirmed || !isDefaultSetup) && (
        <div className="handling-tip" style={{ marginTop: 16 }}>
          Select a symptom above to get setup-specific recommendations.
        </div>
      )}
    </div>
  );
}
