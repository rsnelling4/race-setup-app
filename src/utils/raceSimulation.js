/**
 * Race Simulation Engine
 * Calibrated for: 2008 Crown Victoria P71 on 1/4 mile oval
 * Baseline: 17.4s lap @ 65°F with current setup
 *
 * Tire: Ironman iMove Gen3 AS — 235/55R17 103V XL
 *   Sidewall max (cold): 51 PSI (XL-rated)
 *   Load capacity: 1929 lbs per tire (LI 103)
 *   UTQG: 420 AA A
 *   Radius: 13.59" (model uses 13.6")
 *
 * Features:
 * - Inside/Middle/Outside tire temperature model
 * - Toe, caster, camber, shock, pressure effects
 * - Physics-based performance metric mapped to lap time
 */

// ============ CONSTANTS ============
const G = 32.174;            // ft/s²
const MPH_PER_FPS = 0.6818;  // conversion factor
const RANKINE = 459.67;       // °F to °R offset

// ============ TRACK ============
const TRACK = {
  straightLength: 335,   // ft
  cornerRadius: 130,     // ft (racing line, calibrated)
  bankingDeg: 3,         // effective banking (calibrated)
};
TRACK.bankingRad = TRACK.bankingDeg * Math.PI / 180;
TRACK.cornerArc = Math.PI * TRACK.cornerRadius;
TRACK.totalLength = 2 * TRACK.straightLength + 2 * TRACK.cornerArc;

// ============ VEHICLE ============
const VEH = {
  weight: 3800,
  mass: 3800 / G,
  frontBias: 0.55,
  cgHeight: 22 / 12,      // ft
  trackWidth: 63 / 12,    // ft
  tireRadius: 13.6 / 12,  // ft — 235/55R17: 129.25mm sidewall + 215.9mm wheel = 13.59" ✓
  frontalArea: 25,         // ft²
  cd: 0.33,
  peakTorque: 300,         // lb-ft (user-specified HP ~300)
  gear2Ratio: 1.55 * 3.73, // 2nd gear total
  driveEff: 0.85,
  brakingG: 0.5,           // lift + light brake on short oval
  wheelbase: 114.7 / 12,  // ft (Crown Vic wheelbase)
};

// ============ TIRE THERMAL MODEL ============
// Now tracks Inside/Middle/Outside temperatures separately.
// Calibrated to real pyrometer data:
//   65°F / 15 laps: RF I:106 M:113 O:131, LF I:104 M:102 O:94
//   90°F / 25 laps: RF I:125 M:131 O:135, LF I:114 M:110 O:105
const THERMAL = {
  heatBase: 0.53,      // base heat/s (rolling resistance, all zones)
  heatLoad: 0.00453,   // load-dependent heat/s
  coolRate: 0.02,       // cooling per °F delta per second
  thermalMass: 1.39,    // thermal inertia (τ ≈ 4 laps)
  refSpeed: 75,         // ft/s reference avg speed for heat calc
  // Cross-zone heat distribution factors for cornering (left turns)
  // Outside edge of outside tires gets more heat; inside edge of inside tires gets less
  zoneHeatMult: {
    // [inside, middle, outside] multipliers relative to avg
    outsideTire: [0.82, 1.0, 1.18],   // RF/RR: outside edge loaded harder
    insideTire:  [1.06, 1.0, 0.94],    // LF/LR: inside edge (motor side) slightly hotter
  },
};

// ============ GRIP MODEL ============
// Temperature: plateau optimal range with gradual falloff
// Uses average of I/M/O for grip calculation
function tempGripFactor(temp) {
  // Optimal window for all-season street tires on a short oval.
  // Upper bound extended to 185°F — these tires don't degrade meaningfully
  // until well past 170°F, and the thermal model overshoots slightly on hot zones.
  const optLow = 100;
  const optHigh = 185;
  if (temp >= optLow && temp <= optHigh) return 1.0;
  if (temp < optLow) {
    const below = optLow - temp;
    return Math.max(0.75, 1 - Math.pow(below / 60, 2) * 0.25);
  }
  const above = temp - optHigh;
  return Math.max(0.70, 1 - Math.pow(above / 50, 2) * 0.30);
}

