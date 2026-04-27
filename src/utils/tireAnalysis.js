// Tire Temperature Analysis Engine
// Aligned with the Setup Optimizer's physics model for consistent recommendations.

// ============ PHYSICS-BASED PRESSURE CONSTANTS ============
// Optimal HOT tire pressures for Crown Vic P71 on a left-turn oval.
// Empirically calibrated targets — physics model (load-proportional) predicted RF 42 / RR 32,
// but real-world testing shows that spread creates understeer/push: the RF runs too stiff
// relative to the RR, the front contact patch dominates, and the rear can't keep up.
// Bringing the right-side pressures closer together (RF 38 / RR 35) loosens the car to
// the desired balance. This reflects tire grip degression — a heavily loaded tire gives back
// proportionally less grip per pound of load increase than a linear model predicts, so
// the RF needs less pressure (more compliance) and the RR needs more (more support) than
// pure load ratios would indicate.
//   RF: 38 PSI hot  (physics predicted 42 — reduced 4 PSI for right-side balance)
//   LF: 19 PSI hot  (unchanged — lightly loaded inside tire, linear model holds)
//   RR: 35 PSI hot  (physics predicted 32 — raised 3 PSI to tighten right-side spread)
//   LR: 16 PSI hot  (floor 16 — do not run below 15 PSI hot on left rear)
const OVAL_OPTIMAL_HOT_PSI = { LF: 19, RF: 38, LR: 16, RR: 35 };
// Minimum hot PSI floors — never recommend below these regardless of load calculation.
// LR floor: 16 PSI — empirical minimum for tire integrity on left rear.
const OVAL_MIN_HOT_PSI = { LF: 12, RF: 20, LR: 16, RR: 18 };
const COLD_REF_TEMP = 68;    // °F — temperature when cold PSI is set (garage inflate)
const RANKINE = 459.67;      // °F → °R conversion offset

// ============ CAMBER TEMPERATURE CALIBRATION ============
// Calibrated from simulation and real pyrometer data for Crown Vic P71.
//
// RF (always outside-loaded in left turns):
//   Body roll partially "stands up" the RF even with neg camber — so outside edge
//   will always carry extra heat even at optimal setup.
//   Empirical multi-session data at -3.0° to -3.5° static: outside 6–22°F warmer is normal.
//   Warn below -22°F (insufficient camber) or above +5°F (inside hotter — too much camber).
//
// LF (always inside tire in left turns):
//   Body roll adds positive camber to LF in cornering, loading the inside edge.
//   Empirical multi-session data at -1.5° static: inside 13–22°F hotter than outside is normal.
//   Warn below 8°F (less than expected — body roll overcorrecting) or above 22°F (too much camber).

/**
 * Analyze a single tire's temperature readings.
 * When cold PSI is provided, uses the same physics-based optimal pressure model
 * as the Setup Optimizer — same hot-PSI calculation, same optimal targets.
 */
