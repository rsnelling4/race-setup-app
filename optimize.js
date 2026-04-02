#!/usr/bin/env node
/**
 * Setup Optimizer — finds the fastest lap time setup via grid search.
 *
 * Strategy:
 *  1. Iterate over all unique (frontSum, rearSum) shock stiffness pairs
 *     from the actual available parts.
 *  2. For each shock combo, analytically derive:
 *     - Optimal cold PSI  → from optimal hot PSI + equilibrium temp
 *     - Optimal static camber → from ideal effective camber - caster gain - body roll
 *  3. Grid-search caster LF/RF (remaining trade-off: direct caster grip factor
 *     vs. caster-induced camber gain)
 *  4. Grid-search toe (small effect, confirms -0.25" is optimal)
 *  5. Rank by calcPerformance metric, verify top 5 with full 25-lap simulation.
 *
 * Run: node optimize.js
 */

// ======= CONSTANTS (mirrored from raceSimulation.js) =======
const G          = 32.174;
const RANKINE    = 459.67;
const OVAL_CORNER_G = 0.375;
const COLD_PSI_TEMP = 68;   // °F — inflated in garage, not on track

const TRACK = { cornerRadius: 105, bankingDeg: 3 };
TRACK.bankingRad = TRACK.bankingDeg * Math.PI / 180;

const VEH = {
  weight:          4100,
  mass:            4100 / G,
  frontBias:       0.55,
  cgHeight:        22 / 12,
  rollCenterHeight: 3 / 12, // ft — front roll center height (3 inches, measured)
  trackWidth:      63 / 12,
};

const THERMAL = {
  heatBase:   0.53,
  heatLoad:   0.00453,
  coolRate:   0.02,
  thermalMass:1.39,
  refSpeed:   75,
  wearRate: (wf, temp) => 0.00008 * wf * (temp > 150 ? 1.5 : 1.0),
};

// Zone heat multipliers [inside, middle, outside]
const ZONE_OUTSIDE = [0.82, 1.0, 1.18];
const ZONE_INSIDE  = [1.06, 1.0, 0.94];

// ======= GRIP FACTORS =======
function tempGripFactor(temp) {
  const optLow = 100, optHigh = 165;
  if (temp >= optLow && temp <= optHigh) return 1.0;
  if (temp < optLow) return Math.max(0.75, 1 - Math.pow((optLow - temp) / 60, 2) * 0.25);
  return Math.max(0.70, 1 - Math.pow((temp - optHigh) / 50, 2) * 0.30);
}

function pressureGripFactor(hotPsi, tireLoad) {
  const optPsi = 30 * (tireLoad / (VEH.weight / 4));
  return Math.max(0.82, 1 - 0.010 * Math.abs(hotPsi - optPsi));
}

// Sidewall compliance: Ironman 235/55R17, section height 5.09", width 9.25", rated load 1929 lbs
// K=1.2 for 55-series radial all-season
const TIRE_SIDEWALL_COEFF = 1.2 * (5.09 / 9.25) / 1929; // ≈ 0.000342 °/lb
function sidewallCamberDeg(load) { return load * TIRE_SIDEWALL_COEFF; }

// KPI geometry: 9.5° inclination, ~10° steer at apex
const KPI_CAMBER_GAIN = Math.sin(9.5 * Math.PI / 180) * Math.sin(10 * Math.PI / 180); // ≈ 0.029°

// Ground-frame camber ideals
const IDEAL_GROUND_RF   = -2.0;  // ° — outside front
const IDEAL_GROUND_LF   =  0.0;  // ° — inside front
const IDEAL_GROUND_REAR =  0.0;  // ° — both rears (solid axle)

function camberGripFactor(groundCamber, isOutside, isFront) {
  let ideal;
  if (isFront) { ideal = isOutside ? IDEAL_GROUND_RF : IDEAL_GROUND_LF; }
  else         { ideal = IDEAL_GROUND_REAR; }
  return Math.max(0.88, 1 - 0.012 * Math.abs(groundCamber - ideal));
}

function casterGripFactor(casterDeg, isOutside) {
  if (isOutside) return Math.max(0.96, 1 - 0.004 * Math.abs(casterDeg - 5.0));
  return Math.max(0.97, 1 - 0.003 * Math.abs(casterDeg - 3.0));
}

function toeGripFactor(toe) {
  return Math.max(0.96, 1 - 0.008 * Math.pow(Math.abs(toe - (-0.25)), 2));
}

