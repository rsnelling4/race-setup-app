import { useMemo, useState, useRef } from 'react';
import { analyzeSetupF8, DEFAULT_SETUP_F8 } from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import NumericInput from './NumericInput';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const CORNER_LABELS = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
const TARGET = 23.1;
const RANGE_MIN = 22.8;
const RANGE_MAX = 23.8;

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

const TIPS = {
  gripScore: 'Overall grip score for this corner — product of camber, pressure, and temperature factors. 100% = fully optimal. Green ≥99%, Yellow ≥96%, Orange ≥92%, Red below.',
  load: 'Estimated average tire load across both left and right turns at 1G. Figure 8 loading is nearly symmetric — all four corners see similar average loads.',
  estTemp: 'Steady-state equilibrium temperature predicted by the thermal model at race pace. Based on averaged left/right work factors — figure 8 temps are more balanced than oval.',
  tempFactor: 'Grip multiplier from tire temperature. Optimal window 100–185°F for these Ironman XL all-season tires.',
  camberSection: 'Figure 8 camber is unique: each front tire alternates as outside (needs negative) and inside (needs near-zero) every lap. The ideal is the average of both demands: approximately −2.25° (avg of outside −4.5° and inside 0°).',
  staticCamber: 'Your static alignment setting in degrees. Negative = top of tire tilted inward. For figure 8, both fronts should be set near the same value.',
  casterGain: 'Average dynamic camber contribution from caster across both turn directions. Caster adds negative camber when outside (one turn) but slightly reduces it when inside (other turn) — the net average is small: caster × −0.04°/degree.',
  effectiveCamber: 'Average effective camber across both turn directions. Static setting plus average caster contribution. This is the average camber the tire sees across a full lap.',
  idealCamber: 'Average effective camber target: −2.25° (avg of outside ideal −4.5° and inside ideal 0°). In each turn the outside role needs −4.5° for maximum grip under cornering load; the inside role needs 0° (flat contact patch — body roll droop lays it flat). Optimal static = avg(−4.5+caster×0.034, 0−caster×0.019). F8 apex steer angle is ~3.67° (atan(114.7"/1788") — Ackermann at F8 loop radius 149 ft). Coefficients scaled from 20° steer calibration by sin(3.67°)/sin(20°). The camber score is the true average of both per-turn grip factors.',
  rearCamber: 'Rear solid axle tilts with body roll. In a figure 8 the car rolls left and right equally, so average dynamic rear camber is approximately zero — near-ideal for the rear axle.',
  solidAxle: 'The rear axle is solid — both wheels tilt together with body roll. In figure 8, body roll averages to near-zero across both turn directions, so rear dynamic camber stays close to optimal.',
  camberScore: 'Grip multiplier from camber alignment. 100% = effective camber matches the model ideal of −2.25° for this tire. Each degree of deviation costs roughly 1.2% grip.',
  pressureSection: 'Tire pressure affects contact patch shape. Figure 8 loading is symmetric — LF/RF see equal average loads, as do LR/RR. Equal pressures side-to-side are appropriate.',
  coldHot: 'Cold PSI is what you set when inflating the tires. Hot PSI is calculated via ideal gas law using the "Tires Set At" temperature as the cold reference. At 200°F tires set at 85°F: 34 cold → ~40.9 PSI hot. Setting tires on a hot day means less pressure rise during racing.',
  optimalHot: 'Load-optimal hot pressure for this corner. Since figure 8 loads are symmetric, LF≈RF and LR≈RR should have equal optimal pressures.',
  presScore: 'Grip multiplier from tire pressure. 100% = hot pressure matches the load-optimal target. Each PSI of deviation costs ~0.25% grip.',
  loadMismatch: 'Corner load is far from average — the mathematically optimal pressure is outside a practical range.',
  frontShock: 'Average stiffness rating of front struts. For figure 8, symmetric front shock settings are preferred since the car rolls equally in both directions.',
  rearShock: 'Average stiffness rating of rear shocks. Controls body roll, which averages to near-zero in figure 8 but stiffer rears still help stability through the crossing.',
  frontLLTD: 'Lateral Load Transfer Distribution — front axle share of total cornering weight transfer. Target ~46% (green zone 41–51%). In figure 8, this applies equally to both turn directions. Outside this range costs ~1–3% grip.',
  frontGripShare: 'Front axle share of total grip. Target is 55% — matching the car\'s front weight bias (3700 lbs × 55% front). Even though figure 8 loads symmetrically left/right, the car is still nose-heavy and the performance model penalizes deviation from 55%.',
  bodyRoll: 'Estimated chassis lean at 1G. In figure 8 the car rolls left and right alternately — average is ~0°, but peak roll each way still affects tire geometry through corners.',
  balanceScore: 'Front/rear grip balance. 100% = equal front and rear grip contribution (50/50 target for figure 8). Imbalance causes push or loose handling.',
  toeCurrent: 'Current toe setting. For figure 8, toe-out sharpens turn-in for both left and right corners — same principle as oval but benefits both directions.',
  toeOptimal: 'Model optimum: ¼" toe-out. Balances turn-in sharpness vs straight-line drag for the 350 ft straights on this figure 8 track.',
  turnInGrip: 'Grip multiplier from toe angle. Peaks near ¼"–⅜" toe-out. Applies equally to left and right turn entries.',
  toeDragPenalty: 'Straight-line speed loss from toe scrub. Figure 8 has 350 ft straights — more drag penalty than a short oval, so avoid excessive toe-out.',
};

