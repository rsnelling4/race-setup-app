import { useState, useMemo, useEffect } from 'react';
import { useSync } from '../utils/SyncContext';
import { analyzeGeometry } from './GeometryAnalysis';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';

// Constants matching the rest of the app
const P71_TOTAL_WEIGHT    = 3700;
const P71_FRONT_AXLE_FRAC = 0.57;

// Groq AI integration (shared with Track Day)
const APIKEY_KEY = 'race_groq_api_key';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function callGroq(apiKey, prompt) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
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

// Build the AI prompt — give the model the same data the rule-based engine had,
// plus its own diagnoses, and ask for a second opinion.
function buildSecondOpinionPrompt({ car, analysis, measured, symptoms, aggregatedFixes, trackType }) {
  const isOval = trackType === 'oval';
  const lines = [];
  lines.push(`You are an experienced oval/figure-8 race crew chief reviewing a Crown Victoria P71 setup. The car uses an SLA front + Watts-link solid rear axle (factory Watts bracket is FIXED — not factory-adjustable; rear RC is changed by rear ride height or aftermarket bracket).`);
  lines.push(``);
  lines.push(`The local physics-based tuning advisor has produced its diagnosis below. Your job: review the data, confirm or disagree with each diagnosis, point out anything missed, and suggest the single most important next change. Be direct — no padding.`);
  lines.push(``);
  lines.push(`Track type: ${analysis.T.label}. Apex G ~${analysis.T.trackG}, apex steer ~${analysis.T.apexSteer}°.`);
  lines.push(``);
  lines.push(`── KEY GEOMETRY ──`);
  lines.push(`Front RC ${analysis.rcAvg?.toFixed(1)}" / Rear RC ${analysis.rearRC.toFixed(1)}" / RC differential ${analysis.rcDiff?.toFixed(1)}"`);
  lines.push(`Roll axis inclination: ${analysis.rollAxisInclination?.toFixed(2)}° (positive = rises toward rear)`);
  lines.push(`Front geometric LLTD: ${analysis.geoLLTDF != null ? (analysis.geoLLTDF*100).toFixed(0)+'%' : '—'}`);
  lines.push(`Roll gradient: ${analysis.rollGradient?.toFixed(2)}°/g, body roll at apex: ${analysis.rollAtApex?.toFixed(2)}°`);
  lines.push(`RF dynamic ground camber: ${analysis.rfGroundCamber?.toFixed(2)}° (target ${analysis.T.idealRFGroundCamber}°)`);
  lines.push(`LF dynamic ground camber: ${analysis.lfGroundCamber?.toFixed(2)}° (target ${analysis.T.idealLFGroundCamber}°)`);
  lines.push(`Static alignment: LF camber ${analysis.lfStatic.toFixed(2)}° / RF ${analysis.rfStatic.toFixed(2)}°, LF caster ${analysis.lfCaster.toFixed(1)}° / RF ${analysis.rfCaster.toFixed(1)}°`);
  if (car.toe) lines.push(`Front toe (in): ${car.toe}`);
  if (car.rearToe) lines.push(`Rear toe (in): ${car.rearToe}`);
  if (analysis.kwLF) {
    lines.push(`Springs: LF ${car.springRate?.LF || '?'} RF ${car.springRate?.RF || '?'} LR ${car.springRate?.LR || '?'} RR ${car.springRate?.RR || '?'} (lb/in)`);
    lines.push(`Wheel rates: F avg ${analysis.kwFavg?.toFixed(0)} / R avg ${analysis.kwRavg?.toFixed(0)} lb/in`);
  }
  if (car.shocks) {
    lines.push(`Shocks: LF ${car.shocks.LF || '?'} / RF ${car.shocks.RF || '?'} / LR ${car.shocks.LR || '?'} / RR ${car.shocks.RR || '?'}`);
  }

  if (measured) {
    lines.push(``);
    lines.push(`── MEASURED THIS SESSION ──`);
    if (measured.ambient != null) lines.push(`Ambient: ${measured.ambient}°F, tires set at ${measured.inflationTemp ?? '?'}°F`);
    const cp = measured.coldPsi;
    const hp = measured.hotPsi;
    if (cp.LF != null || cp.RF != null) lines.push(`Cold PSI: LF ${cp.LF ?? '?'} / RF ${cp.RF ?? '?'} / LR ${cp.LR ?? '?'} / RR ${cp.RR ?? '?'}`);
    if (hp.LF != null || hp.RF != null) lines.push(`Hot PSI:  LF ${hp.LF ?? '?'} / RF ${hp.RF ?? '?'} / LR ${hp.LR ?? '?'} / RR ${hp.RR ?? '?'}`);
    const tt = measured.tireTemps;
    for (const pos of ['LF', 'RF', 'LR', 'RR']) {
      const t = tt[pos];
      if (t.inside != null || t.middle != null || t.outside != null) {
        lines.push(`Pyrometer ${pos}: I ${t.inside ?? '?'} / M ${t.middle ?? '?'} / O ${t.outside ?? '?'} °F`);
      }
    }
    if (measured.condition) lines.push(`Driver feel: car ${measured.condition}${measured.phase ? ` in ${measured.phase}` : ''}`);
    if (measured.bestLap) lines.push(`Best lap: ${measured.bestLap}s`);
    if (measured.lapTimes) lines.push(`All laps: ${measured.lapTimes}`);
    if (measured.lapNotes) lines.push(`Notes: ${measured.lapNotes}`);
  }

  lines.push(``);
  lines.push(`── LOCAL ENGINE DIAGNOSIS ──`);
  if (symptoms.length === 0) {
    lines.push(`(no significant issues flagged)`);
  } else {
    for (const s of symptoms) {
      const tag = s.isMixed ? `MIXED → NET ${s.behavior}` : s.behavior;
      lines.push(`[${s.phase} · ${s.severity.toUpperCase()}] ${tag}: ${s.why}`);
      if (s.contributors) {
        for (const c of s.contributors) {
          lines.push(`    └─ ${c.behavior}: ${c.why}`);
        }
      }
    }
  }

  lines.push(``);
  lines.push(`── LOCAL ENGINE FIXES ──`);
  if (aggregatedFixes.track.length > 0) {
    lines.push(`Track tunes:`);
    for (const f of aggregatedFixes.track) lines.push(`  - [${f.magnitude}] ${f.action}`);
  }
  if (aggregatedFixes.garage.length > 0) {
    lines.push(`Garage tunes:`);
    for (const f of aggregatedFixes.garage) lines.push(`  - [${f.magnitude}] ${f.action}`);
  }

  lines.push(``);
  lines.push(`── REQUEST ──`);
  lines.push(`1. CONFIRM or DISAGREE with each diagnosed symptom (cite a number that supports your view).`);
  lines.push(`2. List anything the local engine missed that the data shows.`);
  lines.push(`3. State the single most important next change and why.`);
  lines.push(`4. If track tunes (pressure/toe/camber-bolt) and garage tunes (shock/spring/alignment/RC) are both needed, separate them.`);
  lines.push(`Format: short bullet points. Do not repeat the data back.`);

  return lines.join('\n');
}

// ─── Plausibility limits (so fixes never recommend the impossible) ───────────
const LIMITS = {
  staticCamberMin: -3.0,    // Most negative reachable on P71 with cam bolt
  staticCamberRulesMin: -4.0,
  casterMax: 9.0,           // Eccentric bolt limit
  casterMin: 2.5,
  toeOutMax: -0.375,        // Inches total
  toeInMax:  +0.250,
  springFrontMax: 700,      // Heavy Duty strut option
  springRearMax:  220,
  pressureMax: 38,
  pressureMin: 14,
};

// ─── Helper: classify a numeric severity into one of: low/medium/high ────────
function bucket(v, lo, hi) {
  const a = Math.abs(v);
  if (a >= hi) return 'high';
  if (a >= lo) return 'medium';
  return 'low';
}

const SEV_RANK = { high: 3, medium: 2, low: 1, info: 0 };

// ─── Find a recommended shock from the database for an action ───────────────
//
// deltaSteps semantics: +N = stiffer = LOWER rating number; -N = softer = HIGHER.
//
// The result also enforces meaningful direction: a "stiffer" recommendation is
// rejected if the result is still in the soft half (rating > 5), and likewise
// a "softer" recommendation is rejected if still in the stiff half (rating < 5).
// This prevents the UI from telling a user with rating-10 fronts to "go stiffer
// to rating 8" — still soft, no real change.
function findShock(corner, currentRating, deltaSteps, isFront) {
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  if (currentRating == null) {
    const target = 4;
    const pick = list.find(s => s.rating === target);
    return pick ? { ...pick, label: shockLabel(pick), reason: 'starting baseline' } : null;
  }
  let targetRating = Math.max(0, Math.min(10, currentRating - deltaSteps));
  // Direction guard: ensure the result actually crosses the midpoint when the
  // user is far from it. If currentRating is very soft (8+) and we're asking
  // for stiffer, push the target into the firm half (≤4). Same for very stiff
  // current going softer.
  const wantStiffer = deltaSteps > 0;
  const wantSofter  = deltaSteps < 0;
  if (wantStiffer && targetRating > 5) {
    // Land in the firm half
    targetRating = Math.min(targetRating, 4);
  }
  if (wantSofter && targetRating < 5) {
    targetRating = Math.max(targetRating, 6);
  }
  // Find shock with that exact rating; if none, find the closest
  let pick = list.find(s => s.rating === targetRating);
  if (!pick) {
    pick = [...list].sort((a, b) =>
      Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
    )[0];
  }
  return pick ? { ...pick, label: shockLabel(pick), fromRating: currentRating } : null;
}

// Lookup the rating of a saved shock label
function lookupRating(label, isFront) {
  if (!label) return null;
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  const found = list.find(s => shockLabel(s) === label);
  return found ? found.rating : null;
}

