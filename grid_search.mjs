/**
 * Grid search: find fastest lap for 62°F / 25-lap oval
 * Tests all available shock combinations with analytical optimal camber & PSI
 */

// ---- Inline constants from raceSimulation.js ----
const G = 32.174;
const RANKINE = 459.67;
const OVAL_CORNER_G = 0.375;
const BASE_SPRING_FRONT = 475;
const BASE_SPRING_REAR  = 160;
const BASELINE_LAP = 17.4;
const LAP_SENSITIVITY = 0.28;
const COLD_PSI_TEMP = 68;
const OPTIMAL_LLTD = 0.46;

const TRACK = { bankingDeg: 3 };
TRACK.bankingRad = TRACK.bankingDeg * Math.PI / 180;

const VEH = {
  weight: 4100, frontBias: 0.55,
  cgHeight: 22/12, rollCenterHeight: 3/12, trackWidth: 63/12,
};

// Shock options (ratings 0-10; 0=stiffest, 10=softest)
const REAR_RATINGS  = [10,9,9,8,8,8,8,7,5,5,4,4,4,3,3,3,2,1];
const FRONT_RATINGS = [9,9,8,6,6,4,3,2,1];
// Unique values only for search
const REAR_R  = [...new Set(REAR_RATINGS)].sort((a,b)=>a-b);  // [1,2,3,4,5,7,8,9,10]
const FRONT_R = [...new Set(FRONT_RATINGS)].sort((a,b)=>a-b); // [1,2,3,4,6,8,9]

// Available front spring rates (from strut assemblies)
const SPRING_FRONT_OPTS = [475, 440]; // 700 pre-2003 excluded (rare)
const SPRING_REAR = 160;

// Caster options
const CASTER_RF = [3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0];
const CASTER_LF = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

// Toe options
const TOE_OPTS = [-0.5, -0.375, -0.25, -0.125, 0];

// ---- Grip / physics functions ----
function hotPressure(coldPsi, tireTemp, inflationTemp = COLD_PSI_TEMP) {
  return coldPsi * (tireTemp + RANKINE) / (inflationTemp + RANKINE);
}

function tempGripFactor(temp) {
  const optLow = 100, optHigh = 165;
  if (temp >= optLow && temp <= optHigh) return 1.0;
  if (temp < optLow) return Math.max(0.75, 1 - Math.pow((optLow-temp)/60,2)*0.25);
  return Math.max(0.70, 1 - Math.pow((temp-optHigh)/50,2)*0.30);
}

function pressureGripFactor(hotPsi, tireLoad) {
  const avgLoad = VEH.weight / 4;
  const optPsi = 30 * (tireLoad / avgLoad);
  return Math.max(0.82, 1 - 0.006 * Math.abs(hotPsi - optPsi));
}

function optimalColdPsi(tireLoad, tireTemp, inflationTemp = COLD_PSI_TEMP) {
  const avgLoad = VEH.weight / 4;
  const optHot = 30 * (tireLoad / avgLoad);
  return optHot * (inflationTemp + RANKINE) / (tireTemp + RANKINE);
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
  if (isOutside) {
    return Math.max(0.96, 1 - 0.004 * Math.abs(casterDeg - 5.0));
  } else {
    return Math.max(0.97, 1 - 0.003 * Math.abs(casterDeg - 3.0));
  }
}

function toeGripFactor(toeInches) {
  return Math.max(0.96, 1 - 0.008 * Math.pow(toeInches - (-0.25), 2));
}

function toeDragFactor(toeInches) {
  return 1.0 + 0.001 * toeInches * toeInches;
}

function shockStiffness(shocks, springLF, springRF, springR) {
  const f = (10-shocks.LF) + (10-shocks.RF);
  const r = (10-shocks.LR) + (10-shocks.RR);
  const springF = (springLF + springRF) / 2;
  const springLLTD = (springF/BASE_SPRING_FRONT) /
    ((springF/BASE_SPRING_FRONT) + (springR/BASE_SPRING_REAR));
  const damperLLTD = f / Math.max(f+r, 1);
  const frontLLTD = 0.6 * springLLTD + 0.4 * damperLLTD;
  return { front: f, rear: r, total: f+r, frontLLTD };
}

