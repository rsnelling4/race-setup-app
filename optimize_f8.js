#!/usr/bin/env node
/**
 * Figure 8 Setup Optimizer — grid search for fastest lap time.
 *
 * Key F8 differences from oval:
 *  - Each tire is the OUTSIDE tire in one turn and INSIDE in the other → symmetric setup optimal
 *  - Optimal LLTD = 0.50 (balanced, both directions)
 *  - F8_HEAT_MULT = 1.18 (tighter corners, more scrub heat than oval)
 *  - Baseline: 23.283s @ 75°F (real-world calibration run)
 *
 * Strategy:
 *  - Shocks: unique (frontSum, rearSum) pairs from available parts
 *  - Camber: symmetric LF=RF, search grid (each tire is inside/outside 50/50)
 *  - Caster: symmetric LF=RF, search grid
 *  - PSI: analytically derived — optimal hot PSI weighted toward outside-turn corner load
 *  - Toe: -0.25" (confirmed optimal by oval optimizer; symmetric drag both ways)
 *
 * Run: node optimize_f8.js
 */

// ======= CONSTANTS =======
const G           = 32.174;
const RANKINE     = 459.67;
const F8_CORNER_G = 0.28;
const COLD_PSI_TEMP = 68;
const F8_HEAT_MULT  = 1.18;

const VEH = {
  weight:          4100,
  mass:            4100 / G,
  frontBias:       0.55,
  cgHeight:        22 / 12,
  rollCenterHeight: 3 / 12, // ft — front roll center height (3 inches, measured)
  trackWidth:      63 / 12,
  tireRadius:      13.6 / 12,
};

const THERMAL = {
  heatBase:    0.53,
  heatLoad:    0.00453,
  coolRate:    0.02,
  thermalMass: 1.39,
  refSpeed:    75,
  wearRate: (wf, temp) => 0.00008 * wf * (temp > 150 ? 1.5 : 1.0),
};

// F8 zone multipliers (averaged L+R — much more even than oval)
const F8_ZONE = [0.94, 1.0, 1.06];

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

// ======= F8 PERFORMANCE =======
const CORNERS  = ['LF', 'RF', 'LR', 'RR'];
const OUTSIDE  = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true,  RF: true, LR: false, RR: false };

function calcPerformanceF8(ss, camber, caster, toe, coldPsi, tireTemps) {
  const refG = 1.0;
  const { total: totStiff, frontLLTD } = ss;
  const loadsL  = tireLoads(refG, frontLLTD);
  const loadsR  = { LF: loadsL.RF, RF: loadsL.LF, LR: loadsL.RR, RR: loadsL.LR };
  const cLoadsL = tireLoads(F8_CORNER_G, frontLLTD);
  const cLoadsR = { LF: cLoadsL.RF, RF: cLoadsL.LF, LR: cLoadsL.RR, RR: cLoadsL.LR };
  const roll       = bodyRoll(refG, totStiff);
  const cornerRoll = roll * F8_CORNER_G;
  const avgLoad = VEH.weight / 4;

  let totalForce = 0, frontForce = 0, rearForce = 0;

  for (const c of CORNERS) {
    const avgTemp = tireTemps[c];
    const front   = IS_FRONT[c];
    let sumForce  = 0;

    for (const isLeft of [true, false]) {
      const outside = isLeft ? OUTSIDE[c] : !OUTSIDE[c];
      const load    = isLeft ? loadsL[c]  : loadsR[c];
      const cLoad   = isLeft ? cLoadsL[c] : cLoadsR[c];
      const hp      = hotPressure(coldPsi[c], avgTemp);

      let mu = 1.0;
      mu *= tempGripFactor(avgTemp);
      mu *= pressureGripFactor(hp, cLoad);

      if (front) {
        const casterGain = outside
          ? -(caster[c] * 0.18 * refG)
          :  (caster[c] * 0.10 * refG);
        const kpiCamber = outside ? KPI_CAMBER_GAIN : -KPI_CAMBER_GAIN;
        const effectiveCamber = camber[c] + casterGain + kpiCamber;
        const geomGround = outside ? effectiveCamber + cornerRoll : effectiveCamber - cornerRoll;
        const groundCamber = geomGround + sidewallCamberDeg(cLoad);
        mu *= camberGripFactor(groundCamber, outside, true);
        mu *= casterGripFactor(caster[c], outside);
        mu *= toeGripFactor(toe);
      } else {
        const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cLoad);
        mu *= camberGripFactor(groundCamber, outside, false);
      }

      mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
      sumForce += mu * load;
    }

    const avgForce = sumForce / 2;
    totalForce += avgForce;
    if (front) frontForce += avgForce; else rearForce += avgForce;
  }

  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  totalForce *= Math.max(0.94, 1 - Math.abs(frontPct - VEH.frontBias) * 0.2);

  const F8_OPTIMAL_LLTD = 0.50;
  const lltdDev = Math.abs(frontLLTD - F8_OPTIMAL_LLTD);
  totalForce *= Math.max(0.90, 1 - 0.7 * lltdDev * lltdDev);

  totalForce /= toeDragFactor(toe);
  return totalForce / VEH.weight;
}