// ─── Build a "measured" context from a Track Day session ────────────────────
// Returns null if no session selected. When present, has every field the
// extended diagnose() rules consume. All numeric fields return null when
// missing, never zero, so rules can guard with `!= null`.
function buildMeasuredContext(session) {
  if (!session) return null;
  const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const psi = (group, pos) => num(session[group]?.[pos]);
  const temp = (pos, zone) => num(session.tireTemps?.[pos]?.[zone]);
  const tempRow = pos => ({
    inside:  temp(pos, 'inside'),
    middle:  temp(pos, 'middle'),
    outside: temp(pos, 'outside'),
  });
  const setupCold = (pos) => num(session.setup?.coldPsi?.[pos]);
  return {
    hasMeasured: true,
    ambient:       num(session.ambient),
    inflationTemp: num(session.inflationTemp),
    // Cold PSI lives on session.setup.coldPsi (Track Day shape)
    coldPsi: { LF: setupCold('LF'), RF: setupCold('RF'), LR: setupCold('LR'), RR: setupCold('RR') },
    hotPsi:  { LF: psi('hotPsi', 'LF'), RF: psi('hotPsi', 'RF'), LR: psi('hotPsi', 'LR'), RR: psi('hotPsi', 'RR') },
    tireTemps: { LF: tempRow('LF'), RF: tempRow('RF'), LR: tempRow('LR'), RR: tempRow('RR') },
    condition: session.condition || null,    // 'push'|'loose'|'understeer'|...
    phase: session.phase || null,            // 'entry'|'middle'|'exit'
    bestLap:  num(session.bestLap),
    lapTimes: session.lapTimes || null,
    lapNotes: session.lapNotes || null,
  };
}

// Map driver-feel condition values to our behavior taxonomy
function conditionToBehavior(cond) {
  if (!cond) return null;
  const c = cond.toLowerCase();
  if (c.includes('push') || c.includes('under')) return 'PUSH';
  if (c.includes('loose') || c.includes('over'))  return 'LOOSE';
  return null;
}
function phaseToCanonical(phase) {
  if (!phase) return null;
  const p = phase.toLowerCase();
  if (p.includes('entry') || p.includes('turn-in')) return 'ENTRY';
  if (p.includes('middle') || p.includes('apex'))   return 'MIDDLE';
  if (p.includes('exit'))                            return 'EXIT';
  return null;
}

