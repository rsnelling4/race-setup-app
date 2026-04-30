import { useState, useEffect, useCallback } from 'react';
import { analyzeSetup } from '../utils/raceSimulation';
import { handlingConditions, cornerPhases, analyzeFullCar, getHandlingRecommendations, formatPosition } from '../utils/tireAnalysis';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import { computeGeometry } from './GeometryVisualizer';
import { useSync } from '../utils/SyncContext';

// ─── Storage keys ─────────────────────────────────────────────────────────────
const APIKEY_KEY = 'race_groq_api_key';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dc(o) { return JSON.parse(JSON.stringify(o)); }

// ─── Empty templates ──────────────────────────────────────────────────────────
const EMPTY_SESSION = {
  id: null,
  name: '',
  carProfileId: null,   // ← per-session car profile
  ambient: '',
  inflationTemp: '',
  setup: null,
  hotPsi:    { LF: '', RF: '', LR: '', RR: '' },
  tireTemps: {
    LF: { inside: '', middle: '', outside: '' },
    RF: { inside: '', middle: '', outside: '' },
    LR: { inside: '', middle: '', outside: '' },
    RR: { inside: '', middle: '', outside: '' },
  },
  condition: '',
  phase: '',
  lapNotes: '',
};

const EMPTY_EVENT = {
  id: null,
  name: '',
  date: new Date().toISOString().slice(0, 10),
  track: '',
  sessions: [],
};