// Pressure: deviation from load-optimal reduces grip
function pressureGripFactor(hotPsi, tireLoad) {
  const avgLoad = VEH.weight / 4;
  const optPsi = 30 * (tireLoad / avgLoad);
  const dev = Math.abs(hotPsi - optPsi);
  return Math.max(0.88, 1 - 0.0025 * dev);
}

// Camber: deviation from ideal for the cornering condition
function camberGripFactor(actualCamber, isOutside, lateralG) {
  let ideal;
  if (isOutside) {
    ideal = -(1.0 + lateralG * 2.0);
  } else {
    ideal = 0.3 + lateralG * 0.3;
  }
  const dev = Math.abs(actualCamber - ideal);
  return Math.max(0.88, 1 - 0.012 * dev);
}

// Caster: contributes dynamic camber gain on outside front tire during cornering.
// More caster on RF = more negative camber gain when turning left = better grip.
// Also affects mechanical trail → steering feel/stability.
function casterGripFactor(casterDeg, isOutside, isFront) {
  if (!isFront) return 1.0; // Caster only affects front
  // Dynamic camber gain from caster: ~0.5° camber per degree caster per G
  // On outside tire (RF for left turns), more caster = more neg camber = better
  // On inside tire (LF), effect is reversed but smaller
  if (isOutside) {
    // Optimal caster for RF in left-turn oval: 4-6 degrees
    const optimal = 5.0;
    const dev = Math.abs(casterDeg - optimal);
    return Math.max(0.96, 1 - 0.004 * dev);
  } else {
    // LF: less caster is better (reduces positive camber gain on inside)
    const optimal = 3.0;
    const dev = Math.abs(casterDeg - optimal);
    return Math.max(0.97, 1 - 0.003 * dev);
  }
}

// Toe: affects tire drag and cornering entry/stability
// Toe out (negative value in inches) = better turn-in but more drag
// Toe in (positive) = more stable but slower turn-in
function toeGripFactor(toeInches) {
  // For left-turn oval: slight toe out helps turn-in
  // Optimal is about 1/8" to 3/8" toe out
  const optimal = -0.25; // 1/4" toe out
  const dev = Math.abs(toeInches - optimal);
  // Grip benefit from toe out (turn-in response)
  return Math.max(0.96, 1 - 0.008 * dev * dev);
}

// Toe drag penalty: toe misalignment creates scrub drag
function toeDragFactor(toeInches) {
  // Each 1/4" of toe ≈ 0.1° angle → small drag penalty
  const absToe = Math.abs(toeInches);
  // Drag increases with toe magnitude (either direction)
  return 1.0 + 0.001 * absToe * absToe;
}

// Hot pressure from cold + tire temp via ideal gas law
function hotPressure(coldPsi, tireTemp, ambient) {
  return coldPsi * (tireTemp + RANKINE) / (ambient + RANKINE);
}

// ============ SHOCK → ROLL STIFFNESS ============
// Rating 0 = stiffest, 10 = softest → roll contribution = 10 - rating
function shockStiffness(setup) {
  const f = (10 - setup.shocks.LF) + (10 - setup.shocks.RF);
  const r = (10 - setup.shocks.LR) + (10 - setup.shocks.RR);
  return { front: f, rear: r, total: f + r, frontLLTD: f / Math.max(f + r, 1) };
}

// Body roll angle (degrees) at given lateral G
function bodyRoll(lateralG, totalStiffness) {
  const baseRoll = 3.5;     // deg/G at baseline stiffness
  const baseStiff = 28;     // baseline total (user's current: 12+16)
  return lateralG * baseRoll * baseStiff / Math.max(totalStiffness, 4);
}

// ============ WEIGHT TRANSFER ============
function tireLoads(lateralG, frontLLTD) {
  const latTransfer = VEH.weight * lateralG * VEH.cgHeight / VEH.trackWidth;
  const fStatic = VEH.weight * VEH.frontBias / 2;
  const rStatic = VEH.weight * (1 - VEH.frontBias) / 2;
  return {
    LF: Math.max(50, fStatic - latTransfer * frontLLTD),
    RF: fStatic + latTransfer * frontLLTD,
    LR: Math.max(50, rStatic - latTransfer * (1 - frontLLTD)),
    RR: rStatic + latTransfer * (1 - frontLLTD),
  };
}

