import { useMemo, useState, useRef, useEffect } from 'react';
import { analyzeSetup, DEFAULT_SETUP, RECOMMENDED_SETUP } from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const CORNER_LABELS = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
const TARGET = 17.1;
const RANGE_MIN = 16.8;
const RANGE_MAX = 17.8;

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function pct(v) { return (v * 100).toFixed(1) + '%'; }

function scoreColor(v) {
  if (v >= 0.99) return 'var(--green)';
  if (v >= 0.96) return 'var(--yellow)';
  if (v >= 0.92) return 'orange';
  return 'var(--red)';
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
    setVisible(true);
  };
  const hide = () => setVisible(false);

  return (
    <>
      <span ref={ref} className="opt-tip-anchor"
        onMouseEnter={show} onMouseLeave={hide}
        onFocus={show} onBlur={hide}
      >
        {children}
        <span className="opt-tip-icon">?</span>
      </span>
      {visible && (
        <div className="opt-tooltip" style={{ top: pos.top, left: pos.left }}>
          {text}
        </div>
      )}
    </>
  );
}

// ── ScoreBar with optional tooltip ───────────────────────────────────────────
function ScoreBar({ value, label, tip }) {
  const p = Math.round(Math.min(100, value * 100));
  const color = scoreColor(value);
  return (
    <div className="opt-score-row">
      {label && (
        tip
          ? <Tooltip text={tip}><span className="opt-score-label">{label}</span></Tooltip>
          : <span className="opt-score-label">{label}</span>
      )}
      <div className="opt-score-bar-bg">
        <div className="opt-score-bar" style={{ width: `${p}%`, background: color }} />
      </div>
      <span className="opt-score-num" style={{ color }}>{p}%</span>
    </div>
  );
}

// Tooltip text definitions for all corner card items
const TIPS = {
  gripScore: 'Overall grip score for this corner — product of camber, pressure, and temperature factors. 100% = fully optimal. Green ≥99%, Yellow ≥96%, Orange ≥92%, Red below.',
  load: 'Estimated tire load at 1G of lateral force (one full corner). Heavier = more grip potential but also more heat. RF and RR carry more weight in left turns.',
  estTemp: 'Steady-state equilibrium temperature predicted by the thermal model at race pace. Actual race temps will vary with lap count and ambient conditions.',
  tempFactor: 'Grip multiplier from tire temperature. These all-season tires are optimal between 100–170°F. Below 100°F the tire is cold and loses grip; above 170°F it overheats and degrades.',
  camberSection: 'Camber is the inward/outward tilt of the tire. Negative camber tilts the top of the tire inward. The outside front (RF in a left turn) needs negative camber to stay flat on the road under cornering load.',
  staticCamber: 'Your static alignment setting in degrees. Negative = top of tire tilted inward toward the car. This is what you set in the garage.',
  casterGain: 'Dynamic camber change from caster as the wheel steers into the corner. Geometric formula: caster × sin(steer angle). At ~10° steer on this oval, gain ≈ 0.18°/degree of caster — adds negative camber to the outside front (RF), which helps grip.',
  effectiveCamber: 'The actual camber angle at mid-corner: static setting plus caster-induced gain. This is what the tire "sees" during the hardest part of the corner. The goal is to keep the contact patch as flat as possible under body roll.',
  idealCamber: {
    outside: 'Model target for the outside front (RF) at 1G: −4.5°. Calibrated from pyrometer data — the RF consistently shows outside edge hotter than inside, meaning the tire needs more negative camber than a generic model would suggest. More negative camber shifts load toward the inside edge for a flatter contact patch.',
    inside: 'Model target for the inside front (LF) at 1G: −1.0°. Pyrometer data shows the LF inside edge slightly warmer than outside at equilibrium — consistent with mild negative camber. Near-zero to slightly negative is correct for an inside tire on a left-turn oval.',
    rearOutside: 'Ideal dynamic camber for the outside rear (RR): −1.0°. With a solid axle the rear tilts with body roll — stiffer shocks reduce roll and keep camber closer to optimal.',
    rearInside: 'Ideal dynamic camber for the inside rear (LR): 0°. The inside rear is very lightly loaded in a left turn; near-zero camber is optimal.',
  },
  solidAxle: 'The rear axle is solid (live axle) — both rear wheels tilt together with body roll. You cannot set rear camber directly. Reducing body roll (stiffer rear shocks) brings dynamic camber closer to ideal.',
  camberScore: 'Grip multiplier from camber alignment. 100% = effective camber matches the model\'s ideal for this corner. Each degree of deviation costs roughly 1.2% grip.',
  pressureSection: 'Tire pressure affects contact patch shape. Under-inflated tires flex excessively and overheat the edges; over-inflated tires crown and only use the center of the tread.',
  coldHot: 'Cold PSI is what you set before the car goes out. Hot PSI is the pressure at racing temperature — it rises as the tire heats up, calculated using the ideal gas law.',
  optimalHot: 'The hot pressure that gives maximum grip for this corner\'s load. Heavily loaded tires (RF, RR) need higher pressure to support the load; lightly loaded tires (LF, LR) need less.',
  presScore: 'Grip multiplier from tire pressure. 100% = hot pressure matches the load-optimal target. Each PSI of deviation costs ~0.25% grip.',
  loadMismatch: 'This corner\'s load is far from the car\'s average, so the mathematically optimal pressure is outside a practical range. Run the lowest safe pressure for lightly loaded corners and the highest safe pressure for heavily loaded ones.',
  frontShock: 'Average stiffness rating of the two front struts (0 = stiffest, 10 = softest). Stiffer fronts resist body roll and reduce weight transfer to the front tires during braking and corner entry.',
  rearShock: 'Average stiffness rating of the two rear shocks (0 = stiffest, 10 = softest). Stiffer rears limit body roll on a solid axle, keeping dynamic rear camber closer to ideal.',
  frontLLTD: 'Lateral Load Transfer Distribution — the share of total cornering weight transfer handled by the front axle. Higher = more understeer tendency. Target ~52–58% for neutral handling.',
  frontGripShare: 'The front axle\'s share of total cornering grip based on current tire temperatures and pressures. 55% ideal matches the car\'s front weight bias and aerodynamic balance in left turns.',
  bodyRoll: 'Estimated chassis lean angle at 1G of lateral force. More roll tilts the solid rear axle and degrades camber on both rear tires. Target under 3° for this suspension geometry.',
  balanceScore: 'Combined grip penalty from front/rear imbalance. 100% = perfectly balanced. Score drops when the front and rear axles contribute unequal grip, causing understeer or oversteer.',
  toeCurrent: 'Current toe setting. Toe-out (negative) points the front tires slightly away from center, sharpening turn-in response. Toe-in (positive) improves straight-line stability but dulls corner entry.',
  toeOptimal: 'Model optimum: ¼" toe-out. This is the peak of the turn-in grip curve for this car — enough to sharpen initial steering response without excessive tire scrub or drag.',
  turnInGrip: 'Grip multiplier from toe angle. Peaks near ¼"–⅜" toe-out and falls off with excessive toe in either direction. 100% = best achievable toe grip.',
  toeDragPenalty: 'Straight-line speed penalty from toe angle. Even small amounts of toe-out create tire scrub on the straights. Displayed as % increase in effective drag coefficient.',
};