export function analyzeTire(inside, middle, outside, position, currentPressure = null) {
  const avg = (inside + middle + outside) / 3;
  const spread = Math.abs(inside - outside);
  const edgeAvg = (inside + outside) / 2;
  const middleDiff = middle - edgeAvg;
  const psiCalculation = middle - edgeAvg;
  const camberDiff = inside - outside;      // positive = inside hotter
  const isFront = position.includes('F');
  const isRF = position === 'RF';

  const tireRecommendations = [];
  let overallSeverity = 'good';
  let currentPressureSeverity = 'good';
  let currentPressureAction = 'none';
  let camberCalculation = null;
  let recommendedPressure = currentPressure;

  // ── Hot pressure (ideal gas law) ─────────────────────────────────────────
  // Same formula used by Setup Optimizer: P_hot = P_cold × (T_hot + 460) / (T_cold_ref + 460)
  const optimalHotPsi = OVAL_OPTIMAL_HOT_PSI[position];
  let hotPsi = null;
  let psiError = null;   // positive = over-pressured hot
  let recommendedColdPsi = null;

  if (currentPressure) {
    hotPsi = currentPressure * (avg + RANKINE) / (COLD_REF_TEMP + RANKINE);
    psiError = hotPsi - optimalHotPsi;
    // Back-calculate cold PSI to hit optimal hot, then enforce minimum hot PSI floor.
    const minHot = OVAL_MIN_HOT_PSI[position] ?? 10;
    const targetHot = Math.max(optimalHotPsi, minHot);
    recommendedColdPsi = targetHot * (COLD_REF_TEMP + RANKINE) / (avg + RANKINE);
    recommendedPressure = Math.round(recommendedColdPsi * 2) / 2; // nearest 0.5 PSI
  }

  // ── Pressure Analysis ─────────────────────────────────────────────────────
  const rfNote = isRF ? ' RF is the primary loaded tire — pressure accuracy here is critical.' : '';

  if (currentPressure && psiError !== null) {
    // Physics-based comparison — identical to Setup Optimizer logic.
    // Middle-vs-edge temperature pattern is unreliable for low-loaded inside tires
    // (LF, LR) because they don't deform much even when significantly over-pressured.
    const absDiff = Math.abs(psiError);
    const isOver = psiError > 0;
    const action = isOver ? 'decrease' : 'increase';
    const coldDiff = Math.abs(currentPressure - recommendedPressure).toFixed(1);

    if (absDiff > 5) {
      tireRecommendations.push({
        type: 'pressure', severity: 'critical',
        message: `Hot PSI is ${hotPsi.toFixed(1)} — significantly ${isOver ? 'over' : 'under'} the optimal ${optimalHotPsi} PSI for this tire's corner load. ${isOver ? 'Decrease' : 'Increase'} cold PSI: ${currentPressure} → ${recommendedPressure.toFixed(1)} PSI (${coldDiff} PSI ${action}).${rfNote}`,
        action,
      });
      currentPressureAction = action;
      currentPressureSeverity = 'critical';
      if (overallSeverity !== 'critical') overallSeverity = 'critical';
    } else if (absDiff > 2.5) {
      tireRecommendations.push({
        type: 'pressure', severity: 'warning',
        message: `Hot PSI is ${hotPsi.toFixed(1)}, optimal is ${optimalHotPsi} PSI. ${isOver ? 'Decrease' : 'Increase'} cold PSI: ${currentPressure} → ${recommendedPressure.toFixed(1)} PSI (${coldDiff} PSI ${action}).${rfNote}`,
        action,
      });
      currentPressureAction = action;
      currentPressureSeverity = 'warning';
      if (overallSeverity === 'good') overallSeverity = 'warning';
    } else if (absDiff > 1) {
      tireRecommendations.push({
        type: 'pressure', severity: 'good',
        message: `Hot PSI is ${hotPsi.toFixed(1)}, optimal is ${optimalHotPsi} PSI — close. Fine-tune: ${action} cold PSI to ${recommendedPressure.toFixed(1)} for maximum grip.`,
        action,
      });
      currentPressureAction = 'good';
    } else {
      tireRecommendations.push({
        type: 'pressure', severity: 'good',
        message: `Hot PSI is ${hotPsi.toFixed(1)} — at optimal ${optimalHotPsi} PSI. Pressure is dialed in for this corner's load.`,
        action: 'none',
      });
      currentPressureAction = 'good';
    }

    // Secondary: flag extreme middle-vs-edge even when physics pressure is near optimal
    // (indicates abnormal tire deformation or damage, not just pressure)
    const midEdgeCrit = 18;
    if (Math.abs(psiCalculation) > midEdgeCrit && currentPressureSeverity !== 'critical') {
      const msg = psiCalculation > 0
        ? `Middle is ${Math.round(psiCalculation)}°F hotter than edges despite near-optimal pressure — check for abnormal tire deformation.`
        : `Edges are ${Math.round(Math.abs(psiCalculation))}°F hotter than middle — verify tire is seated correctly.`;
      tireRecommendations.push({ type: 'pressure', severity: 'warning', message: msg, action: 'none' });
      if (overallSeverity === 'good') overallSeverity = 'warning';
    }

  } else {
    // Fallback when no cold PSI is entered: use middle-vs-edge pattern.
    // Note: this method misses over-inflation on lightly-loaded tires — enter PSI for best results.
    const overCritical = isRF ? 10 : 15;
    const overWarn = isRF ? 5 : 8;
    const underCritical = isRF ? -10 : -15;
    const underWarn = isRF ? -5 : -8;

    if (psiCalculation > overCritical) {
      tireRecommendations.push({
        type: 'pressure', severity: 'critical',
        message: `Over-inflated — middle is ${Math.round(psiCalculation)}°F hotter than edges. Reduce pressure 2-4 PSI.${rfNote} (Enter current PSI for physics-based recommendation.)`,
        action: 'decrease',
      });
      currentPressureAction = 'decrease';
      currentPressureSeverity = 'critical';
      if (overallSeverity !== 'critical') overallSeverity = 'critical';
    } else if (psiCalculation < underCritical) {
      tireRecommendations.push({
        type: 'pressure', severity: 'critical',
        message: `Under-inflated — middle is ${Math.round(Math.abs(psiCalculation))}°F cooler than edges. Increase pressure 2-4 PSI.${rfNote} (Enter current PSI for physics-based recommendation.)`,
        action: 'increase',
      });
      currentPressureAction = 'increase';
      currentPressureSeverity = 'critical';
      if (overallSeverity !== 'critical') overallSeverity = 'critical';
    } else if (psiCalculation > overWarn) {
      tireRecommendations.push({
        type: 'pressure', severity: 'warning',
        message: `Slightly over-inflated — middle is ${Math.round(psiCalculation)}°F hotter than edges. Consider reducing pressure 1-2 PSI.${rfNote}`,
        action: 'decrease',
      });
      currentPressureAction = 'decrease';
      currentPressureSeverity = 'warning';
      if (overallSeverity === 'good') overallSeverity = 'warning';
    } else if (psiCalculation < underWarn) {
      tireRecommendations.push({
        type: 'pressure', severity: 'warning',
        message: `Slightly under-inflated — middle is ${Math.round(Math.abs(psiCalculation))}°F cooler than edges. Consider increasing pressure 1-2 PSI.${rfNote}`,
        action: 'increase',
      });
      currentPressureAction = 'increase';
      currentPressureSeverity = 'warning';
      if (overallSeverity === 'good') overallSeverity = 'warning';
    } else {
      currentPressureAction = 'good';
      tireRecommendations.push({
        type: 'pressure', severity: 'good',
        message: `Middle-vs-edge pattern looks good. Enter current cold PSI above for a physics-based optimal pressure comparison (same model as the Setup Optimizer).`,
        action: 'none',
      });
    }
  }

  // ── Rear edge-imbalance note (camber not adjustable) ─────────────────────
  // Only add if physics pressure hasn't already given a recommendation,
  // since that recommendation already handles the PSI adjustment direction.
  if (!isFront && currentPressureSeverity === 'good' && Math.abs(camberDiff) > 15) {
    const dir = camberDiff > 0 ? 'inside' : 'outside';
    const opp = camberDiff > 0 ? 'outside' : 'inside';
    tireRecommendations.push({
      type: 'pressure', severity: 'warning',
      message: `Rear ${dir} edge is ${Math.round(Math.abs(camberDiff))}°F hotter than ${opp}. Rear camber is not adjustable — pressure and shock settings are the only levers. Enter PSI above for a specific recommendation.`,
      action: 'none',
    });
    currentPressureSeverity = 'warning';
    if (overallSeverity === 'good') overallSeverity = 'warning';
  }

  // ── Camber Analysis ───────────────────────────────────────────────────────
  // Calibrated to this car's actual thermal model (not a generic reference).
  // RF at optimal setup (recommended -3.5° static): outside runs ~9°F warmer — normal.
  // LF at optimal setup (recommended -1.25° static): inside runs ~6°F warmer — borderline.
  if (currentPressureSeverity !== 'critical') {
    if (isFront) {
      camberCalculation = inside - outside;  // positive = inside hotter

      if (isRF) {
        // RF: outside running warmer is expected (primary loaded tire, body roll partially stands RF up).
        // Empirical data (multi-session P71 at -3.0° to -3.5° static): outside 6–22°F warmer is normal.
        // Warn outside that range in either direction.
        if (camberDiff < -30) {
          tireRecommendations.push({
            type: 'camber', severity: 'critical',
            message: `RF outside is ${Math.round(Math.abs(camberDiff))}°F hotter than inside — well beyond the normal 6–22°F range. Significantly insufficient negative camber; the tire is riding hard on its outside edge. Add negative camber to RF.`,
            action: 'more_negative',
          });
          if (overallSeverity !== 'critical') overallSeverity = 'critical';
        } else if (camberDiff < -22) {
          tireRecommendations.push({
            type: 'camber', severity: 'warning',
            message: `RF outside is ${Math.round(Math.abs(camberDiff))}°F hotter than inside (normal: 6–22°F). More outside-edge heat than typical — consider adding negative camber to RF.`,
            action: 'more_negative',
          });
          if (overallSeverity === 'good') overallSeverity = 'warning';
        } else if (camberDiff > 15) {
          tireRecommendations.push({
            type: 'camber', severity: 'critical',
            message: `RF inside is ${Math.round(camberDiff)}°F hotter than outside — excessive negative camber overloading the inside edge. Reduce negative camber on RF.`,
            action: 'less_negative',
          });
          if (overallSeverity !== 'critical') overallSeverity = 'critical';
        } else if (camberDiff > 5) {
          tireRecommendations.push({
            type: 'camber', severity: 'warning',
            message: `RF inside is ${Math.round(camberDiff)}°F hotter than outside — the outside tire is not carrying expected load. Slightly too much negative camber; consider reducing RF static camber.`,
            action: 'less_negative',
          });
          if (overallSeverity === 'good') overallSeverity = 'warning';
        }
        // camberDiff −22 to +5 → normal operating range for this car

      } else {
        // LF: inside tire on a left-turn oval. Body roll adds positive camber to LF in cornering,
        // loading the inside edge. Empirical data (multi-session P71): LF inside runs 13–22°F hotter
        // than outside as the normal operating range at -1.25° to -1.5° static.
        // Normal: inside 8–22°F warmer. Warn beyond that in either direction.
        if (camberDiff > 28) {
          tireRecommendations.push({
            type: 'camber', severity: 'critical',
            message: `LF inside is ${Math.round(camberDiff)}°F hotter than outside — far above the normal 8–22°F range. Excessive negative camber is overloading the inside edge. Reduce LF static camber.`,
            action: 'less_negative',
          });
          if (overallSeverity !== 'critical') overallSeverity = 'critical';
        } else if (camberDiff > 22) {
          tireRecommendations.push({
            type: 'camber', severity: 'warning',
            message: `LF inside is ${Math.round(camberDiff)}°F hotter than outside (normal: 8–22°F). Slightly more inside-edge heat than expected — consider reducing LF static camber by 0.25°.`,
            action: 'less_negative',
          });
          if (overallSeverity === 'good') overallSeverity = 'warning';
        } else if (camberDiff < -5) {
          tireRecommendations.push({
            type: 'camber', severity: 'critical',
            message: `LF outside is ${Math.round(Math.abs(camberDiff))}°F hotter than inside — body roll is completely overpowering static negative camber on the inside tire. Add significant negative camber to LF.`,
            action: 'more_negative',
          });
          if (overallSeverity !== 'critical') overallSeverity = 'critical';
        } else if (camberDiff < 8) {
          tireRecommendations.push({
            type: 'camber', severity: 'warning',
            message: `LF inside is only ${Math.round(camberDiff)}°F hotter than outside (normal: 8–22°F). Less inside-edge heat than typical — body roll may be overcorrecting camber. Consider adding a small amount of negative camber to LF.`,
            action: 'more_negative',
          });
          if (overallSeverity === 'good') overallSeverity = 'warning';
        }
        // camberDiff 8–22 → normal operating range for this car
      }
    }
  }

  // ── Final severity pass ───────────────────────────────────────────────────
  for (const rec of tireRecommendations) {
    if (rec.severity === 'critical') { overallSeverity = 'critical'; break; }
    if (rec.severity === 'warning' && overallSeverity === 'good') overallSeverity = 'warning';
  }

  return {
    position,
    inside,
    middle,
    outside,
    avg: Math.round(avg),
    spread: Math.round(spread),
    middleDiff: Math.round(middleDiff),
    camberDiff: Math.round(camberDiff),
    pressureAction: currentPressureAction,
    severity: overallSeverity,
    recommendations: tireRecommendations,
    currentPressure,
    recommendedPressure,
    hotPsi: hotPsi !== null ? Math.round(hotPsi * 10) / 10 : null,
    optimalHotPsi,
    recommendedColdPsi: recommendedColdPsi !== null ? Math.round(recommendedColdPsi * 2) / 2 : null,
    camberCalculation,
    psiCalculation,
  };
}