// ─── Diagnose handling — produces a list of {phase, behavior, why, severity} ─
//
// `phase` ∈ ENTRY | MIDDLE | EXIT | OVERALL
// `behavior` ∈ PUSH | LOOSE | NEUTRAL | INSTABILITY
// `severity` ∈ low | medium | high
//
// `measured` is optional: when present, contains live session data (cold/hot
// PSI, pyrometer readings, driver feel, lap times). Diagnostic rules that
// consume measured data trump rules that infer from geometry alone.
//
function diagnose(a, geo, trackType, measured = null) {
  const symptoms = [];
  const isOval = trackType === 'oval';

  // ── 1. RC differential → entry behavior ─────────────────────────────────
  // Front RC > rear RC = front loads geometrically faster = sharp turn-in (oval favorable)
  // Front RC < rear RC = rear loads first = entry oversteer
  if (a.rcDiff != null) {
    if (a.rcDiff < -2) {
      symptoms.push({
        phase: 'ENTRY',
        behavior: 'LOOSE',
        severity: bucket(a.rcDiff, 2, 5),
        magnitude: Math.abs(a.rcDiff),
        why: `Rear roll center (${a.rearRC.toFixed(1)}") is ${Math.abs(a.rcDiff).toFixed(1)}" higher than front (${a.rcAvg.toFixed(1)}"). Rear axle transfers load geometrically faster than front, so the tail sets first when you turn in — the car rotates before the front fully bites.`,
        causeTag: 'RC_DIFF_NEG',
      });
    } else if (a.rcDiff > 6 && isOval) {
      symptoms.push({
        phase: 'ENTRY',
        behavior: 'PUSH',
        severity: bucket(a.rcDiff - 6, 1, 4),
        magnitude: a.rcDiff,
        why: `Front roll center (${a.rcAvg.toFixed(1)}") is much higher than rear (${a.rearRC.toFixed(1)}"). Front loads up so abruptly through the geometry that springs/ARB cannot bias load to the RF — the front axle plants symmetrically and pushes.`,
        causeTag: 'RC_DIFF_HIGH',
      });
    } else if (!isOval && Math.abs(a.rcDiff) > 3) {
      symptoms.push({
        phase: 'ENTRY',
        behavior: a.rcDiff > 0 ? 'PUSH' : 'LOOSE',
        severity: bucket(Math.abs(a.rcDiff) - 3, 1, 3),
        magnitude: Math.abs(a.rcDiff),
        why: `Figure-8: front and rear RC differential of ${a.rcDiff.toFixed(1)}" is too large for symmetric handling. Car will turn-in differently going left vs right.`,
        causeTag: 'RC_DIFF_F8_ASYM',
      });
    }
  }

  // ── 2. Geometric LLTD → mid-corner balance ──────────────────────────────
  if (a.geoLLTDF != null) {
    const front = a.geoLLTDF;
    if (front > 0.72) {
      symptoms.push({
        phase: 'MIDDLE',
        behavior: 'PUSH',
        severity: bucket(front - 0.72, 0.04, 0.10),
        magnitude: front,
        why: `Front geometric LLTD is ${(front * 100).toFixed(0)}% — above the 72% upper bound. Most of the lateral load transfer at the front happens through the control arms (geometric path), so the front ARB and springs have very little authority to redistribute that load. Front axle plants both tires symmetrically rather than biasing to RF.`,
        causeTag: 'LLTD_FRONT_HIGH',
      });
    } else if (front < 0.55) {
      symptoms.push({
        phase: 'MIDDLE',
        behavior: 'LOOSE',
        severity: bucket(0.55 - front, 0.03, 0.10),
        magnitude: front,
        why: `Front geometric LLTD is only ${(front * 100).toFixed(0)}% — below 55%. The rear is doing too much of the geometric work. Rear axle loads up first and stays loaded through the middle, rotating the car.`,
        causeTag: 'LLTD_FRONT_LOW',
      });
    }
  }

  // ── 3. Camber chain → mid-corner / exit grip on outside front ───────────
  if (a.rfCamberDev != null) {
    if (a.rfCamberDev > 0.4) {
      // RF tilting outward at apex — outside edge runs hot
      symptoms.push({
        phase: isOval ? 'MIDDLE' : 'MIDDLE',
        behavior: 'PUSH',
        severity: bucket(a.rfCamberDev, 0.4, 1.0),
        magnitude: a.rfCamberDev,
        why: `RF dynamic ground camber works out to ${a.rfGroundCamber.toFixed(2)}° — that's ${a.rfCamberDev.toFixed(2)}° more positive than the ${a.T.idealRFGroundCamber}° target. The RF outside tire is leaning outward at apex, riding on its outside edge. Outside edge runs hot, contact patch is small, lateral grip is reduced — front pushes mid-corner.`,
        causeTag: 'RF_CAMBER_INSUFFICIENT',
      });
    } else if (a.rfCamberDev < -0.5) {
      symptoms.push({
        phase: 'EXIT',
        behavior: 'LOOSE',
        severity: bucket(Math.abs(a.rfCamberDev), 0.5, 1.5),
        magnitude: Math.abs(a.rfCamberDev),
        why: `RF dynamic ground camber works out to ${a.rfGroundCamber.toFixed(2)}° — ${Math.abs(a.rfCamberDev).toFixed(2)}° more negative than the ${a.T.idealRFGroundCamber}° target. RF inside edge runs hot. Reduced contact patch under throttle — RF can't put the power down on exit, may chatter.`,
        causeTag: 'RF_CAMBER_EXCESS',
      });
    }
  }

  // ── 4. Body roll → mid-corner stability ─────────────────────────────────
  if (a.rollAtApex != null) {
    if (a.rollAtApex > 4.5) {
      symptoms.push({
        phase: 'MIDDLE',
        behavior: 'INSTABILITY',
        severity: bucket(a.rollAtApex - 4.5, 0.5, 2.0),
        magnitude: a.rollAtApex,
        why: `Body roll at apex is ${a.rollAtApex.toFixed(1)}° — excessive. The body is rolling more than the geometry can compensate for. Outside tires lean outward, inside tires unload. Camber chain output is degraded.`,
        causeTag: 'ROLL_EXCESS',
      });
    } else if (a.rollAtApex < 1.8) {
      symptoms.push({
        phase: 'OVERALL',
        behavior: 'INSTABILITY',
        severity: 'low',
        magnitude: a.rollAtApex,
        why: `Body roll at apex is only ${a.rollAtApex.toFixed(1)}° — very stiff. Car may skip across surface bumps rather than rolling through them.`,
        causeTag: 'ROLL_INSUFFICIENT',
      });
    }
  }

  // ── 5. Caster effectiveness ─────────────────────────────────────────────
  if (isOval) {
    // RF caster → camber gain on the outside front. Want more = better.
    const rfCasterGainAbs = Math.abs(a.rfCasterGain);
    if (a.rfCaster < 4.5) {
      symptoms.push({
        phase: 'MIDDLE',
        behavior: 'PUSH',
        severity: bucket(4.5 - a.rfCaster, 1, 2),
        magnitude: a.rfCaster,
        why: `RF caster is only ${a.rfCaster.toFixed(1)}° — below 4.5°. RF caster contributes ${rfCasterGainAbs.toFixed(2)}° of negative camber dynamically; more caster = more dynamic negative camber = better contact at apex. Currently leaving free camber gain unused.`,
        causeTag: 'RF_CASTER_LOW',
      });
    }
  } else if (Math.abs(a.rfCaster - a.lfCaster) > 1.0) {
    // Figure-8 needs symmetric caster
    symptoms.push({
      phase: 'OVERALL',
      behavior: 'INSTABILITY',
      severity: bucket(Math.abs(a.rfCaster - a.lfCaster), 1.0, 2.5),
      magnitude: Math.abs(a.rfCaster - a.lfCaster),
      why: `Caster split LF ${a.lfCaster.toFixed(1)}° / RF ${a.rfCaster.toFixed(1)}° = ${Math.abs(a.rfCaster - a.lfCaster).toFixed(1)}° asymmetric. Figure-8 turns both ways; asymmetric caster gives different camber gain in left vs right turns — car will feel inconsistent.`,
      causeTag: 'CASTER_F8_ASYMMETRIC',
    });
  }

  // ── 6. Roll axis inclination ────────────────────────────────────────────
  if (a.rollAxisInclination != null) {
    if (a.rollAxisInclination < 0) {
      symptoms.push({
        phase: 'OVERALL',
        behavior: 'INSTABILITY',
        severity: 'high',
        magnitude: Math.abs(a.rollAxisInclination),
        why: `Roll axis tilts DOWN toward the rear by ${Math.abs(a.rollAxisInclination).toFixed(2)}°. Front RC is higher than rear — body jacks upward in cornering rather than rolling through the geometry. Unpredictable load transfer.`,
        causeTag: 'ROLL_AXIS_INVERTED',
      });
    } else if (a.rollAxisInclination > 9) {
      symptoms.push({
        phase: 'ENTRY',
        behavior: 'LOOSE',
        severity: 'medium',
        magnitude: a.rollAxisInclination,
        why: `Roll axis is steeply inclined (${a.rollAxisInclination.toFixed(1)}°). Rear loads up much faster than front — corner-entry oversteer when the rear hits its geometric limit.`,
        causeTag: 'ROLL_AXIS_STEEP',
      });
    }
  }

  // ── 7. Shock balance → entry/exit transient behavior ────────────────────
  const lfRating = lookupRating(geo.shocks?.LF, true);
  const rfRating = lookupRating(geo.shocks?.RF, true);
  const lrRating = lookupRating(geo.shocks?.LR, false);
  const rrRating = lookupRating(geo.shocks?.RR, false);
  const frontRatingAvg = (lfRating != null && rfRating != null) ? (lfRating + rfRating) / 2 : null;
  const rearRatingAvg  = (lrRating != null && rrRating != null) ? (lrRating + rrRating) / 2 : null;

  if (frontRatingAvg != null && rearRatingAvg != null) {
    const split = frontRatingAvg - rearRatingAvg;
    // Negative split = front stiffer than rear (lower rating # = stiffer)
    if (split > 3) {
      // Rear stiffer than front
      symptoms.push({
        phase: 'EXIT',
        behavior: 'PUSH',
        severity: bucket(split - 3, 1, 3),
        magnitude: split,
        why: `Front shocks (avg rating ${frontRatingAvg.toFixed(1)}) are softer than rear shocks (avg ${rearRatingAvg.toFixed(1)}). Rear stays planted, front rolls more — front loses grip relative to rear on throttle exit, push develops.`,
        causeTag: 'SHOCKS_REAR_STIFF',
      });
    } else if (split < -3) {
      symptoms.push({
        phase: 'ENTRY',
        behavior: 'LOOSE',
        severity: bucket(-split - 3, 1, 3),
        magnitude: -split,
        why: `Front shocks (avg rating ${frontRatingAvg.toFixed(1)}) are much stiffer than rear shocks (avg ${rearRatingAvg.toFixed(1)}). Rear lifts and rotates on entry while front holds — loose entry.`,
        causeTag: 'SHOCKS_FRONT_STIFF',
      });
    }
  }

  // ── 8. Bumpstop proximity → mid-corner spike (any corner < 0.5") ────────
  for (const pos of ['LF', 'RF', 'LR', 'RR']) {
    const sd = a.shockData[pos];
    if (sd && sd.jounceAvail != null && sd.jounceAvail < 0.5) {
      const phase = pos.endsWith('F') ? 'MIDDLE' : 'EXIT';
      symptoms.push({
        phase,
        behavior: 'INSTABILITY',
        severity: 'high',
        magnitude: 0.5 - sd.jounceAvail,
        why: `${pos} bumpstop gap is only ${sd.jounceAvail.toFixed(2)}" at ride height. In hard cornering this corner contacts the bump rubber, spiking effective spring rate to near-infinite — tire momentarily loses grip. Felt as an unsettled jolt mid-corner or on bumps.`,
        causeTag: `BUMPSTOP_${pos}`,
      });
    }
  }

  // ── 9. Measured cold PSI imbalance (oval-specific) ──────────────────────
  // Tire pressures are session data and only diagnosed when a session is the
  // analysis source. Without a session there is nothing to compare against.
  if (measured && measured.coldPsi) {
    const psi = measured.coldPsi;
    if (psi.LF != null && psi.RF != null && isOval && psi.LF > psi.RF + 4) {
      symptoms.push({
        phase: 'MIDDLE',
        behavior: 'LOOSE',
        severity: 'low',
        magnitude: psi.LF - psi.RF,
        why: `Cold PSI: LF ${psi.LF} vs RF ${psi.RF} (Δ +${(psi.LF - psi.RF).toFixed(0)}). On a left-turn oval the RF is the loaded outside tire and wants more pressure to support sidewall — the imbalance reduces RF grip relative to its load.`,
        causeTag: 'PSI_LR_LF_HIGH',
      });
    }
  }

  // ── 10. MEASURED — pyrometer cross-tread signature ──────────────────────
  // Inside-hot, middle-cool, outside-cool = too much negative camber.
  // Outside-hot, middle-cool, inside-cool = not enough negative camber.
  // Middle hot vs edges = pressure too high. Middle cool vs edges = too low.
  // These trump the geometry-only camber chain analysis because they are
  // physical evidence rather than predicted dynamics.
  if (measured && measured.tireTemps) {
    for (const pos of ['LF', 'RF', 'LR', 'RR']) {
      const t = measured.tireTemps[pos];
      if (t.inside == null || t.middle == null || t.outside == null) continue;
      const max = Math.max(t.inside, t.middle, t.outside);
      const min = Math.min(t.inside, t.middle, t.outside);
      const span = max - min;
      // Edge analysis (camber)
      const edgeDelta = t.inside - t.outside;
      // Center analysis (pressure)
      const centerDelta = t.middle - (t.inside + t.outside) / 2;

      // Camber signal — only meaningful with a clear edge bias
      if (Math.abs(edgeDelta) >= 8) {
        const isOutsideTire = isOval ? pos === 'RF' : true; // outside front matters most
        if (edgeDelta > 0 && pos === 'RF') {
          // Inside hotter than outside on RF — too much neg camber
          symptoms.push({
            phase: 'EXIT',
            behavior: 'LOOSE',
            severity: bucket(edgeDelta, 8, 20),
            magnitude: edgeDelta,
            why: `RF pyrometer: inside ${t.inside}°F vs outside ${t.outside}°F (Δ ${edgeDelta.toFixed(0)}°F hotter inside). Inside edge is doing all the work — too much negative camber dynamically. Reduced contact patch under throttle, RF can't put power down on exit.`,
            causeTag: 'MEAS_RF_INSIDE_HOT',
          });
        } else if (edgeDelta < -8 && pos === 'RF') {
          // Outside hotter than inside on RF — not enough neg camber
          symptoms.push({
            phase: 'MIDDLE',
            behavior: 'PUSH',
            severity: bucket(-edgeDelta, 8, 20),
            magnitude: -edgeDelta,
            why: `RF pyrometer: outside ${t.outside}°F vs inside ${t.inside}°F (Δ ${(-edgeDelta).toFixed(0)}°F hotter outside). Outside edge is the only thing on the ground — RF leaning outward at apex from too little dynamic negative camber. Front pushes mid-corner.`,
            causeTag: 'MEAS_RF_OUTSIDE_HOT',
          });
        } else if (edgeDelta < -8 && pos === 'LF') {
          // Outside hotter than inside on LF — for oval LF is the inside (droop)
          // tire, hot outside means LF static was too positive
          symptoms.push({
            phase: 'OVERALL',
            behavior: 'INSTABILITY',
            severity: 'low',
            magnitude: -edgeDelta,
            why: `LF pyrometer: outside ${t.outside}°F vs inside ${t.inside}°F (Δ ${(-edgeDelta).toFixed(0)}°F hotter outside). LF inside is unloaded in left-turn — outside edge running hot suggests LF static camber set too positive.`,
            causeTag: 'MEAS_LF_OUTSIDE_HOT',
          });
        }
      }

      // Pressure signal
      if (centerDelta >= 8) {
        symptoms.push({
          phase: 'OVERALL',
          behavior: 'INSTABILITY',
          severity: bucket(centerDelta, 8, 20),
          magnitude: centerDelta,
          why: `${pos} pyrometer: middle ${t.middle}°F vs edges avg ${((t.inside + t.outside) / 2).toFixed(0)}°F (Δ +${centerDelta.toFixed(0)}°F hotter middle). Center crowning — pressure too high. Tire rides on center, smaller contact patch, less grip.`,
          causeTag: `MEAS_${pos}_PSI_HIGH`,
        });
      } else if (centerDelta <= -8) {
        symptoms.push({
          phase: 'OVERALL',
          behavior: 'INSTABILITY',
          severity: bucket(-centerDelta, 8, 20),
          magnitude: -centerDelta,
          why: `${pos} pyrometer: middle ${t.middle}°F vs edges avg ${((t.inside + t.outside) / 2).toFixed(0)}°F (Δ ${centerDelta.toFixed(0)}°F cooler middle). Tire bowing under load — pressure too low. Sidewalls flexing, vague feel.`,
          causeTag: `MEAS_${pos}_PSI_LOW`,
        });
      }
    }
  }

  // ── 11. MEASURED — overall tire temperature balance (front vs rear) ─────
  if (measured && measured.tireTemps) {
    const avgF = (() => {
      const v = ['LF', 'RF']
        .map(p => measured.tireTemps[p])
        .filter(t => t.inside != null && t.middle != null && t.outside != null)
        .map(t => (t.inside + t.middle + t.outside) / 3);
      return v.length ? v.reduce((a, b) => a + b) / v.length : null;
    })();
    const avgR = (() => {
      const v = ['LR', 'RR']
        .map(p => measured.tireTemps[p])
        .filter(t => t.inside != null && t.middle != null && t.outside != null)
        .map(t => (t.inside + t.middle + t.outside) / 3);
      return v.length ? v.reduce((a, b) => a + b) / v.length : null;
    })();
    if (avgF != null && avgR != null) {
      const delta = avgF - avgR;
      if (delta >= 25) {
        symptoms.push({
          phase: 'MIDDLE',
          behavior: 'PUSH',
          severity: bucket(delta - 25, 5, 20),
          magnitude: delta,
          why: `Front tires averaged ${avgF.toFixed(0)}°F vs rear ${avgR.toFixed(0)}°F (Δ +${delta.toFixed(0)}°F front hotter). Front working much harder than rear — front tires saturated, push.`,
          causeTag: 'MEAS_FRONT_HOT',
        });
      } else if (delta <= -25) {
        symptoms.push({
          phase: 'MIDDLE',
          behavior: 'LOOSE',
          severity: bucket(-delta - 25, 5, 20),
          magnitude: -delta,
          why: `Rear tires averaged ${avgR.toFixed(0)}°F vs front ${avgF.toFixed(0)}°F (Δ +${(-delta).toFixed(0)}°F rear hotter). Rear working harder — rear gets to grip limit first, loose.`,
          causeTag: 'MEAS_REAR_HOT',
        });
      }
    }
  }

  // ── 12. MEASURED — driver feel report (subjective truth) ────────────────
  // The driver's reported feel is direct primary evidence. We add it as its
  // own symptom that mirrors any matching geometric symptom (or stands alone
  // if geometry didn't predict it). This both confirms predictions and
  // surfaces feel that the geometry-only model missed.
  if (measured?.condition) {
    const drvBehavior = conditionToBehavior(measured.condition);
    const drvPhase    = phaseToCanonical(measured.phase) || 'MIDDLE';
    if (drvBehavior) {
      // Check whether geometry already predicted this — if so, mark it as
      // confirmed; if not, add it as a new symptom with high credibility.
      const matched = symptoms.find(s => s.phase === drvPhase && s.behavior === drvBehavior);
      if (matched) {
        matched.driverConfirmed = true;
        matched.why = `[DRIVER CONFIRMED] ${matched.why}`;
      } else {
        symptoms.push({
          phase: drvPhase,
          behavior: drvBehavior,
          severity: 'high',
          magnitude: 1,
          why: `Driver reports the car ${drvBehavior === 'PUSH' ? 'pushes' : 'is loose'} in the ${drvPhase.toLowerCase()} of the corner. Geometry alone did not predict this — possible causes: tire pressure, shock balance, or an alignment number not yet measured. See "How to fix it" below.`,
          causeTag: `DRIVER_${drvBehavior}_${drvPhase}`,
          driverOnly: true,
        });
      }
    }
  }

  // Net opposing PUSH/LOOSE symptoms within a phase into a single MIXED entry,
  // and sort the result.
  return netSymptoms(symptoms);
}