// ============ PERFORMANCE METRIC ============
const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const OUTSIDE = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true, RF: true, LR: false, RR: false };

function calcPerformance(setup, tires, ambient) {
  const refG = 1.0;
  const ss = shockStiffness(setup);
  const loads = tireLoads(refG, ss.frontLLTD);
  const roll = bodyRoll(refG, ss.total);

  // Toe and caster from setup (with defaults for backward compat)
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  let totalForce = 0;
  let frontForce = 0;
  let rearForce = 0;

  for (const c of CORNERS) {
    const load = loads[c];
    // Use average temp for grip calculation
    const avgTemp = tires[c].temp;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, ambient);
    let mu = 1.0;

    // Temperature
    mu *= tempGripFactor(avgTemp);

    // Pressure
    mu *= pressureGripFactor(hp, load);

    // Camber (with caster-induced dynamic camber for fronts)
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    if (front) {
      // Dynamic camber from caster: ~0.5° per degree caster per G of lateral
      const casterCamberGain = outside
        ? -(caster[c] * 0.5 * refG)  // RF: caster adds negative camber (good)
        : (caster[c] * 0.3 * refG);   // LF: caster adds positive camber (less effect)
      const effectiveCamber = setup.camber[c] + casterCamberGain;
      mu *= camberGripFactor(effectiveCamber, outside, refG);
      // Caster direct effect (trail, stability)
      mu *= casterGripFactor(caster[c], outside, true);
    } else {
      // Solid rear axle: camber = body roll angle
      const dynCamber = outside ? roll : -roll;
      const idealRear = outside ? -1.0 : 0;
      const dev = Math.abs(dynCamber - idealRear);
      mu *= Math.max(0.88, 1 - 0.012 * dev);
    }

    // Toe effect (front tires only)
    if (front) {
      mu *= toeGripFactor(toe);
    }

    // Load sensitivity (heavier loaded → slightly lower μ per unit)
    const avgLoad = VEH.weight / 4;
    mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);

    // Wear
    mu *= Math.max(0.92, 1 - tires[c].wear);

    const force = mu * load;
    totalForce += force;
    if (front) frontForce += force;
    else rearForce += force;
  }

  // Banking
  totalForce += VEH.weight * Math.sin(TRACK.bankingRad);

  // Balance penalty: imbalanced car wastes potential grip
  const frontPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontPct - VEH.frontBias);
  totalForce *= Math.max(0.94, 1 - imbalance * 0.2);

  // Toe drag penalty on straights (reduces overall performance slightly)
  const dragPenalty = toeDragFactor(toe);
  totalForce /= dragPenalty;

  return totalForce / VEH.weight;
}

// ============ WORK FACTORS (for thermal model) ============
function calcWorkFactors(setup) {
  const ss = shockStiffness(setup);
  const loads = tireLoads(1.0, ss.frontLLTD);
  const avgLoad = VEH.weight / 4;
  return {
    LF: loads.LF / avgLoad,
    RF: loads.RF / avgLoad,
    LR: loads.LR / avgLoad,
    RR: loads.RR / avgLoad,
  };
}