// ======= F8 FULL SIMULATION (for verification) =======
function simulateF8(ss, camber, caster, toe, coldPsi, ambientTemp, numLaps = 20) {
  const { frontLLTD } = ss;
  // Work factors: F8 averages L+R → equal to static loads
  const avgLoad = VEH.weight / 4;
  const fStatic = VEH.weight * VEH.frontBias / 2;
  const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
  const wf = {
    LF: fStatic / avgLoad, RF: fStatic / avgLoad,
    LR: rStatic / avgLoad, RR: rStatic / avgLoad,
  };

  const cLoadsL = tireLoads(F8_CORNER_G, frontLLTD);
  const cLoadsR = { LF: cLoadsL.RF, RF: cLoadsL.LF, LR: cLoadsL.RR, RR: cLoadsL.LR };

  let tires = {};
  for (const c of CORNERS) {
    const t = ambientTemp + 5;
    tires[c] = { inside: t, middle: t, outside: t, temp: t, wear: 0 };
  }

  let bestLap = Infinity;

  for (let lap = 1; lap <= numLaps; lap++) {
    const tempMap = {};
    for (const c of CORNERS) tempMap[c] = tires[c].temp;
    const metric  = calcPerformanceF8(ss, camber, caster, toe, coldPsi, tempMap);
    const lapTime = BASELINE_LAP_F8 * Math.pow(BASELINE_METRIC_F8 / metric, LAP_SENSITIVITY);
    if (lapTime < bestLap) bestLap = lapTime;

    // Update tire temps (F8 thermal model)
    const newTires = {};
    for (const c of CORNERS) {
      const front    = IS_FRONT[c];
      const gOut     = -(caster[c] * 0.18);
      const gIn      = (caster[c] * 0.10);
      const camberL  = camber[c] + (OUTSIDE[c]  ? gOut : gIn);
      const camberR  = camber[c] + (!OUTSIDE[c] ? gOut : gIn);
      const camberAvg = front ? (camberL + camberR) / 2 : 0;
      const camberShift = -camberAvg * 0.02;

      const avgTemp = tires[c].temp;
      const hp      = hotPressure(coldPsi[c], avgTemp);
      const cLoadAvg = ((cLoadsL[c] + cLoadsR[c]) / 2);
      const optPsi   = 30 * (cLoadAvg / avgLoad);
      const psiMid   = (hp - optPsi) * 0.003;
      const toeMid   = front ? Math.abs(toe) * 0.008 : 0;

      const mults = [
        F8_ZONE[0] + camberShift,
        F8_ZONE[1] + psiMid + toeMid,
        F8_ZONE[2] - camberShift,
      ];

      const zones = ['inside', 'middle', 'outside'];
      const newZ = {};
      for (let z = 0; z < 3; z++) {
        const T       = tires[c][zones[z]];
        const heatIn  = (THERMAL.heatBase * F8_HEAT_MULT + THERMAL.heatLoad * wf[c] * THERMAL.refSpeed) * lapTime * mults[z];
        const heatOut = THERMAL.coolRate * (T - ambientTemp) * lapTime;
        newZ[zones[z]] = T + (heatIn - heatOut) / THERMAL.thermalMass;
      }
      const newAvg = (newZ.inside + newZ.middle + newZ.outside) / 3;
      newTires[c] = { ...newZ, temp: newAvg, wear: tires[c].wear + THERMAL.wearRate(wf[c], newAvg) };
    }
    tires = newTires;
  }

  return bestLap;
}

// ======= BASELINE =======
// F8_BASELINE_SETUP — real-world run: 20 laps @ 75°F → 23.283s
const F8_BASELINE_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  camber: { LF: -2.75, RF: -3.0 },
  caster: { LF: 5.5,  RF: 3.75 },
  toe: -0.25,
  coldPsi: { LF: 35, RF: 35, LR: 30, RR: 30 },
};
const F8_CALIB_TIRES = {
  LF: 133.0, RF: 123.3, LR: 128.0, RR: 120.3,
};