function toeDragFactor(toe) {
  return 1.0 + 0.001 * toe * toe;
}

function hotPressure(coldPsi, tireTemp) {
  return coldPsi * (tireTemp + RANKINE) / (COLD_PSI_TEMP + RANKINE);
}

// ======= MECHANICAL =======
function shockStiffness(lfR, rfR, lrR, rrR) {
  const f = (10 - lfR) + (10 - rfR);
  const r = (10 - lrR) + (10 - rrR);
  return { front: f, rear: r, total: f + r, frontLLTD: f / Math.max(f + r, 1) };
}

function bodyRoll(lateralG, totalStiffness) {
  return lateralG * 3.1 * 28 / Math.max(totalStiffness, 4); // 3.1°/G measured at corner speed
}

function tireLoads(lateralG, frontLLTD) {
  const lat = VEH.weight * lateralG * (VEH.cgHeight - VEH.rollCenterHeight) / VEH.trackWidth;
  const fs  = VEH.weight * VEH.frontBias / 2;
  const rs  = VEH.weight * (1 - VEH.frontBias) / 2;
  return {
    LF: Math.max(50, fs - lat * frontLLTD),
    RF: fs + lat * frontLLTD,
    LR: Math.max(50, rs - lat * (1 - frontLLTD)),
    RR: rs + lat * (1 - frontLLTD),
  };
}

// ======= PERFORMANCE METRIC =======
const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const OUTSIDE  = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true,  RF: true, LR: false, RR: false };

function calcPerformance(ss, camber, caster, toe, coldPsi, tireTemps, ambient) {
  const { front: fStiff, rear: rStiff, total: totStiff, frontLLTD } = ss;
  const refG       = 1.0;
  const loads      = tireLoads(refG, frontLLTD);
  const cornerLoads= tireLoads(OVAL_CORNER_G, frontLLTD);
  const roll       = bodyRoll(refG, totStiff);
  const cornerRoll = roll * OVAL_CORNER_G;

  let totalForce = 0, frontForce = 0, rearForce = 0;

  for (const c of CORNERS) {
    const load    = loads[c];
    const avgTemp = tireTemps[c];
    const hp      = hotPressure(coldPsi[c], avgTemp);
    const outside = OUTSIDE[c];
    const front   = IS_FRONT[c];
    let mu = 1.0;

    mu *= tempGripFactor(avgTemp);
    mu *= pressureGripFactor(hp, cornerLoads[c]);

    if (front) {
      const casterGain   = outside ? -(caster[c] * 0.18 * refG) : (caster[c] * 0.10 * refG);
      const brCamber     = outside ? -(cornerRoll * 0.355) : (cornerRoll * 0.15); // 0.355=1.1°/3.1°
      const kpiCamber    = outside ? KPI_CAMBER_GAIN : -KPI_CAMBER_GAIN;
      const effCamber    = camber[c] + casterGain + brCamber + kpiCamber;
      const geomGround   = outside ? effCamber + cornerRoll : effCamber - cornerRoll;
      const groundCamber = geomGround + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, true);
      mu *= casterGripFactor(caster[c], outside);
    } else {
      const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, false);
    }

    if (front) mu *= toeGripFactor(toe);

    const avgLoad = VEH.weight / 4;
    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);

    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force;
    else       rearForce  += force;
  }

  totalForce += VEH.weight * Math.sin(TRACK.bankingRad);

  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  totalForce *= Math.max(0.94, 1 - Math.abs(frontPct - VEH.frontBias) * 0.2);

  const OPTIMAL_LLTD = 0.46;
  const lltdDev = Math.abs(frontLLTD - OPTIMAL_LLTD);
  totalForce *= Math.max(0.90, 1 - 0.7 * lltdDev * lltdDev);
  totalForce /= toeDragFactor(toe);

  return totalForce / VEH.weight;
}

