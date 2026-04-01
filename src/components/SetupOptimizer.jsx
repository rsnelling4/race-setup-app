import { useMemo, useState, useRef } from 'react';
import { analyzeSetup, DEFAULT_SETUP, RECOMMENDED_SETUP, PETE_SETUP, DYLAN_SETUP, JOSH_SETUP } from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import NumericInput from './NumericInput';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const FRONT_SPRING_OPTIONS = [
  { value: 700, label: '700 lbs/in — Pre-2003 / Heavy Duty' },
  { value: 475, label: '475 lbs/in — Police / Taxi (P71 stock)' },
  { value: 440, label: '440 lbs/in — Civilian / Base' },
];
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
  tempFactor: 'Grip multiplier from tire temperature. These all-season tires are optimal between 100–165°F. Below 100°F the tire is cold and loses grip; above 165°F heat starts to degrade the compound.',
  camberSection: 'Camber is the inward/outward tilt of the tire. Negative camber tilts the top of the tire inward. The outside front (RF in a left turn) needs negative camber to stay flat on the road under cornering load.',
  staticCamber: 'Your static alignment setting in degrees. Negative = top of tire tilted inward toward the car. This is what you set in the garage.',
  casterGain: 'Combined dynamic camber change from three sources: (1) Caster geometry — RF gains negative camber (~0.18°/deg caster), LF gains positive (~0.10°/deg). (2) SLA body roll — RF gains additional negative in jounce (0.355°/° roll), LF gains slight positive in droop. (3) KPI (kingpin inclination 9.5°) — adds +0.03° positive camber to RF, −0.03° to LF at ~10° steer. KPI effect is small but included for accuracy.',
  effectiveCamber: 'Chassis-relative effective camber at mid-corner: static setting plus caster gain, SLA body-roll gain, and KPI-induced camber. This is the angle relative to the car body — not the same as tire-to-road angle.',
  groundCamber: 'Tire-to-road angle at mid-corner — the contact patch metric. Accounts for body roll rotating the chassis: outside tire\'s ground camber = effective + cornerRoll; inside = effective − cornerRoll. This is what actually determines how the contact patch loads.',
  idealCamber: {
    outside: 'Target ground camber for the outside front (RF): −2.0°. At 0° ground the contact patch is geometrically flat, but under cornering load the outside tread crown lifts slightly — a small negative ground angle compensates. Calibrated for the Ironman 235/55R17 tall sidewall; a stiffer low-profile tire would need more negative. Refine this target with camber sweep tests: the setting that produces even I/M/O pyrometer temps is the true optimum.',
    inside: 'Target ground camber for the inside front (LF): 0° (flat contact patch). The inside front is lightly loaded — maximum contact patch area matters more than centrifugal compensation.',
    rearOutside: 'Target ground camber for the outside rear (RR): 0°. With a solid axle the tire tilts with body roll — the car rolls outward, adding positive ground camber to the outside rear. Stiffer rear shocks reduce roll and keep this closer to 0°.',
    rearInside: 'Target ground camber for the inside rear (LR): 0°. The inside rear is very lightly loaded. No adjustment possible — controlled only by reducing body roll.',
  },
  solidAxle: 'The rear axle is solid (live axle) — both rear wheels tilt together with body roll. You cannot set rear camber directly. Reducing body roll (stiffer rear shocks) brings ground camber closer to 0° on both rears.',
  camberScore: 'Grip multiplier from camber alignment. 100% = ground camber matches the target for this corner. Each degree of deviation from target costs roughly 1.2% grip.',
  alignmentRange: 'P71 front camber adjustable range: approximately −0.5° to −3.0° with stock eccentric alignment bolts. Values outside this range require aftermarket camber bolts or alignment shims.',
  sidewallCamber: 'Positive camber added at the contact patch by sidewall compliance. The 235/55R17 55-series sidewall deflects outward under load, shifting the contact patch and effectively leaning the tire away from center. This is load-dependent (heavier corner = more deflection) and must be offset by additional static negative camber. Data: Ironman iMove Gen3 AS 235/55R17, section height 5.09\", load-deflection curve measured at 500/1000/1500/1929 lbs.',
  pressureSection: 'Tire pressure affects contact patch shape. Under-inflated tires flex excessively and overheat the edges; over-inflated tires crown and only use the center of the tread.',
  coldHot: 'Cold PSI is what you set when inflating the tires. Hot PSI is calculated via ideal gas law using the "Tires Set At" temperature as the cold reference. At 200°F tires set at 85°F: 34 cold → ~40.9 PSI hot. Setting tires on a hot day means less pressure rise — and shifts target cold PSI higher.',
  optimalHot: 'The hot pressure that gives maximum grip for this corner\'s load. Heavily loaded tires (RF, RR) need higher pressure to support the load; lightly loaded tires (LF, LR) need less.',
  presScore: 'Grip multiplier from tire pressure. 100% = hot pressure matches the load-optimal target. Each PSI of deviation costs ~0.25% grip.',
  loadMismatch: 'This corner\'s load is far from the car\'s average, so the mathematically optimal pressure is outside a practical range. Run the lowest safe pressure for lightly loaded corners and the highest safe pressure for heavily loaded ones.',
  frontShock: 'Average stiffness rating of the two front struts (0 = stiffest, 10 = softest). Stiffer fronts resist body roll and reduce weight transfer to the front tires during braking and corner entry.',
  rearShock: 'Average stiffness rating of the two rear shocks (0 = stiffest, 10 = softest). Stiffer rears limit body roll on a solid axle, keeping dynamic rear camber closer to ideal.',
  frontLLTD: 'Lateral Load Transfer Distribution — the share of total cornering weight transfer handled by the front axle. Higher = more understeer tendency. On an oval, 38–55% works well — slightly below the 55% weight bias gives the car rotation through the corners.',
  frontGripShare: 'The front axle\'s share of total cornering grip based on current tire temperatures and pressures. 55% ideal matches the car\'s front weight bias and aerodynamic balance in left turns.',
  bodyRoll: 'Estimated chassis lean angle at 1G of lateral force. More roll tilts the solid rear axle and degrades camber on both rear tires. Target under 3° for this suspension geometry.',
  balanceScore: 'Combined grip penalty from front/rear imbalance. 100% = perfectly balanced. Score drops when the front and rear axles contribute unequal grip, causing understeer or oversteer.',
  toeCurrent: 'Current toe setting. Toe-out (negative) points the front tires slightly away from center, sharpening turn-in response. Toe-in (positive) improves straight-line stability but dulls corner entry.',
  toeOptimal: 'Model optimum: ¼" toe-out. This is the peak of the turn-in grip curve for this car — enough to sharpen initial steering response without excessive tire scrub or drag.',
  turnInGrip: 'Grip multiplier from toe angle. Peaks near ¼"–⅜" toe-out and falls off with excessive toe in either direction. 100% = best achievable toe grip.',
  toeDragPenalty: 'Straight-line speed penalty from toe angle. Even small amounts of toe-out create tire scrub on the straights. Displayed as % increase in effective drag coefficient.',
};

