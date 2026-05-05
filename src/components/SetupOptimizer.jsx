import { useMemo, useState, useRef, useEffect } from 'react';
import {
  analyzeSetup, DEFAULT_SETUP, RECOMMENDED_SETUP, PETE_SETUP, DYLAN_SETUP, JOSH_SETUP, JOEY_SETUP,
  analyzeSetupF8, DEFAULT_SETUP_F8, F8_BASELINE_SETUP,
} from '../utils/raceSimulation';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import { computeGeometry } from './GeometryVisualizer';
import { useSync } from '../utils/SyncContext';
import NumericInput from './NumericInput';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const FRONT_SPRING_OPTIONS = [
  { value: 700, label: '700 lbs/in — Pre-2003 / Heavy Duty' },
  { value: 475, label: '475 lbs/in — Police / Taxi (P71 stock)' },
  { value: 440, label: '440 lbs/in — Civilian / Base' },
];
const REAR_SPRING_OPTIONS = [
  { value: 200, label: '200 lbs/in — Heavy Duty / Police' },
  { value: 160, label: '160 lbs/in — Stock P71' },
  { value: 140, label: '140 lbs/in — Soft / Base' },
];
const CORNER_LABELS = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };

const OVAL_TARGET = 17.1;
const OVAL_RANGE_MIN = 16.8;
const OVAL_RANGE_MAX = 17.8;

const F8_TARGET = 23.1;
const F8_RANGE_MIN = 22.8;
const F8_RANGE_MAX = 23.8;

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function pct(v) { return (v * 100).toFixed(1) + '%'; }

function buildGeoOverrides(geo) {
  if (!geo) return null;
  const overrides = {};
  if (geo.trackWidth?.front) overrides.trackWidthFront = Number(geo.trackWidth.front);
  if (geo.rearRollCenter) overrides.rcHeightRear = Number(geo.rearRollCenter);
  if (geo.rearSpringBase) overrides.rearSpringBase = Number(geo.rearSpringBase);
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
  } else if (lf?.ic?.x != null) {
    overrides.icLateralFront = Math.abs(lf.ic.x);
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
  return Object.keys(overrides).length > 0 ? overrides : null;
}

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

// ── Oval TIPS ─────────────────────────────────────────────────────────────────
const OVAL_TIPS = {
  gripScore: 'Overall grip score for this corner — product of camber, pressure, and temperature factors. 100% = fully optimal. Green ≥99%, Yellow ≥96%, Orange ≥92%, Red below.',
  load: 'Estimated tire load at 1G of lateral force (one full corner). Heavier = more grip potential but also more heat. RF and RR carry more weight in left turns.',
  estTemp: 'Steady-state equilibrium temperature predicted by the thermal model at race pace. Actual race temps will vary with lap count and ambient conditions.',
  tempFactor: 'Grip multiplier from tire temperature. These all-season tires are optimal between 100–165°F. Below 100°F the tire is cold and loses grip; above 165°F heat starts to degrade the compound.',
  camberSection: 'Camber is the inward/outward tilt of the tire. Negative camber tilts the top of the tire inward. The outside front (RF in a left turn) needs negative camber to stay flat on the road under cornering load.',
  staticCamber: 'Your static alignment setting in degrees. Negative = top of tire tilted inward toward the car. This is what you set in the garage.',
  casterGain: 'Combined dynamic camber change from three sources: (1) Caster geometry — RF gains negative camber (0.136°/° caster at 3.77° apex steer), LF gains positive (0.034°/°). Calibrated at 20° steer then scaled by sin(3.77°)/sin(20°) = 0.204 for actual short-oval steer angle. (2) SLA body roll — RF gains negative in jounce (0.355°/° roll, measured), LF gains positive in droop (0.547°/° roll, measured). (3) KPI (kingpin inclination 9.5°) — adds +0.02° positive camber to RF, −0.02° to LF at 3.77° steer. Formula: KPI_deg × (1 − cos(steer)).',
  effectiveCamber: 'Chassis-relative effective camber at mid-corner: static setting plus caster gain, SLA body-roll gain, and KPI-induced camber. This is the angle relative to the car body — not the same as tire-to-road angle.',
  groundCamber: 'Tire-to-road angle at mid-corner — the contact patch metric. Accounts for body roll rotating the chassis: outside tire\'s ground camber = effective + cornerRoll; inside = effective − cornerRoll. This is what actually determines how the contact patch loads.',
  idealCamber: {
    outside: 'Target ground camber for the outside front (RF): −2.0°. At 0° ground the contact patch is geometrically flat, but under cornering load the outside tread crown lifts slightly — a small negative ground angle compensates. Calibrated for the Ironman 235/55R17 tall sidewall; a stiffer low-profile tire would need more negative. Refine this target with camber sweep tests: the setting that produces even I/M/O pyrometer temps is the true optimum.',
    inside: 'Target ground camber for the inside front (LF): +0.75°. This is NOT 0° — a small positive ground angle is optimal. At 0° ground the contact patch is flat but produces zero camber thrust; at +0.75° the lightly loaded LF generates meaningful camber thrust (inward force that aids rotation and turn-in) while the contact patch loss is only ~5%. Research (short oval practice, tire physics): +0.5° to +1.0° ground optimum for lightly loaded inside tire. To achieve +0.75° ground: static LF ≈ +1.5° to +2° (chassis roll subtracts 1–2° in ground frame). Going below +0.75° loses both thrust and contact patch. Going above ~+2° ground mainly loses contact patch with diminishing thrust return.',
    rearOutside: 'Target ground camber for the outside rear (RR): 0°. With a solid axle the tire tilts with body roll — the car rolls outward, adding positive ground camber to the outside rear. Stiffer rear shocks reduce roll and keep this closer to 0°.',
    rearInside: 'Target ground camber for the inside rear (LR): 0°. The inside rear is very lightly loaded. No adjustment possible — controlled only by reducing body roll.',
  },
  solidAxle: 'The rear axle is solid (live axle) — both rear wheels tilt together with body roll. You cannot set rear camber directly. Reducing body roll (stiffer rear shocks) brings ground camber closer to 0° on both rears.',
  camberScore: 'Grip multiplier from camber alignment. 100% = ground camber matches the target. Penalty is asymmetric and load-weighted: RF loses ~1.6–1.8%/° when not negative enough (insufficient camber is more damaging than over-camber). LF loses ~1.2%/° below the +0.75° target (both thrust and contact patch lost), ~0.7%/° above it (mainly contact patch). Rears ~1.0%/° symmetric.',
  alignmentRange: 'P71 front camber range assumes camber bolts are installed (replaces one or both strut pinch bolts). With a camber bolt: RF adjustable from 0° to −4°; LF adjustable from −4° to +4°. Positive LF static camber is normal for oval racing — chassis roll subtracts ~1–2° in the ground frame, so +1° to +2° static produces near-flat contact patch in the corner. Values beyond ±4° require additional hardware (alignment shims or plates).',
  sidewallCamber: 'Positive camber added at the contact patch by sidewall compliance. The 235/55R17 55-series sidewall deflects outward under load, shifting the contact patch and effectively leaning the tire away from center. This is load-dependent (heavier corner = more deflection) and must be offset by additional static negative camber. Data: Ironman iMove Gen3 AS 235/55R17, section height 5.09", load-deflection curve measured at 500/1000/1500/1929 lbs.',
  pressureSection: 'Tire pressure affects contact patch shape. Under-inflated tires flex excessively and overheat the edges; over-inflated tires crown and only use the center of the tread.',
  coldHot: 'Cold PSI is what you set when inflating the tires. Hot PSI is calculated via ideal gas law using the "Tires Set At" temperature as the cold reference. At 200°F tires set at 85°F: 34 cold → ~40.9 PSI hot. Setting tires on a hot day means less pressure rise — and shifts target cold PSI higher.',
  optimalHot: 'The hot pressure that gives maximum grip for this corner\'s load. Heavily loaded tires (RF, RR) need higher pressure to support the load; lightly loaded tires (LF, LR) need less.',
  presScore: 'Grip multiplier from tire pressure. 100% = hot pressure matches the load-optimal target. Each PSI of deviation costs ~0.25% grip.',
  loadMismatch: 'This corner\'s load is far from the car\'s average, so the mathematically optimal pressure is outside a practical range. Run the lowest safe pressure for lightly loaded corners and the highest safe pressure for heavily loaded ones.',
  frontShock: 'Average stiffness rating of the two front struts (0 = stiffest, 10 = softest). Stiffer fronts resist body roll and reduce weight transfer to the front tires during braking and corner entry.',
  rearShock: 'Average stiffness rating of the two rear shocks (0 = stiffest, 10 = softest). Stiffer rears limit body roll on a solid axle, keeping dynamic rear camber closer to ideal.',
  frontLLTD: 'Lateral Load Transfer Distribution — the share of total cornering weight transfer handled by the front axle. Higher = more understeer/push tendency. On an oval, target ~46% (green zone 41–51%) — keeping LLTD slightly below the 55% front weight bias gives the car natural rotation through the corners. Outside this range costs ~1–3% grip.',
  frontGripShare: 'The front axle\'s share of total cornering grip based on current tire temperatures and pressures. 55% ideal matches the car\'s front weight bias. The gauge above shows a pressure-adjusted version of this number used to calculate the needle position — the two will differ slightly when pressures are off-target.',
  bodyRoll: 'Estimated chassis lean angle at 1G of lateral force. More roll tilts the solid rear axle and degrades camber on both rear tires. Target under 3° for this suspension geometry.',
  balanceScore: 'Combined grip penalty from front/rear imbalance. 100% = perfectly balanced. Score drops when the front and rear axles contribute unequal grip, causing understeer or oversteer.',
  rollAngleBalance: 'The angle each suspension end wants to roll to at steady-state cornering load. A balanced setup means both ends desire the same roll angle — when matched, weight transfer is proportionate and tire temperatures are even front-to-rear. Imbalance >1° indicates the front and rear are fighting each other structurally: the stiffer end resists roll more, overloading its outside tire. Source: Circle Track Magazine roll angle balance method.',
  toeCurrent: 'Current toe setting. Toe-out (negative) points the front tires slightly away from center, sharpening turn-in response. Toe-in (positive) improves straight-line stability but dulls corner entry.',
  toeOptimal: 'Model optimum: ¼" toe-out. This is the peak of the turn-in grip curve for this car — enough to sharpen initial steering response without excessive tire scrub or drag.',
  turnInGrip: 'Grip multiplier from toe angle. Peaks near ¼"–⅜" toe-out and falls off with excessive toe in either direction. 100% = best achievable toe grip.',
  toeDragPenalty: 'Straight-line speed penalty from toe angle. Even small amounts of toe-out create tire scrub on the straights. ~0.5% drag at ¼" toe, ~2% at ½". Displayed as % increase in rolling resistance.',
};