// ============ I/M/O TIRE TEMPERATURE UPDATE ============
// Each tire tracks inside, middle, outside temperatures separately.
// The "temp" field is the average used for grip calculations.
function updateTireTemps(tires, workFactors, ambient, lapTime, setup) {
  const newTires = {};
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  for (const c of CORNERS) {
    const wf = workFactors[c];
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    const zoneMults = outside ? THERMAL.zoneHeatMult.outsideTire : THERMAL.zoneHeatMult.insideTire;

    // Camber-induced temperature distribution
    // More negative camber → hotter inside edge, cooler outside edge
    let camberVal = 0;
    if (front) {
      camberVal = setup.camber[c];
      // Add caster-induced dynamic camber
      const casterGain = outside
        ? -(caster[c] * 0.5)
        : (caster[c] * 0.3);
      camberVal += casterGain;
    } else {
      // Rear: body roll effect
      const ss = shockStiffness(setup);
      const roll = bodyRoll(1.0, ss.total);
      camberVal = outside ? roll : -roll;
    }

    // Camber shifts heat distribution: negative camber → more inside heat
    // Each degree of negative camber shifts ~2% heat from outside to inside
    const camberShift = camberVal * 0.02;
    const insideMult = zoneMults[0] + camberShift;  // more neg camber = more inside heat
    const middleMult = zoneMults[1];
    const outsideMult = zoneMults[2] - camberShift; // more neg camber = less outside heat

    // Toe effect on temperature: toe out heats inside edges of both fronts
    let toeInsideBoost = 0;
    let toeOutsideBoost = 0;
    if (front) {
      // Toe out (negative) → inside edges scrub more
      toeInsideBoost = -toe * 0.03;   // toe out → positive boost to inside
      toeOutsideBoost = toe * 0.02;    // toe out → slight cooling of outside
    }

    // Pressure effect on temperature: over-inflation → hotter middle
    const avgTemp = (tires[c].inside + tires[c].middle + tires[c].outside) / 3;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, ambient);
    const avgLoad = VEH.weight / 4;
    const loads = tireLoads(1.0, shockStiffness(setup).frontLLTD);
    const optPsi = 30 * (loads[c] / avgLoad);
    const psiDev = hp - optPsi; // positive = over-inflated
    const psiMiddleBoost = psiDev * 0.003; // over-inflation heats middle more

    // Update each zone
    const zones = [
      { key: 'inside', mult: insideMult + toeInsideBoost },
      { key: 'middle', mult: middleMult + psiMiddleBoost },
      { key: 'outside', mult: outsideMult + toeOutsideBoost },
    ];

    const newZones = {};
    for (const zone of zones) {
      const T = tires[c][zone.key];
      const heatIn = (THERMAL.heatBase + THERMAL.heatLoad * wf * THERMAL.refSpeed) * lapTime * zone.mult;
      const heatOut = THERMAL.coolRate * (T - ambient) * lapTime;
      const dT = (heatIn - heatOut) / THERMAL.thermalMass;
      newZones[zone.key] = T + dT;
    }

    // Average temp for grip calculations
    const newAvg = (newZones.inside + newZones.middle + newZones.outside) / 3;

    newTires[c] = {
      inside: newZones.inside,
      middle: newZones.middle,
      outside: newZones.outside,
      temp: newAvg,
      wear: tires[c].wear + THERMAL.wearRate(wf, newAvg),
    };
  }
  return newTires;
}

// Wear rate: higher load + higher temp = more wear
THERMAL.wearRate = function (workFactor, temp) {
  // Crown Vic on street tires / short oval: wear is negligible over 25 laps.
  // Keep a token rate (0.00008) so the field exists but it has no visible effect.
  const base = 0.00008;
  const tempMult = temp > 150 ? 1.5 : 1.0;
  return base * workFactor * tempMult;
};

// ============ LAP TIME FROM METRIC ============
const BASELINE_LAP = 17.4;
const LAP_SENSITIVITY = 0.55;

let _baselineMetric = null;

function getBaselineMetric() {
  if (_baselineMetric === null) {
    const calibTires = {
      LF: { inside: 104, middle: 102, outside: 94, temp: 100, wear: 0 },
      RF: { inside: 106, middle: 113, outside: 131, temp: 117, wear: 0 },
      LR: { inside: 101, middle: 102, outside: 91, temp: 98, wear: 0 },
      RR: { inside: 100, middle: 117, outside: 130, temp: 116, wear: 0 },
    };
    _baselineMetric = calcPerformance(DEFAULT_SETUP, calibTires, 65);
  }
  return _baselineMetric;
}

function metricToLapTime(metric) {
  const base = getBaselineMetric();
  return BASELINE_LAP * Math.pow(base / metric, LAP_SENSITIVITY);
}