// ── Phase tendency helper ─────────────────────────────────────────────────────
function phaseLabel(bias) {
  // bias > 0.5 = front-heavy load transfer = push; < 0.5 = rear-heavy = loose
  const dev = bias - 0.50;
  if      (dev < -0.20) return { label: 'Very Loose',   color: 'var(--red)' };
  if      (dev < -0.10) return { label: 'Loose',        color: 'orange' };
  if      (dev < -0.03) return { label: 'Slight Loose', color: 'var(--yellow)' };
  if      (dev <=  0.03) return { label: 'Neutral',     color: 'var(--green)' };
  if      (dev <=  0.10) return { label: 'Slight Push', color: 'var(--yellow)' };
  if      (dev <=  0.20) return { label: 'Tight',       color: 'orange' };
  return                        { label: 'Very Tight',  color: 'var(--red)' };
}

// ── Handling Balance Gauge ────────────────────────────────────────────────────
function BalanceGauge({ frontGripPct, frontLLTD, corners, setup }) {
  // Pressure balance correction.
  // Uses absolute deviation from load-optimal: ANY deviation (over OR under) loses grip.
  // RF/LF off-optimal → less front grip → push tendency (negative).
  // RR/LR off-optimal → less rear grip → loose tendency (positive).
  //
  // This matches oval racing convention for typical Setup B pressure positions:
  //   RF/LF/LR are below optimal → raising toward optimal = more grip.
  //     RF higher = more front grip = loose. RF lower = less grip = tight.
  //   RR is slightly above optimal → lowering toward optimal = more grip.
  //     RR lower = more rear grip = tight. RR higher = less grip = loose.
  //
  // Scaled so 3-5 PSI of RF or RR spans one full balance zone boundary.
  const presAdj =
    -Math.abs(corners.RF.psiDev) * 0.010 +
     Math.abs(corners.RR.psiDev) * 0.008 +
    -Math.abs(corners.LF.psiDev) * 0.004 +
     Math.abs(corners.LR.psiDev) * 0.003;
  const balFrontGripPct = Math.max(0.3, Math.min(0.7, frontGripPct + presAdj));

  // Positive = loose tendency, negative = push tendency
  // Center on weight bias (55%) — that's the neutral handling point.
  // On an oval you typically WANT slight loose (LLTD below 55%) for rotation.
  const gripDev  = balFrontGripPct - 0.55;    // + = front has spare grip = loose
  const lltdDev  = (frontLLTD - 0.55) * 0.3; // + = front overloaded = push (gentle scaling)
  const tendency = gripDev - lltdDev;         // + = loose, - = push

  const gaugeMax = 0.12;
  // gaugePos: 0 = full loose (left), 1 = full push (right)
  const gaugePos = Math.max(0, Math.min(1, 0.5 - tendency / (2 * gaugeMax)));

  let label, color;
  if      (tendency < -0.08)  { label = 'Very Tight';    color = 'var(--red)'; }
  else if (tendency < -0.04)  { label = 'Tight';          color = 'orange'; }
  else if (tendency < -0.015) { label = 'Slight Push';    color = 'var(--yellow)'; }
  else if (tendency <=  0.015){ label = 'Neutral';        color = 'var(--green)'; }
  else if (tendency <=  0.04) { label = 'Slight Loose';   color = 'var(--yellow)'; }
  else if (tendency <=  0.08) { label = 'Loose';          color = 'orange'; }
  else                        { label = 'Very Loose';     color = 'var(--red)'; }

  // ── Phase breakdown — shocks, camber, pressure, toe, and grip scores ──
  // bias: 0.5 = neutral, >0.5 = push/tight tendency, <0.5 = loose tendency
  const rfS = 10 - setup.shocks.RF;
  const lfS = 10 - setup.shocks.LF;
  const rrS = 10 - setup.shocks.RR;
  const lrS = 10 - setup.shocks.LR;
  const total = Math.max(rfS + lfS + rrS + lrS, 1);

  // ENTRY — which axle loads first on turn-in?
  // RF/RR stiffness ratio: RF stiffer = front loads first = push; RR stiffer = rear loads = rotation.
  // Toe: toe-in (toward 0 from -0.25 optimal) = front doesn't bite = push on entry.
  // RF camber deviation: off ideal = less RF grip on initial load = push on entry.
  // RF pressure: over-inflated = smaller contact patch = push on entry.
  const entryOutsideBias = rfS / Math.max(rfS + rrS, 1);
  const toeEntryBias    = Math.max(0.2, Math.min(0.8, 0.5 + (setup.toe + 0.25) * 0.5));
  const rfCamEntryBias  = Math.max(0.2, Math.min(0.8, 0.5 + corners.RF.camberDev * 0.04));
  const rfPresEntryBias = Math.max(0.2, Math.min(0.8, 0.5 + corners.RF.psiDev * 0.022));
  const entryBias = 0.32 * entryOutsideBias + 0.17 * frontLLTD + 0.18 * toeEntryBias + 0.14 * rfCamEntryBias + 0.19 * rfPresEntryBias;
  const entry = phaseLabel(entryBias);

  // MID — steady-state corner.
  // Primary: pressure-adjusted front/rear grip balance. balFrontGripPct > 0.55 = rear limited = loose;
  // < 0.55 = front limited = push. Includes amplified pressure correction.
  const midGripBias = Math.max(0.1, Math.min(0.9, 0.5 + (balFrontGripPct - 0.55) * 3));
  const midBias = 0.55 * midGripBias + 0.45 * frontLLTD;
  const mid = phaseLabel(midBias);

  // EXIT — off corner under throttle.
  // Cross-weight (diagonal stiffness) determines how load redistributes as car unwinds.
  // Rear grip quality: if rear grip scores lower than front, rear may step out on throttle.
  // RR pressure: over-inflated = less rear contact patch = loose on exit.
  const diagBias = (rfS + lrS) / Math.max(total, 1);
  const rearGripAvg  = (corners.RR.adjustableScore + corners.LR.adjustableScore) / 2;
  const frontGripAvg = (corners.RF.adjustableScore + corners.LF.adjustableScore) / 2;
  const gripDiffBias   = Math.max(0.1, Math.min(0.9, 0.5 + (rearGripAvg - frontGripAvg) * 5));
  const rrPresExitBias = Math.max(0.2, Math.min(0.8, 0.5 - corners.RR.psiDev * 0.020));
  const exitBias = 0.27 * diagBias + 0.22 * frontLLTD + 0.24 * gripDiffBias + 0.27 * rrPresExitBias;
  const exit = phaseLabel(exitBias);

  // Phase notes — surface the dominant driver for each phase
  let entryNote = '';
  const toeContrib    = Math.abs(toeEntryBias - 0.5);
  const rfCamContrib  = Math.abs(rfCamEntryBias - 0.5);
  const rfPresContrib = Math.abs(rfPresEntryBias - 0.5);
  const shockEntryContrib = Math.abs(entryOutsideBias - 0.5);
  if (toeContrib > 0.04 && toeContrib >= shockEntryContrib) {
    entryNote = setup.toe > -0.25
      ? `Toe-in reduces front turn-in grip — pushier entry (${Math.abs(setup.toe)}" ${setup.toe > 0 ? 'in' : 'out'})`
      : `Aggressive toe-out (${Math.abs(setup.toe)}") — very sharp turn-in`;
  } else if (rfCamContrib > 0.04 && rfCamContrib >= shockEntryContrib) {
    entryNote = `RF camber ${corners.RF.camberDev.toFixed(1)}° off ideal — less front bite on turn-in`;
  } else if (rfPresContrib > 0.04 && rfPresContrib >= shockEntryContrib) {
    entryNote = corners.RF.psiDev > 0
      ? `RF over-inflated ${corners.RF.psiDev.toFixed(1)} PSI above target — harder contact patch`
      : `RF under-inflated ${Math.abs(corners.RF.psiDev).toFixed(1)} PSI below target`;
  } else if (entryOutsideBias > 0.53) {
    entryNote = 'RF strut stiffer than RR — front loads faster on turn-in';
  } else if (entryOutsideBias < 0.47) {
    entryNote = 'RR shock stiffer than RF — rear loads faster, car rotates on entry';
  }

  let exitNote = '';
  const rearGripDiff = rearGripAvg - frontGripAvg;
  if (Math.abs(rearGripDiff) > 0.02) {
    exitNote = rearGripDiff < 0
      ? `Rear grip (${(rearGripAvg * 100).toFixed(0)}%) < front (${(frontGripAvg * 100).toFixed(0)}%) — rear may step out on throttle`
      : `Rear grip (${(rearGripAvg * 100).toFixed(0)}%) > front — rear planted on exit`;
  } else {
    const diagVal = (rfS + lrS) - (lfS + rrS);
    if (diagVal > 2) exitNote = 'RF+LR diagonal stiffer — cross-weight holds rear on exit';
    else if (diagVal < -2) exitNote = 'LF+RR diagonal stiffer — less cross-weight, rear can step out';
  }

  const frontAvgScore = (corners.LF.adjustableScore + corners.RF.adjustableScore) / 2;
  const rearAvgScore  = (corners.LR.adjustableScore + corners.RR.adjustableScore) / 2;
  const rfCamberOk    = corners.RF.camberDev < 0.5;
  const frontPresOk   = Math.abs(corners.RF.psiDev) < 3 && Math.abs(corners.LF.psiDev) < 3;
  const rearPresOk    = Math.abs(corners.RR.psiDev) < 3 && Math.abs(corners.LR.psiDev) < 3;

  let description, action;
  if (tendency < -0.015) {
    const drivers = [];
    if (frontLLTD > 0.60) drivers.push('high front LLTD — front shocks transferring more cornering load than rear');
    if (frontGripPct < 0.53) drivers.push('front tires generating less grip than rears');
    if (!rfCamberOk) drivers.push('RF camber could be improved');
    if (!frontPresOk) drivers.push('front tire pressures off target');
    if (frontAvgScore < rearAvgScore - 0.03) drivers.push('front grip scores lower than rear');
    description = drivers.length
      ? `Car tends to push. Contributing factors: ${drivers.join('; ')}.`
      : 'Front axle is working harder than the rear relative to weight distribution.';
    action = 'To loosen: raise RF pressure (quickest fix — more RF grip turns the car), raise RR pressure (plants rear), raise LF pressure, lower LR pressure. If still pushing: soften front struts, stiffen rear shocks, or add RF negative camber.';
  } else if (tendency > 0.015) {
    const drivers = [];
    if (frontLLTD < 0.40) drivers.push('low front LLTD — rear shocks transferring more cornering load than front');
    if (frontGripPct > 0.57) drivers.push('rear tires generating less grip than fronts');
    if (!rearPresOk) drivers.push('rear tire pressures off target');
    if (rearAvgScore < frontAvgScore - 0.03) drivers.push('rear grip scores lower than front');
    description = drivers.length
      ? `Car tends to be loose. Contributing factors: ${drivers.join('; ')}.`
      : 'Rear axle is working harder than the front relative to weight distribution.';
    action = 'To tighten: lower RF pressure (less front grip — rear catches up), lower RR pressure (rear works harder), lower LF pressure, raise LR pressure. If still loose: stiffen front struts, soften rear shocks to shift load transfer toward the front.';
  } else {
    description = 'Front and rear axles are well-balanced — grip and load are proportional to the car\'s weight distribution.';
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

      {/* Phase breakdown */}
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
            <span className="opt-phase-note">Front grip {(balFrontGripPct * 100).toFixed(0)}% (ideal 55%) · LLTD {(frontLLTD * 100).toFixed(0)}%</span>
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
          {(balFrontGripPct * 100).toFixed(1)}% <span className="opt-stat-ideal">(ideal 55%)</span>
        </span>
      </div>
      <div className="opt-stat-pair">
        <span>Front LLTD</span>
        <span style={{ color: frontLLTD >= 0.35 && frontLLTD <= 0.60 ? 'var(--green)' : 'var(--yellow)' }}>
          {(frontLLTD * 100).toFixed(1)}% <span className="opt-stat-ideal">(oval target 38–55%)</span>
        </span>
      </div>
      <div className="opt-hb-desc">{description}</div>
      {action && <div className="opt-hb-action">{action}</div>}
    </div>
  );
}