// ── Figure 8 TIPS ─────────────────────────────────────────────────────────────
const F8_TIPS = {
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

// ── Oval phase tendency ───────────────────────────────────────────────────────
function phaseLabel(bias) {
  const dev = bias - 0.50;
  if      (dev < -0.20) return { label: 'Very Loose',   color: 'var(--red)' };
  if      (dev < -0.10) return { label: 'Loose',        color: 'orange' };
  if      (dev < -0.03) return { label: 'Slight Loose', color: 'var(--yellow)' };
  if      (dev <=  0.03) return { label: 'Neutral',     color: 'var(--green)' };
  if      (dev <=  0.10) return { label: 'Slight Push', color: 'var(--yellow)' };
  if      (dev <=  0.20) return { label: 'Tight',       color: 'orange' };
  return                        { label: 'Very Tight',  color: 'var(--red)' };
}

// ── Oval Handling Balance Gauge ───────────────────────────────────────────────
function BalanceGauge({ frontGripPct, frontLLTD, springLLTD, corners, setup }) {
  const presAdj =
    +Math.abs(corners.RF.psiDev) * 0.010 +
    -Math.abs(corners.RR.psiDev) * 0.008 +
    +Math.abs(corners.LF.psiDev) * 0.004 +
    -Math.abs(corners.LR.psiDev) * 0.003;
  const balFrontGripPct = Math.max(0.3, Math.min(0.7, frontGripPct + presAdj));

  const gripDev  = 0.55 - balFrontGripPct;
  const OPTIMAL_LLTD = 0.46;
  const lltdPush = -3.5 * Math.pow(frontLLTD - OPTIMAL_LLTD, 2);

  const rfCamberPush = -(corners.RF.camberDev * 0.012);
  const lfCamberLoose = (corners.LF.camberDev * 0.006);
  const rfCasterLoose = ((setup.caster?.RF ?? 5) - 5) * 0.006;

  const tendency = gripDev + lltdPush + rfCamberPush + lfCamberLoose + rfCasterLoose;

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

  const rfS = 10 - setup.shocks.RF;
  const lfS = 10 - setup.shocks.LF;
  const rrS = 10 - setup.shocks.RR;
  const lrS = 10 - setup.shocks.LR;
  const total = Math.max(rfS + lfS + rrS + lrS, 1);

  const outsideBalance = (rfS - rrS) / Math.max(rfS + rrS, 1);
  const entryOutsideBias = outsideBalance >= 0
    ? Math.max(0.2, Math.min(0.8, 0.5 + outsideBalance * 0.35))
    : Math.max(0.2, Math.min(0.8, 0.5 + outsideBalance * 0.15));
  const toeEntryBias    = Math.max(0.2, Math.min(0.8, 0.5 + (setup.toe + 0.25) * 0.5));
  const rfCamEntryBias  = Math.max(0.2, Math.min(0.8, 0.5 + corners.RF.camberDev * 0.04));
  const rfPresEntryBias = Math.max(0.2, Math.min(0.8, 0.5 + corners.RF.psiDev * 0.022));
  const lltdEntryBias = Math.min(0.8, 0.5 + 3.5 * Math.pow(frontLLTD - OPTIMAL_LLTD, 2));
  const entryBias = 0.32 * entryOutsideBias + 0.17 * lltdEntryBias + 0.18 * toeEntryBias + 0.14 * rfCamEntryBias + 0.19 * rfPresEntryBias;
  const entry = phaseLabel(entryBias);

  const midGripBias = Math.max(0.1, Math.min(0.9, 0.5 + (balFrontGripPct - 0.55) * 3));
  const lltdMidBias = Math.min(0.8, 0.5 + 3.5 * Math.pow(frontLLTD - OPTIMAL_LLTD, 2));
  const midBias = 0.55 * midGripBias + 0.45 * lltdMidBias;
  const mid = phaseLabel(midBias);

  const diagBias = (rfS + lrS) / Math.max(total, 1);
  const rearGripAvg  = (corners.RR.adjustableScore + corners.LR.adjustableScore) / 2;
  const frontGripAvg = (corners.RF.adjustableScore + corners.LF.adjustableScore) / 2;
  const gripDiffBias   = Math.max(0.1, Math.min(0.9, 0.5 + (rearGripAvg - frontGripAvg) * 5));
  const rrPresExitBias = Math.max(0.2, Math.min(0.8, 0.5 - corners.RR.psiDev * 0.020));
  const lltdExitBias = Math.min(0.8, 0.5 + 3.5 * Math.pow(frontLLTD - OPTIMAL_LLTD, 2));
  const exitBias = 0.27 * diagBias + 0.22 * lltdExitBias + 0.24 * gripDiffBias + 0.27 * rrPresExitBias;
  const exit = phaseLabel(exitBias);

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
  } else if (entryOutsideBias > 0.55) {
    entryNote = rfS > rrS
      ? 'RF strut stiffer than RR — front loads faster on turn-in, pushier entry'
      : 'RR shock stiffer than RF — resists rear squat, less rotation on entry';
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
    if (frontLLTD < 0.42) {
      drivers.push(`low front LLTD (${(frontLLTD * 100).toFixed(0)}%) — RF is starved of cornering load and can't build lateral force. Front washes even though rear isn't overloaded. Target 42–50%`);
    } else if (frontLLTD > 0.51) {
      drivers.push('high front LLTD — front shocks transferring too much cornering load to front axle, front reaches grip limit first');
    }
    if (frontGripPct > 0.57) drivers.push('front tires overworked relative to rears (front is the limiting axle)');
    if (!rfCamberOk) drivers.push('RF camber could be improved');
    if (!frontPresOk) drivers.push('front tire pressures off target');
    if (frontAvgScore < rearAvgScore - 0.03) drivers.push('front grip scores lower than rear');
    description = drivers.length
      ? `Car tends to push. Contributing factors: ${drivers.join('; ')}.`
      : 'Front axle is not generating enough lateral force relative to the rear.';
    action = frontLLTD < 0.42
      ? 'To fix push from low LLTD: stiffen front struts (increase front roll resistance so RF gets more load in corners). Also check RF camber and pressure — the RF needs load AND good contact patch to generate cornering force.'
      : 'To loosen: raise RF pressure (quickest fix — more RF grip turns the car), raise RR pressure (plants rear), raise LF pressure, lower LR pressure. If still pushing: soften front struts, stiffen rear shocks, or add RF negative camber.';
  } else if (tendency > 0.015) {
    const drivers = [];
    if (frontLLTD >= 0.42 && frontLLTD < 0.46) drivers.push('front LLTD slightly below optimal — rear handling slightly more load than ideal');
    if (frontGripPct < 0.53) drivers.push('rear tires overworked relative to fronts (rear is the limiting axle)');
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
          <span>LOOSE</span><span>NEUTRAL</span><span>PUSH</span>
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
            <span className="opt-phase-note">Front grip {(balFrontGripPct * 100).toFixed(0)}% (ideal 55%) · Spring LLTD {(springLLTD * 100).toFixed(0)}%</span>
          </div>
          <div className="opt-phase-row">
            <span className="opt-phase-name">Exit</span>
            <span className="opt-phase-label" style={{ color: exit.color }}>{exit.label}</span>
            {exitNote && <span className="opt-phase-note">{exitNote}</span>}
          </div>
        </div>
      </div>

      <div className="opt-stat-pair" style={{ marginTop: 4 }}>
        <span>Front grip share (pres. adj.)</span>
        <span style={{ color: Math.abs(gripDev) < 0.04 ? 'var(--green)' : 'var(--yellow)' }}>
          {(balFrontGripPct * 100).toFixed(1)}% <span className="opt-stat-ideal">(ideal 55%)</span>
        </span>
      </div>
      <div className="opt-stat-pair">
        <span>Front LLTD</span>
        <span style={{ color: frontLLTD >= 0.41 && frontLLTD <= 0.51 ? 'var(--green)' : 'var(--yellow)' }}>
          {(frontLLTD * 100).toFixed(1)}% <span className="opt-stat-ideal">(oval target ~46%)</span>
        </span>
      </div>
      <div className="opt-hb-desc">{description}</div>
      {action && <div className="opt-hb-action">{action}</div>}
    </div>
  );
}