/**
 * Analyze all four tires together for overall balance
 */
export function analyzeFullCar(tires) {
  const { LF, RF, LR, RR } = tires;
  const results = {};
  const overallRecommendations = [];

  // Analyze individual tires
  for (const [pos, data] of Object.entries(tires)) {
    if (data.inside && data.middle && data.outside) {
      results[pos] = analyzeTire(
        parseFloat(data.inside),
        parseFloat(data.middle),
        parseFloat(data.outside),
        pos,
        data.pressure ? parseFloat(data.pressure) : null
      );
    }
  }

  const analyzed = Object.values(results);
  if (analyzed.length < 4) {
    return { tires: results, overall: overallRecommendations, deltas: null };
  }

  // Front vs rear balance
  const frontAvg = (results.LF.avg + results.RF.avg) / 2;
  const rearAvg = (results.LR.avg + results.RR.avg) / 2;
  const frontRearDiff = frontAvg - rearAvg;

  if (frontRearDiff > 20) {
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Front tires are running ${Math.round(frontRearDiff)}°F hotter than rears on average. The front is doing more work — car may be understeering. Try reducing front tire pressure 1–2 PSI or increasing rear pressure 1–2 PSI. Shock valving is fixed (non-adjustable) — addressing imbalance through pressure and camber is the primary lever available.`
    });
  } else if (frontRearDiff < -20) {
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Rear tires are running ${Math.round(Math.abs(frontRearDiff))}°F hotter than fronts on average. The rear is doing more work — car may be oversteering. Try reducing rear tire pressure 1–2 PSI or increasing front pressure 1–2 PSI. Shock valving is fixed (non-adjustable) — pressure and camber are the primary adjustable levers.`
    });
  }

  // Left vs right balance
  // On a left-turn oval, the right side (RF/RR) will always be the outside-loaded side and run
  // significantly hotter than the left — this is expected and normal, not a setup problem.
  const leftAvg = (results.LF.avg + results.LR.avg) / 2;
  const rightAvg = (results.RF.avg + results.RR.avg) / 2;
  const leftRightDiff = leftAvg - rightAvg;

  if (leftRightDiff > 15) {
    // Left hotter than right — unusual on a left-turn oval
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Left side is running ${Math.round(leftRightDiff)}°F hotter than right. On a left-turn oval the right side should be warmer — check for unusual left-side loading (cross-weight, tire pressure imbalance).`
    });
  } else if (leftRightDiff < -40) {
    // Right side significantly hotter (>40°F) — still expected direction but extreme
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Right side is running ${Math.round(Math.abs(leftRightDiff))}°F hotter than left. Right-side loading is expected on a left-turn oval, but this spread is large — verify camber and pressure on the right side.`
    });
  } else if (leftRightDiff < -15) {
    // Right hotter by 15-40°F — normal for oval, just inform
    overallRecommendations.push({
      type: 'balance',
      severity: 'good',
      message: `Right side is running ${Math.round(Math.abs(leftRightDiff))}°F hotter than left — expected on a left-turn oval where the right side carries the outside load.`
    });
  }

  // Diagonal balance (cross-weight)
  const diag1 = (results.LF.avg + results.RR.avg) / 2;
  const diag2 = (results.RF.avg + results.LR.avg) / 2;
  const diagDiff = diag1 - diag2;

  if (Math.abs(diagDiff) > 15) {
    overallRecommendations.push({
      type: 'crossweight',
      severity: 'warning',
      message: `Diagonal imbalance detected (${Math.round(Math.abs(diagDiff))}°F). ${diagDiff > 0 ? 'LF/RR diagonal' : 'RF/LR diagonal'} is hotter. Adjust cross-weight or shock stiffness to balance.`
    });
  }

  // Check for a tire not working hard enough or being excessively overloaded.
  // On a left-turn oval, RF and RR naturally run 15-25°F hotter than LF/LR — this is expected.
  // Use a higher threshold for right-side tires to avoid false alarms.
  const avgTemps = analyzed.map(t => t.avg);
  const overallAvg = avgTemps.reduce((a, b) => a + b, 0) / avgTemps.length;
  for (const tire of analyzed) {
    const isRightSide = tire.position === 'RF' || tire.position === 'RR';
    const hotThreshold = isRightSide ? 35 : 20; // right side runs naturally hotter on oval
    if (tire.avg < overallAvg - 20) {
      overallRecommendations.push({
        type: 'individual',
        severity: 'warning',
        message: `${formatPosition(tire.position)} is running ${Math.round(overallAvg - tire.avg)}°F cooler than average. This tire isn't working as hard as the others — check pressure and consider cross-weight adjustment.`
      });
    }
    if (tire.avg > overallAvg + hotThreshold) {
      overallRecommendations.push({
        type: 'individual',
        severity: 'warning',
        message: `${formatPosition(tire.position)} is running ${Math.round(tire.avg - overallAvg)}°F hotter than average. This tire is carrying excessive load. Check pressure, camber, and shock settings at this corner.`
      });
    }
  }

  // Compute deltas for the delta table
  const leftAvgAll = (results.LF.avg + results.LR.avg) / 2;
  const rightAvgAll = (results.RF.avg + results.RR.avg) / 2;
  const diag1All = (results.LF.avg + results.RR.avg) / 2;
  const diag2All = (results.RF.avg + results.LR.avg) / 2;

  const deltas = {
    // Temperature deltas
    frontRear: Math.round(frontRearDiff),       // + = front hotter (understeer), - = rear hotter (oversteer)
    leftRight: Math.round(leftAvgAll - rightAvgAll), // + = left hotter, - = right hotter
    diagonal: Math.round(diag1All - diag2All),  // + = LF/RR hotter, - = RF/LR hotter
    // Individual tire averages
    lfAvg: results.LF.avg,
    rfAvg: results.RF.avg,
    lrAvg: results.LR.avg,
    rrAvg: results.RR.avg,
    frontAvg: Math.round(frontAvg),
    rearAvg: Math.round(rearAvg),
    leftAvg: Math.round(leftAvgAll),
    rightAvg: Math.round(rightAvgAll),
  };

  return { tires: results, overall: overallRecommendations, deltas };
}