// ── Phase tendency helper (F8) ────────────────────────────────────────────────
function phaseLabelF8(bias) {
  const dev = bias - 0.50;
  if      (dev < -0.20) return { label: 'Very Loose',   color: 'var(--red)' };
  if      (dev < -0.10) return { label: 'Loose',        color: 'orange' };
  if      (dev < -0.03) return { label: 'Slight Loose', color: 'var(--yellow)' };
  if      (dev <=  0.03) return { label: 'Neutral',     color: 'var(--green)' };
  if      (dev <=  0.10) return { label: 'Slight Push', color: 'var(--yellow)' };
  if      (dev <=  0.20) return { label: 'Tight',       color: 'orange' };
  return                        { label: 'Very Tight',  color: 'var(--red)' };
}

// ── Handling Balance Gauge (F8) ───────────────────────────────────────────────
function BalanceGaugeF8({ frontGripPct, frontLLTD, springLLTD, corners, setup }) {
  // Sign convention: positive tendency = LOOSE (rear is limiting axle).
  // frontGripPct < 0.55 = front under-contributing = rear overworked = loose.
  // frontGripPct > 0.55 = front overworked = push.
  const gripDev  = 0.55 - frontGripPct;   // + = front under-contributing = loose
  const lltdDev  = (frontLLTD - 0.55) * 0.3;
  const tendency = gripDev - lltdDev;

  const gaugeMax = 0.12;
  const gaugePos = Math.max(0, Math.min(1, 0.5 - tendency / (2 * gaugeMax)));

  let label, color;
  if      (tendency < -0.08)  { label = 'Very Tight';    color = 'var(--red)'; }
  else if (tendency < -0.04)  { label = 'Tight';          color = 'orange'; }
  else if (tendency < -0.015) { label = 'Slight Push';    color = 'var(--yellow)'; }
  else if (tendency <=  0.015){ label = 'Neutral';        color = 'var(--green)'; }
  else if (tendency <=  0.04) { label = 'Slight Loose';   color = 'var(--yellow)'; }
  else if (tendency <=  0.08) { label = 'Loose';          color = 'orange'; }
  else                        { label = 'Very Loose';     color = 'var(--red)'; }

  // Phase breakdown — shocks, camber, pressure, toe, and grip scores (F8: both turn directions)
  const rfS = 10 - setup.shocks.RF;
  const lfS = 10 - setup.shocks.LF;
  const rrS = 10 - setup.shocks.RR;
  const lrS = 10 - setup.shocks.LR;
  const total = Math.max(rfS + lfS + rrS + lrS, 1);

  // ENTRY — both turn directions: each front tire alternates as outside/inside.
  // Left turn: RF/RR outside pair. Right turn: LF/LR outside pair.
  // Stiffer outside front OR stiffer outside rear both push toward understeer on entry:
  //   outside front stiffer → front loads faster → push (stronger signal)
  //   outside rear stiffer  → resists rear squat → less rotation → mild push
  // Use signed deviation: RF>RR → push; RR>RF → mild push. Same for LF/LR in right turns.
  const leftBalance  = (rfS - rrS) / Math.max(rfS + rrS, 1);
  const rightBalance = (lfS - lrS) / Math.max(lfS + lrS, 1);
  const entryLeftBias  = leftBalance  >= 0
    ? Math.max(0.2, Math.min(0.8, 0.5 + leftBalance  * 0.35))
    : Math.max(0.2, Math.min(0.8, 0.5 + leftBalance  * 0.15));
  const entryRightBias = rightBalance >= 0
    ? Math.max(0.2, Math.min(0.8, 0.5 + rightBalance * 0.35))
    : Math.max(0.2, Math.min(0.8, 0.5 + rightBalance * 0.15));
  const entryShockBias = (entryLeftBias + entryRightBias) / 2;
  // Toe: symmetric — toe-in = less front bite = push on entry in both directions
  const toeEntryBias    = Math.max(0.2, Math.min(0.8, 0.5 + (setup.toe + 0.25) * 0.5));
  // Avg front camber deviation (both fronts alternate as outside in F8)
  const avgFrontCamberDev = (corners.LF.camberDev + corners.RF.camberDev) / 2;
  const camberEntryBias   = Math.max(0.2, Math.min(0.8, 0.5 + avgFrontCamberDev * 0.04));
  // Avg front pressure deviation
  const avgFrontPsiDev  = (corners.LF.psiDev + corners.RF.psiDev) / 2;
  const presEntryBias   = Math.max(0.2, Math.min(0.8, 0.5 + avgFrontPsiDev * 0.012));
  const entryBias = 0.35 * entryShockBias + 0.20 * frontLLTD + 0.20 * toeEntryBias + 0.15 * camberEntryBias + 0.10 * presEntryBias;
  const entry = phaseLabelF8(entryBias);

  // MID — steady-state: shocks stopped moving, only springs determine LLTD.
  // frontGripPct > 0.55 = front is the limiting axle = push; < 0.55 = rear is limiting = loose.
  const midGripBias = Math.max(0.1, Math.min(0.9, 0.5 + (frontGripPct - 0.55) * 3));
  const midBias = 0.55 * midGripBias + 0.45 * springLLTD;
  const mid = phaseLabelF8(midBias);

  // EXIT — off throttle in both directions.
  // Rear grip quality: if rear scores lower than front, rear steps out on throttle.
  // Avg rear pressure: over-inflated rear = less contact = loose on exit.
  const diagBias = (rfS + lrS) / Math.max(total, 1);
  const rearGripAvgF8  = (corners.RR.adjustableScore + corners.LR.adjustableScore) / 2;
  const frontGripAvgF8 = (corners.RF.adjustableScore + corners.LF.adjustableScore) / 2;
  const gripDiffBias   = Math.max(0.1, Math.min(0.9, 0.5 + (rearGripAvgF8 - frontGripAvgF8) * 5));
  const avgRearPsiDev  = (corners.RR.psiDev + corners.LR.psiDev) / 2;
  const rearPresExitBias = Math.max(0.2, Math.min(0.8, 0.5 - avgRearPsiDev * 0.012));
  const exitBias = 0.30 * diagBias + 0.25 * frontLLTD + 0.25 * gripDiffBias + 0.20 * rearPresExitBias;
  const exit = phaseLabelF8(exitBias);

  // Phase notes — dominant driver for each phase
  let entryNote = '';
  const toeContrib    = Math.abs(toeEntryBias - 0.5);
  const camberContrib = Math.abs(camberEntryBias - 0.5);
  const presContrib   = Math.abs(presEntryBias - 0.5);
  const shockContrib  = Math.abs(entryShockBias - 0.5);
  if (toeContrib > 0.04 && toeContrib >= shockContrib) {
    entryNote = setup.toe > -0.25
      ? `Toe-in (${Math.abs(setup.toe)}" ${setup.toe > 0 ? 'in' : 'out'}) reduces front turn-in — push on entry`
      : `Aggressive toe-out (${Math.abs(setup.toe)}") — sharp turn-in both directions`;
  } else if (camberContrib > 0.04 && camberContrib >= shockContrib) {
    entryNote = `Avg front camber ${avgFrontCamberDev.toFixed(1)}° off ideal — less front bite on entry`;
  } else if (presContrib > 0.04 && presContrib >= shockContrib) {
    entryNote = avgFrontPsiDev > 0
      ? `Front tires over-inflated avg ${avgFrontPsiDev.toFixed(1)} PSI — harder contact patch`
      : `Front tires under-inflated avg ${Math.abs(avgFrontPsiDev).toFixed(1)} PSI`;
  } else {
    entryNote = 'Avg of L+R turn-in shock loading';
  }

  let exitNote = '';
  const rearGripDiffF8 = rearGripAvgF8 - frontGripAvgF8;
  if (Math.abs(rearGripDiffF8) > 0.02) {
    exitNote = rearGripDiffF8 < 0
      ? `Rear grip (${(rearGripAvgF8 * 100).toFixed(0)}%) < front (${(frontGripAvgF8 * 100).toFixed(0)}%) — rear may step out on throttle`
      : `Rear grip (${(rearGripAvgF8 * 100).toFixed(0)}%) > front — rear planted on exit`;
  } else {
    exitNote = 'Diagonal + LLTD under throttle';
  }

  const frontAvgScore = (corners.LF.adjustableScore + corners.RF.adjustableScore) / 2;
  const rearAvgScore  = (corners.LR.adjustableScore + corners.RR.adjustableScore) / 2;
  const camberOk      = corners.LF.camberDev < 0.5 && corners.RF.camberDev < 0.5;
  const frontPresOk   = Math.abs(corners.LF.psiDev) < 3 && Math.abs(corners.RF.psiDev) < 3;
  const rearPresOk    = Math.abs(corners.LR.psiDev) < 3 && Math.abs(corners.RR.psiDev) < 3;

  let description, action;
  if (tendency < -0.015) {
    const drivers = [];
    if (frontLLTD > 0.51) drivers.push('high front LLTD — front struts handling too much cornering load, overworking front axle');
    if (!camberOk) drivers.push('front camber could be improved toward optimal');
    if (!frontPresOk) drivers.push('front tire pressures off optimal');
    if (frontAvgScore < rearAvgScore - 0.03) drivers.push('front grip scores lower than rear');
    description = drivers.length
      ? `Car tends to push in both directions. Contributing factors: ${drivers.join('; ')}.`
      : 'Front axle working harder than rear in both turn directions.';
    action = 'To loosen: adjust camber toward optimal, soften front struts, check front pressures.';
  } else if (tendency > 0.015) {
    const drivers = [];
    if (frontLLTD < 0.41) drivers.push('low front LLTD — rear shocks handling too much cornering load, overloading rear axle');
    if (!rearPresOk) drivers.push('rear tire pressures off optimal');
    if (rearAvgScore < frontAvgScore - 0.03) drivers.push('rear grip scores lower than front');
    description = drivers.length
      ? `Car tends to be loose in both directions. Contributing factors: ${drivers.join('; ')}.`
      : 'Rear axle working harder than front in both turn directions.';
    action = 'To tighten: stiffen front struts relative to rear shocks, check rear pressures.';
  } else {
    description = 'Front and rear axles are well-balanced across both turn directions.';
    action = null;
  }

  return (
    <div className="opt-handling-balance">
      <div className="opt-factor-title">Handling Balance</div>
      <div className="opt-hb-gauge-wrap">
        <div className="opt-hb-gauge-ends">
          <span>LOOSE</span>
          <span>NEUTRAL</span>
          <span>PUSH</span>
        </div>
        <div className="opt-hb-gauge-track">
          <div className="opt-hb-gauge-zone loose" />
          <div className="opt-hb-gauge-zone neutral" />
          <div className="opt-hb-gauge-zone push" />
          <div className="opt-hb-gauge-center" />
          <div className="opt-hb-gauge-dot" style={{ left: `${gaugePos * 100}%`, background: color }} />
        </div>
        <div className="opt-hb-label" style={{ color }}>{label}</div>
      </div>

      <div className="opt-phase-breakdown">
        <div className="opt-phase-title">Corner Phase Breakdown</div>
        <div className="opt-phase-grid">
          <div className="opt-phase-row">
            <span className="opt-phase-name">Entry</span>
            <span className="opt-phase-label" style={{ color: entry.color }}>{entry.label}</span>
            {entryNote && <span className="opt-phase-note">{entryNote}</span>}
          </div>
          <div className="opt-phase-row">
            <span className="opt-phase-name">Mid</span>
            <span className="opt-phase-label" style={{ color: mid.color }}>{mid.label}</span>
            <span className="opt-phase-note">Front grip {(frontGripPct * 100).toFixed(0)}% (ideal 55%) · Spring LLTD {(springLLTD * 100).toFixed(0)}%</span>
          </div>
          <div className="opt-phase-row">
            <span className="opt-phase-name">Exit</span>
            <span className="opt-phase-label" style={{ color: exit.color }}>{exit.label}</span>
            {exitNote && <span className="opt-phase-note">{exitNote}</span>}
          </div>
        </div>
      </div>

      <div className="opt-stat-pair" style={{ marginTop: 4 }}>
        <span>Front grip share</span>
        <span style={{ color: Math.abs(gripDev) < 0.02 ? 'var(--green)' : 'var(--yellow)' }}>
          {(frontGripPct * 100).toFixed(1)}% <span className="opt-stat-ideal">(ideal 55%)</span>
        </span>
      </div>
      <div className="opt-stat-pair">
        <span>Front LLTD</span>
        <span style={{ color: frontLLTD >= 0.41 && frontLLTD <= 0.51 ? 'var(--green)' : 'var(--yellow)' }}>
          {(frontLLTD * 100).toFixed(1)}% <span className="opt-stat-ideal">(F8 target ~46%)</span>
        </span>
      </div>
      <div className="opt-hb-desc">{description}</div>
      {action && <div className="opt-hb-action">{action}</div>}
    </div>
  );
}