// ======= FULL SIMULATION (for verification of top candidates) =======
function simulateLaps(ss, camber, caster, toe, coldPsi, ambientTemp, numLaps = 25) {
  const { front: fStiff, rear: rStiff, total: totStiff, frontLLTD } = ss;
  const loads1G   = tireLoads(1.0, frontLLTD);
  const cornerLoads = tireLoads(OVAL_CORNER_G, frontLLTD);
  const avgLoad   = VEH.weight / 4;
  const roll      = bodyRoll(1.0, totStiff);
  const cornerRoll = roll * OVAL_CORNER_G;

  // Work factors for thermal model
  const wf = {};
  for (const c of CORNERS) wf[c] = loads1G[c] / avgLoad;

  // Init tires slightly above ambient
  const tires = {};
  for (const c of CORNERS) {
    const t = ambientTemp + 5;
    tires[c] = { inside: t, middle: t, outside: t, temp: t, wear: 0 };
  }

  let bestLap = Infinity;

  for (let lap = 1; lap <= numLaps; lap++) {
    const tempMap = {};
    for (const c of CORNERS) tempMap[c] = tires[c].temp;

    const metric  = calcPerformance(ss, camber, caster, toe, coldPsi, tempMap, ambientTemp);
    const lapTime = BASELINE_LAP * Math.pow(BASELINE_METRIC / metric, LAP_SENSITIVITY);
    if (lapTime < bestLap) bestLap = lapTime;

    // Update tire temps
    for (const c of CORNERS) {
      const outside = OUTSIDE[c];
      const front   = IS_FRONT[c];
      const zoneMults = outside ? [...ZONE_OUTSIDE] : [...ZONE_INSIDE];

      let camberVal = front ? (setup_camberVal(c, camber, caster, cornerRoll, roll, outside)) : (outside ? roll : -roll);

      let camberShift = 0;
      if (outside)     camberShift = 0;
      else if (front)  camberShift = -camberVal * 0.04;
      else             camberShift = -camberVal * 0.008;

      const toe_ib = front ? (-toe * 0.05) : 0;
      const toe_ob = front ? ( toe * 0.03) : 0;

      const avgTemp = tires[c].temp;
      const hp = hotPressure(coldPsi[c], avgTemp);
      const optPsi = 30 * (cornerLoads[c] / avgLoad);
      const psiDev = hp - optPsi;
      const psiMid = psiDev * 0.003;

      const zoneKeys = ['inside', 'middle', 'outside'];
      const zMults = [
        zoneMults[0] + camberShift + toe_ib,
        zoneMults[1] + psiMid,
        zoneMults[2] - camberShift + toe_ob,
      ];

      const newZ = {};
      for (let z = 0; z < 3; z++) {
        const T = tires[c][zoneKeys[z]];
        const heatIn  = (THERMAL.heatBase + THERMAL.heatLoad * wf[c] * THERMAL.refSpeed) * lapTime * zMults[z];
        const heatOut = THERMAL.coolRate * (T - ambientTemp) * lapTime;
        newZ[zoneKeys[z]] = T + (heatIn - heatOut) / THERMAL.thermalMass;
      }

      const newAvg = (newZ.inside + newZ.middle + newZ.outside) / 3;
      tires[c] = { ...newZ, temp: newAvg, wear: tires[c].wear + THERMAL.wearRate(wf[c], newAvg) };
    }
  }

  return bestLap;
}

function setup_camberVal(c, camber, caster, cornerRoll, roll, outside) {
  if (IS_FRONT[c]) {
    const cg = outside ? -(caster[c] * 0.18) : (caster[c] * 0.10);
    return camber[c] + cg;
  }
  return outside ? roll : -roll;
}

// ======= BASELINE METRIC =======
const DEFAULT_SS = shockStiffness(4, 4, 2, 2);
const DEFAULT_CAMBER = { LF: -1.5, RF: -3.0 };
const DEFAULT_CASTER = { LF: 3.5, RF: 5.0 };
const DEFAULT_TOE    = -0.25;
const DEFAULT_COLD   = { LF: 19.5, RF: 34, LR: 18.5, RR: 36 };
const CALIB_TIRES    = { LF: 100, RF: 117, LR: 98, RR: 116 }; // 65°F pyrometer avg

const BASELINE_METRIC = calcPerformance(
  DEFAULT_SS, DEFAULT_CAMBER, DEFAULT_CASTER, DEFAULT_TOE, DEFAULT_COLD, CALIB_TIRES, 65);
const BASELINE_LAP    = 17.4;
const LAP_SENSITIVITY = 0.28;

// ======= AVAILABLE PARTS =======
// Front strut ratings (unique)
const FRONT_RATINGS = [9, 8, 6, 4, 3, 2, 1];
// Rear shock ratings (unique)
const REAR_RATINGS  = [10, 9, 8, 7, 5, 4, 3, 2, 1];

// ======= SEARCH RANGES =======
const CASTER_LF_RANGE = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5];
const CASTER_RF_RANGE = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5];
const TOE_RANGE       = [-0.125, -0.25, -0.375, -0.5];

