import { useState, useMemo } from 'react';
import { useSync } from '../utils/SyncContext';
import { analyzeGeometry } from './GeometryAnalysis';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';

// Constants matching the rest of the app
const P71_TOTAL_WEIGHT    = 3700;
const P71_FRONT_AXLE_FRAC = 0.57;

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
function findShock(corner, currentRating, deltaSteps, isFront) {
  // deltaSteps: +N = stiffer (lower rating number), -N = softer (higher rating)
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  if (currentRating == null) {
    // No baseline — recommend a sensible "balanced firm" baseline
    const target = isFront ? 4 : 4;
    const pick = list.find(s => s.rating === target);
    return pick ? { ...pick, label: shockLabel(pick), reason: 'starting baseline' } : null;
  }
  const targetRating = Math.max(0, Math.min(10, currentRating - deltaSteps));
  // Find shock with that exact rating; if none, find the closest
  let pick = list.find(s => s.rating === targetRating);
  if (!pick) {
    // Closest by rating
    pick = [...list].sort((a, b) =>
      Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
    )[0];
  }
  return pick ? { ...pick, label: shockLabel(pick) } : null;
}

// Lookup the rating of a saved shock label
function lookupRating(label, isFront) {
  if (!label) return null;
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  const found = list.find(s => shockLabel(s) === label);
  return found ? found.rating : null;
}

// ─── Diagnose handling — produces a list of {phase, behavior, why, severity} ─
//
// `phase` ∈ ENTRY | MIDDLE | EXIT | OVERALL
// `behavior` ∈ PUSH | LOOSE | NEUTRAL | INSTABILITY
// `severity` ∈ low | medium | high
//
function diagnose(a, geo, trackType) {
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

  // ── 9. Tire pressure imbalance from cold settings ───────────────────────
  // Using the raw cold PSI as a proxy for what the model would say is wrong
  const psi = {
    LF: parseFloat(geo.coldPsi?.LF) || null,
    RF: parseFloat(geo.coldPsi?.RF) || null,
    LR: parseFloat(geo.coldPsi?.LR) || null,
    RR: parseFloat(geo.coldPsi?.RR) || null,
  };
  if (psi.LF && psi.RF && psi.LR && psi.RR) {
    const frontAvg = (psi.LF + psi.RF) / 2;
    const rearAvg  = (psi.LR + psi.RR) / 2;
    if (isOval) {
      // Oval-specific: RF should run highest (most loaded), LR lowest, etc.
      if (psi.LF > psi.RF + 4) {
        symptoms.push({
          phase: 'MIDDLE',
          behavior: 'LOOSE',
          severity: 'low',
          magnitude: psi.LF - psi.RF,
          why: `LF pressure (${psi.LF}) is much higher than RF (${psi.RF}). On a left-turn oval the RF is the loaded outside tire and wants more pressure to support sidewall — the imbalance reduces RF grip relative to its load.`,
          causeTag: 'PSI_LR_LF_HIGH',
        });
      }
    }
  }

  // Net opposing PUSH/LOOSE symptoms within a phase into a single MIXED entry,
  // and sort the result.
  return netSymptoms(symptoms);
}