function rollStiffness(shocks, springLF, springRF, springR) {
  const f = (10-shocks.LF) + (10-shocks.RF);
  const r = (10-shocks.LR) + (10-shocks.RR);
  const ss_total = f + r;
  const springF = (springLF + springRF) / 2;
  const springScale = (springF/BASE_SPRING_FRONT + springR/BASE_SPRING_REAR) / 2;
  const damperNorm = ss_total / 28;
  return Math.max(4, (0.85 * springScale + 0.15 * damperNorm) * 28);
}

function bodyRoll(lateralG, totalStiffness) {
  const baseRoll = 3.1, baseStiff = 28; // 3.1°/G measured at corner speed
  return lateralG * baseRoll * baseStiff / Math.max(totalStiffness, 4);
}

function tireLoads(lateralG, frontLLTD) {
  const latTransfer = VEH.weight * lateralG * (VEH.cgHeight - VEH.rollCenterHeight) / VEH.trackWidth;
  const fStatic = VEH.weight * VEH.frontBias / 2;
  const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
  return {
    LF: Math.max(50, fStatic - latTransfer * frontLLTD),
    RF: fStatic + latTransfer * frontLLTD,
    LR: Math.max(50, rStatic - latTransfer * (1-frontLLTD)),
    RR: rStatic + latTransfer * (1-frontLLTD),
  };
}

const CORNERS = ['LF','RF','LR','RR'];
const OUTSIDE = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true, RF: true, LR: false, RR: false };

// Steady-state equilibrium temp
function eqTemp(wf, ambient) {
  const heatBase = 0.53, heatLoad = 0.00453, coolRate = 0.02, refSpeed = 75;
  return ambient + (heatBase + heatLoad * wf * refSpeed) / coolRate;
}

function calcMetric(shockRatings, springLF, springRF, casterRF, casterLF, toe, ambient) {
  const shocks = { LF: shockRatings.LF, RF: shockRatings.RF, LR: shockRatings.LR, RR: shockRatings.RR };
  const ss = shockStiffness(shocks, springLF, springRF, SPRING_REAR);
  const rs = rollStiffness(shocks, springLF, springRF, SPRING_REAR);
  const refG = 1.0;
  const loads = tireLoads(refG, ss.frontLLTD);
  const cornerLoads = tireLoads(OVAL_CORNER_G, ss.frontLLTD);
  const roll = bodyRoll(refG, rs);
  const cornerRoll = roll * OVAL_CORNER_G;
  const avgLoad = VEH.weight / 4;

  // Equilibrium temps (for work factor we use load ratio)
  const wf = {};
  for (const c of CORNERS) wf[c] = loads[c] / avgLoad;
  const temps = {};
  for (const c of CORNERS) temps[c] = eqTemp(wf[c], ambient);

  // Analytical optimal cold PSI
  const coldPsi = {};
  for (const c of CORNERS) {
    coldPsi[c] = optimalColdPsi(cornerLoads[c], temps[c]);
  }

  // Analytical optimal static camber for fronts: back-calculate from ground ideal
  // including sidewall compliance and KPI camber.
  const caster = { LF: casterLF, RF: casterRF };
  const camber = {};
  for (const c of ['LF','RF']) {
    const outside = OUTSIDE[c];
    const casterGain = outside
      ? -(caster[c] * 0.18 * refG)
      :  (caster[c] * 0.10 * refG);
    const brCamber = outside
      ? -(cornerRoll * 0.355) // 0.355 = 1.1°/3.1° (measured wheel disp)
      :  (cornerRoll * 0.15);
    const kpiCamber = outside ? KPI_CAMBER_GAIN : -KPI_CAMBER_GAIN;
    const swCamber  = sidewallCamberDeg(cornerLoads[c]);
    const effectiveIdeal = outside
      ? IDEAL_GROUND_RF - swCamber - cornerRoll
      : IDEAL_GROUND_LF - swCamber + cornerRoll;
    camber[c] = effectiveIdeal - casterGain - brCamber - kpiCamber;
  }

  let totalForce = 0, frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const load = loads[c];
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    const avgTemp = temps[c];
    const hp = hotPressure(coldPsi[c], avgTemp);
    let mu = 1.0;

    mu *= tempGripFactor(avgTemp);
    mu *= pressureGripFactor(hp, cornerLoads[c]);

    if (front) {
      const casterCamberGain = outside
        ? -(caster[c] * 0.18 * refG)
        :  (caster[c] * 0.10 * refG);
      const bodyRollCamberGain = outside
        ? -(cornerRoll * 0.355) // 0.355=1.1°/3.1°
        :  (cornerRoll * 0.15);
      const kpiCamber = outside ? KPI_CAMBER_GAIN : -KPI_CAMBER_GAIN;
      const effectiveCamber = camber[c] + casterCamberGain + bodyRollCamberGain + kpiCamber;
      const geomGround = outside ? effectiveCamber + cornerRoll : effectiveCamber - cornerRoll;
      const groundCamber = geomGround + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, true);
      mu *= casterGripFactor(caster[c], outside);
      mu *= toeGripFactor(toe);
    } else {
      const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, false);
    }

    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
    // no wear at lap 1 eq

    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force; else rearForce += force;
  }

  totalForce += VEH.weight * Math.sin(TRACK.bankingRad);

  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontPct - VEH.frontBias);
  totalForce *= Math.max(0.94, 1 - imbalance * 0.2);

  const lltdDev = Math.abs(ss.frontLLTD - OPTIMAL_LLTD);
  totalForce *= Math.max(0.85, 1 - 3.0 * lltdDev * lltdDev);

  totalForce /= toeDragFactor(toe);

  return totalForce / VEH.weight;
}