function blankSetup() {
  return dc({
    shocks:  { LF: 4, RF: 4, LR: 2, RR: 2 },
    springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
    camber:  { LF: 2.75, RF: -2.25 },
    caster:  { LF: 9.0, RF: 3.0 },
    toe:     -0.25,
    coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shockLabelToRating(label, isFront) {
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  const found = list.find(s => shockLabel(s) === label);
  return found ? found.rating : 4;
}

// Returns current shock ratings for a session's setup (0=stiffest, 10=softest)
function sessionShockRatings(session) {
  const s = session.setup ?? blankSetup();
  const ratings = {};
  for (const corner of ['LF', 'RF', 'LR', 'RR']) {
    const val = s.shocks[corner];
    ratings[corner] = (typeof val === 'string' && val.includes('|'))
      ? shockLabelToRating(val, corner === 'LF' || corner === 'RF')
      : Number(val) ?? 4;
  }
  return ratings;
}

// Annotates handling changes with "already at limit" if the shock is maxed out.
// component names containing a corner code (RF, LR, etc.) are checked.
function annotateShockLimits(changes, shockRatings) {
  return changes.map(ch => {
    const isStiffen = /stiffen/i.test(ch.adjustment);
    const isSoften  = /soften/i.test(ch.adjustment);
    if (!isStiffen && !isSoften) return ch;

    // Find which corner this change targets
    const corner = ['RF', 'LF', 'RR', 'LR'].find(c => ch.component.includes(c));
    if (!corner || shockRatings[corner] == null) return ch;

    const rating = shockRatings[corner];
    const isFront = corner === 'LF' || corner === 'RF';
    const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
    const minRating = Math.min(...list.map(s => s.rating)); // stiffest available
    const maxRating = Math.max(...list.map(s => s.rating)); // softest available

    if (isStiffen && rating <= minRating) {
      return { ...ch, atLimit: true, limitNote: `already at stiffest available option (rating ${rating})` };
    }
    if (isSoften && rating >= maxRating) {
      return { ...ch, atLimit: true, limitNote: `already at softest available option (rating ${rating})` };
    }
    return ch;
  });
}

function sessionToSimSetup(session) {
  const s = session.setup ?? blankSetup();
  const shocks = {};
  for (const corner of ['LF', 'RF', 'LR', 'RR']) {
    const val = s.shocks[corner];
    shocks[corner] = (typeof val === 'string' && val.includes('|'))
      ? shockLabelToRating(val, corner === 'LF' || corner === 'RF')
      : (val != null && val !== '' ? Number(val) : 4);
  }
  return {
    shocks,
    springs: { LF: Number(s.springs?.LF) || 475, RF: Number(s.springs?.RF) || 475, LR: 160, RR: 160 },
    camber:  { LF: Number(s.camber?.LF) || 0, RF: Number(s.camber?.RF) || 0 },
    caster:  { LF: Number(s.caster?.LF) || 5, RF: Number(s.caster?.RF) || 5 },
    toe:     Number(s.toe) || -0.25,
    coldPsi: {
      LF: Number(s.coldPsi?.LF) || 20, RF: Number(s.coldPsi?.RF) || 38,
      LR: Number(s.coldPsi?.LR) || 16, RR: Number(s.coldPsi?.RR) || 35,
    },
  };
}

function carLabel(session, geoProfiles) {
  if (!session.carProfileId) return 'Model default (P71)';
  const geo = geoProfiles.find(g => g.id === session.carProfileId);
  return geo ? (geo.title || 'Unnamed car') : 'Model default (P71)';
}

// ─── Geometry overrides ───────────────────────────────────────────────────────
// Derives geoOverrides from a stored geometry profile for use in analyzeSetup().
// Returns null if no geo profile or if required hardpoints are missing.
// Jounce coefficient formula: camberGain (°/in) × wheelDisplacement (in/°roll)
//   camberGain = 57.3 / fvsa  (degrees per inch of wheel travel — SLA geometry)
//   wheelDisp  = 0.383 in/°  (derived from 13.6" wheel radius: sin(1°) × 13.6" ≈ 0.237"
//                              actual measured: 1.7" at 3.1° roll ÷ 2 = 0.548" / 3.1° ≈ 0.177"
//                              per-degree-roll ≈ 0.383 / 2 = 0.19" — using empirical 0.383)
// If fvsa is not computable (missing hardpoints), falls back to calibrated defaults.
function buildGeoOverrides(geo) {
  if (!geo) return null;
  const overrides = {};

  // Front track width
  if (geo.trackWidth?.front) overrides.trackWidthFront = Number(geo.trackWidth.front);

  // Rear roll center (Watts pivot height)
  if (geo.rearRollCenter) overrides.rcHeightRear = Number(geo.rearRollCenter);

  // Rear spring base width
  if (geo.rearSpringBase) overrides.rearSpringBase = Number(geo.rearSpringBase);

  // Front roll center height — computed from SLA hardpoints via computeGeometry()
  const rf = computeGeometry(geo, 'RF');
  const lf = computeGeometry(geo, 'LF');
  if (rf?.rcHeight != null && lf?.rcHeight != null) {
    overrides.rcHeightFront = (rf.rcHeight + lf.rcHeight) / 2;
  } else if (rf?.rcHeight != null) {
    overrides.rcHeightFront = rf.rcHeight;
  } else if (lf?.rcHeight != null) {
    overrides.rcHeightFront = lf.rcHeight;
  }

  // IC lateral position — average of RF and LF (distance from centerline, inches)
  if (rf?.ic?.x != null && lf?.ic?.x != null) {
    overrides.icLateralFront = (Math.abs(rf.ic.x) + Math.abs(lf.ic.x)) / 2;
  } else if (rf?.ic?.x != null) {
    overrides.icLateralFront = Math.abs(rf.ic.x);
  } else if (lf?.ic?.x != null) {
    overrides.icLateralFront = Math.abs(lf.ic.x);
  }

  // SLA jounce/droop coefficients from FVSA
  // Wheel displacement per degree of roll: empirically measured at 0.383 in/°
  const wheelDispPerDegRoll = 0.383;
  if (rf?.fvsa != null && rf.fvsa > 0) {
    overrides.slaJounceCoeffRF = (57.3 / rf.fvsa) * wheelDispPerDegRoll;
  }
  if (lf?.fvsa != null && lf.fvsa > 0) {
    overrides.slaDroopCoeffLF = (57.3 / lf.fvsa) * wheelDispPerDegRoll;
  }

  return Object.keys(overrides).length > 0 ? overrides : null;
}

// ─── Physics-derived prediction (no AI — pure geometry/math) ─────────────────
// Returns a plain-English prediction of what the car should be doing based solely
// on the setup inputs and physics model output. Driver confirms or overrides this
// before the AI analysis runs, so the AI knows whether the model matched reality.
function buildPrediction(session, physics) {
  if (!physics) return null;
  const c = physics.corners;
  const rf = c?.RF;
  const lf = c?.LF;
  const rr = c?.RR;
  const lr = c?.LR;

  const lines = [];

  // ── RF camber chain ──────────────────────────────────────────────────────
  if (rf?.groundCamber != null) {
    const gc = rf.groundCamber;
    const ideal = rf.idealGroundCamber ?? -2.0;
    const dev = gc - ideal; // positive = more positive (insufficient neg camber)
    if (dev > 0.25) {
      lines.push(`RF contact patch: ground camber is ${gc.toFixed(2)}° vs ideal ${ideal.toFixed(1)}°. ` +
        `The outside (wall-side) edge is carrying more load than ideal — ` +
        `expect the RF outside tread zone to be ${Math.round(dev * 8)}–${Math.round(dev * 14)}°F hotter than the inside edge.`);
    } else if (dev < -0.25) {
      lines.push(`RF contact patch: ground camber is ${gc.toFixed(2)}° vs ideal ${ideal.toFixed(1)}°. ` +
        `The inside edge is overloaded — ` +
        `expect the RF inside tread zone to be ${Math.round(Math.abs(dev) * 6)}–${Math.round(Math.abs(dev) * 12)}°F hotter than the outside edge.`);
    } else {
      lines.push(`RF contact patch: ground camber ${gc.toFixed(2)}° is within 0.25° of ideal (${ideal.toFixed(1)}°). ` +
        `Temperature spread across the RF tread should be relatively even (under 10°F I-to-O difference).`);
    }
  }

  // ── RF pressure ──────────────────────────────────────────────────────────
  if (rf?.hp != null && rf?.optHotPsi != null) {
    const psiDev = rf.hp - rf.optHotPsi;
    const gripLoss = Math.abs(psiDev) * 0.6;
    if (Math.abs(psiDev) > 1.5) {
      const dir = psiDev > 0 ? 'over-inflated' : 'under-inflated';
      const effect = psiDev > 0
        ? 'contact patch center bulges and overheats; tread middle will be hotter than edges'
        : 'contact patch edges carry more load; tread edges will be hotter than middle';
      lines.push(`RF pressure: running ${rf.hp.toFixed(1)} PSI hot vs load-optimal ${rf.optHotPsi.toFixed(1)} PSI ` +
        `(${Math.abs(psiDev).toFixed(1)} PSI ${psiDev > 0 ? 'high' : 'low'}, ~${gripLoss.toFixed(1)}% grip penalty). ` +
        `${dir.charAt(0).toUpperCase() + dir.slice(1)}: ${effect}.`);
    } else {
      lines.push(`RF pressure: ${rf.hp.toFixed(1)} PSI hot is within 1.5 PSI of load-optimal (${rf.optHotPsi.toFixed(1)} PSI). ` +
        `Pressure should not be a limiting factor at the RF this session.`);
    }
  }

  // ── LLTD / handling prediction ───────────────────────────────────────────
  const frontLLTD = physics.ss?.frontLLTD;
  if (frontLLTD != null) {
    const target = 0.46;
    const dev = frontLLTD - target;
    if (dev > 0.04) {
      lines.push(`Front LLTD is ${(frontLLTD * 100).toFixed(1)}% (target 46%). ` +
        `Front is carrying more load transfer than the rear — ` +
        `this geometry biases the car toward understeer/push in the center of the corner.`);
    } else if (dev < -0.04) {
      lines.push(`Front LLTD is ${(frontLLTD * 100).toFixed(1)}% (target 46%). ` +
        `Rear is carrying disproportionate load transfer — ` +
        `this geometry biases the car toward oversteer/loose behavior, especially on exit.`);
    } else {
      lines.push(`Front LLTD is ${(frontLLTD * 100).toFixed(1)}% (target 46%). ` +
        `Load transfer balance is near target — neutral handling bias from LLTD alone.`);
    }
  }

  // ── RF vs RR pressure spread (push indicator) ────────────────────────────
  if (rf?.hp != null && rr?.hp != null) {
    const spread = rf.hp - rr.hp;
    if (spread >= 10) {
      lines.push(`RF-to-RR hot PSI spread is ${spread.toFixed(1)} PSI (${rf.hp.toFixed(1)} vs ${rr.hp.toFixed(1)}). ` +
        `A spread ≥ 10 PSI stiffens the RF contact patch relative to the RR — ` +
        `front dominates, which adds to push/understeer in the middle of the corner.`);
    }
  }

  // ── LR pressure floor ────────────────────────────────────────────────────
  if (lr?.hp != null && lr.hp < 18) {
    lines.push(`LR hot PSI is ${lr.hp.toFixed(1)} — below the 18 PSI safety floor. ` +
      `Expect abnormal wear on the LR inside shoulder and potential handling instability under throttle.`);
  }

  // ── Overall grip estimate ────────────────────────────────────────────────
  const gripScores = ['RF', 'LF', 'RR', 'LR'].map(p => c?.[p]?.adjustableScore).filter(v => v != null);
  if (gripScores.length === 4) {
    const rfGrip = c.RF.adjustableScore * 100;
    const avgGrip = (gripScores.reduce((a, b) => a + b, 0) / gripScores.length) * 100;
    lines.push(`Predicted grip: RF at ${rfGrip.toFixed(1)}%, car average ${avgGrip.toFixed(1)}%. ` +
      `The RF is the primary loaded corner — it limits overall lap performance.`);
  }

  // ── Handling summary sentence ────────────────────────────────────────────
  if (frontLLTD != null && rf?.groundCamber != null) {
    const lltdDev = frontLLTD - 0.46;
    const rfCamberDev = rf.groundCamber - (rf.idealGroundCamber ?? -2.0);
    let summary = '';
    if (rfCamberDev > 0.3 && lltdDev > 0.03) {
      summary = 'Geometry prediction: push/understeer, most likely felt in the center of the corner. RF is both under-cambered and carrying excess load transfer.';
    } else if (rfCamberDev > 0.3) {
      summary = 'Geometry prediction: RF is under-cambered. The handling may feel like a front-end push as the RF outside edge slides rather than grips.';
    } else if (rfCamberDev < -0.3) {
      summary = 'Geometry prediction: RF is over-cambered. The car may feel stable in the corner but RF grip will fall off as the inside edge overheats.';
    } else if (lltdDev > 0.04) {
      summary = 'Geometry prediction: front-biased load transfer (push tendency). RF camber is near ideal so handling character depends on the driver sensitivity to front LLTD.';
    } else if (lltdDev < -0.04) {
      summary = 'Geometry prediction: rear-biased load transfer (loose/oversteer tendency). Evaluate whether driver reports exit looseness.';
    } else {
      summary = 'Geometry prediction: setup is near targets — no strong handling bias predicted from camber or LLTD alone.';
    }
    lines.push(summary);
  }

  return lines;
}

// ─── AI prompt ────────────────────────────────────────────────────────────────
function buildPrompt(event, selectedSessions, geoProfiles, confirmations) {
  const lines = [
    `You are a race car setup engineer specializing in the 2008 Ford Crown Victoria P71 on a left-turn oval.`,
    `Analyze the session data below with the depth of a crew chief who knows this car's physics chain cold.`,
    ``,
    `CAR PHYSICS (use these to interpret data and explain recommendations):`,
    `  Weight: 3700 lbs. Tire: Ironman iMove Gen3 AS 235/55R17 103V XL. Left-turn oval.`,
    `  RF is the primary loaded corner — it carries the most load, runs the hottest, and has the most grip to gain or lose.`,
    ``,
    `  CAMBER CHAIN (RF ground camber = what the tire actually sees at the contact patch):`,
    `    Ground camber = static + caster gain + body roll (SLA jounce) + KPI + roll-frame + sidewall compliance`,
    `    Caster gain (RF): −0.136°/° of caster at actual oval apex steer (3.77°). At 6° caster = −0.82°; at 8.5° = −1.15°.`,
    `    CRITICAL: caster camber gain is tiny on a short oval. Steer angle is only 3.77° (Ackermann at 145 ft radius).`,
    `    The old coefficient (0.667°/°) was calibrated at 20° steer — wrong for this track. Pyrometer-validated April 2026.`,
    `    Body roll (RF): −0.355°/° of roll (SLA jounce, measured).`,
    `    KPI (RF): +0.02° at apex steer (negligible at 3.77° steer).`,
    `    Sidewall compliance: +0.000342°/lb load — at RF ~1400 lbs = +0.48° positive camber added (always works against you).`,
    `    Roll frame conversion (RF outside): adds body roll angle to convert chassis→ground frame.`,
    `    Model ideal ground camber for RF: −2.0°. Every degree short of that costs ~1.75% grip (load-weighted).`,
    `    Over-camber penalty: ~1.0%/° (less severe than insufficient camber).`,
    `    Both April 2026 sessions: RF outside edge hotter = insufficient camber. Ground camber was −1.3° to −1.4°, not −2.0°.`,
    `    Fix is more static negative camber, NOT more caster. Caster contributes almost nothing at this oval.`,
    ``,
    `  CASTER — two independent effects on RF grip:`,
    `    1. Camber gain: only 0.136°/° on this short oval (3.77° apex steer). Nearly negligible.`,
    `       All camber must come from static. Target static ≈ −3.25° to −3.5° RF with typical 6–8° caster.`,
    `    2. Mechanical trail: trail = tire_radius × sin(caster) − scrub × cos(caster).`,
    `       Optimal trail ≈ 0.9". At 5.5° caster = 0.97" (near peak). At 8.5° = 1.49" (above peak, −1.9% workload penalty).`,
    `       Above 1.5" trail the steering effort penalty exceeds the camber benefit at oval speeds.`,
    ``,
    `  PRESSURE — load-proportional optimal: optHotPsi = 30 × (cornerLoad / avgLoad).`,
    `    avgLoad = 925 lbs (3700/4). RF corner load ~1400 lbs → opt ~45 PSI hot.`,
    `    Penalty: 0.6% grip per PSI off optimal. Over-pressure also heats tread center → compounds on next lap.`,
    `    Right-side spread: if RF hot PSI is 10+ PSI above RR hot PSI, RF contact patch stiffens relative to RR`,
    `    and the front dominates — causes push/understeer. Flag this if you see it.`,
    `    LR FLOOR: never recommend below 16 PSI cold / ~18 PSI hot on the left rear.`,
    ``,
    `  SHOCK SCALE — CRITICAL: Click 0 = STIFFEST. Click 10 = SOFTEST. Higher number = softer damping.`,
    `    "Stiffen" means lower click number (e.g. Click 4 → Click 2). "Soften" means higher click number (e.g. Click 4 → Click 6).`,
    `    NEVER say "increase click number" to mean stiffer — that is wrong. Lower number = more damping force.`,
    ``,
    `  SHOCK STIFFNESS → LLTD → RF LOAD:`,
    `    Front LLTD target: 46% (oval). Stiffer RF shock (lower click) raises front LLTD → more RF load.`,
    `    More RF load → higher optimal PSI → if pressure not adjusted, RF runs under-optimal.`,
    `    Stiffer RF shock also reduces body roll → less SLA jounce camber gain → RF runs more positive ground camber.`,
    `    RF shock rebound: stiffer (lower click) = front stays loaded longer on exit = more steering authority under throttle.`,
    ``,
    `  PYROMETER INTERPRETATION:`,
    `    Inside/Middle/Outside zones. RF outside (wall side) expected hotter — centrifugal load is normal.`,
    `    RF inside much hotter than outside = too much negative camber (over-cambered).`,
    `    RF outside much hotter than inside = insufficient camber (contact patch tilted away).`,
    `    Middle hotter than both edges = over-inflated. Edges hotter than middle = under-inflated.`,
    `    Temperature spread across RF I/M/O > 20°F = contact patch not fully loaded — investigate camber + pressure.`,
    ``,
    `  COLD vs HOT PSI: cold = set in garage. Hot = measured after session. Rise: left +2, right +4 to +6 PSI typical.`,
    `  Physics model "opt" PSI = load-derived target. Compare measured hot PSI to opt to determine direction.`,
    `  All setup values shown are WHAT WAS RUN — not assumed to be optimal.`,
    ``,
    `EVENT: ${event.name}  |  Date: ${event.date}  |  Track: ${event.track || 'not specified'}`,
    ``,
  ];

  selectedSessions.forEach((session, idx) => {
    const geo = session.carProfileId ? geoProfiles.find(g => g.id === session.carProfileId) : null;
    const carName = carLabel(session, geoProfiles);
    const simSetup = sessionToSimSetup(session);
    const ambient = Number(session.ambient) || 65;
    const inflation = Number(session.inflationTemp) || 68;
    let physics = null;
    const geoOverrides = buildGeoOverrides(geo);
    try { physics = analyzeSetup(simSetup, ambient, inflation, geoOverrides); } catch { /* ignore */ }
    const conf = confirmations?.[session.id];

    lines.push(`${'─'.repeat(60)}`);
    lines.push(`SESSION ${idx + 1}: ${session.name || `Practice ${idx + 1}`}  |  Car: ${carName}`);
    lines.push(`  Ambient: ${session.ambient || '—'}°F  |  Tires set at: ${session.inflationTemp || '—'}°F`);
    lines.push(``);

    if (geo) {
      lines.push(`  GEOMETRY (${geo.title}):`);
      lines.push(`    Track width: front ${geo.trackWidth?.front || '—'}"  rear ${geo.trackWidth?.rear || '—'}"`);
      lines.push(`    Rear roll center (Watts pivot): ${geo.rearRollCenter || '—'}"`);
      lines.push(`    Front SLA: lower BJ LF ${geo.lowerBallJoint?.LF || '—'}"  RF ${geo.lowerBallJoint?.RF || '—'}"`);
      lines.push(`               upper BJ LF ${geo.upperBallJoint?.LF || '—'}"  RF ${geo.upperBallJoint?.RF || '—'}"`);
      lines.push(`               arm pivot LF ${geo.lowerArmPivot?.LF || '—'}"  RF ${geo.lowerArmPivot?.RF || '—'}"`);
      lines.push(`               wheel center height ${geo.wheelCenterHeight || '—'}"`);
      lines.push(`    Droop camber: LF ${geo.droopCamber?.LF || '—'}°  RF ${geo.droopCamber?.RF || '—'}°`);
      lines.push(`    Droop travel: LF ${geo.droopTravel?.LF || '—'}"  RF ${geo.droopTravel?.RF || '—'}"`);
      lines.push(`    Bump camber: LF ${geo.bumpCamber?.LF || '—'}°  RF ${geo.bumpCamber?.RF || '—'}°`);
      lines.push(`    Caster camber gain (20° steer): LF ${geo.steerCamber20?.LF || '—'}°  RF ${geo.steerCamber20?.RF || '—'}°`);
      lines.push(``);
    } else {
      lines.push(`  GEOMETRY: model defaults`);
      lines.push(``);
    }

    lines.push(`  SETUP (what was run — NOT assumed optimal):`);
    lines.push(`    Camber LF ${simSetup.camber.LF}°  RF ${simSetup.camber.RF}°`);
    lines.push(`    Caster LF ${simSetup.caster.LF}°  RF ${simSetup.caster.RF}°`);
    lines.push(`    Toe ${simSetup.toe}" front`);
    lines.push(`    Springs LF ${simSetup.springs.LF} lbs/in  RF ${simSetup.springs.RF} lbs/in`);
    lines.push(`    Shocks LF ${simSetup.shocks.LF}  RF ${simSetup.shocks.RF}  LR ${simSetup.shocks.LR}  RR ${simSetup.shocks.RR}  (0=stiffest 10=softest)`);
    lines.push(`    Cold PSI: LF ${simSetup.coldPsi.LF}  RF ${simSetup.coldPsi.RF}  LR ${simSetup.coldPsi.LR}  RR ${simSetup.coldPsi.RR}`);
    lines.push(``);

    const hp = session.hotPsi;
    if (Object.values(hp).some(v => v !== '')) {
      lines.push(`  HOT PSI: LF ${hp.LF || '—'}  RF ${hp.RF || '—'}  LR ${hp.LR || '—'}  RR ${hp.RR || '—'}`);
      lines.push(``);
    }

    const tt = session.tireTemps;
    if (Object.values(tt).some(t => t.inside || t.middle || t.outside)) {
      lines.push(`  PYROMETER (°F: Inside / Middle / Outside):`);
      for (const pos of ['LF', 'RF', 'LR', 'RR']) {
        lines.push(`    ${pos}: ${tt[pos].inside || '—'} / ${tt[pos].middle || '—'} / ${tt[pos].outside || '—'}`);
      }
      lines.push(``);
    }

    if (session.condition || session.phase) {
      const condLabel = handlingConditions.find(c => c.value === session.condition)?.label || session.condition;
      const phaseLabel = cornerPhases.find(p => p.value === session.phase)?.label || session.phase;
      lines.push(`  DRIVER FEEL: ${condLabel || '—'}  |  When: ${phaseLabel || '—'}`);
      lines.push(``);
    }

    if (session.lapNotes?.trim()) {
      lines.push(`  NOTES: ${session.lapNotes.trim()}`);
      lines.push(``);
    }

    // ── Driver confirmation of physics model prediction ─────────────────────
    if (conf) {
      lines.push(`  DRIVER CONFIRMATION OF MODEL PREDICTION:`);
      if (conf.verdict === 'yes') {
        lines.push(`    Driver confirmed: the car behaved EXACTLY as the model predicted.`);
        lines.push(`    This validates the geometry and pressure calculations for this session.`);
        lines.push(`    Recommendations should be grounded entirely in the physics model numbers.`);
      } else if (conf.verdict === 'partial') {
        lines.push(`    Driver confirmed: the car PARTIALLY matched the model prediction.`);
        if (conf.override?.trim()) {
          lines.push(`    What was different: "${conf.override.trim()}"`);
        }
        lines.push(`    Treat the model numbers as directionally correct but investigate the discrepancy.`);
        lines.push(`    Where driver feedback contradicts the model, driver feedback is ground truth.`);
      } else if (conf.verdict === 'no') {
        lines.push(`    Driver DISAGREED with the model prediction.`);
        if (conf.override?.trim()) {
          lines.push(`    What actually happened: "${conf.override.trim()}"`);
        }
        lines.push(`    CRITICAL: the model prediction did not match reality. This is a calibration signal.`);
        lines.push(`    Driver feedback is the ground truth. Diagnose WHY the model diverged before issuing recommendations.`);
        lines.push(`    Possible causes: unmeasured alignment, incorrect setup input, track surface anomaly, driver technique.`);
      }
      lines.push(``);
    }

    if (physics) {
      const c = physics.corners;
      lines.push(`  PHYSICS MODEL (calculated — not based on user setup assumptions):`);
      lines.push(`    Est. lap ${physics.lapTime?.toFixed(3)}s  |  Front LLTD ${(physics.ss?.frontLLTD * 100).toFixed(1)}% (model target 46%)`);
      lines.push(`    Per-corner: grip% / hot PSI run (model-optimal PSI) / ground camber run (model-ideal camber) / model-recommended cold PSI`);
      for (const pos of ['RF', 'LF', 'RR', 'LR']) {
        const corner = c?.[pos];
        if (!corner) continue;
        const camberStr = corner.groundCamber != null
          ? `ground camber ${corner.groundCamber.toFixed(2)}° (ideal ${corner.idealGroundCamber?.toFixed(2) ?? '—'}°)${corner.optStaticCamber != null ? `, opt static ${corner.optStaticCamber.toFixed(2)}°` : ''}`
          : '';
        const psiStr = `hot PSI ${corner.hp?.toFixed(1)} (opt ${corner.optHotPsi?.toFixed(1)}, rec cold ${corner.recColdPsi?.toFixed(1)})`;
        const gripPct = corner.adjustableScore != null ? (corner.adjustableScore * 100).toFixed(1) : '—';
        lines.push(`    ${pos}: grip ${gripPct}%  ${psiStr}  ${camberStr}`);
      }
      if (physics.recommendations?.length) {
        lines.push(`    Model-ranked changes (calculated deltas vs current setup):`);
        for (const r of physics.recommendations.slice(0, 6)) {
          lines.push(`      • ${r.parameter}: ${r.current} → ${r.optimal}  (${r.detail ?? ''})`);
        }
      }
      lines.push(``);
    }
  });

  // Group by car for cross-session notes
  const cars = [...new Set(selectedSessions.map(s => carLabel(s, geoProfiles)))];

  lines.push(`${'─'.repeat(60)}`);
  lines.push(`ANALYSIS REQUESTED:`);
  if (cars.length > 1) {
    lines.push(`NOTE: This analysis covers ${cars.length} different cars: ${cars.join(', ')}. Analyze each car separately, then compare across cars where useful.`);
  }
  const hasConfirmations = confirmations && Object.keys(confirmations).length > 0;
  if (hasConfirmations) {
    lines.push(`DRIVER CONFIRMATION NOTE: Each session includes a "DRIVER CONFIRMATION OF MODEL PREDICTION" block.`);
    lines.push(`This tells you whether the driver's actual experience matched what the physics model predicted.`);
    lines.push(`- If verdict is "confirmed": model is calibrated. Use physics numbers as ground truth.`);
    lines.push(`- If verdict is "partial": model is directionally right but something is off. Investigate the discrepancy first.`);
    lines.push(`- If verdict is "disagreed": driver experience contradicts the model. Driver is ground truth. Diagnose the gap before recommending.`);
    lines.push(`Your recommendations MUST reference the confirmation verdict and explain how it shapes your confidence in each recommendation.`);
  }
  lines.push(``);
  lines.push(`For each session, walk through the following in order:`);
  lines.push(``);
  lines.push(`RF CONTACT PATCH CHAIN (do this numerically for every session):`);
  lines.push(`  The physics model already calculated this chain. Use the values from the PHYSICS MODEL section directly.`);
  lines.push(`  Chain: static + caster + SLA jounce + frame roll + KPI + sidewall = ground camber`);
  lines.push(`  Where: SLA jounce = body roll × −0.355° (RF outside). Frame roll = +cornerRoll (chassis→ground conversion).`);
  lines.push(`  These are two separate roll effects: SLA changes the WHEEL angle; frame roll changes the REFERENCE FRAME.`);
  lines.push(`  1. State the static RF camber that was run.`);
  lines.push(`  2. Caster gain: RF caster × −0.136°/° (short oval, 3.77° apex steer — NOT 0.667°, that is a road course value).`);
  lines.push(`  3. SLA jounce (roll × −0.355°) + frame roll (+cornerRoll) + KPI (+0.02°) + sidewall (+~0.47°).`);
  lines.push(`  4. State the RF ground camber vs −2.0° ideal. Outside-hotter pyro = insufficient camber. Inside-hotter = over-camber.`);
  lines.push(`  5. State measured hot RF PSI vs model-optimal (optHotPsi = 30 × cornerLoad/925). Calculate PSI delta and grip penalty (0.6%/PSI).`);
  lines.push(`  6. Interpret RF pyrometer zones: which zone is hottest? What does that pattern indicate (over/under camber, over/under pressure)?`);
  lines.push(`  7. Do the pyrometer pattern and the physics model agree? If not, state which is the ground truth and correct the other.`);
  lines.push(`  NOTE: on this short oval, caster contributes only ~0.1–1.2° of camber gain total. Static camber carries all the load.`);
  lines.push(``);
  lines.push(`HANDLING DIAGNOSIS:`);
  lines.push(`  - Name the primary handling condition (push/understeer, loose/oversteer, tight entry, loose exit, etc.).`);
  lines.push(`  - Tie it to the physics: which corner is causing it and what in the camber/pressure/LLTD chain explains it?`);
  lines.push(`  - If front LLTD deviates from 46%, explain the implication for RF load and what that does to optimal PSI.`);
  lines.push(`  - Reference the driver confirmation verdict: did the model correctly predict what the driver felt?`);
  lines.push(`    If the model was wrong, state what the gap reveals about the setup or the model's assumptions.`);
  lines.push(``);
  lines.push(`RANKED NEXT-SESSION RECOMMENDATIONS:`);
  lines.push(`  Give exactly 3–5 changes, ranked by expected grip gain. For each:`);
  lines.push(`    a) The specific change (with numbers: current → target).`);
  lines.push(`    b) Which step of the camber/pressure/LLTD chain it affects.`);
  lines.push(`    c) The expected effect on RF ground camber or hot PSI.`);
  lines.push(`    d) Whether it is TRACKSIDE (PSI, tire swap) or SHOP (alignment, shocks, springs).`);
  lines.push(`  Prioritize TRACKSIDE changes first. Flag if no trackside change is available — shop changes only.`);
  lines.push(``);
  lines.push(`SESSION COMPARISON (if multiple sessions):`);
  lines.push(`  - What changed between sessions and did the data confirm it helped?`);
  lines.push(`  - Was the grip delta consistent with what the physics model predicted?`);
  lines.push(``);
  lines.push(`FORMAT RULES:`);
  lines.push(`  - Every claim must reference an actual number from the data above.`);
  lines.push(`  - Never say "adjust camber" without specifying the direction and a target value.`);
  lines.push(`  - Never say "check pressure" without giving the delta from optimal and direction to adjust.`);
  lines.push(`  - SHOCK SCALE: Click 0 = stiffest, Click 10 = softest. A higher click number means SOFTER damping.`);
  lines.push(`    When describing a shock change: "stiffen" means lower click (e.g. Click 4 → Click 2).`);
  lines.push(`    "Soften" means higher click (e.g. Click 4 → Click 6). NEVER say "increase stiffness" with a higher click number.`);
  lines.push(`  - Write for a crew chief reading this at the wall between sessions — terse, numeric, actionable.`);

  return lines.join('\n');
}

// ─── Groq API call ────────────────────────────────────────────────────────────
const GROQ_MODEL = 'llama-3.3-70b-versatile';
async function callGroq(apiKey, prompt) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function runPhysicsAnalysis(sessions, geoProfiles = []) {
  return sessions.map(session => {
    const simSetup = sessionToSimSetup(session);
    const ambient = Number(session.ambient) || 65;
    const inflation = Number(session.inflationTemp) || 68;
    const geo = session.carProfileId ? geoProfiles.find(g => g.id === session.carProfileId) : null;
    const geoOverrides = buildGeoOverrides(geo);
    try { return { sessionId: session.id, ...analyzeSetup(simSetup, ambient, inflation, geoOverrides) }; }
    catch { return null; }
  }).filter(Boolean);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-field">
      <div className="ml-field-label">
        {label}
        {hint && <button className="ml-hint-btn" onClick={() => setOpen(o => !o)}>?</button>}
      </div>
      {hint && open && <div className="ml-hint">{hint}</div>}
      {children}
    </div>
  );
}

function NumIn({ value, onChange, placeholder, step = '1', min, max }) {
  return (
    <input type="number" className="ml-input"
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '—'} step={step} min={min} max={max} />
  );
}

const FRONT_SPRING_OPTIONS = [
  { value: 700, label: '700 lbs/in — Heavy Duty' },
  { value: 475, label: '475 lbs/in — Police/Taxi' },
  { value: 440, label: '440 lbs/in — Base/LX' },
];

function SetupEditor({ setup, onChange }) {
  function set(path, val) {
    const s = dc(setup);
    const keys = path.split('.');
    let obj = s;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = val;
    onChange(s);
  }
  function updateShock(corner, label) {
    const isFront = corner === 'LF' || corner === 'RF';
    const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === label);
    if (!found) return;
    const s = dc(setup);
    s.shocks[corner] = found.rating;
    if (isFront && found.springRate) s.springs[corner] = found.springRate;
    onChange(s);
  }
  function selectedLabel(corner) {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const match = list.find(s => s.rating === setup.shocks[corner]);
    return match ? shockLabel(match) : '';
  }

  return (
    <div className="td-setup-editor">
      <div className="td-setup-col">
        <div className="td-setup-group-label">Shocks / Struts</div>
        {['LF', 'RF', 'LR', 'RR'].map(corner => {
          const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
          return (
            <div key={corner} className="td-setup-row">
              <span className="td-setup-corner">{corner}</span>
              <select className="ml-input ml-select td-select"
                value={selectedLabel(corner)}
                onChange={e => updateShock(corner, e.target.value)}>
                {list.map(s => <option key={s.part} value={shockLabel(s)}>{shockLabel(s)} — {s.use}</option>)}
              </select>
            </div>
          );
        })}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>Front Springs</div>
        {['LF', 'RF'].map(corner => (
          <div key={corner} className="td-setup-row">
            <span className="td-setup-corner">{corner}</span>
            <select className="ml-input ml-select td-select"
              value={setup.springs[corner] ?? 475}
              onChange={e => set(`springs.${corner}`, parseInt(e.target.value))}>
              {FRONT_SPRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="td-setup-col">
        <div className="td-setup-group-label">Camber (°)</div>
        {['LF', 'RF'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="0.25" className="ml-input td-num"
              value={setup.camber[c]} onChange={e => set(`camber.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>Caster (°)</div>
        {['LF', 'RF'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="0.25" min="0" max="12" className="ml-input td-num"
              value={setup.caster[c]} onChange={e => set(`caster.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>
          Toe (in) <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>− = out</span>
        </div>
        <div className="td-setup-row">
          <span className="td-setup-corner">F</span>
          <input type="number" step="0.0625" className="ml-input td-num"
            value={setup.toe} onChange={e => set('toe', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="td-setup-col">
        <div className="td-setup-group-label">Cold PSI</div>
        {['LF', 'RF', 'LR', 'RR'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="1" min="5" max="60" className="ml-input td-num"
              value={setup.coldPsi[c]} onChange={e => set(`coldPsi.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PhysicsCard({ analysis, session, geoProfiles, onSendToOptimizer }) {
  if (!analysis) return null;
  const c = analysis.corners;
  const lltd = analysis.ss?.frontLLTD ?? 0;
  const lltdOk = Math.abs(lltd - 0.46) < 0.03;

  // Penalty % from ideal for a given grip factor
  const pen = (f) => f != null ? ((1 - f) * 100).toFixed(1) : '—';
  const sign = (v) => v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);

  function handleSendToOptimizer() {
    const simSetup = sessionToSimSetup(session);
    const ambient = Number(session.ambient) || 65;
    const inflation = Number(session.inflationTemp) || 68;
    onSendToOptimizer?.(simSetup, ambient, inflation);
  }

  return (
    <div className="td-physics-card">
      <div className="td-physics-title">
        {session.name || 'Session'}
        <span className="td-physics-car">{carLabel(session, geoProfiles)}</span>
        {onSendToOptimizer && (
          <button className="td-send-optimizer-btn" onClick={handleSendToOptimizer}>
            Open in Optimizer
          </button>
        )}
      </div>

      {/* Summary row */}
      <div className="td-physics-grid">
        <div className="td-phys-item">
          <span className="td-phys-label">Est. Lap</span>
          <span className="td-phys-val">{analysis.lapTime?.toFixed(3)}s</span>
        </div>
        <div className="td-phys-item">
          <span className="td-phys-label">Opt. Lap</span>
          <span className="td-phys-val" style={{ color: 'var(--green)' }}>
            {analysis.optLapTime?.toFixed(3)}s
            <span className="td-phys-sub">−{analysis.totalGain?.toFixed(3)}s avail</span>
          </span>
        </div>
        <div className="td-phys-item">
          <span className="td-phys-label">Front LLTD</span>
          <span className="td-phys-val" style={{ color: lltdOk ? 'var(--green)' : 'var(--yellow)' }}>
            {(lltd * 100).toFixed(1)}%
            <span className="td-phys-sub">target 46%</span>
          </span>
        </div>
      </div>

      {/* Per-corner camber chain + PSI breakdown */}
      <div className="td-phys-corner-table">
        <div className="td-phys-corner-heading">Per-Corner Contact Patch Analysis</div>
        {['RF', 'LF', 'RR', 'LR'].map(pos => {
          const cr = c?.[pos];
          if (!cr) return null;
          const gripPct = cr.adjustableScore != null ? (cr.adjustableScore * 100).toFixed(1) : '—';
          const camberPen = cr.camberFactor != null ? pen(cr.camberFactor) : '—';
          const psiPen = cr.psiGripFactor != null ? pen(cr.psiGripFactor) : '—';
          const gcOk = cr.groundCamber != null && cr.idealGroundCamber != null
            && Math.abs(cr.groundCamber - cr.idealGroundCamber) < 0.3;
          const psiOk = cr.psiGripFactor != null && cr.psiGripFactor > 0.99;
          return (
            <div key={pos} className="td-phys-corner-row">
              <div className="td-phys-corner-pos">{pos}</div>
              <div className="td-phys-corner-detail">
                {/* Grip score */}
                <div className="td-phys-detail-line">
                  <span className="td-phys-detail-key">Grip score</span>
                  <span className="td-phys-detail-val" style={{ color: parseFloat(gripPct) > 95 ? 'var(--green)' : parseFloat(gripPct) > 90 ? 'var(--yellow)' : 'var(--red)' }}>
                    {gripPct}%
                  </span>
                </div>

                {/* Camber chain (fronts only) */}
                {cr.front && (
                  <div className="td-phys-detail-line td-phys-chain">
                    <span className="td-phys-detail-key">Camber chain</span>
                    <span className="td-phys-detail-val td-phys-chain-val">
                      static {sign(session.setup?.camber?.[pos] ?? (pos === 'RF' ? -2.25 : 2.75))}°
                      {cr.casterGain != null && ` + caster ${sign(cr.casterGain)}°`}
                      {cr.bodyRollCamber != null && ` + SLA ${sign(cr.bodyRollCamber)}°`}
                      {cr.frameRollCamber != null && cr.frameRollCamber !== 0 && ` + frame ${sign(cr.frameRollCamber)}°`}
                      {cr.kpiCamber != null && ` + KPI ${sign(cr.kpiCamber)}°`}
                      {cr.sidewallCamber != null && ` + SW ${sign(cr.sidewallCamber)}°`}
                      {cr.groundCamber != null && (
                        <span style={{ fontWeight: 700, color: gcOk ? 'var(--green)' : 'var(--yellow)' }}>
                          {' '}= {sign(cr.groundCamber)}° ground
                        </span>
                      )}
                      {cr.idealGroundCamber != null && (
                        <span style={{ color: 'var(--text-secondary)' }}> (ideal {cr.idealGroundCamber.toFixed(1)}°, −{camberPen}% grip)</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Rear ground camber (body roll only) */}
                {!cr.front && cr.groundCamber != null && (
                  <div className="td-phys-detail-line">
                    <span className="td-phys-detail-key">Ground camber</span>
                    <span className="td-phys-detail-val" style={{ color: gcOk ? 'var(--green)' : 'var(--yellow)' }}>
                      {sign(cr.groundCamber)}° (body roll only, ideal 0°, −{camberPen}% grip)
                    </span>
                  </div>
                )}

                {/* Optimal static camber recommendation (fronts) */}
                {cr.front && cr.optStaticCamber != null && (
                  <div className="td-phys-detail-line">
                    <span className="td-phys-detail-key">Opt static</span>
                    <span className="td-phys-detail-val" style={{ color: 'var(--green)' }}>
                      {cr.optStaticCamber.toFixed(2)}°
                      {cr.alignmentOutOfRange && <span style={{ color: 'var(--yellow)' }}> ⚠ beyond ±4° range</span>}
                    </span>
                  </div>
                )}

                {/* PSI */}
                <div className="td-phys-detail-line">
                  <span className="td-phys-detail-key">Pressure</span>
                  <span className="td-phys-detail-val" style={{ color: psiOk ? 'var(--green)' : 'var(--yellow)' }}>
                    {cr.hp?.toFixed(1)} hot / {cr.recHotPsi?.toFixed(1)} opt
                    {cr.isPresLimited && cr.optHotPsi != null && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}> (load-ideal {cr.optHotPsi.toFixed(0)}, capped)</span>
                    )}
                    <span style={{ color: 'var(--text-secondary)' }}> (−{psiPen}% grip, rec cold: {Math.round(cr.recColdPsi * 2) / 2} PSI)</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optimal setup — ranked recommendations with lap time gains */}
      {analysis.recs?.length > 0 && (
        <div className="td-phys-recs">
          <div className="td-phys-corner-heading">
            Mathematically Optimal Setup Changes
            <span className="td-phys-rec-total"> (total available: −{analysis.totalGain?.toFixed(3)}s)</span>
          </div>
          {analysis.recs.map((rec, i) => (
            <div key={rec.id} className="td-phys-rec-row">
              <span className="td-phys-rec-rank">#{i + 1}</span>
              <span className="td-phys-rec-param">{rec.parameter}</span>
              <span className="td-phys-rec-change">{rec.current} → {rec.optimal}</span>
              <span className="td-phys-rec-gain" style={{ color: 'var(--green)' }}>−{rec.gain.toFixed(3)}s</span>
              <span className="td-phys-rec-detail">{rec.detail}</span>
              {rec.note && <span className="td-phys-rec-note">{rec.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Severity badge helpers ───────────────────────────────────────────────────
const SEV_COLOR = { critical: 'var(--red, #f56565)', warning: 'var(--yellow, #ecc94b)', good: 'var(--green, #68d391)' };
const SEV_ICON  = { critical: '✕', warning: '!', good: '✓' };

function SevBadge({ severity }) {
  return (
    <span style={{ color: SEV_COLOR[severity] || SEV_COLOR.good, fontWeight: 700, marginRight: 6, fontSize: '0.85em' }}>
      [{SEV_ICON[severity] || '✓'}]
    </span>
  );
}

// ─── Markdown-ish renderer (bold + line breaks only) ──────────────────────────
function SimpleMarkdown({ text }) {
  if (!text) return null;
  return (
    <div className="td-ai-text">
      {text.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
          chunk.startsWith('**') && chunk.endsWith('**')
            ? <strong key={j}>{chunk.slice(2, -2)}</strong>
            : chunk
        );
        return line.trim() === '' ? <br key={i} /> : <p key={i} style={{ margin: '0 0 4px' }}>{parts}</p>;
      })}
    </div>
  );
}

// ─── Per-tire temp strip ──────────────────────────────────────────────────────
function TireStrip({ pos, data, result, physicsCorner }) {
  if (!result) return null;
  const sev = result.severity;
  const pc = physicsCorner;

  // Determine if pyrometer pattern agrees with physics model
  // RF: outside expected hotter (centrifugal load). Inside hotter = over-cambered.
  // LF: inside expected hotter (body roll). Outside hotter = insufficient camber.
  // Rear: solid axle, body roll determines loading.
  let modelAgrees = null;
  let modelNote = null;
  if (pc?.groundCamber != null && pc?.idealGroundCamber != null) {
    const gcDev = pc.groundCamber - pc.idealGroundCamber;
    const insideHotter = result.camberDiff > 0; // camberDiff = inside - outside
    if (pos === 'RF') {
      // RF ideal: ground camber −2.0°. Too positive (insufficient neg) = outside edge overloaded.
      if (gcDev > 0.3) {
        // Model says insufficient negative camber → expect outside hotter (camberDiff < 0)
        modelAgrees = !insideHotter;
        modelNote = modelAgrees
          ? `Pyro confirms: outside hotter — consistent with model's +${gcDev.toFixed(2)}° ground camber deficit (ideal −2.0°).`
          : `Pyro contradicts model: inside hotter but model shows +${gcDev.toFixed(2)}° ground camber deficit (insufficient negative camber). Check static camber accuracy.`;
      } else if (gcDev < -0.3) {
        // Model says over-cambered → expect inside hotter (camberDiff > 0)
        modelAgrees = insideHotter;
        modelNote = modelAgrees
          ? `Pyro confirms: inside hotter — consistent with model's ${gcDev.toFixed(2)}° over-camber at contact patch.`
          : `Pyro contradicts model: outside hotter but model shows ${gcDev.toFixed(2)}° over-camber. Verify caster gain calculation with measured alignment.`;
      } else {
        modelNote = `Model shows RF ground camber ${pc.groundCamber.toFixed(2)}° (ideal −2.0°, within 0.3°). Pyro spread is primary indicator at this precision.`;
      }
    } else if (pos === 'LF') {
      // LF: inside expected hotter (body roll overcambers in cornering). Ideal +0.75° ground.
      if (gcDev > 0.5) {
        modelNote = `Model: LF ground camber +${pc.groundCamber.toFixed(2)}° vs ideal +0.75° — excessive positive. Expect inside edge dominance confirmed by I>${result.inside}° vs O>${result.outside}°.`;
      }
    }
  }

  return (
    <div className="td-tire-strip" style={{ borderLeft: `3px solid ${SEV_COLOR[sev] || SEV_COLOR.good}` }}>
      <div className="td-tire-strip-header">
        <span className="td-tire-pos">{pos}</span>
        <span className="td-tire-temps">
          {data.inside}°&nbsp;/&nbsp;{data.middle}°&nbsp;/&nbsp;{data.outside}°
          <span className="td-tire-avg"> avg {result.avg}°F</span>
        </span>
        {result.hotPsi !== null && (
          <span className="td-tire-hot-psi">
            est. hot {result.hotPsi?.toFixed(1)} PSI
            {result.optimalHotPsi != null && Math.abs(result.hotPsi - result.optimalHotPsi) > 1
              ? ` (model target ${result.optimalHotPsi?.toFixed(1)})`
              : ''}
          </span>
        )}
        {/* Physics chain ground camber inline */}
        {pc?.groundCamber != null && (
          <span className="td-tire-ground-camber" style={{
            color: Math.abs(pc.groundCamber - pc.idealGroundCamber) < 0.3 ? 'var(--green)' : 'var(--yellow)',
            fontSize: '0.75em', marginLeft: 8,
          }}>
            ground {pc.groundCamber >= 0 ? '+' : ''}{pc.groundCamber.toFixed(2)}° / ideal {pc.idealGroundCamber.toFixed(1)}°
            {pc.optStaticCamber != null && ` → opt static ${pc.optStaticCamber.toFixed(2)}°`}
          </span>
        )}
      </div>
      {/* Model / pyro agreement note */}
      {modelNote && (
        <div className="td-tire-rec" style={{ color: modelAgrees === false ? 'var(--yellow)' : 'var(--text-secondary)', fontStyle: 'italic' }}>
          {modelAgrees === false ? '⚠ ' : 'ℹ '}{modelNote}
        </div>
      )}
      {result.recommendations.map((rec, i) => (
        <div key={i} className="td-tire-rec">
          <SevBadge severity={rec.severity} />{rec.message}
        </div>
      ))}
    </div>
  );
}

// ─── Full tire analysis card (per session) ────────────────────────────────────
function TireAnalysisCard({ session, geoProfiles }) {
  const tt = session.tireTemps;
  const hp = session.hotPsi;
  const setup = session.setup;

  const hasTemps = tt && Object.values(tt).some(t => t.inside && t.middle && t.outside);
  if (!hasTemps) return null;

  // Run physics model to get load-derived optimal hot PSI per corner
  const simSetup = sessionToSimSetup(session);
  const ambient = Number(session.ambient) || 65;
  const inflation = Number(session.inflationTemp) || 68;
  const geo = session.carProfileId ? geoProfiles?.find(g => g.id === session.carProfileId) : null;
  const geoOverrides = buildGeoOverrides(geo);
  let physicsCorners = null;
  try {
    const phys = analyzeSetup(simSetup, ambient, inflation, geoOverrides);
    physicsCorners = phys.corners;
  } catch { /* ignore */ }

  // Build the input structure analyzeFullCar expects
  const tiresInput = {};
  for (const pos of ['LF', 'RF', 'LR', 'RR']) {
    tiresInput[pos] = {
      inside:   tt[pos]?.inside  || '',
      middle:   tt[pos]?.middle  || '',
      outside:  tt[pos]?.outside || '',
      pressure: setup?.coldPsi?.[pos] || hp?.[pos] || null,
    };
  }

  const analysis = analyzeFullCar(tiresInput, physicsCorners);
  const shockRatings = sessionShockRatings(session);
  const handlingRaw = (session.condition && session.phase)
    ? getHandlingRecommendations(session.condition, session.phase)
    : null;
  const handling = handlingRaw
    ? { ...handlingRaw, changes: annotateShockLimits(handlingRaw.changes, shockRatings) }
    : null;

  const condLabel = handlingConditions.find(c => c.value === session.condition)?.label || '';
  const phaseLabel = cornerPhases.find(p => p.value === session.phase)?.label || '';

  return (
    <div className="td-tire-analysis-card">
      <div className="td-physics-title">
        {session.name || 'Session'} — Tire Analysis
        <span className="td-physics-car">{carLabel(session, geoProfiles)}</span>
      </div>

      {/* Per-tire breakdown */}
      <div className="td-tire-strips">
        {['RF', 'LF', 'RR', 'LR'].map(pos => (
          <TireStrip key={pos} pos={pos} data={tiresInput[pos]} result={analysis.tires[pos]} physicsCorner={physicsCorners?.[pos]} />
        ))}
      </div>

      {/* Overall balance */}
      {analysis.overall?.length > 0 && (
        <div className="td-tire-balance">
          <div className="td-balance-label">Overall Balance</div>
          {analysis.deltas && (
            <div className="td-balance-deltas">
              <span className={`td-delta ${Math.abs(analysis.deltas.frontRear) > 20 ? 'warn' : ''}`}>
                F/R: {analysis.deltas.frontRear > 0 ? '+' : ''}{analysis.deltas.frontRear}°F
              </span>
              <span className={`td-delta ${analysis.deltas.leftRight > 15 ? 'warn' : ''}`}>
                L/R: {analysis.deltas.leftRight > 0 ? '+' : ''}{analysis.deltas.leftRight}°F
              </span>
              <span className={`td-delta ${Math.abs(analysis.deltas.diagonal) > 15 ? 'warn' : ''}`}>
                Diag: {analysis.deltas.diagonal > 0 ? '+' : ''}{analysis.deltas.diagonal}°F
              </span>
            </div>
          )}
          {analysis.overall.map((rec, i) => (
            <div key={i} className="td-tire-rec">
              <SevBadge severity={rec.severity} />{rec.message}
            </div>
          ))}
        </div>
      )}

      {/* Handling diagnosis */}
      {handling && (
        <div className="td-handling-rec">
          <div className="td-handling-title">{handling.title}</div>
          <div className="td-handling-desc">{handling.description}</div>
          <div className="td-handling-changes">
            {handling.changes.map((ch, i) => (
              <div key={i} className={`td-change-row${ch.atLimit ? ' td-change-row--at-limit' : ''}`}>
                <span className="td-change-component">{ch.component}</span>
                {ch.atLimit
                  ? <span className="td-change-action td-change-action--at-limit">
                      {ch.adjustment}
                      <span className="td-change-at-limit-badge">⚠ {ch.limitNote} — try the opposite corner instead</span>
                    </span>
                  : <span className="td-change-action">{ch.adjustment}</span>
                }
                <span className="td-change-effect">{ch.effect}</span>
              </div>
            ))}
          </div>
          {handling.perTire && (
            <div className="td-pertire-table">
              <div className="td-pertire-label">Per-Tire Detail</div>
              {Object.entries(handling.perTire).map(([category, corners]) => (
                <div key={category} className="td-pertire-group">
                  <span className="td-pertire-cat">{category}:</span>
                  {typeof corners === 'object' && Object.entries(corners).map(([corner, action]) => (
                    <span key={corner} className="td-pertire-item">{corner}: <strong>{action}</strong></span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prompt to add driver feel if missing temps but no condition */}
      {!session.condition && (
        <div className="td-tire-rec" style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
          Add "Driver Feel" in the session editor to get handling recommendations.
        </div>
      )}
    </div>
  );
}

// ─── Session editor ───────────────────────────────────────────────────────────
function SessionEditor({ session, index, onChange, geoProfiles }) {
  const setup = session.setup ?? blankSetup();
  function set(field, val) { onChange({ ...session, [field]: val }); }
  function setN(parent, key, val) { onChange({ ...session, [parent]: { ...session[parent], [key]: val } }); }
  function setTemp(pos, zone, val) {
    onChange({ ...session, tireTemps: { ...session.tireTemps, [pos]: { ...session.tireTemps[pos], [zone]: val } } });
  }

  return (
    <div className="td-session-editor">
      <div className="td-session-header">
        <input className="td-session-name-input" type="text"
          placeholder={`Practice ${index + 1}`}
          value={session.name} onChange={e => set('name', e.target.value)} />
      </div>

      {/* Car profile — per session */}
      <div className="td-session-section">
        <div className="td-ss-label">Car Profile</div>
        <select className="ml-input ml-select"
          value={session.carProfileId ?? ''}
          onChange={e => set('carProfileId', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Model default (P71)</option>
          {geoProfiles.map(g => (
            <option key={g.id} value={g.id}>{g.title || 'Unnamed'} — {g.date}</option>
          ))}
        </select>
        {session.carProfileId && (
          <div className="td-geo-badge" style={{ marginTop: 6 }}>
            {carLabel(session, geoProfiles)}
          </div>
        )}
      </div>

      {/* Environment */}
      <div className="td-session-section">
        <div className="td-ss-label">Environment</div>
        <div className="ml-row">
          <Field label="Ambient (°F)">
            <NumIn value={session.ambient} onChange={v => set('ambient', v)} placeholder="e.g. 75" />
          </Field>
          <Field label="Tires set at (°F)" hint="Shop temperature when cold pressures were set.">
            <NumIn value={session.inflationTemp} onChange={v => set('inflationTemp', v)} placeholder="e.g. 68" />
          </Field>
        </div>
      </div>

      {/* Setup */}
      <div className="td-session-section">
        <div className="td-ss-label">Setup This Session</div>
        <SetupEditor setup={setup} onChange={s => set('setup', s)} />
      </div>

      {/* Hot PSI */}
      <div className="td-session-section">
        <div className="td-ss-label">Hot Pressures (PSI) — after session</div>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos} hint="Check within 2 minutes of getting off track.">
              <NumIn value={session.hotPsi[pos]} onChange={v => setN('hotPsi', pos, v)} placeholder="PSI" min="5" max="80" />
            </Field>
          ))}
        </div>
      </div>

      {/* Pyrometer */}
      <div className="td-session-section">
        <div className="td-ss-label">Pyrometer (°F) — Inside / Middle / Outside</div>
        <div className="ml-pyro-grid">
          <div className="ml-pyro-header">
            <span></span><span>Inside</span><span>Middle</span><span>Outside</span>
          </div>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <div key={pos} className="ml-pyro-row">
              <span className="ml-pyro-pos">{pos}</span>
              {['inside', 'middle', 'outside'].map(zone => (
                <NumIn key={zone} value={session.tireTemps[pos][zone]}
                  onChange={v => setTemp(pos, zone, v)} placeholder="°F" min="60" max="300" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Driver feel */}
      <div className="td-session-section">
        <div className="td-ss-label">Driver Feel</div>
        <div className="td-feel-row">
          <div className="td-feel-group">
            <div className="td-feel-group-label">What is the car doing?</div>
            <div className="td-feel-buttons">
              {handlingConditions.map(c => (
                <button key={c.value}
                  className={`td-feel-btn${session.condition === c.value ? ' active' : ''}`}
                  onClick={() => set('condition', session.condition === c.value ? '' : c.value)}>
                  <span className="td-feel-btn-label">{c.label}</span>
                  <span className="td-feel-btn-desc">{c.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="td-feel-group">
            <div className="td-feel-group-label">When does it happen?</div>
            <div className="td-feel-buttons three">
              {cornerPhases.map(p => (
                <button key={p.value}
                  className={`td-feel-btn${session.phase === p.value ? ' active' : ''}`}
                  onClick={() => set('phase', session.phase === p.value ? '' : p.value)}>
                  <span className="td-feel-btn-label">{p.label}</span>
                  <span className="td-feel-btn-desc">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="td-session-section">
        <div className="td-ss-label">Lap Notes / Observations</div>
        <textarea className="ml-textarea" rows={3}
          placeholder="Lap times, what changed from last session, anything the driver noticed..."
          value={session.lapNotes} onChange={e => set('lapNotes', e.target.value)} />
      </div>
    </div>
  );
}

// ─── API Key panel ────────────────────────────────────────────────────────────
function ApiKeyPanel({ apiKey, setApiKey }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function saveKey() {
    setApiKey(draft.trim());
    localStorage.setItem(APIKEY_KEY, draft.trim());
    setEditing(false);
  }
  function clearKey() {
    setApiKey('');
    localStorage.removeItem(APIKEY_KEY);
    setEditing(false);
  }

  if (!editing) return (
    <div className="td-apikey-bar">
      <span className="td-apikey-status">
        {apiKey
          ? <><span className="td-apikey-dot active" />Groq AI analysis enabled</>
          : <><span className="td-apikey-dot" />No API key — physics model only</>}
      </span>
      <button className="td-apikey-btn" onClick={() => { setDraft(apiKey); setEditing(true); }}>
        {apiKey ? 'Change Key' : 'Add API Key'}
      </button>
    </div>
  );

  return (
    <div className="td-apikey-bar td-apikey-edit">
      <input className="ml-input td-apikey-input" type="password" placeholder="gsk_..."
        value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && saveKey()} />
      <button className="ml-save-btn" onClick={saveKey}>Save</button>
      {apiKey && <button className="ml-delete-btn" onClick={clearKey}>Remove</button>}
      <button className="ml-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
      <span className="td-apikey-note">Stored in your browser only. Never sent anywhere except api.groq.com.</span>
    </div>
  );
}

// ─── Prediction confirm card ──────────────────────────────────────────────────
function PredictionConfirmCard({ session, prediction, confirmation, onChange }) {
  const sessionName = session.name || 'Unnamed session';
  const { verdict = '', override = '' } = confirmation || {};

  return (
    <div className="td-predict-card">
      <div className="td-predict-header">
        <span className="td-predict-session">{sessionName}</span>
        <span className="td-predict-label">Model prediction — confirm before analysis</span>
      </div>
      <div className="td-predict-lines">
        {prediction.map((line, i) => (
          <p key={i} className="td-predict-line">{line}</p>
        ))}
      </div>
      <div className="td-predict-confirm">
        <span className="td-predict-q">Did the car behave as predicted?</span>
        <div className="td-predict-btns">
          {[
            { value: 'yes',     label: 'Yes — matches' },
            { value: 'partial', label: 'Partially' },
            { value: 'no',      label: 'No — different' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`td-predict-btn${verdict === opt.value ? ' selected' : ''}`}
              onClick={() => onChange({ verdict: opt.value, override })}>
              {opt.label}
            </button>
          ))}
        </div>
        {(verdict === 'partial' || verdict === 'no') && (
          <textarea
            className="td-predict-override"
            placeholder={verdict === 'no'
              ? 'What actually happened? (e.g. "car was loose on exit, not pushing in the center")'
              : 'What was different? (e.g. "push was only on entry, not mid-corner")'}
            value={override}
            onChange={e => onChange({ verdict, override: e.target.value })}
            rows={2}
          />
        )}
      </div>
    </div>
  );
}

// ─── Analysis panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ event, allSessions, geoProfiles, apiKey, onSendToOptimizer }) {
  const [selected, setSelected]         = useState(() => new Set(allSessions.map(s => s.id)));
  // phase: 'idle' | 'confirming' | 'running' | 'done' | 'error'
  const [phase, setPhase]               = useState('idle');
  const [aiText, setAiText]             = useState('');
  const [errMsg, setErrMsg]             = useState('');
  const [physicsResults, setPhysicsResults] = useState(null);
  const [predictions, setPredictions]   = useState(null); // { sessionId: [...lines] }
  // confirmations: { sessionId: { verdict: 'yes'|'partial'|'no', override: string } }
  const [confirmations, setConfirmations] = useState({});

  useEffect(() => {
    setSelected(prev => {
      const ids = new Set(allSessions.map(s => s.id));
      return new Set([...prev].filter(id => ids.has(id)));
    });
  }, [allSessions]);

  function toggleSession(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll()  { setSelected(new Set(allSessions.map(s => s.id))); }
  function selectNone() { setSelected(new Set()); }

  const selectedSessions = allSessions.filter(s => selected.has(s.id));

  // Phase 1: compute physics + predictions, show confirmation cards
  function predict() {
    if (selectedSessions.length === 0) return;
    const phys = runPhysicsAnalysis(selectedSessions, geoProfiles);
    setPhysicsResults(phys);

    // Build a lookup by sessionId so index desync from .filter(Boolean) is avoided
    const physById = Object.fromEntries(phys.map(p => [p.sessionId, p]));
    const preds = {};
    selectedSessions.forEach(session => {
      const lines = buildPrediction(session, physById[session.id] ?? null);
      if (lines && lines.length > 0) preds[session.id] = lines;
    });
    setPredictions(preds);
    setConfirmations({});
    setAiText('');
    setErrMsg('');
    setPhase('confirming');
  }

  // Phase 2: run AI with confirmation data
  const runAnalysis = useCallback(async () => {
    setPhase('running');
    if (apiKey) {
      try {
        const text = await callGroq(apiKey, buildPrompt(event, selectedSessions, geoProfiles, confirmations));
        setAiText(text);
        setPhase('done');
      } catch (e) {
        setErrMsg(e.message);
        setPhase('error');
      }
    } else {
      setPhase('done');
    }
  }, [event, selectedSessions, geoProfiles, apiKey, confirmations]);

  function updateConfirmation(sessionId, data) {
    setConfirmations(prev => ({ ...prev, [sessionId]: data }));
  }

  // All selected sessions that have predictions must have a verdict before continuing
  const sessionsWithPredictions = selectedSessions.filter(s => predictions?.[s.id]);
  const allConfirmed = sessionsWithPredictions.length > 0
    && sessionsWithPredictions.every(s => confirmations[s.id]?.verdict);

  const isRunning = phase === 'running';

  return (
    <div className="td-analysis-panel">
      {/* Session selector — only shown before predictions */}
      {phase === 'idle' && allSessions.length > 0 && (
        <div className="td-session-selector">
          <div className="td-selector-header">
            <span className="td-ss-label" style={{ marginBottom: 0 }}>Sessions to analyze</span>
            <div className="td-selector-controls">
              <button className="td-sel-btn" onClick={selectAll}>All</button>
              <button className="td-sel-btn" onClick={selectNone}>None</button>
            </div>
          </div>
          <div className="td-selector-list">
            {allSessions.map(session => (
              <label key={session.id} className={`td-sel-item${selected.has(session.id) ? ' checked' : ''}`}>
                <input type="checkbox"
                  checked={selected.has(session.id)}
                  onChange={() => toggleSession(session.id)} />
                <div className="td-sel-item-info">
                  <span className="td-sel-session-name">{session.name || 'Unnamed session'}</span>
                  <span className="td-sel-car-name">{carLabel(session, geoProfiles)}</span>
                </div>
                {session.condition && (
                  <span className="td-view-badge condition" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {handlingConditions.find(c => c.value === session.condition)?.label}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 1 button */}
      {phase === 'idle' && (
        <>
          <button
            className="td-analyze-btn"
            onClick={predict}
            disabled={selectedSessions.length === 0}>
            {`Predict & Confirm — ${selectedSessions.length} Session${selectedSessions.length !== 1 ? 's' : ''}`}
          </button>
          {selectedSessions.length === 0 && <p className="td-analysis-note">Select at least one session above.</p>}
        </>
      )}

      {/* Step 2: prediction confirmation cards */}
      {phase === 'confirming' && (
        <div className="td-predict-section">
          <div className="td-predict-intro">
            <strong>Step 1 of 2 — Confirm Model Predictions</strong>
            <p>Based on your setup inputs, geometry, and track conditions, here is what the physics model calculates the car should be doing. Confirm or correct each prediction before the AI analysis runs.</p>
          </div>
          {sessionsWithPredictions.map(session => (
            <PredictionConfirmCard
              key={session.id}
              session={session}
              prediction={predictions[session.id]}
              confirmation={confirmations[session.id]}
              onChange={data => updateConfirmation(session.id, data)}
            />
          ))}
          {sessionsWithPredictions.length === 0 && (
            <p className="td-analysis-note">No physics data available for selected sessions.</p>
          )}
          <div className="td-predict-actions">
            <button className="td-analyze-btn" onClick={runAnalysis} disabled={!allConfirmed || isRunning}>
              {isRunning ? 'Analyzing…' : 'Run Analysis'}
            </button>
            {!allConfirmed && sessionsWithPredictions.length > 0 && (
              <p className="td-analysis-note">Confirm each session prediction above before running analysis.</p>
            )}
            <button className="td-sel-btn" style={{ marginTop: 8 }} onClick={() => setPhase('idle')}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Running state */}
      {isRunning && (
        <button className="td-analyze-btn running" disabled>Analyzing…</button>
      )}

      {phase === 'error' && (
        <div className="td-analysis-error">
          <strong>Groq API error:</strong> {errMsg}<br />Physics model results shown below.
        </div>
      )}

      {/* Physics model results — shown after confirmation step */}
      {physicsResults && physicsResults.length > 0 && phase !== 'idle' && (
        <div className="td-physics-results">
          <div className="td-results-heading">Physics Model Results</div>
          {physicsResults.map((res, i) => (
            <PhysicsCard key={res.sessionId} analysis={res} session={selectedSessions[i]} geoProfiles={geoProfiles} onSendToOptimizer={onSendToOptimizer} />
          ))}
        </div>
      )}

      {selectedSessions.some(s => Object.values(s.tireTemps || {}).some(t => t.inside && t.middle && t.outside)) && phase !== 'idle' && (
        <div className="td-physics-results">
          <div className="td-results-heading">Tire Temperature Analysis</div>
          {selectedSessions.map(session => (
            <TireAnalysisCard key={session.id} session={session} geoProfiles={geoProfiles} />
          ))}
        </div>
      )}

      {aiText && (
        <div className="td-ai-results">
          <div className="td-results-heading">
            AI Analysis
            <span className="td-results-model">{GROQ_MODEL}</span>
          </div>
          <SimpleMarkdown text={aiText} />
        </div>
      )}
    </div>
  );
}

// ─── Event editor ─────────────────────────────────────────────────────────────
function EventEditor({ event, onChange, geoProfiles }) {
  function set(field, val) { onChange({ ...event, [field]: val }); }

  function addSession() {
    const newSession = { ...dc(EMPTY_SESSION), id: Date.now(), name: `Practice ${event.sessions.length + 1}`, setup: blankSetup() };
    onChange({ ...event, sessions: [...event.sessions, newSession] });
  }
  function updateSession(idx, updated) {
    const sessions = [...event.sessions];
    sessions[idx] = updated;
    onChange({ ...event, sessions });
  }
  function removeSession(idx) {
    onChange({ ...event, sessions: event.sessions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="td-event-editor">
      <div className="td-event-meta">
        <div className="ml-row">
          <Field label="Event Name">
            <input className="ml-input ml-input-wide" type="text" placeholder="e.g. Wampum 4/26"
              value={event.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="ml-input" type="date"
              value={event.date} onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Track">
            <input className="ml-input" type="text" placeholder="e.g. Wampum Speedway"
              value={event.track} onChange={e => set('track', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="td-sessions-area">
        <div className="td-sessions-header">
          <span className="td-sessions-title">Practice Sessions</span>
          <button className="ml-new-btn" onClick={addSession}>+ Add Session</button>
        </div>
        {event.sessions.length === 0 && (
          <div className="ml-empty" style={{ padding: '24px' }}>
            No sessions yet — tap "+ Add Session" to log your first practice.
          </div>
        )}
        {event.sessions.map((session, idx) => (
          <div key={session.id} className="td-session-card">
            <div className="td-session-card-header">
              <div className="td-session-card-title-group">
                <span className="td-session-card-title">{session.name || `Practice ${idx + 1}`}</span>
                <span className="td-session-card-car">{carLabel(session, geoProfiles)}</span>
              </div>
              <button className="ml-delete-btn td-remove-session" onClick={() => removeSession(idx)}>Remove</button>
            </div>
            <SessionEditor session={session} index={idx} onChange={u => updateSession(idx, u)} geoProfiles={geoProfiles} />
          </div>
        ))}
        {event.sessions.length > 0 && (
          <button className="ml-new-btn td-add-session-bottom" onClick={addSession}>+ Add Session</button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrackDay({ onSendToOptimizer }) {
  const { events, setEvents, geometry: geoProfiles } = useSync();
  const [apiKey, setApiKey]     = useState(() => localStorage.getItem(APIKEY_KEY) || '');
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editing, setEditing]   = useState(null);
  const [tab, setTab]           = useState('edit');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  function newEvent() {
    setEditing({ ...dc(EMPTY_EVENT), id: Date.now(), date: new Date().toISOString().slice(0, 10) });
    setSelectedIdx(null);
    setTab('edit');
  }
  function editEvent(idx) {
    setEditing(dc(events[idx]));
    setSelectedIdx(idx);
    setTab('edit');
  }
  function saveEvent() {
    if (!editing) return;
    const updated = [...events];
    if (selectedIdx !== null) {
      updated[selectedIdx] = editing;
    } else {
      updated.push(editing);
      setSelectedIdx(updated.length - 1);
    }
    setEvents(updated);
    setEditing(null);
  }
  function deleteEvent(idx) {
    setEvents(events.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setDeleteConfirm(null);
    setEditing(null);
  }

  const activeEvent = editing ?? (selectedIdx !== null ? events[selectedIdx] : null);

  return (
    <div className="td-page">
      <div className="ml-sidebar">
        <div className="ml-sidebar-header">
          <span className="ml-sidebar-title">Events</span>
          <button className="ml-new-btn" onClick={newEvent}>+ New</button>
        </div>
        {events.length === 0 && <div className="ml-empty">No events yet.<br />Tap "+ New" to start.</div>}
        {events.map((ev, idx) => (
          <button key={ev.id} className={`ml-car-item${selectedIdx === idx ? ' active' : ''}`} onClick={() => editEvent(idx)}>
            <span className="ml-car-name">{ev.name || 'Unnamed Event'}</span>
            <span className="ml-car-date">
              {ev.date}{ev.sessions.length > 0 ? ` · ${ev.sessions.length} session${ev.sessions.length > 1 ? 's' : ''}` : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="ml-content">
        {!activeEvent && <div className="ml-splash"><p>Select an event or tap "+ New" to log a track day.</p></div>}

        {activeEvent && (
          <>
            <div className="td-topbar">
              <div className="td-topbar-left">
                <span className="td-topbar-title">{activeEvent.name || 'New Event'}</span>
                {activeEvent.date && <span className="td-topbar-date">{activeEvent.date}</span>}
              </div>
              <div className="td-topbar-actions">
                {editing ? (
                  <>
                    <button className="ml-save-btn" onClick={saveEvent}>Save</button>
                    <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                    {selectedIdx !== null && (
                      deleteConfirm === selectedIdx
                        ? <>
                            <span className="ml-delete-confirm-text">Delete?</span>
                            <button className="ml-delete-confirm-btn" onClick={() => deleteEvent(selectedIdx)}>Yes</button>
                            <button className="ml-cancel-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                          </>
                        : <button className="ml-delete-btn" onClick={() => setDeleteConfirm(selectedIdx)}>Delete</button>
                    )}
                  </>
                ) : (
                  <button className="ml-edit-btn" onClick={() => editEvent(selectedIdx)}>Edit</button>
                )}
              </div>
            </div>

            <ApiKeyPanel apiKey={apiKey} setApiKey={setApiKey} />

            <div className="td-tab-row">
              <button className={`td-inner-tab${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>
                {editing ? 'Edit Sessions' : 'Sessions'}
              </button>
              <button className={`td-inner-tab${tab === 'analyze' ? ' active' : ''}`} onClick={() => setTab('analyze')}>
                Analyze
              </button>
            </div>

            {tab === 'edit' && editing && (
              <div className="td-scroll-area">
                <EventEditor event={editing} onChange={setEditing} geoProfiles={geoProfiles} />
                <div className="ml-editor-footer">
                  <button className="ml-save-btn ml-save-btn-lg" onClick={saveEvent}>Save Event</button>
                  <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}

            {tab === 'edit' && !editing && (
              <div className="td-scroll-area td-view-sessions">
                {activeEvent.sessions.length === 0 ? (
                  <div className="ml-empty" style={{ padding: '32px' }}>No sessions logged. Click Edit to add sessions.</div>
                ) : activeEvent.sessions.map((s, i) => (
                  <div key={s.id} className="td-view-session-card">
                    <div className="td-view-session-title">
                      {s.name || `Practice ${i + 1}`}
                      <span className="td-view-session-car">{carLabel(s, geoProfiles)}</span>
                    </div>
                    <div className="td-view-session-body">
                      {s.condition && <span className="td-view-badge condition">{handlingConditions.find(c => c.value === s.condition)?.label}</span>}
                      {s.phase && <span className="td-view-badge phase">{cornerPhases.find(p => p.value === s.phase)?.label}</span>}
                      {s.ambient && <span className="td-view-badge">{s.ambient}°F</span>}
                      <div className="td-view-psi">
                        <span className="td-view-psi-label">Cold PSI</span>
                        {['LF', 'RF', 'LR', 'RR'].map(pos => (
                          <span key={pos} className="td-view-psi-item">{pos} {s.setup?.coldPsi?.[pos] ?? '—'}</span>
                        ))}
                      </div>
                      <div className="td-view-psi">
                        <span className="td-view-psi-label">Hot PSI</span>
                        {['LF', 'RF', 'LR', 'RR'].map(pos => (
                          <span key={pos} className="td-view-psi-item">{pos} {s.hotPsi?.[pos] || '—'}</span>
                        ))}
                      </div>
                      {s.lapNotes && <p className="td-view-notes">{s.lapNotes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'analyze' && (
              <div className="td-scroll-area">
                <AnalysisPanel
                  event={activeEvent}
                  allSessions={editing ? editing.sessions : activeEvent.sessions}
                  geoProfiles={geoProfiles}
                  apiKey={apiKey}
                  onSendToOptimizer={onSendToOptimizer}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