// ─── Generate fixes for each symptom — track + garage ────────────────────────
function fixesFor(symptom, a, geo, trackType) {
  // MIXED phase: union the fixes for each contributing cause so the user sees
  // every available action. The aggregator de-duplicates downstream.
  if (symptom.causeTag === 'MIXED_PHASE' && symptom._expandedSymptoms) {
    const out = { track: [], garage: [] };
    for (const c of symptom._expandedSymptoms) {
      const f = fixesFor(c, a, geo, trackType);
      out.track.push(...f.track);
      out.garage.push(...f.garage);
    }
    return out;
  }

  const fixes = { track: [], garage: [] };
  const isOval = trackType === 'oval';
  const tag = symptom.causeTag;

  switch (tag) {

    // ── RC differential issues ───────────────────────────────────────────
    case 'RC_DIFF_NEG':
      fixes.garage.push({
        action: `Lower the rear Watts link center pivot bracket by ${Math.min(Math.abs(a.rcDiff) - 1, 4).toFixed(1)}".`,
        impact: `Reduces rear RC from ${a.rearRC.toFixed(1)}" toward ${(a.rearRC - Math.min(Math.abs(a.rcDiff) - 1, 4)).toFixed(1)}". Front and rear geometric load transfer rates equalize, removing entry rotation.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Alternative: raise front ride height ½–1" on stiffer springs.`,
        impact: `Raises front RC by ~1–2" closer to rear RC. Same balance effect from the front side instead of the rear.`,
        magnitude: 'medium',
      });
      fixes.track.push({
        action: `Add ½ turn of static negative camber to RF.`,
        impact: `Helps the RF bite earlier on entry — partially masks the entry rotation. Not a fix, but buys lap time while the geometry change is scheduled.`,
        magnitude: 'low',
      });
      break;

    case 'RC_DIFF_HIGH':
      fixes.garage.push({
        action: `Raise ride height by 0.5"–1.0" on the front.`,
        impact: `Each 1" of ride height raises front RC ~1–2" geometrically — but ALSO drops it relative to CG. The net effect is reduced front geometric load transfer share, returning ARB authority. Use spring spacers or taller front springs.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Increase rear Watts link pivot height to ${Math.min(a.rearRC + 1.5, 18).toFixed(1)}".`,
        impact: `Closes the RC gap by raising rear share of geometric transfer. Less invasive than re-springing.`,
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
        action: `Raise RF cold pressure by 1–2 PSI (current ${parseFloat(geo.coldPsi?.RF) || '—'} → ${(parseFloat(geo.coldPsi?.RF) + 2) || 34}).`,
        impact: `Stiffens RF sidewall to support loaded outside tire. Doesn't fix LLTD root cause but recovers some of the lost lateral grip.`,
        magnitude: 'low',
      });
      break;

    case 'LLTD_FRONT_LOW': {
      const target = Math.min(a.rearRC - 1.5, 14).toFixed(1);
      fixes.garage.push({
        action: `Lower rear Watts link pivot to ~${target}".`,
        impact: `Drops rear geometric LLTD share, returning front LLTD to 60–65% range. Most direct correction.`,
        magnitude: 'high',
      });
      fixes.garage.push({
        action: `Stiffer rear springs (e.g. 200 lb/in Heavy Duty) raise rear elastic share.`,
        impact: `Adds elastic LLTD to rear, balancing the geometric tilt the other direction.`,
        magnitude: 'medium',
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
        action: `Drop RF cold pressure by 1–2 PSI (current ${parseFloat(geo.coldPsi?.RF) || '—'} → ${(parseFloat(geo.coldPsi?.RF) - 2) || 30}).`,
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
        action: `URGENT: raise rear Watts link pivot or drop front RC. Front RC must be lower than rear RC.`,
        impact: `Currently the body jacks upward in cornering instead of rolling. This is dangerous and unpredictable.`,
        magnitude: 'high',
      });
      break;

    case 'ROLL_AXIS_STEEP':
      fixes.garage.push({
        action: `Lower rear Watts link pivot by 1–2".`,
        impact: `Reduces roll axis inclination from ${a.rollAxisInclination.toFixed(1)}° toward 5–7°. Rear sets more progressively.`,
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
          action: `Softer rear shocks. Try ${softerRear.label} (rating ${softerRear.rating}) at LR/RR.`,
          impact: `${softerRear.ovalRole.split('.')[0]}.`,
          magnitude: 'high',
        });
      }
      if (stifferFront) {
        fixes.garage.push({
          action: `Or stiffer front struts: ${stifferFront.label} (rating ${stifferFront.rating}).`,
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
          action: `Softer front struts. Try ${softerFront.label} (rating ${softerFront.rating}).`,
          impact: `${softerFront.ovalRole.split('.')[0]}.`,
          magnitude: 'high',
        });
      }
      if (stifferRear) {
        fixes.garage.push({
          action: `Or stiffer rear shocks: ${stifferRear.label} (rating ${stifferRear.rating}).`,
          impact: `${stifferRear.ovalRole.split('.')[0]}.`,
          magnitude: 'medium',
        });
      }
      break;
    }

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
  const { geometry: geoList } = useSync();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const car = geoList[selectedIdx];
  const trackType = car?.trackType ?? 'oval';

  const analysis = useMemo(
    () => car ? analyzeGeometry(car, trackType) : null,
    [car, trackType]
  );

  const symptoms = useMemo(
    () => analysis ? diagnose(analysis, car, trackType) : [],
    [analysis, car, trackType]
  );

  // Group symptoms by phase, then merge their fixes
  const byPhase = useMemo(() => {
    const groups = { ENTRY: [], MIDDLE: [], EXIT: [], OVERALL: [] };
    for (const s of symptoms) {
      const phase = groups[s.phase] ? s.phase : 'OVERALL';
      groups[phase].push({
        ...s,
        fixes: analysis ? fixesFor(s, analysis, car, trackType) : { track: [], garage: [] },
      });
    }
    return groups;
  }, [symptoms, analysis, car, trackType]);

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

  return (
    <div className="tuning-page">
      {/* Car selector */}
      <div className="tuning-header">
        <div className="tuning-header-row">
          <label className="tuning-label">Analyze car:</label>
          <select className="tuning-select" value={selectedIdx} onChange={e => setSelectedIdx(parseInt(e.target.value))}>
            {geoList.map((g, i) => (
              <option key={g.id} value={i}>
                {g.title || 'Unnamed'} — {g.date} ({g.trackType === 'figure8' ? 'Figure-8' : 'Oval'})
              </option>
            ))}
          </select>
        </div>
        {car && (
          <div className="tuning-summary">
            Track: {analysis?.T?.label}{' '}
            ·{' '}
            Front RC: {analysis?.rcAvg?.toFixed(1)}"{' '}
            ·{' '}
            Rear RC: {analysis?.rearRC?.toFixed(1)}"{' '}
            ·{' '}
            Front LLTD: {analysis?.geoLLTDF != null ? `${(analysis.geoLLTDF*100).toFixed(0)}%` : '—'}{' '}
            ·{' '}
            Body roll: {analysis?.rollAtApex?.toFixed(1)}°{' '}
            ·{' '}
            RF dyn camber: {analysis?.rfGroundCamber != null ? `${analysis.rfGroundCamber>=0?'+':''}${analysis.rfGroundCamber.toFixed(2)}°` : '—'}
          </div>
        )}
      </div>

      {/* What the car will do */}
      <Section title="WHAT THE CAR WILL DO" subtitle="Mathematical prediction from geometry, alignment, and shock data">
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
                  GARAGE TUNING — between sessions; alignment rack, shock swap, spring change, Watts link
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