function CornerCard({ c, data, setup }) {
  const {
    load, estimatedTemp, hp, optHotPsi, recColdPsi, recHotPsi,
    psiGripFactor, isPresLimited, psiDev,
    effectiveCamber, idealCamber, camberDev, camberFactor, casterGain,
    optStaticCamber, front, outside, tempFactor, casterFactor, adjustableScore,
  } = data;

  const camberOk = camberDev < 0.5;
  const presOk = Math.abs(psiDev) < 3;
  const recCold = Math.round(recColdPsi * 2) / 2;

  const idealTip = front
    ? (outside ? TIPS.idealCamber.outside : TIPS.idealCamber.inside)
    : (outside ? TIPS.idealCamber.rearOutside : TIPS.idealCamber.rearInside);

  return (
    <div className="opt-corner-card">
      <div className="opt-corner-header">
        <div>
          <span className="opt-corner-pos">{c}</span>
          <span className="opt-corner-name">{CORNER_LABELS[c]}</span>
        </div>
        <Tooltip text={TIPS.gripScore}>
          <div className="opt-corner-score" style={{ color: scoreColor(adjustableScore) }}>
            {pct(adjustableScore)}
          </div>
        </Tooltip>
      </div>

      <div className="opt-corner-meta">
        <Tooltip text={TIPS.load}><span>{Math.round(load)} lbs</span></Tooltip>
        <Tooltip text={TIPS.estTemp}><span>{Math.round(estimatedTemp)}°F est.</span></Tooltip>
        <Tooltip text={TIPS.tempFactor}>
          <span style={{ color: scoreColor(tempFactor) }}>Temp {pct(tempFactor)}</span>
        </Tooltip>
      </div>

      <div className="opt-factor-block">
        <Tooltip text={TIPS.camberSection}>
          <div className="opt-factor-title">Camber</div>
        </Tooltip>
        {front ? (
          <>
            <div className="opt-camber-math">
              <Tooltip text={TIPS.staticCamber}><span>{setup.camber[c]}° static</span></Tooltip>
              <Tooltip text={TIPS.casterGain}>
                <span className="opt-math-op"> {casterGain >= 0 ? '+' : ''}{casterGain.toFixed(2)}° caster</span>
              </Tooltip>
              <Tooltip text={TIPS.effectiveCamber}>
                <span className="opt-math-eq"> = {effectiveCamber.toFixed(2)}° eff.</span>
              </Tooltip>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={idealTip}><span>Ideal effective</span></Tooltip>
              <span style={{ color: camberOk ? 'var(--green)' : 'var(--yellow)' }}>
                {idealCamber.toFixed(1)}°
                {!camberOk && optStaticCamber !== null && (
                  <span className="opt-rec-arrow"> → set {optStaticCamber}° static</span>
                )}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.effectiveCamber}><span>Dynamic (body roll)</span></Tooltip>
              <span>{effectiveCamber.toFixed(2)}°</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={idealTip}><span>Ideal</span></Tooltip>
              <span>{idealCamber.toFixed(1)}°</span>
            </div>
            <Tooltip text={TIPS.solidAxle}>
              <div className="opt-limited-note">Solid axle — adjust via shock balance</div>
            </Tooltip>
          </>
        )}
        <ScoreBar value={camberFactor} label="Camber score" tip={TIPS.camberScore} />
      </div>

      <div className="opt-factor-block">
        <Tooltip text={TIPS.pressureSection}>
          <div className="opt-factor-title">Pressure</div>
        </Tooltip>
        <div className="opt-stat-pair">
          <Tooltip text={TIPS.coldHot}><span>Cold → Hot</span></Tooltip>
          <span>{setup.coldPsi[c]} → {hp.toFixed(1)} PSI</span>
        </div>
        <div className="opt-stat-pair">
          <Tooltip text={isPresLimited ? TIPS.loadMismatch : TIPS.optimalHot}>
            <span>Optimal hot{isPresLimited ? ' *' : ''}</span>
          </Tooltip>
          <span style={{ color: isPresLimited ? 'var(--text-muted)' : presOk ? 'var(--green)' : 'var(--yellow)' }}>
            {recHotPsi.toFixed(1)} PSI
            {!presOk && !isPresLimited && (
              <span className="opt-rec-arrow"> → cold: {recCold} PSI</span>
            )}
          </span>
        </div>
        {isPresLimited && (
          <div className="opt-limited-note">* Load mismatch — optimal {optHotPsi.toFixed(0)} PSI unreachable</div>
        )}
        <ScoreBar value={psiGripFactor} label="Pressure score" tip={TIPS.presScore} />
      </div>
    </div>
  );
}

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
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === label);
    if (!found) return;
    const s = deepClone(setup);
    s.shocks[corner] = found.rating;
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
                <select
                  className="opt-select"
                  value={selectedLabel(c)}
                  onChange={e => updateShock(c, e.target.value)}
                >
                  {list.map(s => (
                    <option key={s.part} value={shockLabel(s)}>{shockLabel(s)}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Camber (°)</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <input type="number" step="0.25" className="opt-input"
                value={setup.camber[c]}
                onChange={e => update(`camber.${c}`, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}

          <div className="opt-form-label" style={{ marginTop: 12 }}>Caster (°)</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <input type="number" step="0.25" min="0" max="10" className="opt-input"
                value={setup.caster[c]}
                onChange={e => update(`caster.${c}`, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}

          <div className="opt-form-label" style={{ marginTop: 12 }}>
            Toe (in) <span className="opt-form-hint">− = out</span>
          </div>
          <div className="opt-form-field">
            <label>Front</label>
            <input type="number" step="0.0625" min="-1" max="1" className="opt-input"
              value={setup.toe}
              onChange={e => update('toe', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Cold Pressures (PSI)</div>
          {CORNERS.map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <input type="number" step="0.5" min="10" max="50" className="opt-input"
                value={setup.coldPsi[c]}
                onChange={e => update(`coldPsi.${c}`, parseFloat(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SetupOptimizer({ setup, setSetup, ambient, setAmbient }) {
  const analysis = useMemo(() => analyzeSetup(setup, ambient), [setup, ambient]);
  const {
    corners, ss, roll, frontGripPct, balancePenalty, imbalance,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain, recs, caster,
  } = analysis;

  const gap = lapTime - TARGET;
  const optGap = optLapTime - TARGET;

  // Progress bar position helper (RANGE_MAX=slow, RANGE_MIN=fast, left=slow, right=fast)
  const barPos = (t) =>
    `${Math.max(0, Math.min(100, (RANGE_MAX - t) / (RANGE_MAX - RANGE_MIN) * 100))}%`;

  const applyAll = () => {
    const s = deepClone(setup);
    for (const rec of recs) {
      if (rec.gain <= 0) continue;
      if (rec.id === 'lf-camber') s.camber.LF = rec.optimalVal;
      if (rec.id === 'rf-camber') s.camber.RF = rec.optimalVal;
      if (rec.id === 'toe') s.toe = rec.optimalVal;
      const m = rec.id.match(/^([a-z]{2})-psi$/);
      if (m) s.coldPsi[m[1].toUpperCase()] = rec.optimalVal;
    }
    setSetup(s);
  };

  return (
    <div className="opt-page">

      {/* ── Header ── */}
      <div className="opt-header">
        <div>
          <h2>Setup Optimizer</h2>
          <p className="opt-subtitle">Real-time analysis — every parameter recalculates instantly as you adjust.</p>
        </div>
        <div className="opt-lap-banner">
          <div className="opt-lap-item">
            <span className="opt-lap-label">Est. Lap</span>
            <span className="opt-lap-time">{lapTime.toFixed(3)}s</span>
          </div>
          <div className="opt-lap-divider" />
          <div className="opt-lap-item">
            <span className="opt-lap-label">Gap to {TARGET}s</span>
            <span className="opt-lap-time" style={{
              color: gap <= 0 ? 'var(--green)' : gap < 0.2 ? 'var(--yellow)' : 'var(--red)',
            }}>
              {gap <= 0 ? `✓ −${Math.abs(gap).toFixed(3)}s` : `+${gap.toFixed(3)}s`}
            </span>
          </div>
          <div className="opt-lap-divider" />
          <div className="opt-lap-item">
            <span className="opt-lap-label">With all recs</span>
            <span className="opt-lap-time" style={{ color: optGap <= 0 ? 'var(--green)' : 'var(--yellow)' }}>
              {optLapTime.toFixed(3)}s
            </span>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="opt-progress-wrap">
        <div className="opt-progress-track">
          <div className="opt-progress-fill" />
          {/* Markers */}
          {[
            { label: '17.8', t: 17.8 },
            { label: '17.4', t: 17.4 },
            { label: '17.1★', t: 17.1, star: true },
          ].map(({ label, t, star }) => (
            <div key={t} className={`opt-progress-tick ${star ? 'target' : ''}`} style={{ left: barPos(t) }}>
              <div className="opt-tick-line" />
              <div className="opt-tick-label">{label}</div>
            </div>
          ))}
          {/* Current */}
          <div className="opt-progress-dot current" style={{ left: barPos(lapTime) }}
            title={`Current: ${lapTime.toFixed(3)}s`} />
          {/* Optimal */}
          {totalGain > 0.01 && (
            <div className="opt-progress-dot optimal" style={{ left: barPos(optLapTime) }}
              title={`Optimal: ${optLapTime.toFixed(3)}s`} />
          )}
        </div>
        <div className="opt-progress-legend">
          <span><span className="opt-dot-swatch current" /> Current</span>
          {totalGain > 0.01 && <span><span className="opt-dot-swatch optimal" /> With recs</span>}
        </div>
      </div>

      {/* ── Ambient + presets ── */}
      <div className="opt-conditions">
        <div className="opt-form-field">
          <label>Ambient Temp (°F)</label>
          <input type="number" min="30" max="120" step="5" className="opt-input"
            value={ambient}
            onChange={e => setAmbient(parseFloat(e.target.value) || 65)}
          />
        </div>
        <div className="opt-presets">
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DEFAULT_SETUP))}>
            Load Current Setup
          </button>
          <button className="sim-preset-btn accent" onClick={() => setSetup(deepClone(RECOMMENDED_SETUP))}>
            Load Recommended Setup
          </button>
        </div>
      </div>

      {/* ── Setup form ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Setup Parameters</h3>
        <CompactSetupForm setup={setup} onChange={setSetup} />
      </div>

      {/* ── Per-corner analysis ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Per-Corner Analysis
          <span className="opt-section-sub">Temperatures estimated at steady-state equilibrium</span>
        </h3>
        <div className="opt-corners-grid">
          {CORNERS.map(c => (
            <CornerCard key={c} c={c} data={corners[c]} setup={setup} />
          ))}
        </div>
      </div>

      {/* ── Balance & Toe ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Balance & Toe</h3>
        <div className="opt-balance-row">
          <div className="opt-balance-card">
            <div className="opt-factor-title">Lateral Balance (at 1G)</div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.frontShock}><span>Front shock stiffness</span></Tooltip><span>{ss.front}</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.rearShock}><span>Rear shock stiffness</span></Tooltip><span>{ss.rear}</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.frontLLTD}><span>Front LLTD</span></Tooltip>
              <span>{(ss.frontLLTD * 100).toFixed(1)}%</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.frontGripShare}><span>Front grip share</span></Tooltip>
              <span style={{ color: Math.abs(frontGripPct - 0.55) < 0.01 ? 'var(--green)' : 'var(--yellow)' }}>
                {(frontGripPct * 100).toFixed(1)}% <span className="opt-stat-ideal">(ideal 55%)</span>
              </span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.bodyRoll}><span>Body roll @ 1G</span></Tooltip><span>{roll.toFixed(1)}°</span>
            </div>
            <ScoreBar value={balancePenalty} label="Balance score" tip={TIPS.balanceScore} />
          </div>

          <div className="opt-balance-card">
            <div className="opt-factor-title">Front Toe</div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.toeCurrent}><span>Current</span></Tooltip>
              <span>{toe < 0 ? `${Math.abs(toe)}" toe out` : toe > 0 ? `${toe}" toe in` : 'Zero toe'}</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.toeOptimal}><span>Optimal</span></Tooltip>
              <span style={{ color: 'var(--green)' }}>¼" toe out</span>
            </div>
            <ScoreBar value={toeGrip} label="Turn-in grip" tip={TIPS.turnInGrip} />
            <div className="opt-stat-pair" style={{ marginTop: 6 }}>
              <Tooltip text={TIPS.toeDragPenalty}><span>Drag penalty</span></Tooltip>
              <span style={{ color: toeDrag > 1.001 ? 'var(--yellow)' : 'var(--green)' }}>
                +{((toeDrag - 1) * 100).toFixed(3)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recommendations ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Recommendations
          <span className="opt-section-sub">Ranked by estimated lap time gain</span>
        </h3>

        {recs.length === 0 ? (
          <div className="opt-no-recs">No improvements found — setup is near-optimal for this model.</div>
        ) : (
          <>
            <div className="opt-recs">
              {recs.map((rec, i) => {
                const positive = rec.gain > 0;
                const barW = Math.min(100, Math.abs(rec.gain) / 0.25 * 100);
                return (
                  <div key={rec.id} className="opt-rec-card">
                    <div className="opt-rec-rank">#{i + 1}</div>
                    <div className="opt-rec-body">
                      <div className="opt-rec-top">
                        <span className="opt-rec-param">{rec.parameter}</span>
                        <span className="opt-rec-arrow-txt">{rec.current} → {rec.optimal}</span>
                        <span className="opt-rec-gain" style={{ color: positive ? 'var(--green)' : 'var(--red)' }}>
                          {positive ? `−${rec.gain.toFixed(3)}s` : `+${Math.abs(rec.gain).toFixed(3)}s`}
                        </span>
                      </div>
                      <div className="opt-rec-bar-bg">
                        <div className="opt-rec-bar"
                          style={{ width: `${barW}%`, background: positive ? 'var(--green)' : 'var(--red)' }} />
                      </div>
                      <div className="opt-rec-detail">{rec.detail}</div>
                      {rec.note && <div className="opt-rec-note">{rec.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="opt-combined">
              <div className="opt-combined-times">
                <div className="opt-combined-item">
                  <span>Current</span>
                  <strong>{lapTime.toFixed(3)}s</strong>
                </div>
                <div className="opt-combined-arrow">→</div>
                <div className="opt-combined-item">
                  <span>Optimal</span>
                  <strong style={{ color: optGap <= 0 ? 'var(--green)' : 'var(--yellow)' }}>
                    {optLapTime.toFixed(3)}s
                  </strong>
                </div>
                <div className="opt-combined-item gain">
                  <span>Save</span>
                  <strong style={{ color: 'var(--green)' }}>−{totalGain.toFixed(3)}s</strong>
                </div>
              </div>
              <button className="opt-apply-btn" onClick={applyAll}>
                Apply All Recommendations to Setup
              </button>
            </div>
          </>
        )}
      </div>

      <div className="sim-disclaimer">
        <strong>Model note:</strong> Analysis uses steady-state equilibrium temperatures.
        Camber recommendations reflect model assumptions about caster-induced dynamic camber gain
        (0.5°/degree RF, 0.3°/degree LF) — always verify against real pyrometer data.
        Results are directional guidance, not exact predictions.
      </div>
    </div>
  );
}