function CornerCard({ c, data, setup }) {
  const {
    load, estimatedTemp, hp, optHotPsi, recColdPsi, recHotPsi,
    psiGripFactor, isPresLimited, psiDev,
    effectiveCamber, idealCamber, camberDev, camberFactor, casterGain,
    optStaticCamber, front, tempFactor, casterFactor, adjustableScore,
  } = data;

  const camberOk = camberDev < 0.5;
  const presOk = Math.abs(psiDev) < 2;
  const recCold = Math.round(recColdPsi * 2) / 2;

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
        <Tooltip text={TIPS.load}><span>{Math.round(load)} lbs avg</span></Tooltip>
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
                <span className="opt-math-op"> {casterGain >= 0 ? '+' : ''}{casterGain.toFixed(2)}° avg caster</span>
              </Tooltip>
              <Tooltip text={TIPS.effectiveCamber}>
                <span className="opt-math-eq"> = {effectiveCamber.toFixed(2)}° avg eff.</span>
              </Tooltip>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.idealCamber}><span>Ideal avg effective</span></Tooltip>
              <span style={{ color: camberOk ? 'var(--green)' : 'var(--yellow)' }}>
                {idealCamber.toFixed(2)}°
                {!camberOk && optStaticCamber !== null && (
                  <span className="opt-rec-arrow"> → set {optStaticCamber}° static</span>
                )}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.effectiveCamber}><span>Avg dynamic (both turns)</span></Tooltip>
              <span>{effectiveCamber.toFixed(2)}°</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.rearCamber}><span>Ideal</span></Tooltip>
              <span>0.00°</span>
            </div>
            <Tooltip text={TIPS.solidAxle}>
              <div className="opt-limited-note">Solid axle — roll averages to ~0° in figure 8</div>
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
          <div className="opt-form-label">Camber (°) <span className="opt-form-hint">Symmetric recommended</span></div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <NumericInput step="0.25" className="opt-input"
                value={setup.camber[c]}
                onChange={num => update(`camber.${c}`, num)}
              />
            </div>
          ))}

          <div className="opt-form-label" style={{ marginTop: 12 }}>Caster (°) <span className="opt-form-hint">Symmetric recommended</span></div>
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
            <NumericInput step="0.0625" className="opt-input"
              value={setup.toe}
              onChange={num => update('toe', num)}
            />
          </div>
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Cold Pressures (PSI) <span className="opt-form-hint">Symmetric recommended</span></div>
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