// ---- Baseline metric ----
const DEFAULT_CALIB_TIRES = {
  LF: 100, RF: 117, LR: 98, RR: 116,
};
// Compute baseline metric using DEFAULT_SETUP parameters
const DEF_SHOCKS = { LF: 4, RF: 4, LR: 2, RR: 2 };
const DEF_SPRINGS = { LF: 475, RF: 475 };

// Compute baseline via the same functions (must match raceSimulation.js)
function calcMetricFull(shockRatings, springLF, springRF, casterRF, casterLF, toe, tires) {
  const shocks = shockRatings;
  const ss = shockStiffness(shocks, springLF, springRF, SPRING_REAR);
  const rs = rollStiffness(shocks, springLF, springRF, SPRING_REAR);
  const refG = 1.0;
  const loads = tireLoads(refG, ss.frontLLTD);
  const cornerLoads = tireLoads(OVAL_CORNER_G, ss.frontLLTD);
  const roll = bodyRoll(refG, rs);
  const cornerRoll = roll * OVAL_CORNER_G;
  const avgLoad = VEH.weight / 4;
  const caster = { LF: casterLF, RF: casterRF };

  // DEFAULT camber from DEFAULT_SETUP
  const camber = { LF: -1.5, RF: -3.0 };
  // DEFAULT coldPsi
  const coldPsi = { LF: 19.5, RF: 34, LR: 18.5, RR: 36 };

  let totalForce = 0, frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const load = loads[c];
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    const avgTemp = tires[c];
    const hp = hotPressure(coldPsi[c], avgTemp);
    let mu = 1.0;
    mu *= tempGripFactor(avgTemp);
    mu *= pressureGripFactor(hp, cornerLoads[c]);
    if (front) {
      const casterGain = outside ? -(caster[c]*0.18*refG) : (caster[c]*0.10*refG);
      const bodyRollCG = outside ? -(cornerRoll*0.355) : (cornerRoll*0.15); // 0.355=1.1°/3.1°
      const kpiCamber = outside ? KPI_CAMBER_GAIN : -KPI_CAMBER_GAIN;
      const eff = camber[c] + casterGain + bodyRollCG + kpiCamber;
      const geomGround = outside ? eff + cornerRoll : eff - cornerRoll;
      const groundCamber = geomGround + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, true);
      mu *= casterGripFactor(caster[c], outside);
      mu *= toeGripFactor(-0.25);
    } else {
      const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, false);
    }
    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force; else rearForce += force;
  }
  totalForce += VEH.weight * Math.sin(TRACK.bankingRad);
  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  totalForce *= Math.max(0.94, 1 - Math.abs(frontPct - VEH.frontBias) * 0.2);
  const lltdDev = Math.abs(ss.frontLLTD - OPTIMAL_LLTD);
  totalForce *= Math.max(0.85, 1 - 3.0 * lltdDev * lltdDev);
  totalForce /= toeDragFactor(-0.25);
  return totalForce / VEH.weight;
}