export function formatPosition(pos) {
  const names = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
  return names[pos] || pos;
}

/**
 * Get handling recommendations based on reported car behavior
 * Calibrated for Crown Victoria P71 on a left-turn oval.
 *
 * Key physics for this car/track:
 *   RF = always the outside-loaded tire (compresses in left turns) — primary grip tire
 *   LF = always the inside tire (extends/rebounds in left turns) — lighter load
 *   RR = outside rear (compresses in left turns)
 *   LR = inside rear (extends in left turns)
 *   Rear camber is NOT adjustable. Spring rates are NOT adjustable.
 *   Shocks control roll stiffness: stiffer compression = more LLTD at that corner.
 *   Front LLTD up = more push. Rear LLTD up = more loose.
 *
 * Pressure and handling (for Crown Vic P71 at typical Setup B pressures):
 *   Effects depend on whether each tire is above or below its load-optimal hot PSI.
 *   RF/LF/LR are typically BELOW optimal → raising moves toward optimal → more grip.
 *   RR is typically AT or SLIGHTLY ABOVE optimal → lowering moves toward optimal → more grip.
 *
 *   Higher RF PSI → toward optimal → more RF grip → front bites → LOOSE
 *   Lower RF PSI  → away from optimal → less RF grip → front washes → TIGHT
 *   Higher RR PSI → past optimal → less RR contact → rear reaches limit sooner → LOOSE
 *   Lower RR PSI  → toward optimal → more RR contact → rear planted → TIGHT
 *   Higher LR PSI → toward optimal → more inside rear grip → TIGHT from middle out
 *   Lower LR PSI  → away from optimal → less inside rear grip → LOOSE from middle out
 *   Higher LF PSI → toward optimal → slightly more front grip → mild LOOSE
 *   Lower LF PSI  → less front grip → mild TIGHT
 */