// ── Static Camber Calculator ──────────────────────────────────────────────────
// Coefficients mirror raceSimulation.js exactly.
// All ideals now in GROUND FRAME (tire-to-road angle) — consistent with camberGripFactor.
//   RF (outside): idealGround = -2.0° → chassis-relative ideal = idealGround - cornerRoll
//   LF (inside):  idealGround =  0.0° → chassis-relative ideal = idealGround + cornerRoll
// rollCoeff 0.355 = 1.1° camber gain / 3.1° body roll (measured: 1.7" wheel disp × 0.65°/in)
const IDEAL_GROUND = { RF: -2.0, LF: 0.0 }; // ° ground camber targets
const CALC = {
  RF: { outside: true,  casterCoeff: 0.18, rollCoeff: 0.355 },
  LF: { outside: false, casterCoeff: 0.10, rollCoeff: 0.15  },
};
const OVAL_CORNER_G_CALC = 0.375;

function CamberCalc({ roll, setupCaster }) {
  const cornerRoll = roll * OVAL_CORNER_G_CALC;

  const [caster, setCaster] = useState({
    LF: setupCaster?.LF ?? 3.5,
    RF: setupCaster?.RF ?? 5.0,
  });

  const compute = (c) => {
    const { outside, casterCoeff, rollCoeff } = CALC[c];
    // Convert ground-frame ideal → chassis-relative ideal effective camber
    // RF: ground = effective + cornerRoll → effective = idealGround - cornerRoll
    // LF: ground = effective - cornerRoll → effective = idealGround + cornerRoll
    const idealGround = IDEAL_GROUND[c];
    const idealEffective = outside ? idealGround - cornerRoll : idealGround + cornerRoll;
    const casterGain = outside ? -(caster[c] * casterCoeff) :  (caster[c] * casterCoeff);
    const rollGain   = outside ? -(cornerRoll * rollCoeff)  :  (cornerRoll * rollCoeff);
    const totalGain  = casterGain + rollGain;
    const optStatic  = Math.round((idealEffective - casterGain - rollGain) * 4) / 4;
    const effectiveCamber = optStatic + totalGain;
    // Ground camber: rotate chassis-relative → ground frame
    const groundCamber = outside
      ? effectiveCamber + cornerRoll
      : effectiveCamber - cornerRoll;
    return { casterGain, rollGain, totalGain, idealGround, idealEffective, optStatic, groundCamber };
  };

  return (
    <div className="opt-camber-calc">
      <div className="opt-factor-title">Static Camber Calculator</div>
      <p className="opt-calc-desc">
        Enter caster → model returns the static setting that hits the ideal effective camber
        at mid-corner. Body roll uses your current setup stiffness
        ({cornerRoll.toFixed(2)}° in corners).
      </p>
      <div className="opt-calc-grid">
        {['LF', 'RF'].map(c => {
          const { casterGain, rollGain, totalGain, idealGround, idealEffective, optStatic, groundCamber } = compute(c);
          const label = c === 'RF' ? 'Right Front (outside)' : 'Left Front (inside)';
          return (
            <div key={c} className="opt-balance-card opt-calc-card">
              <div className="opt-calc-header">{label}</div>

              <div className="opt-form-field" style={{ marginBottom: 10 }}>
                <label>Caster (°)</label>
                <input type="number" step="0.25" min="0" max="12" className="opt-input"
                  value={caster[c]}
                  onChange={e => setCaster(prev => ({ ...prev, [c]: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div className="opt-stat-pair">
                <span>Caster gain</span>
                <span>{casterGain >= 0 ? '+' : ''}{casterGain.toFixed(2)}°</span>
              </div>
              <div className="opt-stat-pair">
                <span>Body roll gain</span>
                <span>{rollGain >= 0 ? '+' : ''}{rollGain.toFixed(2)}°</span>
              </div>
              <div className="opt-stat-pair">
                <span>Total dynamic gain</span>
                <span style={{ color: 'var(--accent)' }}>
                  {totalGain >= 0 ? '+' : ''}{totalGain.toFixed(2)}°
                </span>
              </div>
              <div className="opt-stat-pair">
                <span>Ideal effective (chassis)</span>
                <span>{idealEffective.toFixed(2)}°</span>
              </div>

              <div className="opt-calc-result">
                Set static to <strong>{optStatic}°</strong>
              </div>

              <div className="opt-calc-check">
                {optStatic}° + ({totalGain >= 0 ? '+' : ''}{totalGain.toFixed(2)}°) ={' '}
                <span style={{ color: 'var(--green)' }}>
                  {(optStatic + totalGain).toFixed(2)}° eff.
                </span>
              </div>

              <div className="opt-stat-pair" style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <span>Ground camber → target</span>
                <span style={{ color: Math.abs(groundCamber - idealGround) < 0.15 ? 'var(--green)' : 'var(--accent)' }}>
                  {groundCamber >= 0 ? '+' : ''}{groundCamber.toFixed(2)}° → {idealGround >= 0 ? '+' : ''}{idealGround.toFixed(1)}°
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CornerCard({ c, data, setup }) {
  const {
    load, estimatedTemp, hp, optHotPsi, recColdPsi, recHotPsi,
    psiGripFactor, isPresLimited, psiDev,
    effectiveCamber, groundCamber, idealGroundCamber, camberDev, camberFactor, dynamicGain,
    optStaticCamber, alignmentOutOfRange, sidewallCamber, front, outside, tempFactor, adjustableScore,
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
                <span className="opt-math-op"> {dynamicGain >= 0 ? '+' : ''}{dynamicGain.toFixed(2)}° dynamic</span>
              </Tooltip>
              <Tooltip text={TIPS.effectiveCamber}>
                <span className="opt-math-eq"> = {effectiveCamber !== null ? effectiveCamber.toFixed(2) : '—'}° eff.</span>
              </Tooltip>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.groundCamber}><span>Ground camber</span></Tooltip>
              <span style={{ color: camberOk ? 'var(--green)' : 'var(--yellow)' }}>
                {groundCamber !== null ? (groundCamber >= 0 ? '+' : '') + groundCamber.toFixed(2) : '—'}°
              </span>
            </div>
            <div className="opt-stat-pair" style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
              <Tooltip text={TIPS.sidewallCamber}><span>  ↳ sidewall compliance</span></Tooltip>
              <span>+{sidewallCamber !== undefined ? sidewallCamber.toFixed(2) : '—'}°</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={idealTip}><span>Target ground</span></Tooltip>
              <span style={{ color: camberOk ? 'var(--green)' : 'var(--yellow)' }}>
                {idealGroundCamber !== undefined ? (idealGroundCamber >= 0 ? '+' : '') + idealGroundCamber.toFixed(1) : '—'}°
                {!camberOk && optStaticCamber !== null && (
                  <span className="opt-rec-arrow"> → set {optStaticCamber}° static</span>
                )}
              </span>
            </div>
            {alignmentOutOfRange && optStaticCamber !== null && (
              <Tooltip text={TIPS.alignmentRange}>
                <div className="opt-limited-note" style={{ color: 'var(--yellow)' }}>
                  ⚠ {optStaticCamber}° outside stock hardware range (−0.5° to −3.0°)
                </div>
              </Tooltip>
            )}
          </>
        ) : (
          <>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.groundCamber}><span>Ground camber</span></Tooltip>
              <span>{groundCamber !== null ? (groundCamber >= 0 ? '+' : '') + groundCamber.toFixed(2) : '—'}°</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={idealTip}><span>Target ground</span></Tooltip>
              <span>{idealGroundCamber !== undefined ? (idealGroundCamber >= 0 ? '+' : '') + idealGroundCamber.toFixed(1) : '—'}°</span>
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
    const isFront = corner === 'LF' || corner === 'RF';
    const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === label);
    if (!found) return;
    const s = deepClone(setup);
    s.shocks[corner] = found.rating;
    // Complete strut assemblies (Quick-Strut, Strut-Plus) include their own coil spring.
    // Auto-fill that corner's spring rate as a convenience — user can override via selector.
    // Damper-only parts leave the existing spring rate unchanged.
    if (isFront && found.springRate) {
      s.springs[corner] = found.springRate;
    }
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

          <div className="opt-form-label" style={{ marginTop: 12 }}>Front Spring Rates</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <select
                className="opt-select"
                value={setup.springs[c] ?? 475}
                onChange={e => update(`springs.${c}`, parseInt(e.target.value))}
              >
                {FRONT_SPRING_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">Camber (°)</div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <NumericInput step="0.25" className="opt-input"
                value={setup.camber[c]}
                onChange={num => update(`camber.${c}`, num)}
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
            <NumericInput step="0.0625" className="opt-input"
              value={setup.toe}
              onChange={num => update('toe', num)}
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

export default function SetupOptimizer({ setup, setSetup, ambient, setAmbient, inflationTemp, setInflationTemp }) {
  const analysis = useMemo(() => analyzeSetup(setup, ambient, inflationTemp), [setup, ambient, inflationTemp]);
  const {
    corners, ss, roll, frontGripPct, balancePenalty,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain, recs,
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
        <div className="opt-form-field">
          <label>Tires Set At (°F)</label>
          <input type="number" min="30" max="120" step="1" className="opt-input"
            value={inflationTemp}
            onChange={e => setInflationTemp(parseFloat(e.target.value) || 68)}
          />
        </div>
        <div className="opt-presets">
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DEFAULT_SETUP))}>
            Load Current Setup
          </button>
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(PETE_SETUP))}>
            Load Pete
          </button>
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DYLAN_SETUP))}>
            Load Dylan
          </button>
          <button className="sim-preset-btn" onClick={() => setSetup(deepClone(JOSH_SETUP))}>
            Load Josh
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

      {/* ── Camber Calculator ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Camber Calculator</h3>
        <CamberCalc roll={roll} setupCaster={setup.caster} />
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
        <BalanceGauge frontGripPct={frontGripPct} frontLLTD={ss.frontLLTD} corners={corners} setup={setup} />
        <div className="opt-balance-row" style={{ marginTop: 14 }}>
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
        Camber recommendations use caster-induced dynamic camber gain of 0.18°/degree (RF outside)
        and 0.10°/degree (LF inside), calibrated from geometric formula caster × sin(~10° steer angle).
        All display scores match the lap time model exactly. Always verify camber with real pyrometer data.
      </div>
    </div>
  );
}