// ── Figure 8 Handling Balance Gauge ───────────────────────────────────────────
function BalanceGaugeF8({ frontGripPct, frontLLTD, springLLTD, corners, setup }) {
  const gripDev  = 0.55 - frontGripPct;
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

  const rfS = 10 - setup.shocks.RF;
  const lfS = 10 - setup.shocks.LF;
  const rrS = 10 - setup.shocks.RR;
  const lrS = 10 - setup.shocks.LR;
  const total = Math.max(rfS + lfS + rrS + lrS, 1);

  const leftBalance  = (rfS - rrS) / Math.max(rfS + rrS, 1);
  const rightBalance = (lfS - lrS) / Math.max(lfS + lrS, 1);
  const entryLeftBias  = leftBalance  >= 0
    ? Math.max(0.2, Math.min(0.8, 0.5 + leftBalance  * 0.35))
    : Math.max(0.2, Math.min(0.8, 0.5 + leftBalance  * 0.15));
  const entryRightBias = rightBalance >= 0
    ? Math.max(0.2, Math.min(0.8, 0.5 + rightBalance * 0.35))
    : Math.max(0.2, Math.min(0.8, 0.5 + rightBalance * 0.15));
  const entryShockBias = (entryLeftBias + entryRightBias) / 2;
  const toeEntryBias    = Math.max(0.2, Math.min(0.8, 0.5 + (setup.toe + 0.25) * 0.5));
  const avgFrontCamberDev = (corners.LF.camberDev + corners.RF.camberDev) / 2;
  const camberEntryBias   = Math.max(0.2, Math.min(0.8, 0.5 + avgFrontCamberDev * 0.04));
  const avgFrontPsiDev  = (corners.LF.psiDev + corners.RF.psiDev) / 2;
  const presEntryBias   = Math.max(0.2, Math.min(0.8, 0.5 + avgFrontPsiDev * 0.012));
  const entryBias = 0.35 * entryShockBias + 0.20 * frontLLTD + 0.20 * toeEntryBias + 0.15 * camberEntryBias + 0.10 * presEntryBias;
  const entry = phaseLabel(entryBias);

  const midGripDev  = (frontGripPct - 0.55) * 3;
  const midLLTDDev  = (springLLTD   - 0.50) * 0.5;
  const midBias = Math.max(0.1, Math.min(0.9, 0.5 + 0.70 * midGripDev + 0.30 * midLLTDDev));
  const mid = phaseLabel(midBias);

  const diagBias = (rfS + lrS) / Math.max(total, 1);
  const rearGripAvgF8  = (corners.RR.adjustableScore + corners.LR.adjustableScore) / 2;
  const frontGripAvgF8 = (corners.RF.adjustableScore + corners.LF.adjustableScore) / 2;
  const gripDiffBias   = Math.max(0.1, Math.min(0.9, 0.5 + (rearGripAvgF8 - frontGripAvgF8) * 5));
  const avgRearPsiDev  = (corners.RR.psiDev + corners.LR.psiDev) / 2;
  const rearPresExitBias = Math.max(0.2, Math.min(0.8, 0.5 - avgRearPsiDev * 0.012));
  const exitBias = 0.30 * diagBias + 0.25 * frontLLTD + 0.25 * gripDiffBias + 0.20 * rearPresExitBias;
  const exit = phaseLabel(exitBias);

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
    const phaseIssues = [];
    if (mid.label !== 'Neutral')   phaseIssues.push(`${mid.label} mid-corner (spring LLTD ${(springLLTD * 100).toFixed(0)}%)`);
    if (exit.label !== 'Neutral')  phaseIssues.push(`${exit.label} on exit`);
    if (entry.label !== 'Neutral') phaseIssues.push(`${entry.label} on entry`);
    description = phaseIssues.length
      ? `Overall balance is neutral, but phase tendencies detected: ${phaseIssues.join('; ')}.`
      : 'Front and rear axles are well-balanced across all corner phases.';
    action = phaseIssues.length
      ? 'Overall grip is balanced — fine-tune spring LLTD or shock balance to address phase-specific tendencies.'
      : null;
  }

  return (
    <div className="opt-handling-balance">
      <div className="opt-factor-title">Handling Balance</div>
      <div className="opt-hb-gauge-wrap">
        <div className="opt-hb-gauge-ends">
          <span>LOOSE</span><span>NEUTRAL</span><span>PUSH</span>
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

// ── Static Camber Calculator (oval only) ──────────────────────────────────────
const IDEAL_GROUND = { RF: -2.0, LF: 0.75 };
const CALC = {
  RF: { outside: true,  casterCoeff: 0.136, rollCoeff: 0.355  },
  LF: { outside: false, casterCoeff: 0.034, rollCoeff: 0.547  },
};
const OVAL_RACING_G_CALC = 0.813;

function CamberCalc({ roll, setupCaster, geoOverrides }) {
  const cornerRoll = roll * OVAL_RACING_G_CALC;

  const [caster, setCaster] = useState({
    LF: setupCaster?.LF ?? 3.5,
    RF: setupCaster?.RF ?? 5.0,
  });
  const prevCaster = useRef(setupCaster);
  useEffect(() => {
    if (
      setupCaster &&
      (setupCaster.LF !== prevCaster.current?.LF || setupCaster.RF !== prevCaster.current?.RF)
    ) {
      setCaster({ LF: setupCaster.LF ?? 3.5, RF: setupCaster.RF ?? 5.0 });
      prevCaster.current = setupCaster;
    }
  }, [setupCaster]);

  const jounceRF = geoOverrides?.slaJounceCoeffRF ?? CALC.RF.rollCoeff;
  const droopLF  = geoOverrides?.slaDroopCoeffLF  ?? CALC.LF.rollCoeff;

  const compute = (c) => {
    const { outside, casterCoeff } = CALC[c];
    const rollCoeff = c === 'RF' ? jounceRF : droopLF;
    const idealGround = IDEAL_GROUND[c];
    const idealEffective = outside ? idealGround - cornerRoll : idealGround + cornerRoll;
    const casterGain = outside ? -(caster[c] * casterCoeff) :  (caster[c] * casterCoeff);
    const rollGain   = outside ? -(cornerRoll * rollCoeff)  :  (cornerRoll * rollCoeff);
    const totalGain  = casterGain + rollGain;
    const optStatic  = Math.round((idealEffective - casterGain - rollGain) * 4) / 4;
    const effectiveCamber = optStatic + totalGain;
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
        {geoOverrides?.slaJounceCoeffRF != null && (
          <span className="opt-geo-note" style={{ display: 'block', marginTop: 4 }}>
            Using measured jounce coefficients — RF {jounceRF.toFixed(3)}°/° · LF {droopLF.toFixed(3)}°/° (from FVSA)
          </span>
        )}
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

function StatusRow({ ok, label, value, action, tip, warn }) {
  const icon = ok ? '✓' : warn ? '⚠' : '→';
  const iconColor = ok ? 'var(--green)' : warn ? 'var(--yellow)' : 'var(--yellow)';
  const content = (
    <div className="opt-status-row">
      <span className="opt-status-icon" style={{ color: iconColor }}>{icon}</span>
      <span className="opt-status-label">{label}</span>
      <span className="opt-status-value" style={{ color: ok ? 'var(--green)' : 'var(--text-primary)' }}>{value}</span>
      {!ok && action && <span className="opt-status-action">{action}</span>}
    </div>
  );
  return tip ? <Tooltip text={tip}>{content}</Tooltip> : content;
}

// ── Oval Corner Card ──────────────────────────────────────────────────────────
function OvalCornerCard({ c, data, setup, frontGripPct }) {
  const [expanded, setExpanded] = useState(false);
  const {
    load, estimatedTemp, hp, recColdPsi, recHotPsi,
    psiGripFactor, isPresLimited, psiDev,
    effectiveCamber, groundCamber, idealGroundCamber, camberDev, camberFactor, dynamicGain,
    optStaticCamber, alignmentOutOfRange, sidewallCamber, front, outside, tempFactor, toeFactor, adjustableScore,
    cornerRoll,
  } = data;

  const camberOk   = camberDev < 0.5;
  const presOk     = Math.abs(psiDev) < 2;
  const recCold    = Math.round(recColdPsi * 2) / 2;
  const psiDir     = psiDev < 0 ? 'Raise' : 'Lower';

  const balanceNote = frontGripPct != null ? (() => {
    const dev = frontGripPct - 0.57;
    if (Math.abs(dev) < 0.02) return null;
    if (front && dev > 0.02)  return { text: 'Front dominant — push', color: '#f59e0b' };
    if (front && dev < -0.02) return { text: 'Front limited — loose entry', color: '#60a5fa' };
    if (!front && dev > 0.02) return { text: 'Rear yielding — push', color: '#f59e0b' };
    if (!front && dev < -0.02) return { text: 'Rear dominant — loose', color: '#60a5fa' };
    return null;
  })() : null;
  const toeOk = toeFactor == null || toeFactor > 0.97;

  const idealTip = front
    ? (outside ? OVAL_TIPS.idealCamber.outside : OVAL_TIPS.idealCamber.inside)
    : (outside ? OVAL_TIPS.idealCamber.rearOutside : OVAL_TIPS.idealCamber.rearInside);

  let topAction = null;
  if (!camberOk && front && optStaticCamber !== null) {
    topAction = { label: 'Set camber', value: `${optStaticCamber}° static` };
  } else if (!presOk && !isPresLimited) {
    topAction = { label: `${psiDir} cold PSI`, value: `${recCold} PSI` };
  }

  return (
    <div className="opt-corner-card">
      <div className="opt-corner-header">
        <div>
          <span className="opt-corner-pos">{c}</span>
          <span className="opt-corner-name">{CORNER_LABELS[c]}</span>
        </div>
        <Tooltip text={OVAL_TIPS.gripScore}>
          <div className="opt-corner-score" style={{ color: scoreColor(adjustableScore) }}>
            {pct(adjustableScore)}
          </div>
        </Tooltip>
      </div>

      <div className="opt-corner-meta">
        <Tooltip text={OVAL_TIPS.load}><span>{Math.round(load)} lbs</span></Tooltip>
        <Tooltip text={OVAL_TIPS.estTemp}><span>{Math.round(estimatedTemp)}°F est.</span></Tooltip>
        <Tooltip text={OVAL_TIPS.tempFactor}>
          <span style={{ color: scoreColor(tempFactor) }}>Temp {pct(tempFactor)}</span>
        </Tooltip>
      </div>

      {(balanceNote || (front && !toeOk)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 2px', fontSize: '0.78em' }}>
          {balanceNote && (
            <Tooltip text="Overall grip balance between front and rear axles. Push = front is the limit; Loose = rear is the limit. Adjust spring rates, ARB, or camber to rebalance.">
              <span style={{ color: balanceNote.color, fontFamily: 'monospace' }}>{balanceNote.text}</span>
            </Tooltip>
          )}
          {front && !toeOk && (
            <Tooltip text="Front toe-out adds understeer at corner entry. Reducing toe-out (toward 0) increases front grip and reduces drag. Current setting is outside the efficient range.">
              <span style={{ color: '#f59e0b', fontFamily: 'monospace' }}>Toe drag</span>
            </Tooltip>
          )}
        </div>
      )}

      {topAction && (
        <div className="opt-top-action">
          <span className="opt-top-action-label">{topAction.label}:</span>
          <span className="opt-top-action-value">{topAction.value}</span>
        </div>
      )}

      <div className="opt-factor-block opt-factor-block--compact">
        <Tooltip text={OVAL_TIPS.camberSection}>
          <div className="opt-factor-title">Camber</div>
        </Tooltip>

        {front ? (
          <>
            <StatusRow
              ok={camberOk}
              warn={alignmentOutOfRange}
              label="Ground camber"
              value={`${groundCamber !== null ? (groundCamber >= 0 ? '+' : '') + groundCamber.toFixed(2) : '—'}° (target ${idealGroundCamber !== undefined ? (idealGroundCamber >= 0 ? '+' : '') + idealGroundCamber.toFixed(1) : '—'}°)`}
              action={optStaticCamber !== null ? `Set static to ${optStaticCamber}°${alignmentOutOfRange ? ' ⚠ beyond ±4° camber bolt range' : ''}` : null}
              tip={idealTip}
            />
            {expanded && (
              <div className="opt-expanded-detail">
                <div className="opt-camber-math">
                  <Tooltip text={OVAL_TIPS.staticCamber}><span>{setup.camber[c]}° static</span></Tooltip>
                  <Tooltip text={OVAL_TIPS.casterGain}>
                    <span className="opt-math-op"> {dynamicGain >= 0 ? '+' : ''}{dynamicGain.toFixed(2)}° dynamic</span>
                  </Tooltip>
                  <Tooltip text={OVAL_TIPS.effectiveCamber}>
                    <span className="opt-math-eq"> = {effectiveCamber !== null ? effectiveCamber.toFixed(2) : '—'}° eff.</span>
                  </Tooltip>
                </div>
                <div className="opt-stat-pair" style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                  <Tooltip text={OVAL_TIPS.sidewallCamber}><span>↳ sidewall compliance</span></Tooltip>
                  <span>+{sidewallCamber !== undefined ? sidewallCamber.toFixed(2) : '—'}°</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <StatusRow
              ok={camberOk}
              label="Ground camber"
              value={`${groundCamber !== null ? (groundCamber >= 0 ? '+' : '') + groundCamber.toFixed(2) : '—'}° (target ${idealGroundCamber !== undefined ? (idealGroundCamber >= 0 ? '+' : '') + idealGroundCamber.toFixed(1) : '—'}°)`}
              tip="Rear solid axle — ground camber equals body roll angle at the corner apex."
            />
            {expanded && cornerRoll != null && (
              <div className="opt-expanded-detail">
                <div className="opt-camber-math" style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  <Tooltip text="Body roll angle at the corner apex.">
                    <span>Body roll at apex</span>
                  </Tooltip>
                  <span style={{ color: 'var(--text-primary)', marginLeft: 'auto' }}>{cornerRoll.toFixed(2)}°</span>
                </div>
                <div className="opt-camber-math" style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  <Tooltip text="Sidewall compliance camber: the tire sidewall deflects slightly outward under load.">
                    <span>↳ sidewall compliance</span>
                  </Tooltip>
                  <span style={{ marginLeft: 'auto' }}>+{sidewallCamber !== undefined ? sidewallCamber.toFixed(2) : '—'}°</span>
                </div>
                <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  To reduce: stiffen front or rear springs. Softer springs = more roll = more rear camber angle. No static adjustment possible on solid axle.
                </div>
              </div>
            )}
          </>
        )}
        <ScoreBar value={camberFactor} tip={OVAL_TIPS.camberScore} />
      </div>

      <div className="opt-factor-block opt-factor-block--compact">
        <Tooltip text={OVAL_TIPS.pressureSection}>
          <div className="opt-factor-title">Pressure</div>
        </Tooltip>
        <StatusRow
          ok={presOk || isPresLimited}
          label={`${setup.coldPsi[c]} cold → ${hp.toFixed(1)} hot`}
          value={isPresLimited ? 'load mismatch' : `opt ${recHotPsi.toFixed(1)} PSI hot`}
          action={!isPresLimited && !presOk ? `${psiDir} cold to ${recCold} PSI` : null}
          tip={isPresLimited ? OVAL_TIPS.loadMismatch : OVAL_TIPS.optimalHot}
          warn={isPresLimited}
        />
        <ScoreBar value={psiGripFactor} tip={OVAL_TIPS.presScore} />
      </div>

      <button className="opt-expand-toggle" onClick={() => setExpanded(e => !e)}>
        {expanded ? 'Less detail ▲' : 'More detail ▼'}
      </button>
    </div>
  );
}

// ── Figure 8 Corner Card ──────────────────────────────────────────────────────
function F8CornerCard({ c, data, setup }) {
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
        <Tooltip text={F8_TIPS.gripScore}>
          <div className="opt-corner-score" style={{ color: scoreColor(adjustableScore) }}>
            {pct(adjustableScore)}
          </div>
        </Tooltip>
      </div>

      <div className="opt-corner-meta">
        <Tooltip text={F8_TIPS.load}><span>{Math.round(load)} lbs avg</span></Tooltip>
        <Tooltip text={F8_TIPS.estTemp}><span>{Math.round(estimatedTemp)}°F est.</span></Tooltip>
        <Tooltip text={F8_TIPS.tempFactor}>
          <span style={{ color: scoreColor(tempFactor) }}>Temp {pct(tempFactor)}</span>
        </Tooltip>
      </div>

      <div className="opt-factor-block">
        <Tooltip text={F8_TIPS.camberSection}>
          <div className="opt-factor-title">Camber</div>
        </Tooltip>
        {front ? (
          <>
            <div className="opt-camber-math">
              <Tooltip text={F8_TIPS.staticCamber}><span>{setup.camber[c]}° static</span></Tooltip>
              <Tooltip text={F8_TIPS.casterGain}>
                <span className="opt-math-op"> {casterGain >= 0 ? '+' : ''}{casterGain.toFixed(2)}° avg caster</span>
              </Tooltip>
              <Tooltip text={F8_TIPS.effectiveCamber}>
                <span className="opt-math-eq"> = {effectiveCamber.toFixed(2)}° avg eff.</span>
              </Tooltip>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={F8_TIPS.idealCamber}><span>Ideal avg effective</span></Tooltip>
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
              <Tooltip text={F8_TIPS.effectiveCamber}><span>Avg dynamic (both turns)</span></Tooltip>
              <span>{effectiveCamber.toFixed(2)}°</span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={F8_TIPS.rearCamber}><span>Ideal</span></Tooltip>
              <span>0.00°</span>
            </div>
            <Tooltip text={F8_TIPS.solidAxle}>
              <div className="opt-limited-note">Solid axle — roll averages to ~0° in figure 8</div>
            </Tooltip>
          </>
        )}
        <ScoreBar value={camberFactor} label="Camber score" tip={F8_TIPS.camberScore} />
      </div>

      <div className="opt-factor-block">
        <Tooltip text={F8_TIPS.pressureSection}>
          <div className="opt-factor-title">Pressure</div>
        </Tooltip>
        <div className="opt-stat-pair">
          <Tooltip text={F8_TIPS.coldHot}><span>Cold → Hot</span></Tooltip>
          <span>{setup.coldPsi[c]} → {hp.toFixed(1)} PSI</span>
        </div>
        <div className="opt-stat-pair">
          <Tooltip text={isPresLimited ? F8_TIPS.loadMismatch : F8_TIPS.optimalHot}>
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
        <ScoreBar value={psiGripFactor} label="Pressure score" tip={F8_TIPS.presScore} />
      </div>
    </div>
  );
}

// ── Shared Setup Form ─────────────────────────────────────────────────────────
function CompactSetupForm({ setup, onChange, isF8 }) {
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

          <div className="opt-form-label" style={{ marginTop: 12 }}>
            Front Spring Rates
            {isF8 && <span className="opt-form-hint"> Symmetric recommended</span>}
          </div>
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

          {isF8 && (
            <>
              <div className="opt-form-label" style={{ marginTop: 12 }}>Rear Spring Rate</div>
              <div className="opt-form-field">
                <label>LR/RR</label>
                <select
                  className="opt-select"
                  value={setup.springs.LR ?? 160}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    const s = deepClone(setup);
                    s.springs.LR = val; s.springs.RR = val;
                    onChange(s);
                  }}
                >
                  {REAR_SPRING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="opt-form-col">
          <div className="opt-form-label">
            Camber (°)
            {isF8 && <span className="opt-form-hint"> Symmetric recommended</span>}
          </div>
          {['LF', 'RF'].map(c => (
            <div key={c} className="opt-form-field">
              <label>{c}</label>
              <NumericInput step="0.25" className="opt-input"
                value={setup.camber[c]}
                onChange={num => update(`camber.${c}`, num)}
              />
            </div>
          ))}

          <div className="opt-form-label" style={{ marginTop: 12 }}>
            Caster (°)
            {isF8 && <span className="opt-form-hint"> Symmetric recommended</span>}
          </div>
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
          <div className="opt-form-label">
            Cold Pressures (PSI)
            {isF8 && <span className="opt-form-hint"> Symmetric recommended</span>}
          </div>
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

// ── Main Optimizer ────────────────────────────────────────────────────────────
export default function SetupOptimizer({ setup, setSetup, ambient, setAmbient, inflationTemp, setInflationTemp }) {
  const [mode, setMode] = useState('oval'); // 'oval' | 'f8'
  const isF8 = mode === 'f8';

  const { geometry: geoProfiles = [] } = useSync();
  const [selectedGeoId, setSelectedGeoId] = useState(null);
  const selectedGeo = selectedGeoId != null ? geoProfiles.find(g => g.id === selectedGeoId) : null;
  const geoOverrides = useMemo(() => buildGeoOverrides(selectedGeo), [selectedGeo]);

  const TARGET    = isF8 ? F8_TARGET    : OVAL_TARGET;
  const RANGE_MIN = isF8 ? F8_RANGE_MIN : OVAL_RANGE_MIN;
  const RANGE_MAX = isF8 ? F8_RANGE_MAX : OVAL_RANGE_MAX;

  const loadSetupFromGeo = () => {
    if (!selectedGeo) return;
    const s = deepClone(setup);
    if (selectedGeo.camber?.LF !== '' && selectedGeo.camber?.LF != null) s.camber.LF = parseFloat(selectedGeo.camber.LF);
    if (selectedGeo.camber?.RF !== '' && selectedGeo.camber?.RF != null) s.camber.RF = parseFloat(selectedGeo.camber.RF);
    if (selectedGeo.caster?.LF !== '' && selectedGeo.caster?.LF != null) s.caster.LF = parseFloat(selectedGeo.caster.LF);
    if (selectedGeo.caster?.RF !== '' && selectedGeo.caster?.RF != null) s.caster.RF = parseFloat(selectedGeo.caster.RF);
    if (selectedGeo.toe !== '' && selectedGeo.toe != null) s.toe = parseFloat(selectedGeo.toe);
    if (selectedGeo.springRate?.LF !== '' && selectedGeo.springRate?.LF != null) s.springs.LF = parseFloat(selectedGeo.springRate.LF);
    if (selectedGeo.springRate?.RF !== '' && selectedGeo.springRate?.RF != null) s.springs.RF = parseFloat(selectedGeo.springRate.RF);
    const rearRate = selectedGeo.springRate?.LR ?? selectedGeo.springRate?.RR;
    if (rearRate !== '' && rearRate != null) { s.springs.LR = parseFloat(rearRate); s.springs.RR = parseFloat(rearRate); }
    ['LF', 'RF', 'LR', 'RR'].forEach(corner => {
      const label = selectedGeo.shocks?.[corner];
      if (!label) return;
      const isFront = corner === 'LF' || corner === 'RF';
      const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
      const found = list.find(sh => shockLabel(sh) === label);
      if (found?.rating != null) s.shocks[corner] = found.rating;
    });
    setSetup(s);
  };

  const ovalAnalysis = useMemo(
    () => !isF8 ? analyzeSetup(setup, ambient, inflationTemp, geoOverrides) : null,
    [isF8, setup, ambient, inflationTemp, geoOverrides]
  );
  const f8Analysis = useMemo(
    () => isF8 ? analyzeSetupF8(setup, ambient, inflationTemp, geoOverrides) : null,
    [isF8, setup, ambient, inflationTemp, geoOverrides]
  );

  const analysis = isF8 ? f8Analysis : ovalAnalysis;
  const {
    corners, ss, roll, frontGripPct, balancePenalty,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain, recs,
  } = analysis;

  // Oval-only fields
  const desiredRollFront    = !isF8 ? ovalAnalysis?.desiredRollFront    : null;
  const desiredRollRear     = !isF8 ? ovalAnalysis?.desiredRollRear     : null;
  const rollAngleImbalance  = !isF8 ? ovalAnalysis?.rollAngleImbalance  : null;
  const imbalance           = isF8  ? f8Analysis?.imbalance             : null;

  const gap    = lapTime - TARGET;
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

  const progressTicks = isF8
    ? [{ label: '23.8', t: 23.8 }, { label: '23.5', t: 23.5 }, { label: '23.1★', t: 23.1, star: true }]
    : [{ label: '17.8', t: 17.8 }, { label: '17.4', t: 17.4 }, { label: '17.1★', t: 17.1, star: true }];

  const TIPS = isF8 ? F8_TIPS : OVAL_TIPS;

  return (
    <div className="opt-page">

      {/* ── Mode selector ── */}
      <div className="opt-mode-selector">
        <span className="opt-mode-label">Track Type:</span>
        <div className="opt-mode-toggle">
          <button
            className={`opt-mode-btn${!isF8 ? ' active' : ''}`}
            onClick={() => setMode('oval')}
          >
            Oval
          </button>
          <button
            className={`opt-mode-btn${isF8 ? ' active' : ''}`}
            onClick={() => setMode('f8')}
          >
            Figure 8
          </button>
        </div>
      </div>

      {/* ── Geometry profile selector ── */}
      {geoProfiles.length > 0 && (
        <div className="opt-geo-selector">
          <label className="opt-geo-label">Car geometry profile:</label>
          <select
            className="opt-geo-select"
            value={selectedGeoId ?? ''}
            onChange={e => setSelectedGeoId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Model default (hardcoded P71 estimates)</option>
            {geoProfiles.map(g => (
              <option key={g.id} value={g.id}>{g.title || `Profile ${g.id}`}</option>
            ))}
          </select>
          {selectedGeo && (
            <>
              <button
                className="opt-geo-load-btn"
                onClick={loadSetupFromGeo}
                title="Copy camber, caster, toe, spring rates, and shocks from this geometry profile into the setup parameters below"
              >
                Load setup from profile
              </button>
              <span className="opt-geo-note">
                Using measured: RCH {selectedGeo.rearRollCenter ? `rear ${selectedGeo.rearRollCenter}"` : ''}
                {geoOverrides?.rcHeightFront != null ? ` · front ${geoOverrides.rcHeightFront.toFixed(1)}"` : ''}
                {geoOverrides?.slaJounceCoeffRF != null ? ` · jounce RF ${geoOverrides.slaJounceCoeffRF.toFixed(3)}°/°` : ''}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="opt-header">
        <div>
          <h2>Setup Optimizer</h2>
          <p className="opt-subtitle">
            {isF8
              ? 'Real-time analysis calibrated for bidirectional loading. Goal: break 23.1s.'
              : 'Real-time analysis — every parameter recalculates instantly as you adjust.'}
          </p>
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
              color: gap <= 0 ? 'var(--green)' : gap < (isF8 ? 0.3 : 0.2) ? 'var(--yellow)' : 'var(--red)',
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
          {progressTicks.map(({ label, t, star }) => (
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
          {isF8 ? (
            <>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DEFAULT_SETUP_F8))}>F8 Default</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(F8_BASELINE_SETUP))}>F8 Baseline</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(PETE_SETUP))}>Pete</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DYLAN_SETUP))}>Dylan</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(JOSH_SETUP))}>Josh</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(JOEY_SETUP))}>Joey</button>
            </>
          ) : (
            <>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DEFAULT_SETUP))}>Load Current Setup</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(PETE_SETUP))}>Load Pete</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(DYLAN_SETUP))}>Load Dylan</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(JOSH_SETUP))}>Load Josh</button>
              <button className="sim-preset-btn" onClick={() => setSetup(deepClone(JOEY_SETUP))}>Load Joey</button>
              <button className="sim-preset-btn accent" onClick={() => setSetup(deepClone(RECOMMENDED_SETUP))}>Load Recommended Setup</button>
            </>
          )}
        </div>
      </div>

      {/* ── Setup form ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Setup Parameters</h3>
        <CompactSetupForm setup={setup} onChange={setSetup} isF8={isF8} />
      </div>

      {/* ── Camber Calculator (oval only) ── */}
      {!isF8 && (
        <div className="opt-section">
          <h3 className="opt-section-title">Camber Calculator</h3>
          <CamberCalc roll={roll} setupCaster={setup.caster} geoOverrides={geoOverrides} />
        </div>
      )}

      {/* ── Per-corner analysis ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">
          Per-Corner Analysis
          <span className="opt-section-sub">
            {isF8 ? 'Loads and temps averaged across left and right turns' : 'Temperatures estimated at steady-state equilibrium'}
          </span>
        </h3>
        <div className="opt-corners-grid">
          {isF8
            ? CORNERS.map(c => <F8CornerCard key={c} c={c} data={corners[c]} setup={setup} />)
            : CORNERS.map(c => <OvalCornerCard key={c} c={c} data={corners[c]} setup={setup} frontGripPct={frontGripPct} />)
          }
        </div>
      </div>

      {/* ── Balance & Toe ── */}
      <div className="opt-section">
        <h3 className="opt-section-title">Balance & Toe</h3>
        {isF8
          ? <BalanceGaugeF8 frontGripPct={frontGripPct} frontLLTD={ss.frontLLTD} springLLTD={ss.springLLTD} corners={corners} setup={setup} />
          : <BalanceGauge   frontGripPct={frontGripPct} frontLLTD={ss.frontLLTD} springLLTD={ss.springLLTD} corners={corners} setup={setup} />
        }
        <div className="opt-balance-row" style={{ marginTop: 14 }}>
          <div className="opt-balance-card">
            <div className="opt-factor-title">Lateral Balance{!isF8 ? ' (at 1G)' : ''}</div>
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
              <span style={{ color: Math.abs(frontGripPct - 0.55) < (isF8 ? 0.01 : 0.04) ? 'var(--green)' : 'var(--yellow)' }}>
                {(frontGripPct * 100).toFixed(1)}% <span className="opt-stat-ideal">(ideal 55%)</span>
              </span>
            </div>
            <div className="opt-stat-pair">
              <Tooltip text={TIPS.bodyRoll}><span>{isF8 ? 'Peak body roll @ 1G' : 'Body roll @ 1G'}</span></Tooltip>
              <span>{roll.toFixed(1)}°</span>
            </div>

            {/* Roll angle balance — oval only */}
            {!isF8 && desiredRollFront != null && (
              <div className="opt-roll-balance">
                <Tooltip text={OVAL_TIPS.rollAngleBalance}>
                  <span className="opt-factor-title" style={{ fontSize: '0.78rem', marginBottom: 4, display: 'block' }}>Roll Angle Balance</span>
                </Tooltip>
                <div className="opt-stat-pair">
                  <Tooltip text="How much roll the front suspension wants to reach at steady-state cornering.">
                    <span>Front desired roll</span>
                  </Tooltip>
                  <span>{desiredRollFront.toFixed(2)}°</span>
                </div>
                <div className="opt-stat-pair">
                  <Tooltip text="How much roll the rear suspension wants to reach at steady-state cornering.">
                    <span>Rear desired roll</span>
                  </Tooltip>
                  <span>{desiredRollRear.toFixed(2)}°</span>
                </div>
                <div className="opt-stat-pair">
                  <Tooltip text={
                    rollAngleImbalance < 1.0
                      ? 'Front and rear are well-matched — both ends want to roll to nearly the same angle.'
                      : rollAngleImbalance < 2.0
                        ? (desiredRollFront > desiredRollRear
                            ? 'Front wants to roll more than rear — front-end push tendency.'
                            : 'Rear wants to roll more than front — loose tendency.')
                        : (desiredRollFront > desiredRollRear
                            ? 'Significant imbalance — front rolls much more than rear. Severe push.'
                            : 'Significant imbalance — rear rolls much more than front. Chronic loose condition.')
                  }>
                    <span>Imbalance</span>
                  </Tooltip>
                  <span style={{
                    color: rollAngleImbalance < 1.0 ? 'var(--green)' : rollAngleImbalance < 2.0 ? 'var(--yellow)' : 'var(--red)',
                    fontWeight: 600,
                  }}>
                    {rollAngleImbalance.toFixed(2)}°
                    {rollAngleImbalance < 1.0 ? ' ✓' : rollAngleImbalance < 2.0 ? ' !' : ' ✗'}
                  </span>
                </div>
              </div>
            )}

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
                +{((toeDrag - 1) * 100).toFixed(isF8 ? 3 : 2)}%
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
        {isF8 ? (
          <><strong>Model note:</strong> Figure 8 analysis averages left and right turn loads — symmetric setup
          (equal camber, equal pressures side-to-side) is expected to be optimal. Camber ideal is −2.25°
          for both fronts (average of outside −4.5° and inside 0° demands). Always verify with real pyrometer data.</>
        ) : (
          <><strong>Model note:</strong> Analysis uses steady-state equilibrium temperatures.
          Camber recommendations use caster-induced dynamic camber gain of 0.136°/° (RF) and 0.034°/° (LF) — calibrated
          at 20° steer and scaled to the actual oval apex steer angle of 3.77°. Pyrometer-validated April 2026.
          All display scores match the lap time model exactly. Always verify camber with real pyrometer data.</>
        )}
      </div>
    </div>
  );
}