// Camber clamping limits (practical alignment range)
const CAMBER_LF_MIN = -3.0, CAMBER_LF_MAX = -0.25;
const CAMBER_RF_MIN = -5.0, CAMBER_RF_MAX = -1.5;

// Ambient for optimization (hot race day)
const AMBIENT = 90;

// ======= BUILD UNIQUE SHOCK CONFIGS =======
// Since shockStiffness() only uses sums, we deduplicate by (frontSum, rearSum)
// but keep a representative part combo for the output.
const shockConfigs = [];
const seenSums = new Set();

for (const lfR of FRONT_RATINGS) {
  for (const rfR of FRONT_RATINGS) {
    for (const lrR of REAR_RATINGS) {
      for (const rrR of REAR_RATINGS) {
        const ss  = shockStiffness(lfR, rfR, lrR, rrR);
        const key = `${ss.front},${ss.rear}`;
        if (!seenSums.has(key)) {
          seenSums.add(key);
          shockConfigs.push({ lfR, rfR, lrR, rrR, ss });
        }
      }
    }
  }
}

// ======= GRID SEARCH =======
const total = shockConfigs.length * CASTER_LF_RANGE.length * CASTER_RF_RANGE.length * TOE_RANGE.length;
console.log(`\nUnique shock configs : ${shockConfigs.length}`);
console.log(`Caster LF options    : ${CASTER_LF_RANGE.length}`);
console.log(`Caster RF options    : ${CASTER_RF_RANGE.length}`);
console.log(`Toe options          : ${TOE_RANGE.length}`);
console.log(`Total combinations   : ${total.toLocaleString()}`);
console.log(`Ambient temp         : ${AMBIENT}°F\n`);
console.log('Searching...\n');

const t0 = Date.now();
const topN = [];

for (const { lfR, rfR, lrR, rrR, ss } of shockConfigs) {
  const { frontLLTD, total: totStiff } = ss;

  // Equilibrium temps (steady-state, from 1G load factors)
  const loads1G = tireLoads(1.0, frontLLTD);
  const avgLoad = VEH.weight / 4;
  const eqTemps = {};
  for (const c of CORNERS) {
    const wf = loads1G[c] / avgLoad;
    eqTemps[c] = AMBIENT + (THERMAL.heatBase + THERMAL.heatLoad * wf * THERMAL.refSpeed) / THERMAL.coolRate;
  }

  // Optimal cold PSI from optimal hot PSI and equilibrium temp
  const cornerLoads = tireLoads(OVAL_CORNER_G, frontLLTD);
  const coldPsi = {};
  for (const c of CORNERS) {
    const optHot     = 30 * (cornerLoads[c] / avgLoad);
    const clampedHot = Math.min(Math.max(18, optHot), 51);
    const raw        = clampedHot * (COLD_PSI_TEMP + RANKINE) / (eqTemps[c] + RANKINE);
    coldPsi[c] = Math.round(raw * 2) / 2; // round to nearest 0.5 PSI
  }

  // Body roll for this shock combo
  const roll       = bodyRoll(1.0, totStiff);
  const cornerRoll = roll * OVAL_CORNER_G;

  for (const cLF of CASTER_LF_RANGE) {
    for (const cRF of CASTER_RF_RANGE) {
      // Analytically optimal static camber
      // Back-calculate optimal static camber from ground ideal including sidewall and KPI
      const lfCasterGain = cLF * 0.10;
      const lfBodyRoll   = cornerRoll * 0.15;
      const lfSwCamber   = sidewallCamberDeg(cornerLoads.LF);
      const lfEffIdeal   = IDEAL_GROUND_LF - lfSwCamber + cornerRoll; // inside: effectiveIdeal = idealGround - sw + roll
      let staticLF = lfEffIdeal - lfCasterGain - lfBodyRoll - (-KPI_CAMBER_GAIN); // LF kpiCamber = -KPI_CAMBER_GAIN
      staticLF = Math.max(CAMBER_LF_MIN, Math.min(CAMBER_LF_MAX, staticLF));
      staticLF = Math.round(staticLF * 4) / 4; // round to 0.25°

      const rfCasterGain = -(cRF * 0.18);
      const rfBodyRoll   = -(cornerRoll * 0.355); // 0.355=1.1°/3.1°
      const rfSwCamber   = sidewallCamberDeg(cornerLoads.RF);
      const rfEffIdeal   = IDEAL_GROUND_RF - rfSwCamber - cornerRoll; // outside: effectiveIdeal = idealGround - sw - roll
      let staticRF = rfEffIdeal - rfCasterGain - rfBodyRoll - KPI_CAMBER_GAIN; // RF kpiCamber = +KPI_CAMBER_GAIN
      staticRF = Math.max(CAMBER_RF_MIN, Math.min(CAMBER_RF_MAX, staticRF));
      staticRF = Math.round(staticRF * 4) / 4;

      const camber = { LF: staticLF, RF: staticRF };
      const caster = { LF: cLF,     RF: cRF };

      for (const toe of TOE_RANGE) {
        const metric = calcPerformance(ss, camber, caster, toe, coldPsi, eqTemps, AMBIENT);

        // Keep top-50 candidates for full-sim verification
        if (topN.length < 50 || metric > topN[topN.length - 1].metric) {
          topN.push({ lfR, rfR, lrR, rrR, ss, camber, caster, toe, coldPsi, eqTemps, metric });
          topN.sort((a, b) => b.metric - a.metric);
          if (topN.length > 50) topN.pop();
        }
      }
    }
  }
}