const BASE_METRIC = calcMetricFull(
  DEF_SHOCKS, 475, 475, 5.0, 3.5, -0.25, DEFAULT_CALIB_TIRES
);

function metricToLap(metric) {
  return BASELINE_LAP * Math.pow(BASE_METRIC / metric, LAP_SENSITIVITY);
}

// ---- Grid Search ----
const ambient = 62;
let best = { lap: 99, params: null };
let count = 0;

for (const sLF of FRONT_R) {
  for (const sRF of FRONT_R) {
    for (const sLR of REAR_R) {
      for (const sRR of REAR_R) {
        for (const spLF of SPRING_FRONT_OPTS) {
          for (const spRF of SPRING_FRONT_OPTS) {
            for (const cRF of CASTER_RF) {
              for (const cLF of CASTER_LF) {
                for (const toe of TOE_OPTS) {
                  count++;
                  const m = calcMetric(
                    { LF: sLF, RF: sRF, LR: sLR, RR: sRR },
                    spLF, spRF, cRF, cLF, toe, ambient
                  );
                  const lap = metricToLap(m);
                  if (lap < best.lap) {
                    best = {
                      lap: Math.round(lap * 1000) / 1000,
                      metric: Math.round(m * 10000) / 10000,
                      params: { shockLF: sLF, shockRF: sRF, shockLR: sLR, shockRR: sRR,
                                springLF: spLF, springRF: spRF,
                                casterRF: cRF, casterLF: cLF, toe },
                      lltd: Math.round((() => {
                        const ss = shockStiffness({LF:sLF,RF:sRF,LR:sLR,RR:sRR}, spLF, spRF, SPRING_REAR);
                        return ss.frontLLTD;
                      })() * 1000) / 1000,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`\nSearched ${count.toLocaleString()} combinations @ ${ambient}°F`);
console.log(`\nBEST LAP: ${best.lap}s`);
console.log(`Metric:   ${best.metric}  (baseline: ${Math.round(BASE_METRIC*10000)/10000})`);
console.log(`LLTD:     ${best.lltd}  (optimal: ${OPTIMAL_LLTD})`);
console.log('\nParams:');
const p = best.params;
console.log(`  Shocks: LF=${p.shockLF} RF=${p.shockRF} LR=${p.shockLR} RR=${p.shockRR}`);
console.log(`  Springs: LF=${p.springLF} RF=${p.springRF} lbs/in`);
console.log(`  Caster: LF=${p.casterLF}° RF=${p.casterRF}°`);
console.log(`  Toe: ${p.toe}"`);

// Also show top-5 distinct shock combos
const results = [];
for (const sLF of FRONT_R) {
  for (const sRF of FRONT_R) {
    for (const sLR of REAR_R) {
      for (const sRR of REAR_R) {
        // Best params for this shock combo
        let bLap = 99;
        for (const spLF of SPRING_FRONT_OPTS) {
          for (const spRF of SPRING_FRONT_OPTS) {
            for (const cRF of CASTER_RF) {
              for (const cLF of CASTER_LF) {
                for (const toe of TOE_OPTS) {
                  const m = calcMetric({LF:sLF,RF:sRF,LR:sLR,RR:sRR}, spLF,spRF,cRF,cLF,toe,ambient);
                  const lap = metricToLap(m);
                  if (lap < bLap) bLap = lap;
                }
              }
            }
          }
        }
        const ss = shockStiffness({LF:sLF,RF:sRF,LR:sLR,RR:sRR}, 475,475,SPRING_REAR);
        results.push({ shocks: `LF=${sLF} RF=${sRF} LR=${sLR} RR=${sRR}`, lap: Math.round(bLap*1000)/1000, lltd: Math.round(ss.frontLLTD*1000)/1000 });
      }
    }
  }
}
results.sort((a,b) => a.lap - b.lap);
console.log('\n--- Top 10 shock combos ---');
for (const r of results.slice(0,10)) {
  console.log(`  ${r.shocks}  →  ${r.lap}s  (LLTD=${r.lltd})`);
}