const perTireRecommendations = {
  // ── TIGHT (UNDERSTEER / PUSH) ─────────────────────────────────────────────
  // To fix push: increase front grip OR reduce rear LLTD relative to front.
  // Pressure to LOOSEN: raise RF (RF below optimal → toward optimal → more grip → front bites).
  //   Raise RR (RR at/above optimal → past optimal → less RR grip → rear rotates more freely).
  //   Raise LF (toward optimal → more front grip). Lower LR (away from optimal → rear less stable).
  // Camber: add negative camber to RF for more grip. LF is inside tire — leave it alone.
  // Shocks: soften RF compression (less front LLTD), stiffen RR compression (more rear LLTD).
  //         Soften LF rebound (LF extends freely = less front roll resistance = less push).
  //         Stiffen LR rebound (rear roll resistance up = rear LLTD up = rear less stable = less push).
  tight_entry: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Increase PSI",   // higher RF = more RF grip = front turns = loosens push
      RR: "Increase PSI",   // higher RR = RR planted = balanced rear = lets front work
    },
    Camber: {
      LF: "Leave alone",                        // inside tire; doesn't drive the push
      RF: "Add 0.5-1.0° negative camber",       // more RF grip helps front bite on entry
    },
    Caster: {
      LF: "Increase slightly (alignment shop)",
      RF: "Increase slightly (alignment shop)",  // more RF caster = more dynamic neg camber in left turns = more RF grip
    },
    "Front Toe": {
      "Front Toe": "Add toe-out slightly",  // more toe-out = better turn-in = less push on entry
    },
    Shock: {
      LF: "Less Compression",
      LR: "Same compression",
      RF: "Less Compression",       // softer RF comp = RF loads more freely = less front LLTD
      RR: "More Compression",       // stiffer RR = more rear LLTD = rear limits before front
      "LF-Rebound": "Less Rebound", // softer LF rebound = LF extends freely = less front roll resistance
      "LR-Rebound": "More Rebound", // stiffer LR rebound = more rear roll resistance = rear LLTD up
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "More Rebound",
    },
  },
  tight_middle: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Increase PSI",   // higher RF = more grip = front turns in mid-corner
      RR: "Increase PSI",
    },
    Camber: {
      LF: "Leave alone",
      RF: "Add 0.25° negative camber",  // slight RF camber increase improves mid-corner contact
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Shock: {
      LF: "Less Compression",
      LR: "More Compression",
      RF: "Less Compression",       // soften RF = less front LLTD = front can grip more
      RR: "More Compression",       // stiffen RR = more rear LLTD = rear limits first
      "LF-Rebound": "Less Rebound",
      "LR-Rebound": "More Rebound",
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "Less Rebound",
    },
  },
  tight_exit: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Increase PSI",   // higher RF = RF holds grip under throttle = less push on exit
      RR: "Increase PSI",
    },
    Camber: {
      LF: "Leave alone",
      RF: "Add 0.5-1.0° negative camber",  // more RF grip helps front steer under throttle
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Shock: {
      LF: "Leave alone",
      LR: "Leave alone",
      RF: "Leave alone",
      RR: "More Compression",       // stiffer RR controls how fast weight goes to rear on throttle
      "LF-Rebound": "More Rebound", // stiffer LF rebound = front doesn't unload as fast on throttle
      "LR-Rebound": "Leave Alone",
      "RF-Rebound": "More Rebound", // stiffer RF rebound = front stays loaded longer under acceleration
      "RR-Rebound": "Leave Alone",
    },
  },

  // ── LOOSE (OVERSTEER) ─────────────────────────────────────────────────────
  // To fix loose: increase rear grip OR reduce front LLTD relative to rear.
  // Pressure to TIGHTEN: lower RF (RF away from optimal → less front grip → front doesn't over-rotate).
  //   Lower RR (RR toward optimal → more RR contact → rear planted). Raise LR (toward optimal → more rear grip).
  //   Lower LF (away from optimal → less front rotation).
  // Camber: slightly reduce RF negative camber to reduce front rotation tendency.
  //         LF is inside — leave alone.
  // Shocks: stiffen RF compression (more front LLTD = front limits before rear = more stable rear).
  //         Soften RR compression (less rear LLTD = rear doesn't reach limit as fast).
  loose_entry: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Decrease PSI",   // lower RF = less front grip = front follows rear = tighter
      RR: "Decrease PSI",   // lower RR = RR can grip harder (less over-inflation) = rear planted
    },
    Camber: {
      LF: "Leave alone",                           // inside tire; doesn't cause loose entry
      RF: "Reduce 0.5-1.0° negative camber",       // slightly less RF grip slows front rotation on entry
    },
    Caster: {
      LF: "Decrease slightly (alignment shop)",
      RF: "Decrease slightly (alignment shop)",  // less RF caster = less dynamic neg camber gain = less front rotation
    },
    "Front Toe": {
      "Front Toe": "Reduce toe-out slightly",  // less toe-out = less aggressive turn-in = more stable entry
    },
    Shock: {
      LF: "More Compression",
      LR: "Same compression",
      RF: "More Compression",       // stiffer RF comp = more front roll resistance = more front LLTD
      RR: "Less Compression",       // softer RR = less rear LLTD = rear doesn't break away as fast
      "LF-Rebound": "More Rebound", // stiffer LF rebound = LF stays planted = more front roll resistance
      "LR-Rebound": "Less Rebound", // softer LR rebound = rear can settle = more rear grip on entry
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "Less Rebound", // softer RR rebound = rear stays planted, doesn't snap back
    },
  },
  loose_middle: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Decrease PSI",   // lower RF = less front rotation = rear can keep up mid-corner
      RR: "Decrease PSI",
    },
    Camber: {
      LF: "Leave alone",
      RF: "Leave alone",  // mid-corner balance is primarily a LLTD issue, not camber
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Shock: {
      LF: "More Compression",
      LR: "Less Compression",
      RF: "More Compression",       // stiffer RF = more front LLTD = front limits before rear
      RR: "Less Compression",       // softer RR = less rear LLTD = rear stays planted mid-corner
      "LF-Rebound": "Less Rebound",
      "LR-Rebound": "More Rebound", // softer LR rebound = rear settles faster mid-corner
      "RF-Rebound": "Less Rebound",
      "RR-Rebound": "Less Rebound",
    },
  },
  loose_exit: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Decrease PSI",   // lower RF = front less aggressive on throttle = rear can follow
      RR: "Decrease PSI",   // lower RR = RR contact patch can work harder = rear planted
    },
    Camber: {
      LF: "Leave alone",
      RF: "Reduce 0.5-1.0° negative camber",  // less RF grip on exit lets rear recover without spinning
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Shock: {
      LF: "Leave alone",
      LR: "Less Compression",
      RF: "Leave alone",
      RR: "More Compression",       // stiffer RR = RR stays planted when throttle loads the rear
      "LF-Rebound": "More Rebound",
      "LR-Rebound": "Less Rebound",
      "RF-Rebound": "More Rebound",
      "RR-Rebound": "Less Rebound", // softer RR rebound = rear can settle under power without bouncing
    },
  },
};