// Approximate speeds for display
function metricToSpeeds(metric) {
  const cornerSpeed = Math.sqrt(metric * G * TRACK.cornerRadius);
  const wheelForce = VEH.peakTorque * VEH.gear2Ratio / VEH.tireRadius * VEH.driveEff;
  const drag = 0.5 * 0.00238 * VEH.cd * VEH.frontalArea * cornerSpeed * cornerSpeed;
  const netForce = wheelForce - drag;
  const accel = netForce / VEH.mass;
  const decel = VEH.brakingG * G;
  const dBrake = Math.max(0,
    (cornerSpeed * cornerSpeed + 2 * accel * TRACK.straightLength - cornerSpeed * cornerSpeed) /
    (2 * (accel + decel))
  );
  const dAccel = TRACK.straightLength - dBrake;
  const peakSpeedSq = cornerSpeed * cornerSpeed + 2 * accel * Math.max(dAccel, 0);
  const peakSpeed = Math.sqrt(Math.max(peakSpeedSq, cornerSpeed * cornerSpeed));
  return {
    cornerMph: cornerSpeed * MPH_PER_FPS,
    peakMph: peakSpeed * MPH_PER_FPS,
  };
}

// ============ DEFAULT SETUP (user's current) ============
export const DEFAULT_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  camber: { LF: -1.5, RF: -3.0 },
  caster: { LF: 3.5, RF: 5.0 },
  toe: -0.25, // 1/4" toe out (negative = toe out)
  coldPsi: { LF: 19.5, RF: 34, LR: 18.5, RR: 36 },
};

// ============ RECOMMENDED SETUP ============
export const RECOMMENDED_SETUP = {
  shocks: { LF: 6, RF: 2, LR: 5, RR: 1 },
  camber: { LF: 1.0, RF: -2.75 },
  caster: { LF: 3.0, RF: 5.5 },
  toe: -0.375, // 3/8" toe out for better turn-in
  coldPsi: { LF: 22, RF: 36, LR: 26, RR: 34 },
};

// ============ MAIN SIMULATION ============
export function simulateRace(setup, ambientTemp = 65, numLaps = 25) {
  // Initialize tires with I/M/O at slightly above ambient
  let tires = {};
  for (const c of CORNERS) {
    const initTemp = ambientTemp + 5;
    tires[c] = { inside: initTemp, middle: initTemp, outside: initTemp, temp: initTemp, wear: 0 };
  }

  const workFactors = calcWorkFactors(setup);
  const laps = [];

  for (let i = 1; i <= numLaps; i++) {
    const metric = calcPerformance(setup, tires, ambientTemp);
    const lapTime = metricToLapTime(metric);
    const speeds = metricToSpeeds(metric);

    // Hot pressures (based on avg temp)
    const hPsi = {};
    for (const c of CORNERS) {
      hPsi[c] = Math.round(hotPressure(setup.coldPsi[c], tires[c].temp, ambientTemp) * 10) / 10;
    }

    // Per-tire grip
    const grips = {};
    for (const c of CORNERS) {
      grips[c] = Math.round(tempGripFactor(tires[c].temp) * 1000) / 1000;
    }

    laps.push({
      lap: i,
      time: Math.round(lapTime * 1000) / 1000,
      cornerMph: Math.round(speeds.cornerMph * 10) / 10,
      peakMph: Math.round(speeds.peakMph * 10) / 10,
      temps: {
        LF: Math.round(tires.LF.temp * 10) / 10,
        RF: Math.round(tires.RF.temp * 10) / 10,
        LR: Math.round(tires.LR.temp * 10) / 10,
        RR: Math.round(tires.RR.temp * 10) / 10,
      },
      tempsIMO: {
        LF: { I: Math.round(tires.LF.inside), M: Math.round(tires.LF.middle), O: Math.round(tires.LF.outside) },
        RF: { I: Math.round(tires.RF.inside), M: Math.round(tires.RF.middle), O: Math.round(tires.RF.outside) },
        LR: { I: Math.round(tires.LR.inside), M: Math.round(tires.LR.middle), O: Math.round(tires.LR.outside) },
        RR: { I: Math.round(tires.RR.inside), M: Math.round(tires.RR.middle), O: Math.round(tires.RR.outside) },
      },
      hotPsi: hPsi,
      gripFactors: grips,
      wear: {
        LF: Math.round(tires.LF.wear * 10000) / 10000,
        RF: Math.round(tires.RF.wear * 10000) / 10000,
        LR: Math.round(tires.LR.wear * 10000) / 10000,
        RR: Math.round(tires.RR.wear * 10000) / 10000,
      },
    });

    // Update temps for next lap
    tires = updateTireTemps(tires, workFactors, ambientTemp, lapTime, setup);
  }

  const times = laps.map(l => l.time);
  return {
    laps,
    summary: {
      best: Math.min(...times),
      worst: Math.max(...times),
      avg: Math.round((times.reduce((a, b) => a + b) / times.length) * 1000) / 1000,
      total: Math.round(times.reduce((a, b) => a + b) * 100) / 100,
      bestLapNum: times.indexOf(Math.min(...times)) + 1,
      worstLapNum: times.indexOf(Math.max(...times)) + 1,
    },
  };
}