// ─── Generate fixes for each symptom — track + garage ────────────────────────
function fixesFor(symptom, a, geo, trackType, measured = null) {
  // MIXED phase: union the fixes for each contributing cause so the user sees
  // every available action. The aggregator de-duplicates downstream.
  if (symptom.causeTag === 'MIXED_PHASE' && symptom._expandedSymptoms) {
    const out = { track: [], garage: [] };
    for (const c of symptom._expandedSymptoms) {
      const f = fixesFor(c, a, geo, trackType, measured);
      out.track.push(...f.track);
      out.garage.push(...f.garage);
    }
    return out;
  }

  // Resolve cold PSI from the Track Day session only. Tire pressures are
  // session-specific data and never live on the car profile. When no session
  // is selected, recipes that reference current PSI render generic guidance
  // without a "current X" anchor.
  const psiAt = (pos) => {
    const m = measured?.coldPsi?.[pos];
    return Number.isFinite(m) ? m : null;
  };
  const psiSourceLabel = 'session';

  const fixes = { track: [], garage: [] };
  const isOval = trackType === 'oval';
  const tag = symptom.causeTag;

  switch (tag) {

    // ── RC differential issues ───────────────────────────────────────────
    // NOTE: factory P71 Watts bracket is FIXED — pivot height is set by the
    // weldment on the axle housing. To change rear RC the realistic options
    // are: (1) change rear ride height (raises/lowers the entire axle and the
    // Watts pivot with it), or (2) install an aftermarket adjustable Watts
    // bracket (Fays2, Strange, fabricated).
    case 'RC_DIFF_NEG':
      fixes.garage.push({
        action: `Raise front ride height ½–1" on stiffer or taller front springs (e.g. P71 700 lb/in HD struts).`,
        impact: `Raises front RC by ~1–2" closer to rear RC. Front-side correction — works without touching the rear and uses parts already in the P71 catalog.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Lower rear ride height ½" via softer or shorter rear coil springs.`,
        impact: `Drops the rear axle assembly (and the fixed Watts pivot mounted on it) by ½", reducing rear RC by approximately the same amount. Re-check rake after the change.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Aftermarket adjustable Watts bracket (Fays2, Strange, fabricated). Drop center pivot ${Math.min(Math.abs(a.rcDiff) - 1, 4).toFixed(1)}".`,
        impact: `Direct correction — drops rear RC from ${a.rearRC.toFixed(1)}" toward ${(a.rearRC - Math.min(Math.abs(a.rcDiff) - 1, 4)).toFixed(1)}" without changing rear ride height or rake. Requires aftermarket part purchase.`,
        magnitude: 'high',
      });
      fixes.track.push({
        action: `Add ½ turn of static negative camber to RF.`,
        impact: `Helps the RF bite earlier on entry — partially masks the entry rotation. Not a fix, but buys lap time while the geometry change is scheduled.`,
        magnitude: 'low',
      });
      break;

    case 'RC_DIFF_HIGH':
      fixes.garage.push({
        action: `Raise front ride height 0.5"–1.0" using stiffer or taller front springs.`,
        impact: `Counter-intuitive but correct: raising the front via stiffer springs drops front RC RELATIVE to the CG, reducing front geometric load transfer share and returning ARB/spring authority. Each 1" of stiffer-spring ride height ≈ 1–2" of geometric front RC change.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Raise rear ride height ½" via stiffer rear coil springs (e.g. 200 lb/in HD).`,
        impact: `Lifts the rear axle and the fixed Watts pivot ½", indirectly raising rear RC by the same amount and closing the differential. Side benefit: stiffer rear adds elastic LLTD to rear.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Aftermarket adjustable Watts bracket — raise center pivot to ${Math.min(a.rearRC + 1.5, 18).toFixed(1)}".`,
        impact: `Direct correction — raises rear share of geometric transfer without changing rear ride height. Requires aftermarket part.`,
        magnitude: 'medium',
      });
      break;

    // ── LLTD issues ──────────────────────────────────────────────────────
    case 'LLTD_FRONT_HIGH':
      fixes.garage.push({
        action: `Raise front ride height 0.5"–1.0" via stiffer or taller front springs (e.g. 700 lb/in HD struts).`,
        impact: `Dropping front RC moves geometric LLTD toward 60–65%. Spring/ARB then have authority to bias load to the RF.`,
        magnitude: 'high',
      });
      fixes.track.push({
        action: psiAt('RF') != null
          ? `Raise RF cold pressure by 1–2 PSI (session ${psiAt('RF')} → ${psiAt('RF') + 2}).`
          : `Raise RF cold pressure by 1–2 PSI for next session.`,
        impact: `Stiffens RF sidewall to support loaded outside tire. Doesn't fix LLTD root cause but recovers some of the lost lateral grip.`,
        magnitude: 'low',
      });
      break;

    case 'LLTD_FRONT_LOW': {
      // Rear is doing too much geometric work. Factory Watts is fixed — the
      // realistic levers are rear ride height, front ride height, and (last
      // resort) an aftermarket adjustable Watts bracket.
      fixes.garage.push({
        action: `Lower rear ride height ½" via softer or shorter rear coil springs.`,
        impact: `Drops the rear axle and the fixed Watts pivot ½", reducing rear RC by approximately the same amount. Pulls geometric LLTD share back toward the front.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Raise front ride height ½–1" via stiffer front springs (e.g. 700 lb/in HD struts).`,
        impact: `Raises front RC closer to rear RC, increasing front geometric share. P71 Watts is not factory-adjustable, so this front-side change is the cleanest non-aftermarket fix.`,
        magnitude: 'high',
      });
      const target = Math.min(a.rearRC - 1.5, 14).toFixed(1);
      fixes.garage.push({
        action: `Aftermarket adjustable Watts bracket — drop center pivot to ~${target}".`,
        impact: `Direct correction without changing rear ride height. Requires aftermarket part (Fays2, Strange, fabricated).`,
        magnitude: 'high',
      });
      break;
    }

    // ── Camber chain ─────────────────────────────────────────────────────
    case 'RF_CAMBER_INSUFFICIENT': {
      const demanded = a.rfStaticDemanded;
      const current  = a.rfStatic;
      const need     = current - demanded;
      const reachable = demanded >= LIMITS.staticCamberMin;
      if (reachable) {
        fixes.garage.push({
          action: `Set RF static camber to ${demanded.toFixed(2)}° (${need >= 0 ? 'add' : 'reduce'} ${Math.abs(need).toFixed(2)}° vs current ${current.toFixed(2)}°). Install P71 camber bolt if not already.`,
          impact: `Camber chain adds: caster ${a.rfCasterGain.toFixed(2)}° + body roll ${a.rfBodyRoll.toFixed(2)}° + roll ${a.rollAtApex.toFixed(2)}° + sidewall ${a.swCamber.toFixed(2)}° = ${a.rfGroundCamber.toFixed(2)}° dynamic. Setting static at ${demanded.toFixed(2)}° gets dynamic to the ${a.T.idealRFGroundCamber}° target.`,
          magnitude: 'high',
        });
      } else {
        fixes.garage.push({
          action: `RF static needs ${demanded.toFixed(2)}° — beyond cam-bolt range. Install camber plates or offset subframe bushings to reach ${LIMITS.staticCamberRulesMin}°. Set as far negative as ruleset allows.`,
          impact: `Cam-bolt limit is ~${LIMITS.staticCamberMin}°. Going further requires hardware. Class rules may cap at ${LIMITS.staticCamberRulesMin}°.`,
          magnitude: 'high',
        });
      }
      // Caster fallback (oval only — caster contributes camber free)
      if (isOval && a.rfCaster < 7) {
        fixes.garage.push({
          action: `Increase RF caster from ${a.rfCaster.toFixed(1)}° toward ${Math.min(a.rfCaster + 2, 7).toFixed(1)}° via P71 lower control arm eccentric.`,
          impact: `Each 1° of RF caster adds ~${a.T.casterCoeffRF.toFixed(3)}° dynamic camber on the outside front — free negative camber without using static.`,
          magnitude: 'medium',
        });
      }
      // Track-side: tire pressure helps a hot outside edge
      fixes.track.push({
        action: psiAt('RF') != null
          ? `Drop RF cold pressure by 1–2 PSI (session ${psiAt('RF')} → ${psiAt('RF') - 2}).`
          : `Drop RF cold pressure by 1–2 PSI for next session.`,
        impact: `Lower pressure widens contact patch, broadens load distribution across the tire so the outside edge isn't the only thing on the ground. Mitigates push until camber is fixed.`,
        magnitude: 'low',
      });
      fixes.track.push({
        action: `Add 1/16" of front toe-out (current ${parseFloat(geo.toe) || 0}" → ${(parseFloat(geo.toe) || 0) - 0.0625}").`,
        impact: `Toe-out bites the outside front earlier on entry, helps the front turn before push develops. Track-tunable in 5 minutes with toe plates.`,
        magnitude: 'low',
      });
      break;
    }

    case 'RF_CAMBER_EXCESS': {
      const demanded = a.rfStaticDemanded;
      fixes.garage.push({
        action: `Reduce RF static negative camber. Target static: ${demanded.toFixed(2)}° (currently ${a.rfStatic.toFixed(2)}°).`,
        impact: `Brings dynamic ground camber from ${a.rfGroundCamber.toFixed(2)}° toward ${a.T.idealRFGroundCamber}° target. RF inside edge will stop running hot.`,
        magnitude: 'high',
      });
      fixes.track.push({
        action: `Raise RF cold pressure by 1–2 PSI to compress center of contact patch and shift load distribution outward.`,
        impact: `Smaller effect than alignment but track-tunable.`,
        magnitude: 'low',
      });
      break;
    }

    // ── Body roll ────────────────────────────────────────────────────────
    case 'ROLL_EXCESS': {
      const targetSpring = Math.round(parseFloat(geo.springRate?.LF || geo.springRate?.RF || 475) * 1.4 / 25) * 25;
      fixes.garage.push({
        action: `Stiffer front springs — current ${geo.springRate?.LF || '475'} → ${Math.min(targetSpring, 700)} lb/in. Use P71 700 lb/in HD struts if available.`,
        impact: `Reduces roll gradient from ${a.rollGradient?.toFixed(2)}°/g toward ~1.5°/g target. Apex roll drops from ${a.rollAtApex.toFixed(1)}° to ~${(a.rollAtApex * 475 / Math.min(targetSpring, 700)).toFixed(1)}°.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Stiffer ARB or larger-diameter front bar (1.25" if currently 1.161").`,
        impact: `ARB stiffness scales as d⁴ — a 1.25" bar = 1.34× stock stiffness. Reduces front roll without changing ride quality on bumps.`,
        magnitude: 'medium',
      });
      break;
    }

    // ── Caster ───────────────────────────────────────────────────────────
    case 'RF_CASTER_LOW':
      fixes.garage.push({
        action: `Increase RF caster from ${a.rfCaster.toFixed(1)}° to 5.5–7°. P71 lower control arm front bushing has eccentric range built in — set at the alignment rack.`,
        impact: `Each 1° of caster adds ~${a.T.casterCoeffRF.toFixed(3)}° dynamic negative camber on RF — direct improvement on outside-front grip with no other side effects.`,
        magnitude: 'medium',
      });
      break;

    case 'CASTER_F8_ASYMMETRIC':
      fixes.garage.push({
        action: `Equalize caster: average is ${((a.rfCaster + a.lfCaster)/2).toFixed(1)}°, set both LF and RF to that target ±0.25°.`,
        impact: `Equal camber gain in left vs right turns — car feels the same regardless of direction.`,
        magnitude: 'high',
      });
      break;

    // ── Roll axis ────────────────────────────────────────────────────────
    case 'ROLL_AXIS_INVERTED':
      fixes.garage.push({
        action: `URGENT: drop front RC. Lower front ride height OR install lower-rate / shorter front springs to bring the front below rear RC.`,
        impact: `Currently the body jacks upward in cornering instead of rolling — dangerous and unpredictable. P71 Watts is fixed; the front-side correction is required.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Raise rear ride height via stiffer rear springs to lift the Watts pivot.`,
        impact: `Lifts axle and Watts pivot together, raising rear RC. Combined with a front-side drop, restores normal roll axis inclination.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Aftermarket adjustable Watts bracket — raise center pivot.`,
        impact: `Most direct fix. Front RC must end up lower than rear RC. Requires aftermarket part.`,
        magnitude: 'high',
      });
      break;

    case 'ROLL_AXIS_STEEP':
      fixes.garage.push({
        action: `Lower rear ride height ½–1" via softer or shorter rear coil springs.`,
        impact: `Drops the axle and Watts pivot, reducing rear RC and roll axis inclination from ${a.rollAxisInclination.toFixed(1)}° toward 5–7°. P71 Watts is not factory-adjustable so ride height is the lever.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Aftermarket adjustable Watts bracket — drop center pivot 1–2".`,
        impact: `Direct correction without ride-height side effects. Requires aftermarket part.`,
        magnitude: 'medium',
      });
      break;

    // ── Shock balance ────────────────────────────────────────────────────
    case 'SHOCKS_REAR_STIFF': {
      // Recommend softer rear OR stiffer front
      const lrRating = lookupRating(geo.shocks?.LR, false);
      const lfRating = lookupRating(geo.shocks?.LF, true);
      const softerRear = lrRating != null ? findShock('LR', lrRating, -2, false) : null;
      const stifferFront = lfRating != null ? findShock('LF', lfRating, +2, true) : null;
      if (softerRear) {
        fixes.garage.push({
          action: `Softer rear shocks at LR/RR — try ${softerRear.label}. Rating ${softerRear.rating} vs your current rating ${lrRating} (higher rating = softer).`,
          impact: `${softerRear.ovalRole.split('.')[0]}.`,
          magnitude: 'high',
        });
      }
      if (stifferFront) {
        fixes.garage.push({
          action: `Or stiffer front struts — try ${stifferFront.label}. Rating ${stifferFront.rating} vs your current rating ${lfRating} (lower rating = stiffer).`,
          impact: `${stifferFront.ovalRole.split('.')[0]}.`,
          magnitude: 'medium',
        });
      }
      break;
    }

    case 'SHOCKS_FRONT_STIFF': {
      const lfRating = lookupRating(geo.shocks?.LF, true);
      const lrRating = lookupRating(geo.shocks?.LR, false);
      const softerFront = lfRating != null ? findShock('LF', lfRating, -2, true) : null;
      const stifferRear = lrRating != null ? findShock('LR', lrRating, +2, false) : null;
      if (softerFront) {
        fixes.garage.push({
          action: `Softer front struts — try ${softerFront.label}. Rating ${softerFront.rating} vs your current rating ${lfRating} (higher rating = softer).`,
          impact: `${softerFront.ovalRole.split('.')[0]}.`,
          magnitude: 'high',
        });
      }
      if (stifferRear) {
        fixes.garage.push({
          action: `Or stiffer rear shocks — try ${stifferRear.label}. Rating ${stifferRear.rating} vs your current rating ${lrRating} (lower rating = stiffer).`,
          impact: `${stifferRear.ovalRole.split('.')[0]}.`,
          magnitude: 'medium',
        });
      }
      break;
    }

    // ── Measured: pyrometer cross-tread signature ────────────────────────
    case 'MEAS_RF_OUTSIDE_HOT':
      // Same fixes as RF_CAMBER_INSUFFICIENT but evidence is now physical
      fixes.track.push({
        action: `Drop RF cold pressure by 1–2 PSI immediately for next session.`,
        impact: `Reduces center crowning and broadens contact patch so the outside edge isn't carrying everything. Fastest possible mitigation while alignment is being scheduled.`,
        magnitude: 'medium',
      });
      fixes.track.push({
        action: `Add 1/16" of front toe-out for next session if toe plates are available.`,
        impact: `Toe-out lets the outside front bite earlier on entry, reducing the time spent on the overheated outside edge.`,
        magnitude: 'low',
      });
      fixes.garage.push({
        action: `Add ½–1° more static negative camber to RF at the alignment rack. Install P71 camber bolt if not already.`,
        impact: `Pyrometer shows the outside edge is the only thing on the ground — RF needs more dynamic negative camber. Static increase is the most direct fix until the cam bolt limit (~−3°) is reached.`,
        magnitude: 'high',
      });
      if (a.rfCaster < 7) {
        fixes.garage.push({
          action: `Increase RF caster from ${a.rfCaster.toFixed(1)}° toward ${Math.min(a.rfCaster + 2, 7).toFixed(1)}° via the lower control arm eccentric.`,
          impact: `Each 1° of RF caster adds ~${a.T.casterCoeffRF.toFixed(3)}° dynamic negative camber on the outside front — free improvement on top of the static change.`,
          magnitude: 'medium',
        });
      }
      break;

    case 'MEAS_RF_INSIDE_HOT':
      fixes.track.push({
        action: `Raise RF cold pressure by 1–2 PSI for next session.`,
        impact: `Lifts the inside edge off the surface slightly, redistributing load toward the middle of the tread.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Reduce RF static negative camber by ½–1° at the alignment rack.`,
        impact: `Inside edge is doing all the work — RF has too much dynamic negative camber. Less static brings the contact patch back to flat.`,
        magnitude: 'high',
      });
      if (a.rfCaster > 4) {
        fixes.garage.push({
          action: `Optionally reduce RF caster slightly (within range; do not go below 3°).`,
          impact: `Lower caster reduces the dynamic negative camber added on top of static. Use this if a static reduction alone isn't enough.`,
          magnitude: 'low',
        });
      }
      break;

    case 'MEAS_LF_OUTSIDE_HOT':
      fixes.garage.push({
        action: `Reduce LF static positive camber. Set closer to +1° to +1.5° (currently more positive).`,
        impact: `LF is unloaded in left-turn oval. The outside edge running hot suggests LF static was set too positive — pull some out so the inside-edge isn't carrying nothing.`,
        magnitude: 'medium',
      });
      break;

    // ── Measured: pyrometer pressure signature ───────────────────────────
    case 'MEAS_LF_PSI_HIGH':
    case 'MEAS_RF_PSI_HIGH':
    case 'MEAS_LR_PSI_HIGH':
    case 'MEAS_RR_PSI_HIGH': {
      const pos = tag.split('_')[1];
      const cur = psiAt(pos);
      fixes.track.push({
        action: `Drop ${pos} cold pressure by 2 PSI for next session${cur != null ? ` (${psiSourceLabel} ${cur} → ${cur - 2})` : ''}.`,
        impact: `Pyrometer shows center crowning — pressure too high. Drop until the middle/edge spread is within 5°F.`,
        magnitude: 'high',
      });
      break;
    }

    case 'MEAS_LF_PSI_LOW':
    case 'MEAS_RF_PSI_LOW':
    case 'MEAS_LR_PSI_LOW':
    case 'MEAS_RR_PSI_LOW': {
      const pos = tag.split('_')[1];
      const cur = psiAt(pos);
      fixes.track.push({
        action: `Raise ${pos} cold pressure by 2 PSI for next session${cur != null ? ` (${psiSourceLabel} ${cur} → ${cur + 2})` : ''}.`,
        impact: `Pyrometer shows the middle is cooler than the edges — tire bowing under load, pressure too low. Raise until middle/edge spread closes.`,
        magnitude: 'high',
      });
      break;
    }

    // ── Measured: front/rear thermal balance ─────────────────────────────
    case 'MEAS_FRONT_HOT':
      fixes.track.push({
        action: `Drop both front cold pressures 1 PSI; raise both rears 1 PSI.`,
        impact: `Mild rebalance — gives the front more compliance and stiffens the rear sidewall to share more lateral work.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Stiffer rear springs (e.g. P71 200 lb/in HD) to recruit more rear roll work.`,
        impact: `Front tires are saturated because the front is doing all the cornering work. Stiffer rear roll stiffness pulls some lateral burden rearward.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Or softer front struts to reduce front roll stiffness contribution.`,
        impact: `Same effect from the other end — less front roll resistance = less front load saturation.`,
        magnitude: 'medium',
      });
      break;

    case 'MEAS_REAR_HOT':
      fixes.track.push({
        action: `Drop both rear cold pressures 1 PSI; raise both fronts 1 PSI.`,
        impact: `Gives the rear more compliance, stiffens front sidewall to absorb more lateral work.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Softer rear springs (160 lb/in stock) or softer rear shocks.`,
        impact: `Reduces rear roll stiffness, shifting lateral load distribution forward to share work with the front.`,
        magnitude: 'high',
      });
      break;

    // ── Driver-feel-only symptom (geometry didn't predict it) ────────────
    case 'DRIVER_PUSH_ENTRY':
    case 'DRIVER_PUSH_MIDDLE':
    case 'DRIVER_PUSH_EXIT':
      fixes.track.push({
        action: `Drop RF cold pressure 1 PSI for next session.`,
        impact: `Quickest mid-event change. Broadens RF contact patch when the front isn't biting.`,
        magnitude: 'medium',
      });
      fixes.track.push({
        action: `Add 1/16" front toe-out if toe plates are available.`,
        impact: `Toe-out helps the outside front bite earlier on entry — directly addresses driver-reported push.`,
        magnitude: 'medium',
      });
      fixes.garage.push({
        action: `Add ½° more RF static negative camber.`,
        impact: `Direct grip improvement on the loaded outside-front tire — most effective when geometry alone didn't predict push.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Investigate: re-measure RF camber, toe, and tire pressures. Driver feel disagrees with geometry prediction — something is different from what's recorded.`,
        impact: `When the driver reports a problem the math didn't predict, the input data is usually the issue. Re-verify the inputs before parts changes.`,
        magnitude: 'high',
      });
      break;

    case 'DRIVER_LOOSE_ENTRY':
    case 'DRIVER_LOOSE_MIDDLE':
    case 'DRIVER_LOOSE_EXIT':
      fixes.track.push({
        action: `Add 1 PSI to both rear tires for next session.`,
        impact: `Stiffens rear sidewall, increases rear lateral grip to plant the back end.`,
        magnitude: 'medium',
      });
      fixes.track.push({
        action: `Reduce front toe-out by 1/16" if currently aggressive.`,
        impact: `Less front bite at turn-in slows the rotation, calming a loose-entry condition.`,
        magnitude: 'low',
      });
      fixes.garage.push({
        action: `Stiffer rear shocks: pick a rating 1–2 steps stiffer from the catalog.`,
        impact: `Slows the rear from rotating away — direct fix for driver-reported looseness when geometry doesn't predict it.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Investigate: re-measure rear toe and rear ride height. Driver feel disagrees with geometry — something measured may be off.`,
        impact: `Loose feel without a geometric cause often traces to rear toe-out, sagging rear springs, or worn bushings.`,
        magnitude: 'high',
      });
      break;

    // ── Bumpstop ─────────────────────────────────────────────────────────
    default:
      if (tag.startsWith('BUMPSTOP_')) {
        const pos = tag.split('_')[1];
        fixes.garage.push({
          action: `${pos}: stiffer spring or shorter bumpstop rubber. Current bumpstop gap is critically low.`,
          impact: `Stiffer spring keeps the corner higher, away from contact. Or fit a tapered progressive rubber so the rate ramps smoothly instead of spiking.`,
          magnitude: 'high',
        });
        if (pos === 'RF' || pos === 'LF') {
          fixes.garage.push({
            action: `Alternative: 700 lb/in HD front struts (FCS 1336349 or stiffer)`,
            impact: `Higher static spring rate keeps the corner higher at race ride height — opens bumpstop gap.`,
            magnitude: 'medium',
          });
        }
      } else if (tag === 'PSI_LR_LF_HIGH') {
        fixes.track.push({
          action: `Drop LF cold by 2 PSI; add 2 PSI to RF.`,
          impact: `On left-turn oval, RF carries the most lateral load — needs stiffer sidewall. LF unloads — wants lower pressure for compliance.`,
          magnitude: 'medium',
        });
      } else if (tag === 'ROLL_INSUFFICIENT') {
        fixes.garage.push({
          action: `Softer front springs may be available — but verify ride frequency stays above 95 cpm.`,
          impact: `Adds compliance over surface bumps. Only do this if the car is actually skipping; otherwise stiff is correct on smooth oval.`,
          magnitude: 'low',
        });
      }
      break;
  }

  return fixes;
}