export default function Figure8Optimizer({ setup, setSetup, ambient, setAmbient, inflationTemp, setInflationTemp }) {
  const analysis = useMemo(() => analyzeSetupF8(setup, ambient, inflationTemp), [setup, ambient, inflationTemp]);
  const {
    corners, ss, roll, frontGripPct, balancePenalty, imbalance,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain, recs, caster,
  } = analysis;

  const gap = lapTime - TARGET;
  const optGap = optLapTime - TARGET;

  const barPos = (t) =>
    `${Math.max(0, Math.min(100, (RANGE_MAX - t) / (RANGE_MAX - RANGE_MIN) * 100))}%`;

  const applyAll = () => {
    const s = deepClone(setup);
    for (const rec of recs) {
      if (rec.gain <= 0) continue;
      if (rec.id === 'lf-camber') s.camber.LF = rec.optimalVal;
      if (rec.id === 'rf-camber') s.camber.RF = rec.optimalVal;
      if (rec.id === 'toe') s.toe = rec.optimalVal;
      const m  = rec.id.match(/^([a-z]{2})-psi$/);
      if (m) s.coldPsi[m[1].toUpperCase()] = rec.optimalVal;
      const m2 = rec.id.match(/^([a-z]{2})-shock$/);
      if (m2) s.shocks[m2[1].toUpperCase()] = rec.optimalVal;
    }
    setSetup(s);
  };

  return (
    <div className="opt-page">

      {/* ── Header ── */}
      <div className="opt-header">
        <div>
          <h2>Figure 8 Setup Optimizer</h2>
          <p className="opt-subtitle">Real-time analysis calibrated for bidirectional loading. Goal: break 23.1s.</p>
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
              color: gap <= 0 ? 'var(--green)' : gap < 0.3 ? 'var(--yellow)' : 'var(--red)',
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
          {[
            { label: '23.8', t: 23.8 },
            { label: '23.5', t: 23.5 },
            { label: '23.1★', t: 23.1, star: true },
          ].map(({ label, t, star }) => (
            <div key={t} className={`opt-progress-tick ${star ? 'target' : ''}`} style={{ left: barPos(t) }}>
              <div className="opt-tick-line" />
              <div className="opt-tick-label">{label}</div>
            </div>
          ))}
          <div className="opt-progress-dot current" style={{ left: barPos(lapTime) }}
            title={`Current: ${lapTime.toFixed(3)}s`} />
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
        <div className="opt-form-field">
          <label>Tires Set At (°F)</label>
          <input type="number" min="30" max="120" step="1" className="opt-input"
            value={inflationTemp}
            onChange={e => setInflationTemp(parseFloat(e.target.value) || 68)}
          />
        </div>
        <div className="opt-presets">
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DEFAULT_SETUP_F8))}>
            Load F8 Baseline
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
          <span className="opt-section-sub">Loads and temps averaged across left and right turns</span>
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
        <BalanceGaugeF8 frontGripPct={frontGripPct} frontLLTD={ss.frontLLTD} springLLTD={ss.springLLTD} corners={corners} setup={setup} />
        <div className="opt-balance-row" style={{ marginTop: 14 }}>
          <div className="opt-balance-card">
            <div className="opt-factor-title">Lateral Balance</div>
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
              <Tooltip text={TIPS.bodyRoll}><span>Peak body roll @ 1G</span></Tooltip><span>{roll.toFixed(1)}°</span>
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
        <strong>Model note:</strong> Figure 8 analysis averages left and right turn loads — symmetric setup
        (equal camber, equal pressures side-to-side) is expected to be optimal. Camber ideal is −2.25°
        for both fronts (average of outside −4.5° and inside 0° demands). Always verify with real pyrometer data.
      </div>
    </div>
  );
}