// ============ SETUP ANALYZER ============
// Returns real-time per-corner analysis, balance, toe, and ranked recommendations.
export function analyzeSetup(setup, ambientTemp = 65) {
  const ss = shockStiffness(setup);
  const loads = tireLoads(1.0, ss.frontLLTD);
  const avgLoad = VEH.weight / 4;
  const roll = bodyRoll(1.0, ss.total);
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  // Steady-state equilibrium temps from thermal model
  const workFactors = calcWorkFactors(setup);
  const refTires = {};
  for (const c of CORNERS) {
    const wf = workFactors[c];
    const tEq = ambientTemp +
      (THERMAL.heatBase + THERMAL.heatLoad * wf * THERMAL.refSpeed) / THERMAL.coolRate;
    refTires[c] = { temp: tEq, inside: tEq, middle: tEq, outside: tEq, wear: 0 };
  }

  // Per-corner breakdown
  const corners = {};
  for (const c of CORNERS) {
    const load = loads[c];
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    const wf = workFactors[c];
    const tEq = refTires[c].temp;

    // Pressure
    const hp = hotPressure(setup.coldPsi[c], tEq, ambientTemp);
    const optHotPsi = 30 * (load / avgLoad);
    const psiDev = hp - optHotPsi;
    const psiGripFactor = pressureGripFactor(hp, load);
    // XL-rated Ironman iMove Gen3 AS 235/55R17: 51 PSI cold max → use 51 PSI as hot ceiling.
    // Hot pressure at track equilibrium (~120°F) rises ~10.5% above cold, so cold recommendations
    // will back-calculate to ~46 PSI max — well within the 51 PSI XL sidewall rating.
    const isPresLimited = optHotPsi < 18 || optHotPsi > 51;
    const recHotPsi = Math.min(Math.max(18, optHotPsi), 51);
    const recColdPsi = recHotPsi * (ambientTemp + RANKINE) / (tEq + RANKINE);

    // Camber
    let effectiveCamber, idealCamber, camberDev, camberFactor;
    let casterGain = 0, casterFactor = 1, optStaticCamber = null;
    if (front) {
      casterGain = outside ? -(caster[c] * 0.5) : (caster[c] * 0.3);
      effectiveCamber = setup.camber[c] + casterGain;
      idealCamber = outside ? -3.0 : 0.6;
      camberDev = Math.abs(effectiveCamber - idealCamber);
      camberFactor = camberGripFactor(effectiveCamber, outside, 1.0);
      casterFactor = casterGripFactor(caster[c], outside, true);
      optStaticCamber = Math.round((idealCamber - casterGain) * 4) / 4;
    } else {
      effectiveCamber = outside ? roll : -roll;
      idealCamber = outside ? -1.0 : 0;
      camberDev = Math.abs(effectiveCamber - idealCamber);
      camberFactor = Math.max(0.88, 1 - 0.012 * camberDev);
    }

    const tempFactor = tempGripFactor(tEq);
    const loadSens = Math.pow(avgLoad / Math.max(load, 50), 0.08);
    const mu = tempFactor * psiGripFactor * camberFactor * casterFactor * loadSens;
    const adjustableScore = tempFactor * psiGripFactor * camberFactor * casterFactor;

    corners[c] = {
      load, wf, estimatedTemp: tEq,
      hp, optHotPsi, psiDev, psiGripFactor, isPresLimited, recHotPsi, recColdPsi,
      effectiveCamber, idealCamber, camberDev, camberFactor, casterGain, casterFactor,
      optStaticCamber, front, outside, tempFactor, loadSens, mu, adjustableScore,
    };
  }

  // Balance
  let frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const f = corners[c].mu * corners[c].load;
    if (IS_FRONT[c]) frontForce += f; else rearForce += f;
  }
  const frontGripPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontGripPct - VEH.frontBias);
  const balancePenalty = Math.max(0.94, 1 - imbalance * 0.2);

  // Toe
  const toeGrip = toeGripFactor(toe);
  const toeDrag = toeDragFactor(toe);

  // Current metric + lap time (using equilibrium temps)
  const metric = calcPerformance(setup, refTires, ambientTemp);
  const lapTime = metricToLapTime(metric);

  // Recommendations
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const testGain = (mutate) => {
    const s = clone(setup);
    mutate(s);
    return lapTime - metricToLapTime(calcPerformance(s, refTires, ambientTemp));
  };
  const recs = [];

  // Front camber
  for (const c of ['LF', 'RF']) {
    if (corners[c].optStaticCamber === null) continue;
    const cur = setup.camber[c];
    const opt = corners[c].optStaticCamber;
    if (Math.abs(opt - cur) < 0.25) continue;
    const gain = testGain(s => { s.camber[c] = opt; });
    recs.push({
      id: `${c.toLowerCase()}-camber`,
      parameter: `${c} Camber`,
      current: `${cur}°`, currentVal: cur,
      optimal: `${opt}°`, optimalVal: opt,
      gain,
      detail: `Mid-corner effective: ${corners[c].effectiveCamber.toFixed(2)}° → ideal ${corners[c].idealCamber.toFixed(1)}°`,
      note: `Assumes ${Math.abs(corners[c].casterGain).toFixed(1)}° dynamic gain from ${caster[c]}° caster — verify with tire temps`,
    });
  }

  // Pressures
  for (const c of CORNERS) {
    const cur = setup.coldPsi[c];
    const opt = Math.round(corners[c].recColdPsi * 2) / 2;
    if (Math.abs(opt - cur) < 0.5) continue;
    const gain = testGain(s => { s.coldPsi[c] = opt; });
    if (Math.abs(gain) < 0.003) continue;
    recs.push({
      id: `${c.toLowerCase()}-psi`,
      parameter: `${c} Pressure`,
      current: `${cur} PSI`, currentVal: cur,
      optimal: `${opt} PSI`, optimalVal: opt,
      gain,
      detail: `Hot: ${corners[c].hp.toFixed(1)} PSI → target ${corners[c].recHotPsi.toFixed(1)} PSI (model optimal: ${corners[c].optHotPsi.toFixed(0)} PSI)`,
      note: corners[c].isPresLimited ? 'Corner load is far from average — optimal pressure is outside practical range' : null,
    });
  }

  // Toe
  const optToe = -0.25;
  if (Math.abs(toe - optToe) > 0.0625) {
    const gain = testGain(s => { s.toe = optToe; });
    if (Math.abs(gain) >= 0.002) {
      recs.push({
        id: 'toe',
        parameter: 'Front Toe',
        current: toe < 0 ? `${Math.abs(toe)}" toe out` : toe > 0 ? `${toe}" toe in` : 'Zero toe',
        currentVal: toe,
        optimal: '¼" toe out', optimalVal: -0.25,
        gain,
        detail: 'Balances turn-in grip vs straight-line drag for left-turn oval',
        note: null,
      });
    }
  }

  recs.sort((a, b) => b.gain - a.gain);

  // Combined optimal lap time
  const optSetup = clone(setup);
  for (const rec of recs) {
    if (rec.gain <= 0) continue;
    if (rec.id === 'lf-camber') optSetup.camber.LF = rec.optimalVal;
    if (rec.id === 'rf-camber') optSetup.camber.RF = rec.optimalVal;
    if (rec.id === 'toe') optSetup.toe = rec.optimalVal;
    const m = rec.id.match(/^([a-z]{2})-psi$/);
    if (m) optSetup.coldPsi[m[1].toUpperCase()] = rec.optimalVal;
  }
  const optMetric = calcPerformance(optSetup, refTires, ambientTemp);
  const optLapTime = metricToLapTime(optMetric);

  return {
    corners, ss, roll, frontGripPct, balancePenalty, imbalance,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain: lapTime - optLapTime,
    recs, caster,
  };
}