const BASE_SS = shockStiffness(
  F8_BASELINE_SETUP.shocks.LF, F8_BASELINE_SETUP.shocks.RF,
  F8_BASELINE_SETUP.shocks.LR, F8_BASELINE_SETUP.shocks.RR
);
const BASELINE_METRIC_F8 = calcPerformanceF8(
  BASE_SS,
  F8_BASELINE_SETUP.camber,
  F8_BASELINE_SETUP.caster,
  F8_BASELINE_SETUP.toe,
  F8_BASELINE_SETUP.coldPsi,
  F8_CALIB_TIRES
);
const BASELINE_LAP_F8  = 23.283;
const LAP_SENSITIVITY  = 0.28;

// ======= AVAILABLE PARTS =======
const FRONT_RATINGS = [9, 8, 6, 4, 3, 2, 1];
const REAR_RATINGS  = [10, 9, 8, 7, 5, 4, 3, 2, 1];

// ======= SEARCH RANGES =======
// Symmetric: LF = RF for camber, caster (required for equal L/R handling in F8)
const CAMBER_RANGE = [];
for (let c = -1.5; c >= -4.25; c -= 0.25) CAMBER_RANGE.push(Math.round(c * 100) / 100);

const CASTER_RANGE = [];
for (let c = 3.0; c <= 7.0; c += 0.5) CASTER_RANGE.push(Math.round(c * 10) / 10);

const TOE = -0.25; // confirmed optimal both for grip and balanced drag in both directions
const AMBIENT = 75; // calibration ambient

// F8 equilibrium temps — same for ALL shock configs (F8 work factors = static loads always)
const fStatic = VEH.weight * VEH.frontBias / 2;
const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
const avgLoad  = VEH.weight / 4;
const wf_front = fStatic / avgLoad; // 1.10
const wf_rear  = rStatic / avgLoad; // 0.90
const tEq_front = AMBIENT + (THERMAL.heatBase * F8_HEAT_MULT + THERMAL.heatLoad * wf_front * THERMAL.refSpeed) / THERMAL.coolRate;
const tEq_rear  = AMBIENT + (THERMAL.heatBase * F8_HEAT_MULT + THERMAL.heatLoad * wf_rear  * THERMAL.refSpeed) / THERMAL.coolRate;

// ======= UNIQUE SHOCK CONFIGS =======
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

const total = shockConfigs.length * CAMBER_RANGE.length * CASTER_RANGE.length;
console.log(`\nUnique shock configs     : ${shockConfigs.length}`);
console.log(`Camber options (sym)     : ${CAMBER_RANGE.length}  [${CAMBER_RANGE[0]}° to ${CAMBER_RANGE[CAMBER_RANGE.length-1]}°]`);
console.log(`Caster options (sym)     : ${CASTER_RANGE.length}  [${CASTER_RANGE[0]}° to ${CASTER_RANGE[CASTER_RANGE.length-1]}°]`);
console.log(`Toe                      : ${TOE}" (fixed)`);
console.log(`PSI                      : analytically derived per shock config`);
console.log(`Total combinations       : ${total.toLocaleString()}`);
console.log(`Ambient                  : ${AMBIENT}°F`);
console.log(`Eq temps (fixed)         : front ${tEq_front.toFixed(1)}°F  rear ${tEq_rear.toFixed(1)}°F\n`);
console.log('Searching...\n');

const t0 = Date.now();
const topN = [];

