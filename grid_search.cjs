/**
 * Oval + F8 Grid Search — self-contained CJS port of raceSimulation.js
 * Run with: node grid_search.cjs
 *
 * Mirrors the current model exactly:
 *  - Geometric + elastic weight transfer (Dixon model, RCH front=3", rear=4")
 *  - Ground-frame camber with asymmetric load-weighted penalty
 *  - Mechanical trail caster model (parabolic RF, monotonic LF)
 *  - OVAL_RACING_G=0.813 for geometry, OVAL_CORNER_G=0.407 for loads
 *  - rollStiffness: 85/15 spring/damper, baseRoll=3.1°/G
 *  - pressureGrip: 0.006/PSI
 *  - toeDrag: 0.08*toe²
 *  - KPI=9.5°, sidewall compliance, SLA jounce=0.355, droop=0.15
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const G = 32.174;
const RANKINE = 459.67;

const OVAL_RACING_G = 0.813;
const OVAL_RACING_R = 145;
const F8_RACING_G   = 0.498;

const TRACK = {
  frontStraight: 325, backStraight: 333, straightLength: 329,
  cornerRadius: 105, bankingDeg: 3,
};
TRACK.bankingRad  = TRACK.bankingDeg * Math.PI / 180;
TRACK.cornerArc   = Math.PI * TRACK.cornerRadius;
TRACK.totalLength = 2 * TRACK.straightLength + 2 * TRACK.cornerArc;

const OVAL_CORNER_G = OVAL_RACING_G * (2 * TRACK.cornerArc / TRACK.totalLength); // ≈0.407
const F8_CORNER_G   = 0.28;

const BASE_SPRING_FRONT = 475;
const BASE_SPRING_REAR  = 160;

const VEH = {
  weight: 4100, get mass() { return this.weight / G; },
  frontBias: 0.55, cgHeight: 22 / 12,
  rollCenterHeight: 3 / 12, rollCenterHeightRear: 4 / 12,
  trackWidth: 63 / 12, tireRadius: 13.6 / 12,
  frontalArea: 25, cd: 0.33,
  peakTorque: 300, gear2Ratio: 1.55 * 3.73, driveEff: 0.85,
  brakingG: 0.5, wheelbase: 114.7 / 12,
};

const GEOM = {
  kpi: 9.5, wheelOffset: 1.75,
  scrubRadius: 13.6 * Math.tan(9.5 * Math.PI / 180) - 1.75,
  steerAngle: 10,
  kpiCamberGain: (9.5 * Math.PI / 180) * (1 - Math.cos(10 * Math.PI / 180)),
};

const TIRE = {
  ratedLoad: 1929, sectionHeight: 5.09, sectionWidth: 9.25,
  sidewallCoeff: 1.2 * (5.09 / 9.25) / 1929,
};

const THERMAL = {
  heatBase: 0.53, heatLoad: 0.00453, coolRate: 0.02,
  thermalMass: 1.39, refSpeed: 75,
  zoneHeatMult: {
    outsideTire: [0.82, 1.0, 1.18],
    insideTire:  [1.06, 1.0, 0.94],
  },
};

const IDEAL_GROUND_CAMBER_RF   = -2.0;
const IDEAL_GROUND_CAMBER_LF   = +0.75;
const IDEAL_GROUND_CAMBER_REAR =  0.0;

const CORNERS  = ['LF', 'RF', 'LR', 'RR'];
const OUTSIDE  = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true, RF: true, LR: false, RR: false };

const COLD_PSI_TEMP = 68;
const BASELINE_LAP  = 17.4;
const LAP_SENSITIVITY = 0.28;
const BASELINE_LAP_F8 = 23.283;

// ── Helpers ──────────────────────────────────────────────────────────────────
function sidewallCamberDeg(load) { return load * TIRE.sidewallCoeff; }

function tempGripFactor(temp) {
  const optLow = 100, optHigh = 165;
  if (temp >= optLow && temp <= optHigh) return 1.0;
  if (temp < optLow) {
    const below = optLow - temp;
    return Math.max(0.75, 1 - Math.pow(below / 60, 2) * 0.25);
  }
  const above = temp - optHigh;
  return Math.max(0.70, 1 - Math.pow(above / 50, 2) * 0.30);
}

function pressureGripFactor(hotPsi, tireLoad) {
  const avgLoad = VEH.weight / 4;
  const optPsi = 30 * (tireLoad / avgLoad);
  return Math.max(0.82, 1 - 0.006 * Math.abs(hotPsi - optPsi));
}

function camberGripFactor(groundCamber, isOutside, isFront, load = VEH.weight / 4) {
  const avgLoad = VEH.weight / 4;
  if (!isFront) {
    const dev = Math.abs(groundCamber - IDEAL_GROUND_CAMBER_REAR);
    return Math.max(0.88, 1 - 0.010 * dev);
  }
  if (isOutside) {
    const ideal = IDEAL_GROUND_CAMBER_RF;
    const dev = groundCamber - ideal;
    if (dev > 0) {
      const penalty = 0.016 + Math.max(0, (load / avgLoad - 1.0)) * 0.004;
      return Math.max(0.88, 1 - penalty * dev);
    } else {
      return Math.max(0.88, 1 - 0.010 * Math.abs(dev));
    }
  } else {
    const ideal = IDEAL_GROUND_CAMBER_LF;
    const dev = groundCamber - ideal;
    if (dev < 0) return Math.max(0.88, 1 - 0.012 * Math.abs(dev));
    else         return Math.max(0.88, 1 - 0.007 * dev);
  }
}

const TRAIL_R = 13.6, TRAIL_S = 0.525;
function mechanicalTrail(casterDeg) {
  const c = casterDeg * Math.PI / 180;
  return TRAIL_R * Math.sin(c) - TRAIL_S * Math.cos(c);
}

function casterGripFactor(casterDeg, isOutside, isFront) {
  if (!isFront) return 1.0;
  const trail = mechanicalTrail(casterDeg);
  if (isOutside) {
    const PEAK_TRAIL = 0.9;
    if (trail < PEAK_TRAIL) {
      const deficit = (PEAK_TRAIL - trail) / PEAK_TRAIL;
      return Math.max(0.97, 1 - 0.010 * deficit * deficit * PEAK_TRAIL * PEAK_TRAIL);
    } else {
      const excess = trail - PEAK_TRAIL;
      return Math.max(0.94, 1 - 0.055 * excess * excess);
    }
  } else {
    const OPTIMAL_LF = 0.35;
    const excess = Math.max(0, trail - OPTIMAL_LF);
    return Math.max(0.96, 1 - 0.030 * excess * excess);
  }
}

function toeGripFactor(toeInches) {
  const dev = Math.abs(toeInches - (-0.25));
  return Math.max(0.96, 1 - 0.008 * dev * dev);
}

function toeDragFactor(toeInches) {
  return 1.0 + 0.08 * toeInches * toeInches;
}

function hotPressure(coldPsi, tireTemp, inflationTemp = COLD_PSI_TEMP) {
  return coldPsi * (tireTemp + RANKINE) / (inflationTemp + RANKINE);
}

function shockStiffness(setup) {
  const springLF = setup.springs?.LF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springRF = setup.springs?.RF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springF  = (springLF + springRF) / 2;
  const springR  = setup.springs?.LR ?? setup.springs?.rear ?? BASE_SPRING_REAR;
  const springLLTD = (springF / BASE_SPRING_FRONT) /
    ((springF / BASE_SPRING_FRONT) + (springR / BASE_SPRING_REAR));
  const cl = tireLoads(OVAL_CORNER_G, springLLTD);
  const fa = cl.LF + cl.RF, ra = cl.LR + cl.RR;
  const rfFrac = cl.RF / fa, lfFrac = cl.LF / fa;
  const rrFrac = cl.RR / ra, lrFrac = cl.LR / ra;
  const f = lfFrac * (10 - setup.shocks.LF) + rfFrac * (10 - setup.shocks.RF);
  const r = lrFrac * (10 - setup.shocks.LR) + rrFrac * (10 - setup.shocks.RR);
  const damperLLTD = f / Math.max(f + r, 1);
  const frontLLTD = 0.6 * springLLTD + 0.4 * damperLLTD;
  return { front: f, rear: r, total: f + r, frontLLTD, springLLTD, damperLLTD };
}

function bodyRoll(lateralG, totalStiffness) {
  const baseRoll = 3.1, baseStiff = 28;
  return lateralG * baseRoll * baseStiff / Math.max(totalStiffness, 4);
}

function rollStiffness(setup) {
  const springLF = setup.springs?.LF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springRF = setup.springs?.RF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springF  = (springLF + springRF) / 2;
  const springR  = setup.springs?.LR ?? setup.springs?.rear ?? BASE_SPRING_REAR;
  const ss = shockStiffness(setup);
  const springScale = (springF / BASE_SPRING_FRONT + springR / BASE_SPRING_REAR) / 2;
  const damperNorm  = ss.total / 28;
  return Math.max(4, (0.85 * springScale + 0.15 * damperNorm) * 28);
}

function tireLoads(lateralG, springLLTD) {
  const mFront = VEH.weight * VEH.frontBias;
  const mRear  = VEH.weight * (1 - VEH.frontBias);
  const geoFront = mFront * lateralG * VEH.rollCenterHeight / VEH.trackWidth;
  const geoRear  = mRear  * lateralG * VEH.rollCenterHeightRear / VEH.trackWidth;
  const avgRCH = VEH.frontBias * VEH.rollCenterHeight + (1 - VEH.frontBias) * VEH.rollCenterHeightRear;
  const elasticTotal = VEH.weight * lateralG * (VEH.cgHeight - avgRCH) / VEH.trackWidth;
  const elasticFront = elasticTotal * springLLTD;
  const elasticRear  = elasticTotal * (1 - springLLTD);
  const ltFront = geoFront + elasticFront;
  const ltRear  = geoRear  + elasticRear;
  const fStatic = VEH.weight * VEH.frontBias / 2;
  const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
  return {
    LF: Math.max(50, fStatic - ltFront),
    RF: fStatic + ltFront,
    LR: Math.max(50, rStatic - ltRear),
    RR: rStatic + ltRear,
  };
}

function calcPerformance(setup, tires, inflationTemp = COLD_PSI_TEMP) {
  const refG = 1.0;
  const ss = shockStiffness(setup);
  const loads = tireLoads(refG, ss.springLLTD);
  const cornerLoads = tireLoads(OVAL_CORNER_G, ss.springLLTD);
  const roll = bodyRoll(refG, rollStiffness(setup));
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };
  const cornerRoll = roll * OVAL_RACING_G;

  let totalForce = 0, frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const load = loads[c];
    const avgTemp = tires[c].temp;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);
    const outside = OUTSIDE[c], front = IS_FRONT[c];
    let mu = 1.0;
    mu *= tempGripFactor(avgTemp);
    mu *= pressureGripFactor(hp, cornerLoads[c]);
    if (front) {
      const casterCamberGain = outside
        ? -(caster[c] * 0.18 * refG)
        :  (caster[c] * 0.10 * refG);
      const bodyRollCamber = outside
        ? -(cornerRoll * 0.355)
        :  (cornerRoll * 0.15);
      const kpiCamber = outside ? GEOM.kpiCamberGain : -GEOM.kpiCamberGain;
      const effectiveCamber = setup.camber[c] + casterCamberGain + bodyRollCamber + kpiCamber;
      const geomGroundCamber = outside
        ? effectiveCamber + cornerRoll
        : effectiveCamber - cornerRoll;
      const groundCamber = geomGroundCamber + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, true, cornerLoads[c]);
      mu *= casterGripFactor(caster[c], outside, true);
    } else {
      const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, false);
    }
    if (front) mu *= toeGripFactor(toe);
    const avgLoad = VEH.weight / 4;
    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
    mu *= Math.max(0.92, 1 - tires[c].wear);
    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force; else rearForce += force;
  }
  totalForce += VEH.weight * Math.sin(TRACK.bankingRad);
  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontPct - VEH.frontBias);
  totalForce *= Math.max(0.94, 1 - imbalance * 0.2);
  const OPTIMAL_LLTD = 0.46;
  const lltdDev = Math.abs(ss.frontLLTD - OPTIMAL_LLTD);
  totalForce *= Math.max(0.85, 1 - 3.0 * lltdDev * lltdDev);
  totalForce /= toeDragFactor(toe);
  return totalForce / VEH.weight;
}

function calcWorkFactors(setup) {
  const ss = shockStiffness(setup);
  const loads = tireLoads(1.0, ss.springLLTD);
  const avgLoad = VEH.weight / 4;
  return { LF: loads.LF / avgLoad, RF: loads.RF / avgLoad,
           LR: loads.LR / avgLoad, RR: loads.RR / avgLoad };
}

function eqTires(setup, ambientTemp, wfFn) {
  const wf = wfFn(setup);
  const tiles = {};
  for (const c of CORNERS) {
    const tEq = ambientTemp +
      (THERMAL.heatBase + THERMAL.heatLoad * wf[c] * THERMAL.refSpeed) / THERMAL.coolRate;
    tiles[c] = { temp: tEq, inside: tEq, middle: tEq, outside: tEq, wear: 0 };
  }
  return tiles;
}

// Baseline metric (calibration tires from Setup A, 15 laps @ 65°F)
const DEFAULT_SETUP = {
  shocks:  { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber:  { LF: -1.5, RF: -3.0 },
  caster:  { LF: 3.5, RF: 5.0 },
  toe: -0.25,
  coldPsi: { LF: 19.5, RF: 34, LR: 18.5, RR: 36 },
};
const CALIB_TIRES = {
  LF: { inside: 104, middle: 102, outside: 94,  temp: 100, wear: 0 },
  RF: { inside: 106, middle: 113, outside: 131, temp: 117, wear: 0 },
  LR: { inside: 101, middle: 102, outside: 91,  temp:  98, wear: 0 },
  RR: { inside: 100, middle: 117, outside: 130, temp: 116, wear: 0 },
};
const BASELINE_METRIC = calcPerformance(DEFAULT_SETUP, CALIB_TIRES);
function metricToLapTime(metric) {
  return BASELINE_LAP * Math.pow(BASELINE_METRIC / metric, LAP_SENSITIVITY);
}

// ── Optimal PSI derivation (cold) ────────────────────────────────────────────
function optColdPsi(cornerLoad, eqTemp, inflationTemp = COLD_PSI_TEMP) {
  const avgLoad = VEH.weight / 4;
  const optHot = 30 * (cornerLoad / avgLoad);
  const clamped = Math.min(Math.max(18, optHot), 51);
  return clamped * (inflationTemp + RANKINE) / (eqTemp + RANKINE);
}

// ── Optimal static camber derivation (ground-frame model) ────────────────────
function optStaticCamber(corner, setup, ambientTemp) {
  const ss = shockStiffness(setup);
  const roll = bodyRoll(1.0, rollStiffness(setup));
  const cornerRoll = roll * OVAL_RACING_G;
  const caster = setup.caster[corner];
  const outside = OUTSIDE[corner];
  const cornerLoads = tireLoads(OVAL_CORNER_G, ss.springLLTD);
  const swCamber = sidewallCamberDeg(cornerLoads[corner]);
  const casterGain    = outside ? -(caster * 0.18) :  (caster * 0.10);
  const bodyRollCamber= outside ? -(cornerRoll * 0.355) :  (cornerRoll * 0.15);
  const kpiCamber     = outside ? GEOM.kpiCamberGain : -GEOM.kpiCamberGain;
  const idealGround   = outside ? IDEAL_GROUND_CAMBER_RF : IDEAL_GROUND_CAMBER_LF;
  const effectiveIdeal = outside
    ? idealGround - swCamber - cornerRoll
    : idealGround - swCamber + cornerRoll;
  const raw = effectiveIdeal - casterGain - bodyRollCamber - kpiCamber;
  return Math.round(raw * 4) / 4; // round to 0.25° steps
}

// ── Shock/strut options ───────────────────────────────────────────────────────
const REAR_SHOCKS = [
  { part: '5993',       rating: 10 },
  { part: '210149',     rating: 9  },
  { part: '173898',     rating: 9  },
  { part: 'ASH24539',   rating: 8  },
  { part: '341967',     rating: 8  },
  { part: 'TS33-31962B',rating: 8  },
  { part: '5783',       rating: 8  },
  { part: '69575',      rating: 7  },
  { part: '555601',     rating: 5  },
  { part: 'DT551380',   rating: 5  },
  { part: '554355',     rating: 4  },
  { part: 'ASH12277',   rating: 4  },
  { part: '194510',     rating: 4  },
  { part: 'TS33-32752B',rating: 3  },
  { part: '194574',     rating: 3  },
  { part: '69574',      rating: 3  },
  { part: '555603',     rating: 2  },
  { part: '550018',     rating: 1  },
];
const FRONT_STRUTS = [
  { part: '1336343', rating: 9, springRate: 440 },
  { part: '714075',  rating: 9, springRate: 440 },
  { part: '171346',  rating: 8, springRate: 440 },
  { part: 'SR4140',  rating: 6, springRate: 440 },
  { part: '551600',  rating: 6, springRate: 475 }, // bare damper — uses existing spring
  { part: '1336349', rating: 4, springRate: 475 },
  { part: '710415',  rating: 3, springRate: 475 },
  { part: '271346',  rating: 2, springRate: 475 },
  { part: '550055',  rating: 1, springRate: 475 },
];

// ── Unique shock combos (dedup by rating tuple + spring) ─────────────────────
function uniqFront() {
  const seen = new Set();
  return FRONT_STRUTS.filter(s => {
    const k = `${s.rating}-${s.springRate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function uniqRear() {
  const seen = new Set();
  return REAR_SHOCKS.filter(s => {
    const k = `${s.rating}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ============================================================
//  OVAL GRID SEARCH
// ============================================================
function runOvalGrid(ambientTemp = 90, inflationTemp = COLD_PSI_TEMP) {
  const fronts = uniqFront();
  const rears  = uniqRear();
  const casterStepsLF = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
  const casterStepsRF = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
  const toe = -0.25;

  // Count total combos
  const nCombos = fronts.length * fronts.length * rears.length * rears.length
                  * casterStepsLF.length * casterStepsRF.length;
  console.log(`Oval grid search: ${nCombos.toLocaleString()} combinations @ ${ambientTemp}°F\n`);

  let best = null;
  let count = 0;
  const TOP_N = 10;
  const topList = [];

  for (const lfStrut of fronts) {
    for (const rfStrut of fronts) {
      for (const lrShock of rears) {
        for (const rrShock of rears) {
          for (const lfCaster of casterStepsLF) {
            for (const rfCaster of casterStepsRF) {
              count++;

              const setup = {
                shocks:  { LF: lfStrut.rating, RF: rfStrut.rating,
                           LR: lrShock.rating, RR: rrShock.rating },
                springs: { LF: lfStrut.springRate, RF: rfStrut.springRate,
                           LR: 160, RR: 160 },
                caster:  { LF: lfCaster, RF: rfCaster },
                toe,
                camber:  { LF: 0, RF: 0 }, // placeholder — derive below
                coldPsi: { LF: 25, RF: 34, LR: 18, RR: 30 }, // placeholder
              };

              // Derive optimal camber analytically
              setup.camber.LF = optStaticCamber('LF', setup, ambientTemp);
              setup.camber.RF = optStaticCamber('RF', setup, ambientTemp);

              // Derive optimal cold PSI analytically
              const ss = shockStiffness(setup);
              const cornerLoads = tireLoads(OVAL_CORNER_G, ss.springLLTD);
              const tiles = eqTires(setup, ambientTemp, calcWorkFactors);
              for (const c of CORNERS) {
                setup.coldPsi[c] = Math.round(optColdPsi(
                  cornerLoads[c], tiles[c].temp, inflationTemp) * 2) / 2;
              }

              const metric = calcPerformance(setup, eqTires(setup, ambientTemp, calcWorkFactors), inflationTemp);
              const lapTime = metricToLapTime(metric);
              const lltd = ss.frontLLTD;

              const entry = { lapTime, lltd, setup: JSON.parse(JSON.stringify(setup)) };

              if (!best || lapTime < best.lapTime) best = entry;

              // Keep top N
              topList.push(entry);
              if (topList.length > TOP_N + 1000) {
                topList.sort((a, b) => a.lapTime - b.lapTime);
                topList.splice(TOP_N);
              }
            }
          }
        }
      }
    }
  }

  topList.sort((a, b) => a.lapTime - b.lapTime);
  const top10 = topList.slice(0, TOP_N);

  console.log(`Oval grid completed. ${count.toLocaleString()} combos evaluated.\n`);
  console.log(`=== TOP ${TOP_N} OVAL SETUPS @ ${ambientTemp}°F ===\n`);
  top10.forEach((r, i) => {
    const s = r.setup;
    console.log(`#${i + 1}  ${r.lapTime.toFixed(3)}s   LLTD ${(r.lltd * 100).toFixed(1)}%`);
    console.log(`     Shocks LF=${s.shocks.LF} RF=${s.shocks.RF} LR=${s.shocks.LR} RR=${s.shocks.RR}`);
    console.log(`     Springs LF=${s.springs.LF} RF=${s.springs.RF} LR=${s.springs.LR} RR=${s.springs.RR}`);
    console.log(`     Camber LF=${s.camber.LF}° RF=${s.camber.RF}°`);
    console.log(`     Caster LF=${s.caster.LF}° RF=${s.caster.RF}°`);
    console.log(`     Cold PSI LF=${s.coldPsi.LF} RF=${s.coldPsi.RF} LR=${s.coldPsi.LR} RR=${s.coldPsi.RR}`);
    console.log('');
  });

  return { best, top10, count };
}

// ============================================================
//  F8 GRID SEARCH
// ============================================================
// F8 uses symmetric caster + symmetric camber (averaged optimal).
// Work factors average across L+R turns → loads = static loads.
// Heat multiplier 1.18×.

const F8_HEAT_MULT = 1.18;
const F8_IDEAL_GROUND_OUTSIDE = -2.0;
const F8_IDEAL_GROUND_INSIDE  = +0.75;
const BASELINE_LAP_F8_OBS = 23.283;

function calcWorkFactorsF8(setup) {
  const ss = shockStiffness(setup);
  // Average L+R — lateral transfer cancels
  const fStatic = VEH.weight * VEH.frontBias / 2;
  const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
  const avgLoad = VEH.weight / 4;
  return { LF: fStatic / avgLoad, RF: fStatic / avgLoad,
           LR: rStatic / avgLoad, RR: rStatic / avgLoad };
}

function eqTiresF8(setup, ambientTemp) {
  const wf = calcWorkFactorsF8(setup);
  const tiles = {};
  for (const c of CORNERS) {
    const tEq = ambientTemp +
      (THERMAL.heatBase * F8_HEAT_MULT + THERMAL.heatLoad * wf[c] * THERMAL.refSpeed) / THERMAL.coolRate;
    tiles[c] = { temp: tEq, wear: 0 };
  }
  return tiles;
}

function calcPerformanceF8(setup, tires, inflationTemp = COLD_PSI_TEMP) {
  const ss = shockStiffness(setup);
  // Symmetric loads (lateral transfer cancels across L+R)
  const loadsL = tireLoads(1.0, ss.springLLTD);
  const loadsR = { LF: loadsL.RF, RF: loadsL.LF, LR: loadsL.RR, RR: loadsL.LR };
  const loads = {
    LF: (loadsL.LF + loadsR.LF) / 2, RF: (loadsL.RF + loadsR.RF) / 2,
    LR: (loadsL.LR + loadsR.LR) / 2, RR: (loadsL.RR + loadsR.RR) / 2,
  };
  const cornerLoadsL = tireLoads(F8_CORNER_G, ss.springLLTD);
  const cornerLoadsR = { LF: cornerLoadsL.RF, RF: cornerLoadsL.LF,
                          LR: cornerLoadsL.RR, RR: cornerLoadsL.LR };
  const cornerLoads = {
    LF: (cornerLoadsL.LF + cornerLoadsR.LF) / 2, RF: (cornerLoadsL.RF + cornerLoadsR.RF) / 2,
    LR: (cornerLoadsL.LR + cornerLoadsR.LR) / 2, RR: (cornerLoadsL.RR + cornerLoadsR.RR) / 2,
  };
  const roll = bodyRoll(1.0, rollStiffness(setup));
  const cornerRoll = roll * F8_RACING_G;
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 4.0, RF: 4.0 };

  let totalForce = 0, frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const load = loads[c];
    const avgTemp = tires[c].temp;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);
    const front = IS_FRONT[c];
    let mu = 1.0;
    mu *= tempGripFactor(avgTemp);
    mu *= pressureGripFactor(hp, cornerLoads[c]);

    if (front) {
      // Average camber grip: once as outside (L turn), once as inside (R turn)
      const camberStatic = setup.camber[c];
      const casterGainOut = -(caster[c] * 0.18);
      const casterGainIn  =  (caster[c] * 0.10);
      const rollGainOut   = -(cornerRoll * 0.355);
      const rollGainIn    =  (cornerRoll * 0.15);
      const kpiOut = GEOM.kpiCamberGain, kpiIn = -GEOM.kpiCamberGain;
      const swOut = sidewallCamberDeg(cornerLoadsL[c === 'LF' ? 'LF' : 'RF']);
      const swIn  = sidewallCamberDeg(cornerLoadsR[c === 'LF' ? 'LF' : 'RF']);
      // As outside tire:
      const effOut = camberStatic + casterGainOut + rollGainOut + kpiOut;
      const gndOut = effOut + cornerRoll + swOut;
      const gfOut  = camberGripFactor(gndOut, true,  true, cornerLoadsL[c === 'LF' ? 'LF' : 'RF']);
      // As inside tire:
      const effIn  = camberStatic + casterGainIn  + rollGainIn  + kpiIn;
      const gndIn  = effIn  - cornerRoll + swIn;
      const gfIn   = camberGripFactor(gndIn,  false, true, cornerLoadsR[c === 'LF' ? 'LF' : 'RF']);
      mu *= (gfOut + gfIn) / 2;
      // Caster: average of outside benefit and inside (neutral 1.0) — only 50% of laps as outside
      const cfOut = casterGripFactor(caster[c], true,  true);
      mu *= (cfOut + 1.0) / 2;
    } else {
      // Rear: solid axle, body roll averages near zero across L+R
      const gndAvg = sidewallCamberDeg(cornerLoads[c]); // roll cancels, only sidewall compliance
      mu *= camberGripFactor(gndAvg, false, false);
    }
    if (front) mu *= toeGripFactor(toe);
    const avgLoad = VEH.weight / 4;
    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
    mu *= Math.max(0.92, 1 - tires[c].wear);
    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force; else rearForce += force;
  }
  // No banking adjustment — F8 crossover is flat
  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontPct - VEH.frontBias);
  totalForce *= Math.max(0.94, 1 - imbalance * 0.2);
  const OPTIMAL_LLTD_F8 = 0.50;
  const lltdDev = Math.abs(ss.frontLLTD - OPTIMAL_LLTD_F8);
  totalForce *= Math.max(0.85, 1 - 3.0 * lltdDev * lltdDev);
  totalForce /= toeDragFactor(toe);
  return totalForce / VEH.weight;
}

// F8 baseline metric from real-world calibration run
const F8_BASELINE_SETUP = {
  shocks:  { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber:  { LF: -2.75, RF: -3.0 },
  caster:  { LF: 5.5, RF: 3.75 },
  toe: -0.25,
  coldPsi: { LF: 35, RF: 35, LR: 30, RR: 30 },
};
const F8_CALIB_TIRES = {
  LF: { temp: 133, wear: 0 }, RF: { temp: 123.3, wear: 0 },
  LR: { temp: 128, wear: 0 }, RR: { temp: 120.3, wear: 0 },
};
const F8_BASELINE_METRIC = calcPerformanceF8(F8_BASELINE_SETUP, F8_CALIB_TIRES);
function metricToLapTimeF8(metric) {
  return BASELINE_LAP_F8_OBS * Math.pow(F8_BASELINE_METRIC / metric, LAP_SENSITIVITY);
}

function optStaticCamberF8(casterDeg, setup) {
  // Average of optimal static for outside role and optimal static for inside role
  const ss = shockStiffness(setup);
  const roll = bodyRoll(1.0, rollStiffness(setup));
  const cornerRoll = roll * F8_RACING_G;
  const cornerLoadsL = tireLoads(F8_CORNER_G, ss.springLLTD);
  const swOut = sidewallCamberDeg(cornerLoadsL.RF); // RF = outside in L turn
  const swIn  = sidewallCamberDeg(cornerLoadsL.LF); // LF = inside in L turn

  const casterGainOut = -(casterDeg * 0.18);
  const casterGainIn  =  (casterDeg * 0.10);
  const rollGainOut   = -(cornerRoll * 0.355);
  const rollGainIn    =  (cornerRoll * 0.15);
  const kpiOut = GEOM.kpiCamberGain, kpiIn = -GEOM.kpiCamberGain;

  const effIdealOut = F8_IDEAL_GROUND_OUTSIDE - swOut - cornerRoll;
  const effIdealIn  = F8_IDEAL_GROUND_INSIDE  - swIn  + cornerRoll;

  const optOut = effIdealOut - casterGainOut - rollGainOut - kpiOut;
  const optIn  = effIdealIn  - casterGainIn  - rollGainIn  - kpiIn;

  return Math.round(((optOut + optIn) / 2) * 4) / 4;
}

function runF8Grid(ambientTemp = 75, inflationTemp = COLD_PSI_TEMP) {
  const fronts = uniqFront();
  const rears  = uniqRear();
  const casterSteps = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
  const toe = -0.25;

  // F8: symmetric (same LF+RF, same LR+RR, same caster both sides)
  // Unique front pairs = unique rating × spring combos (symmetric)
  const nCombos = fronts.length * rears.length * rears.length * casterSteps.length;
  console.log(`F8 grid search: ${nCombos.toLocaleString()} combinations @ ${ambientTemp}°F\n`);

  let best = null;
  let count = 0;
  const TOP_N = 10;
  const topList = [];

  for (const frStrut of fronts) {
    for (const lrShock of rears) {
      for (const rrShock of rears) {
        for (const casterDeg of casterSteps) {
          count++;
          const setup = {
            shocks:  { LF: frStrut.rating, RF: frStrut.rating,
                       LR: lrShock.rating, RR: rrShock.rating },
            springs: { LF: frStrut.springRate, RF: frStrut.springRate,
                       LR: 160, RR: 160 },
            caster:  { LF: casterDeg, RF: casterDeg },
            toe,
            camber:  { LF: 0, RF: 0 },
            coldPsi: { LF: 34, RF: 34, LR: 29, RR: 29 },
          };

          // Derive symmetric camber
          const optCam = optStaticCamberF8(casterDeg, setup);
          setup.camber.LF = optCam;
          setup.camber.RF = optCam;

          // Derive optimal cold PSI for F8 (symmetric loads)
          const ss = shockStiffness(setup);
          const cornerLoadsL = tireLoads(F8_CORNER_G, ss.springLLTD);
          const cornerLoadsR = { LF: cornerLoadsL.RF, RF: cornerLoadsL.LF,
                                  LR: cornerLoadsL.RR, RR: cornerLoadsL.LR };
          const cornerLoads = {
            LF: (cornerLoadsL.LF + cornerLoadsR.LF) / 2, RF: (cornerLoadsL.RF + cornerLoadsR.RF) / 2,
            LR: (cornerLoadsL.LR + cornerLoadsR.LR) / 2, RR: (cornerLoadsL.RR + cornerLoadsR.RR) / 2,
          };
          const tiles = eqTiresF8(setup, ambientTemp);
          for (const c of CORNERS) {
            setup.coldPsi[c] = Math.round(optColdPsi(
              cornerLoads[c], tiles[c].temp, inflationTemp) * 2) / 2;
          }

          const metric = calcPerformanceF8(setup, eqTiresF8(setup, ambientTemp), inflationTemp);
          const lapTime = metricToLapTimeF8(metric);
          const lltd = ss.frontLLTD;

          const entry = { lapTime, lltd, setup: JSON.parse(JSON.stringify(setup)) };
          if (!best || lapTime < best.lapTime) best = entry;

          topList.push(entry);
          if (topList.length > TOP_N + 1000) {
            topList.sort((a, b) => a.lapTime - b.lapTime);
            topList.splice(TOP_N);
          }
        }
      }
    }
  }

  topList.sort((a, b) => a.lapTime - b.lapTime);
  const top10 = topList.slice(0, TOP_N);

  console.log(`F8 grid completed. ${count.toLocaleString()} combos evaluated.\n`);
  console.log(`=== TOP ${TOP_N} F8 SETUPS @ ${ambientTemp}°F ===\n`);
  top10.forEach((r, i) => {
    const s = r.setup;
    console.log(`#${i + 1}  ${r.lapTime.toFixed(3)}s   LLTD ${(r.lltd * 100).toFixed(1)}%`);
    console.log(`     Shocks LF=${s.shocks.LF} RF=${s.shocks.RF} LR=${s.shocks.LR} RR=${s.shocks.RR}`);
    console.log(`     Springs LF=${s.springs.LF} RF=${s.springs.RF}`);
    console.log(`     Camber (symmetric) ${s.camber.LF}°`);
    console.log(`     Caster (symmetric) ${s.caster.LF}°`);
    console.log(`     Cold PSI LF=${s.coldPsi.LF} RF=${s.coldPsi.RF} LR=${s.coldPsi.LR} RR=${s.coldPsi.RR}`);
    console.log('');
  });

  return { best, top10, count };
}

// ── Run both ─────────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log(' RACE SETUP GRID SEARCH — Updated Physics Model');
console.log('='.repeat(60));
console.log('');

const ovalResult = runOvalGrid(90);
console.log('');
console.log('='.repeat(60));
console.log('');
const f8Result   = runF8Grid(75);

console.log('');
console.log('='.repeat(60));
console.log(' SUMMARY');
console.log('='.repeat(60));
console.log(`Oval best: ${ovalResult.best.lapTime.toFixed(3)}s @ 90°F`);
console.log(`F8   best: ${f8Result.best.lapTime.toFixed(3)}s @ 75°F`);
console.log(`Baseline:  ${BASELINE_LAP}s (oval) / ${BASELINE_LAP_F8_OBS}s (F8)`);
console.log(`Oval gain: ${(BASELINE_LAP - ovalResult.best.lapTime).toFixed(3)}s`);
console.log(`F8   gain: ${(BASELINE_LAP_F8_OBS - f8Result.best.lapTime).toFixed(3)}s`);