// ─── Per-phase netting ────────────────────────────────────────────────────────
// Two opposing causes (PUSH + LOOSE) can both be valid physically. The car
// exhibits whichever is dominant — but the masked cause re-appears the moment
// the dominant one is fixed. Convert opposing symptoms in a single phase into
// a single MIXED symptom that lists both contributors and predicts net behavior.
const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };

function netSymptoms(symptoms) {
  // Group by phase
  const byPhase = {};
  for (const s of symptoms) {
    (byPhase[s.phase] = byPhase[s.phase] || []).push(s);
  }

  const result = [];
  for (const phase of Object.keys(byPhase)) {
    const list = byPhase[phase];
    const pushes = list.filter(s => s.behavior === 'PUSH');
    const looses = list.filter(s => s.behavior === 'LOOSE');
    const others = list.filter(s => s.behavior !== 'PUSH' && s.behavior !== 'LOOSE');

    if (pushes.length > 0 && looses.length > 0) {
      // Sum severities
      const pushScore = pushes.reduce((sum, s) => sum + SEVERITY_WEIGHT[s.severity], 0);
      const looseScore = looses.reduce((sum, s) => sum + SEVERITY_WEIGHT[s.severity], 0);
      const diff = Math.abs(pushScore - looseScore);
      const netBehavior = pushScore > looseScore ? 'PUSH' : looseScore > pushScore ? 'LOOSE' : 'INSTABILITY';
      const netSev = diff >= 4 ? 'high' : diff >= 2 ? 'medium' : 'low';

      const allCauses = [...pushes, ...looses].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

      result.push({
        phase,
        behavior: netBehavior === 'INSTABILITY' ? 'MIXED' : netBehavior,
        severity: netSev,
        magnitude: diff,
        isMixed: true,
        netNote: pushScore === looseScore
          ? `Two equal-severity opposing causes — car will feel vague, wandering, or alternate push/loose unpredictably.`
          : `Net behavior is ${netBehavior} (${netBehavior === 'PUSH' ? 'PUSH' : 'LOOSE'} causes outweigh the opposing causes by ${diff} severity points). The opposing condition is masked but will reappear the moment the dominant cause is corrected.`,
        contributors: allCauses,
        causeTag: 'MIXED_PHASE',
        // For the fixes aggregator we need to be able to expand this back into
        // individual cause tags
        _expandedSymptoms: allCauses,
      });
      // Plus the unrelated INSTABILITY symptoms for this phase
      result.push(...others);
    } else {
      // No conflict — pass through
      result.push(...list);
    }
  }

  // Sort by severity then magnitude
  result.sort((a, b) => {
    const r = SEV_RANK[b.severity] - SEV_RANK[a.severity];
    return r !== 0 ? r : (b.magnitude || 0) - (a.magnitude || 0);
  });

  return result;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const BEHAVIOR_COLOR = {
  PUSH: '#f59e0b',
  LOOSE: '#f87171',
  NEUTRAL: '#22c55e',
  INSTABILITY: '#a78bfa',
  MIXED: '#a855f7',
};

const SEVERITY_LABEL = {
  high: 'SEVERE',
  medium: 'MODERATE',
  low: 'MILD',
};

const SEVERITY_COLOR = {
  high: '#f87171',
  medium: '#f59e0b',
  low: '#60a5fa',
};

const PHASE_ORDER = ['ENTRY', 'MIDDLE', 'EXIT', 'OVERALL'];

// ─── Main component ──────────────────────────────────────────────────────────
export default function TuningAdvisor() {
  const { geometry: geoList, events } = useSync();

  // Source selector: 'profile' = analyze a car profile alone (geometry only)
  //                  'session' = analyze a Track Day session (geometry + measured)
  const [source, setSource] = useState('profile');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedEventId, setSelectedEventId]     = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Resolve the selected session and its event
  const selectedEvent   = useMemo(() => events.find(e => e.id === selectedEventId) ?? null, [events, selectedEventId]);
  const selectedSession = useMemo(
    () => selectedEvent?.sessions?.find(s => s.id === selectedSessionId) ?? null,
    [selectedEvent, selectedSessionId]
  );

  // Resolve the car: either explicit profile pick, or session.carProfileId
  const car = useMemo(() => {
    if (source === 'session' && selectedSession) {
      return geoList.find(g => g.id === selectedSession.carProfileId) ?? geoList[selectedIdx] ?? null;
    }
    return geoList[selectedIdx] ?? null;
  }, [source, selectedSession, geoList, selectedIdx]);

  const trackType = car?.trackType ?? 'oval';

  // Build measured-data context only when a session source is active
  const measured = useMemo(() => {
    if (source !== 'session') return null;
    return buildMeasuredContext(selectedSession);
  }, [source, selectedSession]);

  const analysis = useMemo(
    () => car ? analyzeGeometry(car, trackType) : null,
    [car, trackType]
  );

  const symptoms = useMemo(
    () => analysis ? diagnose(analysis, car, trackType, measured) : [],
    [analysis, car, trackType, measured]
  );

  // Group symptoms by phase, then merge their fixes
  const byPhase = useMemo(() => {
    const groups = { ENTRY: [], MIDDLE: [], EXIT: [], OVERALL: [] };
    for (const s of symptoms) {
      const phase = groups[s.phase] ? s.phase : 'OVERALL';
      groups[phase].push({
        ...s,
        fixes: analysis ? fixesFor(s, analysis, car, trackType, measured) : { track: [], garage: [] },
      });
    }
    return groups;
  }, [symptoms, analysis, car, trackType, measured]);

  // Aggregate ALL fixes across all symptoms into a single track + garage list,
  // de-duplicated by action text and ranked by magnitude
  const aggregatedFixes = useMemo(() => {
    const track = new Map();
    const garage = new Map();
    for (const phase of PHASE_ORDER) {
      for (const sym of (byPhase[phase] || [])) {
        for (const f of sym.fixes.track) {
          const existing = track.get(f.action);
          if (!existing || (f.magnitude === 'high' && existing.magnitude !== 'high')) {
            track.set(f.action, { ...f, addresses: existing ? [...existing.addresses, sym] : [sym] });
          } else {
            existing.addresses.push(sym);
          }
        }
        for (const f of sym.fixes.garage) {
          const existing = garage.get(f.action);
          if (!existing || (f.magnitude === 'high' && existing.magnitude !== 'high')) {
            garage.set(f.action, { ...f, addresses: existing ? [...existing.addresses, sym] : [sym] });
          } else {
            existing.addresses.push(sym);
          }
        }
      }
    }
    const rank = { high: 3, medium: 2, low: 1 };
    const sortFn = (a, b) => rank[b.magnitude] - rank[a.magnitude];
    return {
      track: [...track.values()].sort(sortFn),
      garage: [...garage.values()].sort(sortFn),
    };
  }, [byPhase]);

  if (geoList.length === 0) {
    return (
      <div style={{ padding: '40px 24px', color: '#94a3b8', textAlign: 'center', fontFamily: 'monospace' }}>
        <p style={{ fontSize: 16, marginBottom: 12 }}>No saved cars yet.</p>
        <p style={{ fontSize: 13 }}>Go to the <strong>Suspension Geometry</strong> tab and add a car to begin.</p>
      </div>
    );
  }

  // Filter events to only those that have at least one session with a carProfileId
  const eventsWithSessions = useMemo(
    () => events.filter(e => (e.sessions ?? []).length > 0),
    [events]
  );

  // ── Groq AI second opinion ──
  const [apiKey, setApiKeyRaw] = useState(() => localStorage.getItem(APIKEY_KEY) || '');
  const setApiKey = (k) => {
    setApiKeyRaw(k);
    if (k) localStorage.setItem(APIKEY_KEY, k);
    else localStorage.removeItem(APIKEY_KEY);
  };
  const [aiResult, setAiResult] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  // Reset AI result whenever the source changes
  useEffect(() => { setAiResult(''); setAiError(''); }, [source, selectedIdx, selectedSessionId]);

  async function runAI() {
    if (!apiKey || !analysis) return;
    setAiRunning(true);
    setAiError('');
    setAiResult('');
    try {
      const prompt = buildSecondOpinionPrompt({
        car, analysis, measured, symptoms, aggregatedFixes, trackType,
      });
      const text = await callGroq(apiKey, prompt);
      setAiResult(text);
    } catch (e) {
      setAiError(e.message || 'Unknown error');
    } finally {
      setAiRunning(false);
    }
  }

  return (
    <div className="tuning-page">
      {/* Source selector */}
      <div className="tuning-header">
        <div className="tuning-header-row">
          <label className="tuning-label">Source:</label>
          <div className="tuning-source-toggle">
            <button
              className={`tuning-source-btn${source === 'profile' ? ' active' : ''}`}
              onClick={() => setSource('profile')}
            >Car profile (geometry only)</button>
            <button
              className={`tuning-source-btn${source === 'session' ? ' active' : ''}`}
              onClick={() => setSource('session')}
              disabled={eventsWithSessions.length === 0}
              title={eventsWithSessions.length === 0 ? 'No sessions logged yet — add one in Track Day' : ''}
            >Track Day session (geometry + measured)</button>
          </div>
        </div>

        {source === 'profile' && (
          <div className="tuning-header-row" style={{ marginTop: 10 }}>
            <label className="tuning-label">Car:</label>
            <select className="tuning-select" value={selectedIdx} onChange={e => setSelectedIdx(parseInt(e.target.value))}>
              {geoList.map((g, i) => (
                <option key={g.id} value={i}>
                  {g.title || 'Unnamed'} — {g.date} ({g.trackType === 'figure8' ? 'Figure-8' : 'Oval'})
                </option>
              ))}
            </select>
          </div>
        )}

        {source === 'session' && (
          <>
            <div className="tuning-header-row" style={{ marginTop: 10 }}>
              <label className="tuning-label">Event:</label>
              <select
                className="tuning-select"
                value={selectedEventId ?? ''}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setSelectedEventId(id);
                  // Default to first session of newly chosen event
                  const ev = events.find(x => x.id === id);
                  setSelectedSessionId(ev?.sessions?.[0]?.id ?? null);
                }}
              >
                <option value="">— Select an event —</option>
                {eventsWithSessions.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name || 'Unnamed'} — {e.date}{e.track ? ` @ ${e.track}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedEvent && (
              <div className="tuning-header-row" style={{ marginTop: 10 }}>
                <label className="tuning-label">Session:</label>
                <select
                  className="tuning-select"
                  value={selectedSessionId ?? ''}
                  onChange={e => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— Select a session —</option>
                  {(selectedEvent.sessions ?? []).map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {s.name || `Practice ${i + 1}`}
                      {s.bestLap ? ` — best ${s.bestLap}s` : ''}
                      {s.condition ? ` — ${s.condition}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedSession && !car && (
              <div className="tuning-header-row" style={{ marginTop: 10, color: '#f59e0b', fontSize: 12 }}>
                ⚠ This session has no car profile linked. Open Track Day → edit session → set Car Profile.
              </div>
            )}
          </>
        )}

        {car && (
          <div className="tuning-summary">
            <div>
              <strong style={{ color: '#cbd5e1' }}>{car.title || 'Unnamed'}</strong>{' '}
              · {analysis?.T?.label}
              {measured && <> · session: <strong style={{ color: '#cbd5e1' }}>{selectedSession?.name || 'Practice'}</strong></>}
            </div>
            <div style={{ marginTop: 4 }}>
              Front RC: {analysis?.rcAvg?.toFixed(1)}"{' · '}
              Rear RC: {analysis?.rearRC?.toFixed(1)}"{' · '}
              Front LLTD: {analysis?.geoLLTDF != null ? `${(analysis.geoLLTDF*100).toFixed(0)}%` : '—'}{' · '}
              Body roll: {analysis?.rollAtApex?.toFixed(1)}°{' · '}
              RF dyn camber: {analysis?.rfGroundCamber != null ? `${analysis.rfGroundCamber>=0?'+':''}${analysis.rfGroundCamber.toFixed(2)}°` : '—'}
            </div>
            {measured && (
              <div style={{ marginTop: 4, color: '#22c55e' }}>
                Measured data: {measured.bestLap ? `best lap ${measured.bestLap}s · ` : ''}
                {measured.condition ? `driver feel: ${measured.condition}${measured.phase ? ` (${measured.phase})` : ''} · ` : ''}
                pyrometer: {Object.values(measured.tireTemps).filter(t => t.middle != null).length}/4 corners ·
                hot PSI: {Object.values(measured.hotPsi).filter(v => v != null).length}/4 corners
              </div>
            )}
          </div>
        )}
      </div>

      {/* What the car will do */}
      <Section
        title={measured ? 'WHAT THE CAR IS DOING' : 'WHAT THE CAR WILL DO'}
        subtitle={measured
          ? 'Diagnosis combines geometry prediction with measured pyrometer data, hot/cold PSI, and driver feel from the session'
          : 'Mathematical prediction from geometry, alignment, and shock data'}
      >
        {symptoms.length === 0 ? (
          <div style={{ padding: 16, color: '#22c55e', fontSize: 14 }}>
            ✓ No significant handling issues predicted from current measurements. The car should feel balanced.
          </div>
        ) : PHASE_ORDER.map(phase => {
          const list = byPhase[phase];
          if (!list || list.length === 0) return null;
          return (
            <div key={phase} className="tuning-phase">
              <div className="tuning-phase-header">{phase}</div>
              {list.map((sym, i) => (
                <div key={i} className="tuning-symptom" style={{ borderLeftColor: BEHAVIOR_COLOR[sym.behavior] }}>
                  <div className="tuning-symptom-head">
                    <span className="tuning-behavior" style={{ color: BEHAVIOR_COLOR[sym.behavior] }}>
                      {sym.isMixed ? `MIXED → NET ${sym.behavior}` : sym.behavior}
                    </span>
                    <span className="tuning-severity" style={{
                      background: SEVERITY_COLOR[sym.severity] + '22',
                      color: SEVERITY_COLOR[sym.severity],
                      borderColor: SEVERITY_COLOR[sym.severity] + '55',
                    }}>
                      {SEVERITY_LABEL[sym.severity]}
                    </span>
                  </div>
                  {sym.isMixed ? (
                    <>
                      <div className="tuning-why" style={{ marginBottom: 10 }}>{sym.netNote}</div>
                      <div className="tuning-mixed-contributors">
                        {sym.contributors.map((c, ci) => (
                          <div key={ci} className="tuning-mixed-row" style={{ borderLeftColor: BEHAVIOR_COLOR[c.behavior] }}>
                            <div className="tuning-mixed-row-head">
                              <span style={{ color: BEHAVIOR_COLOR[c.behavior], fontWeight: 700, fontSize: 12 }}>
                                {c.behavior}
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: 0.06,
                                background: SEVERITY_COLOR[c.severity] + '22',
                                color: SEVERITY_COLOR[c.severity],
                                border: `1px solid ${SEVERITY_COLOR[c.severity]}55`,
                                padding: '1px 6px', borderRadius: 3,
                              }}>{SEVERITY_LABEL[c.severity]}</span>
                            </div>
                            <div className="tuning-mixed-why">{c.why}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="tuning-why">{sym.why}</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </Section>

      {/* How to fix it */}
      <Section title="HOW TO FIX IT" subtitle="Ranked by impact. Track tunes are 5-min adjustments; garage tunes need tools/parts">
        {(aggregatedFixes.track.length === 0 && aggregatedFixes.garage.length === 0) ? (
          <div style={{ padding: 16, color: '#94a3b8', fontSize: 14 }}>
            No fixes needed — current setup looks balanced.
          </div>
        ) : (
          <>
            {/* Track tuning */}
            <div className="tuning-fix-group track">
              <div className="tuning-fix-group-header">
                <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 700, letterSpacing: 0.05 }}>
                  TRACK TUNING — at the track, no tools beyond a pressure gauge / toe plates / camber gauge
                </span>
              </div>
              {aggregatedFixes.track.length === 0 ? (
                <div className="tuning-fix-empty">No track-side adjustments — fixes require garage work.</div>
              ) : (
                aggregatedFixes.track.map((f, i) => (
                  <FixCard key={`track-${i}`} fix={f} />
                ))
              )}
            </div>

            {/* Garage tuning */}
            <div className="tuning-fix-group garage">
              <div className="tuning-fix-group-header">
                <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700, letterSpacing: 0.05 }}>
                  GARAGE TUNING — between sessions; alignment rack, shock swap, spring change, ride height adjustment
                </span>
              </div>
              {aggregatedFixes.garage.length === 0 ? (
                <div className="tuning-fix-empty">No garage adjustments needed.</div>
              ) : (
                aggregatedFixes.garage.map((f, i) => (
                  <FixCard key={`garage-${i}`} fix={f} />
                ))
              )}
            </div>
          </>
        )}
      </Section>

      {/* AI second opinion */}
      <AiSecondOpinion
        apiKey={apiKey}
        setApiKey={setApiKey}
        canRun={!!analysis}
        running={aiRunning}
        result={aiResult}
        error={aiError}
        onRun={runAI}
      />
    </div>
  );
}

// ─── AI second opinion panel ────────────────────────────────────────────────
function AiSecondOpinion({ apiKey, setApiKey, canRun, running, result, error, onRun }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(apiKey);

  function save() { setApiKey(draft.trim()); setEditing(false); }
  function clear() { setApiKey(''); setDraft(''); setEditing(false); }

  return (
    <div className="tuning-section">
      <div className="tuning-section-head">
        <div className="tuning-section-title">AI SECOND OPINION</div>
        <div className="tuning-section-sub">
          Sends the diagnosis above to {GROQ_MODEL} via Groq for an independent crew-chief review.
          Your API key is stored only in your browser and only sent to api.groq.com.
        </div>
      </div>

      {/* API key bar */}
      {!editing ? (
        <div className="tuning-ai-keybar">
          <span className={`tuning-ai-status${apiKey ? ' active' : ''}`}>
            <span className="tuning-ai-dot" />
            {apiKey ? 'Groq API key configured' : 'No API key — AI second opinion disabled'}
          </span>
          <button className="tuning-ai-keybtn" onClick={() => { setDraft(apiKey); setEditing(true); }}>
            {apiKey ? 'Edit key' : 'Add API key'}
          </button>
        </div>
      ) : (
        <div className="tuning-ai-keybar">
          <input
            className="ml-input tuning-ai-keyinput"
            type="password"
            placeholder="gsk_..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <button className="ml-save-btn" onClick={save}>Save</button>
          <button className="ml-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
          {apiKey && <button className="ml-cancel-btn" onClick={clear}>Remove</button>}
        </div>
      )}

      {/* Run button */}
      <div style={{ marginTop: 12 }}>
        <button
          className="tuning-ai-runbtn"
          disabled={!apiKey || !canRun || running}
          onClick={onRun}
        >
          {running ? 'Asking the AI…' : result ? 'Re-run AI second opinion' : 'Get AI second opinion'}
        </button>
        {!apiKey && (
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 12 }}>
            Add a Groq API key to enable. Free keys at console.groq.com.
          </span>
        )}
      </div>

      {error && (
        <div className="tuning-ai-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="tuning-ai-result">
          <div className="tuning-ai-result-head">
            <span style={{ color: '#a78bfa', fontWeight: 700 }}>AI second opinion</span>
            <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>{GROQ_MODEL}</span>
          </div>
          <pre className="tuning-ai-result-body">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ─── UI sub-components ────────────────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div className="tuning-section">
      <div className="tuning-section-head">
        <div className="tuning-section-title">{title}</div>
        {subtitle && <div className="tuning-section-sub">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function FixCard({ fix }) {
  return (
    <div className="tuning-fix">
      <div className="tuning-fix-head">
        <span className="tuning-fix-mag" style={{
          background: SEVERITY_COLOR[fix.magnitude] + '22',
          color: SEVERITY_COLOR[fix.magnitude],
          borderColor: SEVERITY_COLOR[fix.magnitude] + '55',
        }}>
          {fix.magnitude.toUpperCase()} IMPACT
        </span>
        <span className="tuning-fix-action">{fix.action}</span>
      </div>
      <div className="tuning-fix-impact">{fix.impact}</div>
      {fix.addresses && fix.addresses.length > 0 && (
        <div className="tuning-fix-addresses">
          Addresses: {fix.addresses.map(s => `${s.phase} ${s.behavior}`).join(' · ')}
        </div>
      )}
    </div>
  );
}