for (const { lfR, rfR, lrR, rrR, ss } of shockConfigs) {
  const { frontLLTD, total: totStiff } = ss;

  // Optimal hot PSI: pressureGripFactor is maximized toward outside-turn corner loads
  // (outside load > inside load, so outside grip matters more)
  const cLoadsL = tireLoads(F8_CORNER_G, frontLLTD);
  // Outside corner loads: RF in left turn, LF in right turn → both = cLoadsL.RF (symmetric)
  const cLoad_out_front = cLoadsL.RF; // outside front corner load
  const cLoad_in_front  = cLoadsL.LF; // inside front corner load
  const cLoad_out_rear  = cLoadsL.RR; // outside rear corner load
  const cLoad_in_rear   = cLoadsL.LR; // inside rear corner load

  // Weighted toward outside (derivation in comments of optimize_f8.js):
  // optHotPsi maximized at the outside-turn corner load optima
  const optHot_front = 30 * (cLoad_out_front / avgLoad);
  const optHot_rear  = 30 * (cLoad_out_rear  / avgLoad);

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const optHotFrontC = clamp(optHot_front, 18, 51);
  const optHotRearC  = clamp(optHot_rear,  18, 51);

  const coldFront = Math.round((optHotFrontC * (COLD_PSI_TEMP + RANKINE) / (tEq_front + RANKINE)) * 2) / 2;
  const coldRear  = Math.round((optHotRearC  * (COLD_PSI_TEMP + RANKINE) / (tEq_rear  + RANKINE)) * 2) / 2;

  const coldPsi = { LF: coldFront, RF: coldFront, LR: coldRear, RR: coldRear };
  const eqTemps = { LF: tEq_front, RF: tEq_front, LR: tEq_rear, RR: tEq_rear };

  for (const camberVal of CAMBER_RANGE) {
    const camber = { LF: camberVal, RF: camberVal };

    for (const casterVal of CASTER_RANGE) {
      const caster = { LF: casterVal, RF: casterVal };

      const metric = calcPerformanceF8(ss, camber, caster, TOE, coldPsi, eqTemps);

      if (topN.length < 50 || metric > topN[topN.length - 1].metric) {
        topN.push({ lfR, rfR, lrR, rrR, ss, camber, caster, toe: TOE, coldPsi, eqTemps, metric });
        topN.sort((a, b) => b.metric - a.metric);
        if (topN.length > 50) topN.pop();
      }
    }
  }
}

const t1 = Date.now();
console.log(`Grid search done in ${t1 - t0}ms`);
console.log(`Running full ${20}-lap simulation on top ${topN.length} candidates...\n`);

// Full simulation verification
const results = topN.map(cand => {
  const bestLap = simulateF8(cand.ss, cand.camber, cand.caster, cand.toe, cand.coldPsi, AMBIENT, 20);
  return { ...cand, bestLap };
}).sort((a, b) => a.bestLap - b.bestLap);

const t2 = Date.now();
console.log(`Full simulation done in ${t2 - t1}ms\n`);

// ======= REPORT =======
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           TOP 10 FASTEST F8 SETUPS (75°F / 20 laps)         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

results.slice(0, 10).forEach((c, i) => {
  console.log(`#${i + 1}  Best lap: ${c.bestLap.toFixed(3)}s  (metric: ${c.metric.toFixed(5)})`);
  console.log(`    Shocks  : LF ${c.lfR}  RF ${c.rfR}  LR ${c.lrR}  RR ${c.rrR}`);
  console.log(`    Camber  : LF ${c.camber.LF}°  RF ${c.camber.RF}°`);
  console.log(`    Caster  : LF ${c.caster.LF}°  RF ${c.caster.RF}°`);
  console.log(`    Toe     : ${c.toe}"`);
  console.log(`    Cold PSI: LF ${c.coldPsi.LF}  RF ${c.coldPsi.RF}  LR ${c.coldPsi.LR}  RR ${c.coldPsi.RR}`);
  console.log(`    Eq temps: front ${c.eqTemps.LF.toFixed(1)}°F  rear ${c.eqTemps.LR.toFixed(1)}°F`);
  console.log('');
});

const best = results[0];
console.log('══════════════════════════════════════════════════════════════');
console.log('RECOMMENDED_F8_SETUP (paste into Figure8Simulation.jsx):');
console.log('══════════════════════════════════════════════════════════════');
console.log(`const RECOMMENDED_F8_SETUP = {`);
console.log(`  shocks: { LF: ${best.lfR}, RF: ${best.rfR}, LR: ${best.lrR}, RR: ${best.rrR} },`);
console.log(`  camber: { LF: ${best.camber.LF}, RF: ${best.camber.RF} },`);
console.log(`  caster: { LF: ${best.caster.LF}, RF: ${best.caster.RF} },`);
console.log(`  toe: ${best.toe},`);
console.log(`  coldPsi: { LF: ${best.coldPsi.LF}, RF: ${best.coldPsi.RF}, LR: ${best.coldPsi.LR}, RR: ${best.coldPsi.RR} },`);
console.log(`};`);
console.log('');
console.log(`Baseline (real-world run @ 75°F)  : 23.283s`);
console.log(`Best found (optimal setup @ 75°F) : ${best.bestLap.toFixed(3)}s`);
console.log(`Improvement                       : ${(23.283 - best.bestLap).toFixed(3)}s`);