const t1 = Date.now();
console.log(`Grid search done in ${t1 - t0}ms\n`);
console.log(`Running full 25-lap simulation on top ${topN.length} candidates...\n`);

// ======= VERIFY TOP CANDIDATES WITH FULL SIMULATION =======
const results = topN.map(cand => {
  const bestLap = simulateLaps(
    cand.ss, cand.camber, cand.caster, cand.toe, cand.coldPsi, AMBIENT, 25);
  return { ...cand, bestLap };
}).sort((a, b) => a.bestLap - b.bestLap);

const t2 = Date.now();
console.log(`Full simulation done in ${t2 - t1}ms\n`);

// ======= REPORT =======
function r2(n) { return Math.round(n * 100) / 100; }

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║               TOP 10 FASTEST SETUPS (90°F / 25 laps)        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

results.slice(0, 10).forEach((c, i) => {
  const perf = BASELINE_LAP * Math.pow(BASELINE_METRIC / c.metric, LAP_SENSITIVITY);
  console.log(`#${i + 1}  Best lap: ${c.bestLap.toFixed(3)}s  (metric: ${c.metric.toFixed(5)})`);
  console.log(`    Shocks  : LF ${c.lfR}  RF ${c.rfR}  LR ${c.lrR}  RR ${c.rrR}`);
  console.log(`    Camber  : LF ${c.camber.LF}°  RF ${c.camber.RF}°`);
  console.log(`    Caster  : LF ${c.caster.LF}°  RF ${c.caster.RF}°`);
  console.log(`    Toe     : ${c.toe}" (${c.toe === -0.25 ? '1/4" out' : c.toe === -0.375 ? '3/8" out' : c.toe + '"'})`);
  console.log(`    Cold PSI: LF ${c.coldPsi.LF}  RF ${c.coldPsi.RF}  LR ${c.coldPsi.LR}  RR ${c.coldPsi.RR}`);
  console.log(`    Eq temps: LF ${r2(c.eqTemps.LF)}°  RF ${r2(c.eqTemps.RF)}°  LR ${r2(c.eqTemps.LR)}°  RR ${r2(c.eqTemps.RR)}°`);
  console.log('');
});

const best = results[0];
console.log('══════════════════════════════════════════════════════════════');
console.log('RECOMMENDED_SETUP (paste into raceSimulation.js):');
console.log('══════════════════════════════════════════════════════════════');
console.log(`export const RECOMMENDED_SETUP = {`);
console.log(`  shocks: { LF: ${best.lfR}, RF: ${best.rfR}, LR: ${best.lrR}, RR: ${best.rrR} },`);
console.log(`  camber: { LF: ${best.camber.LF}, RF: ${best.camber.RF} },`);
console.log(`  caster: { LF: ${best.caster.LF}, RF: ${best.caster.RF} },`);
console.log(`  toe: ${best.toe},`);
console.log(`  coldPsi: { LF: ${best.coldPsi.LF}, RF: ${best.coldPsi.RF}, LR: ${best.coldPsi.LR}, RR: ${best.coldPsi.RR} },`);
console.log(`};`);
console.log('');
console.log(`Baseline (current setup @ 65°F)   : 17.400s`);
console.log(`Best found (optimal setup @ 90°F)  : ${best.bestLap.toFixed(3)}s`);
console.log(`Improvement                        : ${(17.4 - best.bestLap).toFixed(3)}s`);