export function getHandlingRecommendations(condition, phase) {
  const recommendations = {
    loose_entry: {
      title: 'Loose on Entry (Oversteer entering the turn)',
      description: 'The rear end wants to come around when you turn in. Weight is transferring off the rear before it can build grip.',
      changes: [
        { component: 'RF Shock (Compression)', adjustment: 'Stiffen RF compression', effect: 'Increases front roll resistance — more front LLTD keeps the front as the limiting factor, stabilizing the rear on turn-in' },
        { component: 'LR Shock (Rebound)', adjustment: 'Soften LR rebound', effect: 'Left rear extends freely as the car rolls left, allowing the rear axle to stay planted on entry' },
        { component: 'RR Shock (Compression)', adjustment: 'Soften RR compression', effect: 'Reduces rear LLTD — the RR stays more loaded rather than transferring all load off the rear' },
        { component: 'Tire Pressure', adjustment: 'Lower RF 1-2 PSI · Lower RR 1-2 PSI · Raise LR 1-2 PSI', effect: 'Lower RF reduces front-end rotation (less front grip = front doesn\'t bite as hard on turn-in). Lower RR moves it toward optimal hot pressure — more RR contact = rear planted. Raise LR adds inside rear grip to stabilize the axle on entry.' },
      ]
    },
    loose_middle: {
      title: 'Loose in the Middle (Oversteer at mid-corner)',
      description: 'The rear slides out at steady throttle through the corner. Rear LLTD is too high relative to front.',
      changes: [
        { component: 'RF Shock (Compression)', adjustment: 'Stiffen RF compression', effect: 'Increases front roll stiffness — shifts the handling balance so the front reaches its grip limit before the rear' },
        { component: 'RR Shock (Compression)', adjustment: 'Soften RR compression', effect: 'Reduces rear LLTD — the rear stays more evenly loaded rather than shedding load to the inside (LR), giving the RR more sustained grip' },
        { component: 'LR Shock (Rebound)', adjustment: 'Soften LR rebound', effect: 'Allows the left rear to unload naturally, reducing rear roll resistance imbalance in sustained cornering' },
        { component: 'Tire Pressure', adjustment: 'Lower RF 1-2 PSI · Lower RR 1-2 PSI · Raise LR 1-2 PSI', effect: 'Lower RF reduces front grip so the front doesn\'t over-rotate mid-corner. Lower RR toward optimal = more RR contact = rear holds through the apex. Raise LR adds inside rear bite for a more stable mid-corner platform.' },
      ]
    },
    loose_exit: {
      title: 'Loose on Exit (Oversteer on throttle application)',
      description: 'The rear steps out when applying throttle. Weight transfers rearward faster than rear grip can build.',
      changes: [
        { component: 'Tire Pressure', adjustment: 'Lower RF 1 PSI · Lower RR 1-2 PSI · Raise LR 1-2 PSI', effect: 'Lower RF reduces front-end pull so the rear isn\'t dragged around on throttle. Lower RR toward its optimal hot pressure — more RR contact patch = rear plants under acceleration. Raise LR adds drive-side bite for smoother power application.' },
        { component: 'RR Shock (Compression)', adjustment: 'Soften RR compression', effect: 'Allows the RR to absorb the weight transfer more smoothly when throttle is applied, maintaining contact' },
        { component: 'RR Shock (Rebound)', adjustment: 'Stiffen RR rebound', effect: 'Keeps the RR compressed and planted as power loads the rear, preventing the tire from bouncing off the track' },
        { component: 'RF/LF Shock (Rebound)', adjustment: 'Stiffen front rebound', effect: 'Slows how fast the front unloads under acceleration — keeps the front engaged so the car tracks straight rather than rotating' },
        { component: 'Throttle Application', adjustment: 'Apply throttle more gradually (driver adjustment)', effect: 'Reduces the abrupt weight transfer spike that breaks the rear loose' },
      ]
    },
    tight_entry: {
      title: 'Tight on Entry (Understeer entering the turn)',
      description: 'The car pushes straight when you turn in. The RF is not generating enough grip on entry.',
      changes: [
        { component: 'RF Shock (Compression)', adjustment: 'Soften RF compression', effect: 'Allows the RF to load up faster and more freely on turn-in, reducing front LLTD and improving RF contact patch grip' },
        { component: 'LF Shock (Rebound)', adjustment: 'Soften LF rebound', effect: 'Left front can extend freely as body rolls, reducing front roll resistance — less front LLTD means more available front grip' },
        { component: 'RF Camber', adjustment: 'Add 0.25-0.5° negative camber to RF', effect: 'Improves RF contact patch orientation on entry — inside edge carries more load, increasing cornering grip' },
        { component: 'RF Caster', adjustment: 'Increase RF caster (alignment shop — not a trackside adjustment)', effect: 'Adds dynamic negative camber gain to the RF during steering input, increasing front grip exactly when it is needed most. Current Setup B RF caster is 8.0° — already near the high end; only increase if alignment shop confirms it is safe.' },
      ]
    },
    tight_middle: {
      title: 'Tight in the Middle (Understeer at mid-corner)',
      description: 'The car plows through the corner at steady throttle. Front LLTD is too high relative to rear.',
      changes: [
        { component: 'RF Shock (Compression)', adjustment: 'Soften RF compression', effect: 'Reduces front roll stiffness — lowers front LLTD so the RF stays more evenly loaded through sustained cornering' },
        { component: 'RR Shock (Compression)', adjustment: 'Stiffen RR compression', effect: 'Increases rear LLTD — the rear reaches its grip limit before the front, which rotates the car more freely' },
        { component: 'RF Camber', adjustment: 'Add 0.25° negative camber to RF', effect: 'Improves RF contact patch through the corner, helping the front grip in sustained lateral load' },
        { component: 'Tire Pressure', adjustment: 'Raise RF 1-2 PSI · Raise LF 1 PSI · Raise RR 1 PSI', effect: 'Raise RF toward its optimal hot pressure — more RF contact patch = front bites mid-corner. Raise LF adds inside front grip. Raise RR moves it slightly above optimal = less RR grip = rear reaches its limit sooner, encouraging the car to rotate.' },
      ]
    },
    tight_exit: {
      title: 'Tight on Exit (Understeer on acceleration)',
      description: 'The car pushes wide when applying throttle. The front unloads too fast as weight transfers rearward.',
      changes: [
        { component: 'Tire Pressure', adjustment: 'Raise RF 1-2 PSI · Raise LF 1 PSI · Raise RR 1 PSI', effect: 'Raise RF toward optimal = more RF grip = front bites longer under throttle load. Raise LF adds inside front grip. Raise RR takes it slightly past optimal = less RR grip = rear starts to rotate, which un-sticks the nose.' },
        { component: 'RF/LF Shock (Rebound)', adjustment: 'Stiffen front rebound', effect: 'Slows how fast the front extends as weight transfers rearward — keeps the front engaged in steering longer on corner exit' },
        { component: 'RR Shock (Compression)', adjustment: 'Stiffen RR compression', effect: 'Controls rear squat under power, preventing excessive weight from dumping off the front and onto the rear too quickly' },
        { component: 'RF Camber', adjustment: 'Add 0.25-0.5° negative camber to RF', effect: 'More RF grip on exit helps the front maintain steering authority even as the rear loads up under throttle' },
      ]
    }
  };

  const key = `${condition}_${phase}`;
  const result = recommendations[key] || null;

  if (result) {
    result.perTire = perTireRecommendations[key] || null;
  }

  return result;
}

export const handlingConditions = [
  { value: 'loose', label: 'Loose (Oversteer)', description: 'Rear end slides out' },
  { value: 'tight', label: 'Tight (Understeer)', description: 'Car pushes/plows wide' },
];

export const cornerPhases = [
  { value: 'entry', label: 'Corner Entry', description: 'Braking zone into the turn' },
  { value: 'middle', label: 'Mid-Corner', description: 'Steady state through the apex' },
  { value: 'exit', label: 'Corner Exit', description: 'Applying throttle out of the turn' },
];
