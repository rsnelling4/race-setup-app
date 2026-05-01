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
const RANKINE = 459.67;       // °F to °R offset

// ACTUAL RACING LINE CONSTANTS — lateral G at the apex, back-calculated from observed lap times.
//   Oval: 2×t_corner + 2×t_straight = 17.4s → v_corner ≈ 47.6 mph at effective R = 145 ft
//   (Driver swings ~40 ft wide from the 105 ft inside radius → effective racing line R ≈ 145 ft)
//   F8: 2×t_loop + 2×t_straight = 23.283s → v_corner = 33.3 mph, lateral G ≈ 0.50G @ 149 ft
const OVAL_RACING_G  = 0.813; // actual lateral G on effective racing line — back-calculated from 47.6 mph (69.8 ft/s) at R=145 ft: v²/(g×R)=69.8²/(32.174×145)=0.813G
const OVAL_RACING_R  = 145;   // ft — effective racing line radius (105 ft inside + ~40 ft arc swing)
const F8_RACING_G    = 0.498; // actual lateral G at F8 loop, back-calculated from 23.283s

// ============ SPRING RATES ============
// Actual measured/confirmed spring rates.
// All FRONT_STRUTS entries are pre-assembled complete units (strut + spring + mount).
// Police/Taxi strut assemblies (FCS 1336349, PRT 710415, Monroe 271346/550055): 475 lbs/in
// Civilian/Base strut assemblies (FCS 1336343, PRT 714075, Monroe 171346, KYB SR4140): ~440 lbs/in
// KYB 551600 is the sole bare damper body (no spring) — uses existing car spring.
// Rear: P71 stock coil spring = 160 lbs/in (separate coil spring, not part of shock assembly)
const BASE_SPRING_FRONT = 475; // lbs/in — 2008 P71 stock front
const BASE_SPRING_REAR  = 160; // lbs/in — P71 stock rear coil spring

// ============ TRACK ============
// Measured via Google Earth: frontstretch 325 ft, backstretch 333 ft, corner width 53 ft.
// Average straight = 329 ft. For a 1/4-mile (1320 ft) track: R = (1320-658)/(2π) ≈ 105 ft.
const TRACK = {
  frontStraight: 325,    // ft (measured, frontstretch with start/finish)
  backStraight: 333,     // ft (measured, backstretch)
  straightLength: 329,   // ft (average of front/back, used for symmetric calculations)
  cornerRadius: 105,     // ft (racing line, derived from 1/4-mile total with 329 ft straights)
  bankingDeg: 3,         // effective banking (calibrated)
};
TRACK.bankingRad = TRACK.bankingDeg * Math.PI / 180;
TRACK.cornerArc = Math.PI * TRACK.cornerRadius;
TRACK.totalLength = 2 * TRACK.straightLength + 2 * TRACK.cornerArc;

// Per-corner minimum hot PSI floors — empirically calibrated.
// Never run left rear below 18 PSI hot (= 16 cold + 2 rise).
const MIN_HOT_PSI = { LF: 14, RF: 28, LR: 16, RR: 28 };

// Per-corner maximum hot PSI ceilings — empirically validated from real sessions.
// RF: never ran above 42 hot and that was already pushing it. Typical race target 38-42.
// RR: raise 1-2 PSI to loosen (oversteer), lower to tighten. Typical 33-35 hot.
const MAX_HOT_PSI = { LF: 30, RF: 42, LR: 26, RR: 38 };

// Per-corner validated hot PSI targets at OVAL_CORNER_G loads.
// Derived from multi-session real-world data (see memory: empirical PSI calibration).
//
// The load-proportional formula (30 × load/avgLoad) over-predicts RF (~45 PSI) and
// under-predicts RR (~31 PSI), producing a 14 PSI right-side split that causes severe push.
// Real-world validated: RF 38-40 / RR 33-35 (3-5 PSI split is neutral; wider split = tighter).
//
// Tire grip degression means the heavily loaded RF needs LESS pressure than load ratios suggest —
// the tall sidewall (235/55R17, 5.09" section height) provides contact patch compliance at load
// that reduces the pressure needed for optimal footprint shape.
//
// Formula: optHotPsi(corner) = BASE_HOT_PSI[corner] × (actualLoad / calibLoad[corner])^LOAD_EXP
// where LOAD_EXP = 0.35 (damped — load sensitivity reduced vs. linear to match observed behavior).
// This keeps load-sensitivity when setup changes shift loads, without extrapolating to absurd values.
//
// Calibration loads (OVAL_CORNER_G with stock geometry):
//   RF ≈ 1417 lbs  → target 39 PSI hot
//   RR ≈  955 lbs  → target 34 PSI hot
//   LF ≈  508 lbs  → target 21 PSI hot
//   LR ≈  820 lbs  → target 18 PSI hot
const BASE_HOT_PSI   = { LF: 21, RF: 39, LR: 18, RR: 34 };
const CALIB_LOAD     = { LF: 508, RF: 1417, LR: 820, RR: 955 };
const LOAD_EXP       = 0.35; // damped load exponent — empirically fitted to avoid over/under prediction

function optimalHotPsi(corner, load) {
  return BASE_HOT_PSI[corner] * Math.pow(Math.max(load, 50) / CALIB_LOAD[corner], LOAD_EXP);
}

// TIME-AVERAGED LATERAL G — used for tire load, pressure target, and camber calculations.
//
// The tires are only cornering for a fraction of each lap; on the straights lateral G = 0.
// Using peak corner G (0.813) for pressure targets would give RF optPsi ≈ 50 PSI — too high.
// Using time-averaged G gives a load that represents the average sidewall stress over the lap,
// which is what actually drives equilibrium tire pressure and sustained heat generation.
//
// Formula: OVAL_CORNER_G = OVAL_RACING_G × (2 × cornerArc / totalLength)
//   cornerFraction = 2×π×105 / (2×329 + 2×π×105) = 659.7 / 1317.7 = 0.5007
//   OVAL_CORNER_G  = 0.813 × 0.5007 = 0.407
//
// Verification against real-world data (baseline session, 35 PSI cold RF, 130°F tire):
//   RF hot PSI observed ≈ 39 PSI. At 0.407G: RF load ≈ 1417 lbs → optPsi ≈ 41.5 PSI.
//   Gap of ~2.5 PSI is explained by the front anti-roll bar, which transfers load without
//   creating body roll and thus isn't in the spring/damper LLTD model. The sway bar
//   reduces the effective elastic load transfer to the RF, lowering observed hot pressure.
//   No empirical tuning needed — derive from track geometry, note the known ARB gap.
//
// F8_CORNER_G: F8 loop fraction ≈ 0.56 of lap distance × 0.498G actual = 0.279 ≈ 0.28
//   (F8_RACING_G × loopFraction — computed in the F8 track section below; stored here for clarity)
const OVAL_CORNER_G = OVAL_RACING_G * (2 * TRACK.cornerArc / TRACK.totalLength); // ≈ 0.407
const F8_CORNER_G   = 0.28; // F8 loop fraction × F8_RACING_G — computed after F8 track defined

// ============ VEHICLE ============
export const VEH = {
  weight: 3700,
  mass: 3700 / G,
  frontBias: 0.57,          // Ford P71 published curb weight distribution ~57/43 front-heavy
  cgHeight: 23 / 12,          // ft — stock ~22" + roll cage ~0.8" raise + battery in passenger seat
  rollCenterHeight: 20.4 / 12, // ft — ESTIMATED pending upper arm inner pivot measurement
                               //   Calculated 2026-04-29 from 4 measured hardpoints + estimated upper arm pivot:
                               //   RF IC: 14.9" from CL, 10.2" high → RCH line intersects CL at 19.1"
                               //   LF IC: 16.6" from CL, 10.4" high → RCH line intersects CL at 21.6"
                               //   Average 20.4". Upper arm inner pivot assumed 13.5" (published P71 geometry) —
                               //   UPDATE this value once upper arm inner pivot is physically measured.
                               //   Prior value: 8.1" (2026-04-22, different geometry assumptions).
  rollCenterHeightRear: 14.5 / 12, // ft — measured: Watts link center pivot 14.5" from floor
  trackWidth: 64 / 12,        // ft — measured front (64"); rear 65.125" — using front for model
  tireRadius: 13.6 / 12,  // ft — 235/55R17: 129.25mm sidewall + 215.9mm wheel = 13.59" ✓
  frontalArea: 25,         // ft²
  cd: 0.33,
  peakTorque: 300,         // lb-ft (user-specified HP ~300)
  gear2Ratio: 1.55 * 3.73, // 2nd gear total
  driveEff: 0.85,
  brakingG: 0.5,           // lift + light brake on short oval
  wheelbase: 114.7 / 12,  // ft (Crown Vic wheelbase)
};

// ============ FRONT SUSPENSION GEOMETRY ============
// Kingpin inclination (KPI): 9.5° (measured/confirmed for P71 front SLA)
// Wheel: 17×7 steel, offset +44.45 mm = +1.75" (factory P71)
// Tire radius: 13.6" (235/55R17)
//
// Scrub radius = tireRadius × tan(KPI) − wheelOffset
//   = 13.6 × tan(9.5°) − 1.75 = 13.6 × 0.1673 − 1.75 = 2.275 − 1.75 = +0.525"
// Positive scrub: kingpin axis meets ground inboard of contact patch center.
// Creates self-centering moment and mild pull toward a braking wheel.
//
// KPI-induced camber gain during steering (adds positive camber to both front tires):
//   Correct formula: KPI_deg × (1 - cos(steerAngle))
//   At 10° steer: 9.5° × (1 - cos(10°)) = 9.5 × 0.01519 = +0.144°
//   (Previous formula sin(KPI)×sin(steer) was wrong — underestimated by ~5×.)
// Steer angle at corner apex — Ackermann geometry, back-calculated from actual corner radius.
//   Ackermann steer angle = arctan(wheelbase / cornerRadius)
//   Wheelbase = 114.7", effective racing line radius = 145 ft = 1740".
//   atan(114.7 / 1740) = atan(0.0659) = 3.77°
//
// Pyrometer validation (April 2026 session, RF caster 8.5°):
//   RF outside edge ran 20°F HOTTER than inside — the pattern for INSUFFICIENT camber.
//   Model previously used steerAngle=10° which gave caster gain coefficient 0.667°/°
//   (measured at 20° steer, applied unchanged). At 10° steer that over-estimated caster gain
//   by sin(10°)/sin(3.77°) = 1.74×, and at the prior hardcoded 20° steer, by ~4.8×.
//   With corrected 3.77° steer, caster gain at 8.5° = 8.5 × 0.136 = −1.15° (not −5.67°).
//   Revised RF ground camber ≈ −1.45°, which is INSUFFICIENT (short of −2.0° ideal) —
//   consistent with the outside-hotter pyrometer reading. Steer angle corrected to 3.77°.
//
// Caster camber gain coefficient (per degree of caster, at actual oval apex steer 3.77°):
//   Physical formula: camberGain = caster_deg × sin(steerAngle_rad) × K
//   where K = camberChange_at_20deg / (caster_deg × sin(20°)).
//
//   RF calibration (20° steer, 3° RF caster): measured 2.0° gain
//     K_RF = 2.0 / (3 × sin(20°)) = 1.946
//     CASTER_COEFF_RF = sin(3.77°) × 1.946 = 0.0658 × 1.946 ≈ 0.128°/°
//   Pyrometer-validated April 2026: 0.136°/° is the confirmed target (pyrometer cross-check).
//   Using validated value directly — within ~6% of calibration-derived value.
//
//   LF calibration (20° steer, 9° LF caster): measured 1.5° gain
//     K_LF = 1.5 / (9 × sin(20°)) = 0.487
//     CASTER_COEFF_LF = sin(3.77°) × 0.487 ≈ 0.032°/°
//   Pyrometer-validated target: 0.034°/°. Using validated value.
//
//   These tiny coefficients confirm: on a short oval, nearly ALL camber must come from static.
//   At 8.5° RF caster: caster gain = −(8.5 × 0.136) = −1.15° (not −5.67° as the old 0.667 gave).
const _STEER_RAD    = 3.77 * Math.PI / 180; // ≈ 0.0658 rad — Ackermann at apex: atan(114.7"/1740")
const CASTER_COEFF_RF = 0.136;              // °/°caster — pyrometer-validated April 2026, oval (3.77° steer)
const CASTER_COEFF_LF = 0.034;              // °/°caster — pyrometer-validated April 2026, oval (3.77° steer)

const GEOM = {
  kpi:         9.5,                          // ° — kingpin inclination (measured)
  wheelOffset: 1.75,                         // inches — P71 17×7 factory wheel
  scrubRadius: 13.6 * Math.tan(9.5 * Math.PI / 180) - 1.75, // ≈ 0.525"
  steerAngle:  3.77,                         // ° — Ackermann at apex: atan(114.7"/1740") = 3.77°
  // KPI camber gain: positive on outside tire (RF), negative on inside (LF)
  // Correct formula: KPI_deg × (1 - cos(steerAngle)) — derived from wheel rotating about
  // a tilted kingpin axis.
  // At 3.77° steer: 9.5° × (1 - cos(3.77°)) = 9.5 × 0.00216 = +0.021°
  kpiCamberGain: (9.5 * Math.PI / 180) * (1 - Math.cos(_STEER_RAD)), // ≈ +0.021°
};

// ============ TIRE SIDEWALL COMPLIANCE ============
// Ironman iMove Gen3 AS 235/55R17 103V XL — measured load vs. deflection curve:
//   500 lbs  →  9.5 mm deflection  (light load / straightaway)
//   1000 lbs → 18.9 mm             (static corner weight, P71 front)
//   1500 lbs → 28.4 mm             (1.5G cornering, RF at apex)
//   1929 lbs → 36.5 mm             (rated load, LI 103)
// Section height: 5.09" (129.25 mm). Section width: 9.25" (235 mm).
// Rim width: 7" (178 mm). Sidewall overhang each side: (235-178)/2 = 28.5 mm.
//
// Sidewall compliance camber: under cornering load the tire sidewall deflects,
// shifting the contact patch outward relative to the wheel center. This adds POSITIVE
// camber at the contact patch — the tire leans away from the load.
//
// Formula (SAE radial tire compliance model for 55-series all-season H/V-rated):
//   sidewallCamber = (load / ratedLoad) × (sectionHeight / sectionWidth) × K
//   K = 1.2° — empirical coefficient for 55-series radial street tire
//   = load × SIDEWALL_COEFF   (°/lb)
//
// At RF apex load ~1300 lbs: +0.45° positive camber at contact patch.
// At RR load     ~1100 lbs: +0.38°
// At LF load      ~600 lbs: +0.21°
// This must be compensated with additional static negative camber.
//
// The sidewall camber is added to geometric ground camber BEFORE the grip calculation.
// camberGripFactor receives (geometricGroundCamber + sidewallCamber) as its input.
const TIRE = {
  ratedLoad:      1929,    // lbs — LI 103
  sectionHeight:  5.09,    // inches
  sectionWidth:   9.25,    // inches (235 mm)
  // 235/55R17 load-deflection: nearly linear at ~52.9 lbs/mm = 1345 lbs/in
  // K = 1.2° compliance coefficient for 55-series all-season radial
  sidewallCoeff: 1.2 * (5.09 / 9.25) / 1929, // °/lb ≈ 0.000342 °/lb
};

// Returns the sidewall-compliance camber addition (always positive — outward lean).
// This is added to geometric ground camber before grip evaluation.
function sidewallCamberDeg(cornerLoad) {
  return cornerLoad * TIRE.sidewallCoeff;
}

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
  const optHigh = 165;
  if (temp >= optLow && temp <= optHigh) return 1.0;
  if (temp < optLow) {
    const below = optLow - temp;
    return Math.max(0.75, 1 - Math.pow(below / 60, 2) * 0.25);
  }
  const above = temp - optHigh;
  return Math.max(0.70, 1 - Math.pow(above / 50, 2) * 0.30);
}

// Pressure grip factor — deviation from load-optimal hot PSI reduces grip.
// Uses optimalHotPsi() (empirically calibrated per corner) rather than raw load ratio.
// corner: 'LF'|'RF'|'LR'|'RR'
// 0.006/PSI = 0.6% grip per PSI of deviation. Floor 0.82 = 18% max loss.
function pressureGripFactor(hotPsi, tireLoad, corner) {
  const optPsi = corner ? optimalHotPsi(corner, tireLoad) : BASE_HOT_PSI.RF; // fallback
  const dev = Math.abs(hotPsi - optPsi);
  return Math.max(0.82, 1 - 0.006 * dev);
}

// Camber grip factor — operates in GROUND FRAME (tire-to-road angle).
// Ground camber is what actually determines contact patch loading.
//   groundCamber > 0: top of tire leans outward from car centerline (positive = bad for cornering)
//   groundCamber < 0: top leans inward (negative camber, loads outside edge)
//
// Conversion from chassis-frame effective camber:
//   RF (outside): groundCamber = effectiveCamber + cornerRoll  (chassis rolls away from corner)
//   LF (inside):  groundCamber = effectiveCamber - cornerRoll  (chassis rolls toward corner)
//   Rear (solid axle, outside): groundCamber = roll (no static camber, just body roll)
//   Rear (solid axle, inside):  groundCamber = -roll
//
// Ideal ground camber — the tire-to-road angle that maximizes grip at each corner.
//
//   RF (outside front, heavily loaded ~1,300–1,700 lbs at 0.8G):
//     −2.0° ground. Slight negative counters centrifugal crown and keeps full contact patch.
//     Calibrated for Ironman 235/55R17 tall sidewall; R-compound slicks need −2.5° to −3.0°.
//     Literature (NASCAR, IMCA baselines): −2.0° to −2.25° for street tires at heavy load.
//     Sidewall compliance adds +0.45° at RF load, so static must be set to ~−2.5° to reach −2.0° ground.
//     Back-calculate with I/O pyrometer splits to refine: even split = optimal.
//
//   LF (inside front, lightly loaded ~600–900 lbs at 0.8G):
//     +0.75° ground. NOT 0° — the optimum is a small positive ground angle.
//     At 0° ground (flat patch) the LF contributes maximum contact area but zero camber thrust.
//     Camber thrust on the lightly loaded inside tire sharpens turn-in response and aids rotation.
//     Research (short oval practice, tire physics): +0.5° to +1.0° ground is the practical optimum
//     where camber thrust benefit exceeds the modest contact patch reduction (~5% at +0.75°).
//     To achieve +0.75° ground: static LF ≈ +1.5° to +2° (chassis roll subtracts 1–2° in ground frame).
//     Going negative (insufficient positive, below +0.75°) loses camber thrust AND narrows the patch.
//     Going above +2° ground starts losing more patch than the camber thrust can recover.
//
//   RR (outside rear, solid axle): 0° ground — body roll is the only camber source; unavoidable.
//   LR (inside rear, solid axle): 0° ground — same; reduce body roll to minimize deviation.
const IDEAL_GROUND_CAMBER_RF   = -2.0;  // ° — outside front. Literature: −2.0° to −2.25° for street tires.
const IDEAL_GROUND_CAMBER_LF   = +0.75; // ° — inside front. Small positive: camber thrust > patch loss.
const IDEAL_GROUND_CAMBER_REAR =  0.0;  // ° — both rears (solid axle, no static adjustment).

// camberGripFactor — asymmetric, load-weighted penalty curve.
//
// WHY ASYMMETRIC:
//   RF (outside, heavily loaded): Insufficient camber (too positive) is ~1.6× more damaging than
//   over-camber (too negative). At insufficient camber, the outer edge lifts and lateral force drops
//   sharply. At over-camber, the inner edge carries load and some lateral force is retained.
//   Source: Pacejka tire model, JOES Racing / Speed Academy contact patch research.
//
//   LF (inside, lightly loaded): Going below the +0.75° ideal (toward 0° or negative) removes
//   camber thrust AND reduces the contact patch — double penalty. Going above +0.75° mainly just
//   reduces contact patch with modest camber thrust still present — single, gentler penalty.
//
// WHY LOAD-WEIGHTED:
//   Camber thrust coefficient scales nearly linearly with vertical load (Pacejka). A 1° deviation
//   costs more grip on the heavily loaded RF (~1.5%/°) than on the lightly loaded LF (~0.8%/°).
//   load parameter = actual corner load (lbs). Defaults to average load if omitted (F8/rear uses).
//
// PENALTY RATES (per degree of deviation from ideal ground camber):
//   RF insufficient (groundCamber > IDEAL_RF): 1.6%/° base + 0.4%/° per × average load
//   RF over-camber  (groundCamber < IDEAL_RF): 1.0%/° flat
//   LF too-low      (groundCamber < IDEAL_LF): 1.2%/° (loses both thrust and patch)
//   LF too-high     (groundCamber > IDEAL_LF): 0.7%/° (loses mostly patch, thrust still present)
//   Rear (both):    1.0%/° symmetric (no adjustment, informational only)
//   Floor: 0.88 (12% max loss) — unchanged.
function camberGripFactor(groundCamber, isOutside, isFront, load = VEH.weight / 4) {
  const avgLoad = VEH.weight / 4; // 1025 lbs

  if (!isFront) {
    // Rear solid axle — symmetric 1.0%/° (no adjustment possible, informational only)
    const ideal = IDEAL_GROUND_CAMBER_REAR;
    const dev = Math.abs(groundCamber - ideal);
    return Math.max(0.88, 1 - 0.010 * dev);
  }

  if (isOutside) {
    // RF: asymmetric. Insufficient camber penalizes harder than over-camber.
    const ideal = IDEAL_GROUND_CAMBER_RF;
    const dev = groundCamber - ideal; // positive = insufficient (too close to 0), negative = over-camber
    if (dev > 0) {
      // Insufficient: load-weighted penalty. At RF ~1,400 lbs: 1.6% + (1400/1025-1)×0.4% ≈ 1.75%/°
      const penalty = 0.016 + Math.max(0, (load / avgLoad - 1.0)) * 0.004;
      return Math.max(0.88, 1 - penalty * dev);
    } else {
      // Over-camber: gentler flat penalty
      return Math.max(0.88, 1 - 0.010 * Math.abs(dev));
    }
  } else {
    // LF: asymmetric. Below ideal loses both camber thrust and contact patch (steeper).
    //     Above ideal loses mainly contact patch (gentler — camber thrust still partially present).
    const ideal = IDEAL_GROUND_CAMBER_LF;
    const dev = groundCamber - ideal; // positive = above ideal, negative = below ideal
    if (dev < 0) {
      // Below ideal: double penalty (thrust lost + patch reduced)
      return Math.max(0.88, 1 - 0.012 * Math.abs(dev));
    } else {
      // Above ideal: gentler (mainly patch reduction, camber thrust still present)
      return Math.max(0.88, 1 - 0.007 * dev);
    }
  }
}

// Caster: modeled via mechanical trail — the correct physical mechanism.
//
// NOTE: Caster's camber gain effect is already fully captured in casterCamberGain
// (caster × CASTER_COEFF_RF for RF, × CASTER_COEFF_LF for LF — calibrated at 20° steer,
// scaled to actual oval steer angle 3.77° via sin ratio) which feeds into effectiveCamber →
// groundCamber → camberGripFactor. This function handles ONLY the steering
// torque / driveability effect of mechanical trail.
//
// Mechanical trail formula (side-view geometry, exact):
//   MT = R_tire × sin(caster_rad) − scrubRadius × cos(caster_rad)
//   R_tire = 13.6", scrubRadius ≈ 0.525" (positive = contact patch outboard of steering axis)
//
// Trail values across the P71 caster range:
//   3°  → 0.19"  (very light — little self-centering, car wanders)
//   5°  → 0.66"  (good light feel, within beneficial zone)
//   7°  → 1.13"  (solid self-centering, manageable without power steering)
//   9°  → 1.60"  (approaching workload limit at 27 mph)
//   9.75° → 1.79" (at/past fatigue threshold for slow no-power-steering oval)
//
// On a left-turn oval, RF trail has a BENEFICIAL self-aligning effect —
// it resists the car's tendency to chase the inside and reduces steering
// corrections mid-corner. Benefit peaks ~0.9–1.1", then excessive trail
// becomes a driver workload penalty above ~1.5".
//
// LF (inside tire): trail creates an opposing torque that fights turn-in
// and loads the inside edge. Optimal LF trail is low — 0.3–0.6".
// Above ~0.8" LF trail adds to push tendency.
//
// Sources: SAE mechanical trail geometry, circle-track caster research
// (iRacing/Speed Academy), DrRacing SAT model, P71 alignment community data.
//
// Realistic P71 stock-class range: RF 4.5–7.0°, LF 0.5–3.0°
const TRAIL_R   = 13.6;    // tire radius (inches)
const TRAIL_S   = 0.525;   // scrub radius (inches)

function mechanicalTrail(casterDeg) {
  const c = casterDeg * Math.PI / 180;
  return TRAIL_R * Math.sin(c) - TRAIL_S * Math.cos(c);
}

function casterGripFactor(casterDeg, isOutside, isFront) {
  if (!isFront) return 1.0;

  const trail = mechanicalTrail(casterDeg);

  if (isOutside) {
    // RF (outside in left turn): self-aligning trail is BENEFICIAL in the sweet spot.
    // Sweet spot: 0.6–1.2" — provides natural straight-tracking resistance.
    // Below 0.5": stability deficit, driver must steer actively → small penalty.
    // Above 1.5": steering torque exceeds comfortable range without power steering → penalty.
    // Above 2.0": severe workload/fatigue cost at slow oval speeds.
    // Modeled as a parabola peaking at 0.9" with asymmetric tails.
    const PEAK_TRAIL = 0.9;  // inches — peak of benefit curve
    if (trail < PEAK_TRAIL) {
      // Below peak: small stability deficit. 1% loss at 0" trail, 0 at peak.
      const deficit = (PEAK_TRAIL - trail) / PEAK_TRAIL;
      return Math.max(0.97, 1 - 0.010 * deficit * deficit * PEAK_TRAIL * PEAK_TRAIL);
    } else {
      // Above peak: driver workload penalty. Gentle to 1.5", steeper above.
      // At 1.5": ~0.5% loss. At 1.79" (9.75°): ~2.0%. At 2.0": ~3.5%. Floor 0.94.
      const excess = trail - PEAK_TRAIL;
      return Math.max(0.94, 1 - 0.055 * excess * excess);
    }
  } else {
    // LF (inside in left turn): trail creates torque that fights turn-in and
    // loads the inside edge. Optimal is low — 0.3–0.5". Above 0.8" adds push.
    // At 3° LF caster → trail ≈ 0.19" (near ideal).
    // At 6° LF caster → trail ≈ 0.88" (starting to hurt).
    // At 7° LF caster → trail ≈ 1.13" (noticeable push contribution).
    const OPTIMAL_LF = 0.35; // inches
    const excess = Math.max(0, trail - OPTIMAL_LF);
    return Math.max(0.96, 1 - 0.030 * excess * excess);
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
  // Each 1/4" of toe ≈ 0.1° scrub angle per wheel.
  // 0.08 coefficient → ~0.5% drag penalty at 1/4" toe, ~2% at 1/2" — calibrated to
  // measured lap-time sensitivity: ~0.08s per 1/4" additional toe on a 17.2s oval lap.
  const absToe = Math.abs(toeInches);
  return 1.0 + 0.08 * absToe * absToe;
}

// Temperature at which cold PSI is measured — where and when you inflated the tires.
// 68°F = cool garage (historical calibration default).
// 85-90°F = typical track-side inflation on a summer race day.
// This matters: inflating at 90°F vs 68°F changes the target cold PSI by ~4%.
const COLD_PSI_TEMP = 68; // °F — calibration default only; UI passes actual inflationTemp

// Hot pressure from cold + tire temp via ideal gas law: P2 = P1 × (T2/T1), absolute temps
// inflationTemp = temperature when cold PSI was set (not race ambient).
// At 200°F tires, cold set at 68°F: 34 × (200+460)/(68+460) = 42.5 PSI ✓
// At 200°F tires, cold set at 90°F: 34 × (200+460)/(90+460) = 40.8 PSI (lower — tire was
// already warm when set, so it rises less during racing).
function hotPressure(coldPsi, tireTemp, inflationTemp = COLD_PSI_TEMP) {
  return coldPsi * (tireTemp + RANKINE) / (inflationTemp + RANKINE);
}

// ============ SHOCK → ROLL STIFFNESS ============
// Rating 0 = stiffest, 10 = softest → roll contribution = 10 - rating
// geoCtx — resolved geometry for a specific car profile, threaded through calc functions.
// Produced by resolveGeoCtx() in analyzeSetup; defaults to VEH constants when null.
function tireLoadsCtx(lateralG, springLLTD, geoCtx) {
  if (!geoCtx) return tireLoads(lateralG, springLLTD);
  const { rcF, rcR, tw, rearSpringBase, icLateralFront } = geoCtx; // eslint-disable-line no-unused-vars
  const frontBias = geoCtx.frontBias ?? VEH.frontBias;
  const cgH       = geoCtx.cgHeight  ?? VEH.cgHeight;   // ft
  const mFront = VEH.weight * frontBias;
  const mRear  = VEH.weight * (1 - frontBias);

  // Geometric load transfer — IC lateral position shifts the effective moment arm.
  // When the IC is located laterally from the centerline, the resultant force vector
  // (centrifugal + gravity) has a longer moment arm to the roll center line.
  // Effective front moment arm length = sqrt(rcF² + icLateral²).
  // When icLateralFront is not measured, fall back to using rcF (vertical arm only).
  const frontMomentArm = icLateralFront != null
    ? Math.sqrt(rcF * rcF + icLateralFront * icLateralFront)
    : rcF;
  const geoFront = mFront * lateralG * frontMomentArm / tw;
  const geoRear  = mRear  * lateralG * rcR / tw;

  const avgRCH = frontBias * rcF + (1 - frontBias) * rcR;
  const elasticTotal = VEH.weight * lateralG * (cgH - avgRCH) / tw;

  // Rear elastic load transfer — if spring base width is measured, use it to compute
  // rear roll stiffness directly: k_roll_rear = k_spring × (springBase/2)².
  // Wider spring base increases rear roll resistance independent of spring rate.
  // When measured, replace the proportional rear elastic share with a physically correct split.
  let elasticFront, elasticRear;
  if (rearSpringBase != null) {
    const springR = BASE_SPRING_REAR * 12; // lbs/ft
    const halfBase = rearSpringBase / 2;   // ft
    const rearRollStiffness = springR * halfBase * halfBase * MR_REAR * MR_REAR; // lb-ft/rad
    // Front roll stiffness from spring rate with SLA motion ratio
    const springLF = BASE_SPRING_FRONT * 12;
    const halfTw   = tw / 2;
    const frontRollStiffness = springLF * halfTw * halfTw * MR_FRONT * MR_FRONT;
    const measuredLLTD = frontRollStiffness / (frontRollStiffness + rearRollStiffness);
    elasticFront = elasticTotal * measuredLLTD;
    elasticRear  = elasticTotal * (1 - measuredLLTD);
  } else {
    elasticFront = elasticTotal * springLLTD;
    elasticRear  = elasticTotal * (1 - springLLTD);
  }

  const rollRad = lateralG * 3.1 * Math.PI / 180;
  const arbFront = ARB.frontRollStiffness * rollRad / tw;
  const ltFront = geoFront + elasticFront + arbFront;
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

function shockStiffness(setup, geoCtx) {
  // Front spring: average LF+RF (may differ when different assemblies are used on each side).
  // Supports both new per-corner format { LF, RF, LR, RR } and legacy { front, rear }.
  const springLF = setup.springs?.LF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springRF = setup.springs?.RF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springF  = (springLF + springRF) / 2;
  const springR  = setup.springs?.LR ?? setup.springs?.rear  ?? BASE_SPRING_REAR;
  const springLLTD = (springF / BASE_SPRING_FRONT) /
    ((springF / BASE_SPRING_FRONT) + (springR / BASE_SPRING_REAR));

  // Load-weighted damper LLTD: RF (outside) carries more load in left turns and does more
  // transient work than LF (inside). Weight each shock's contribution by its corner's share
  // of the axle load at OVAL_CORNER_G using springLLTD only (no circularity — dampers not involved).
  const cornerLoads = tireLoadsCtx(OVAL_CORNER_G, springLLTD, geoCtx);
  const frontAxle = cornerLoads.LF + cornerLoads.RF;
  const rearAxle  = cornerLoads.LR + cornerLoads.RR;
  const rfFrac = cornerLoads.RF / frontAxle;   // ~0.62 — outside front carries more
  const lfFrac = cornerLoads.LF / frontAxle;   // ~0.38
  const rrFrac = cornerLoads.RR / rearAxle;    // ~0.65 — outside rear carries more
  const lrFrac = cornerLoads.LR / rearAxle;    // ~0.35

  const f = lfFrac * (10 - setup.shocks.LF) + rfFrac * (10 - setup.shocks.RF);
  const r = lrFrac * (10 - setup.shocks.LR) + rrFrac * (10 - setup.shocks.RR);

  const damperLLTD = f / Math.max(f + r, 1);
  // 60% springs (steady-state physics), 40% dampers (transient/adjustable)
  const frontLLTD = 0.6 * springLLTD + 0.4 * damperLLTD;
  // springLLTD exposed separately: used for mid-corner steady-state phase (shocks stopped moving)
  return { front: f, rear: r, total: f + r, frontLLTD, springLLTD, damperLLTD };
}

// Physical roll stiffness (lb-ft/rad) from spring rates and track geometry.
// Formula (Goodman 2009 §15.5): K_roll = K_wheel × (t/2)²
//   K_wheel = spring_rate × MR²  (§15.6, wheel rate via motion ratio)
//
// P71 front SLA (double A-arm): spring mounts to lower control arm at roughly mid-span.
//   MR_front ≈ 0.87 — spring displacement / wheel displacement in heave.
//   Exact value depends on spring pickup point along lower arm; 0.87 is a reasonable estimate
//   for the P71 geometry and is implicitly confirmed by the 3.1°/G baseline measurement.
//   TODO: measure spring pickup distance along lower arm to refine this value.
// P71 rear solid axle (Watts-link): spring sits directly on axle → MR_rear = 1.0.
//   Rear spring base (contact points on axle) = 37" — if geoCtx provides it, use it;
//   otherwise falls back to track width (conservative, over-estimates rear roll stiffness).
//
// ARB is included in front total (physically resists roll; already in lb-ft/rad units).
//
// Baseline validation (475 lbs/in front, 160 lbs/in rear, MR_front=0.87, tw=64"):
//   K_front_spring = (475×12) × (32/12)² × 0.87² = 5700 × 7.111 × 0.757 = 30,670 lb-ft/rad
//   K_rear_spring  = (160×12) × (32/12)²          = 1920 × 7.111          = 13,653 lb-ft/rad
//   K_total_spring = 30,670 + 13,653 = 44,323 lb-ft/rad (baseline index)
//   This baseline is stored as BASE_K_ROLL_SPRING and used to scale bodyRoll() to 3.1°/G.
const MR_FRONT = 0.87; // SLA front: spring-to-wheel motion ratio (heave) — estimate, see TODO above
const MR_REAR  = 1.00; // Solid rear axle: spring at wheel → MR = 1.0
const BASE_K_ROLL_SPRING = (() => {
  const tw = VEH.trackWidth; // ft
  const kFront = (BASE_SPRING_FRONT * 12) * Math.pow(tw / 2, 2) * MR_FRONT * MR_FRONT;
  const kRear  = (BASE_SPRING_REAR  * 12) * Math.pow(tw / 2, 2) * MR_REAR  * MR_REAR;
  return kFront + kRear; // lb-ft/rad at baseline springs, excluding ARB
})();

function rollStiffness(setup, geoCtx) {
  const springLF = setup.springs?.LF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springRF = setup.springs?.RF ?? setup.springs?.front ?? BASE_SPRING_FRONT;
  const springF  = (springLF + springRF) / 2;
  const springR  = setup.springs?.LR ?? setup.springs?.rear  ?? BASE_SPRING_REAR;
  const tw = (geoCtx?.tw ?? VEH.trackWidth); // ft
  // Rear spring base: measured distance between rear spring contact points on axle.
  // Narrower than track width — increases rear roll resistance relative to track-width estimate.
  const rearHalfBase = geoCtx?.rearSpringBase != null ? geoCtx.rearSpringBase / 2 : tw / 2;
  const mr = geoCtx?.mrFront ?? MR_FRONT; // use measured MR if available
  const kFront = (springF * 12) * Math.pow(tw / 2, 2) * mr * mr; // lb-ft/rad
  const kRear  = (springR * 12) * Math.pow(rearHalfBase, 2) * MR_REAR * MR_REAR;
  return kFront + kRear; // lb-ft/rad, springs only (ARB added separately in bodyRoll)
}

// Body roll angle (degrees) at given lateral G.
// Uses physically derived spring roll stiffness (Goodman 2009 §15.5) normalized to the
// empirically measured baseline: 3.1°/G at stock P71 springs (475F/160R) at actual corner G.
//
// The ratio (BASE_K_ROLL_SPRING / K_roll_spring) correctly scales roll angle as spring rates
// change relative to baseline, preserving the validated 3.1° measurement while using
// physical spring geometry rather than a normalized index.
//
// Dampers do NOT contribute to steady-state roll stiffness — they resist roll velocity,
// not roll angle. They affect how quickly the car reaches equilibrium, not where it settles.
function bodyRoll(lateralG, totalStiffness) {
  // totalStiffness is now K_roll_spring (lb-ft/rad) from rollStiffness().
  // Ratio to baseline scales the 3.1°/G measurement proportionally.
  const baseRoll = 3.1; // deg/G at baseline springs (measured: 3.1° at actual corner G)
  const stiffnessRatio = BASE_K_ROLL_SPRING / Math.max(totalStiffness, 1000);
  return lateralG * baseRoll * stiffnessRatio;
}

// ============ ANTI-ROLL BAR ============
// P71 front ARB: 29.5mm solid steel (stiffest factory Panther option).
// Estimated wheel rate: 475 lbs/in (published range 450–500; midpoint used).
// No factory rear ARB on P71.
//
// ARB load transfer is a THIRD component, separate from geometric and elastic:
//   ΔF_ARB = k_ARB × rollAngle_rad × (trackWidth / 2) / trackWidth
//           = k_ARB × rollAngle_rad / 2
// where rollAngle comes from body roll at the actual corner apex.
//
// Key distinction: ARB transfers load WITHOUT generating body roll visible to the springs.
// This is why the elastic model alone over-predicts RF hot pressure by ~2.5 PSI — the ARB
// is doing load transfer work that the springs don't see.
//
// ARB roll stiffness (lb-ft/rad) = k_wheel_lbft × (t/2 in ft)²
//   k_wheel in lbs/ft = 475 lbs/in × 12 in/ft = 5700 lbs/ft
//   (t/2) = 64/2 in = 32 in = 2.667 ft (measured track width)
//   k_roll = 5700 × 2.667² = 5700 × 7.111 = 40,533 lb-ft/rad
// At OVAL_CORNER_G (lap-average roll ≈ 1.26° = 0.022 rad):
//   ΔF_ARB = 40,533 × 0.022 / (64/12 ft) = 892 / 5.333 ≈ 167 lbs
//   → ~2.6 PSI on RF — matches the observed gap ✓
const ARB = {
  frontWheelRate: 475,       // lbs/in — P71 29.5mm solid bar, estimated midpoint
  rearWheelRate:  0,         // lbs/in — no rear ARB on P71
  trackWidth:     64,        // inches — measured front track width
};
// lb-ft/rad: convert wheel rate to lbs/ft first, then multiply by (t/2 in ft)²
ARB.frontRollStiffness = (ARB.frontWheelRate * 12) * Math.pow((ARB.trackWidth / 2) / 12, 2); // lb-ft/rad ≈ 39,277

// ============ WEIGHT TRANSFER ============
// Total lateral load transfer has THREE components per axle (Dixon / Kelvin Tse + ARB):
//
//   1. GEOMETRIC (inelastic/link) load transfer — through suspension links, independent of
//      spring/shock settings. Determined by axle mass and roll center height.
//        ΔF_geo,i = (m_i × h_RC,i × a_y) / t_i
//
//   2. ELASTIC (roll stiffness) load transfer — through springs, creates body roll.
//      Distributed front/rear by the roll stiffness ratio k_φ,f / (k_φ,f + k_φ,r).
//      This maps to springLLTD (springs only — dampers do not contribute to steady-state
//      roll stiffness and must not be included here).
//        ΔF_e,f = (k_φ,f / (k_φ,f + k_φ,r)) × [m_f(h_CG-h_RC,f) + m_r(h_CG-h_RC,r)] × a_y / t_f
//
//   3. ARB load transfer — through the anti-roll bar, front axle only (no rear ARB on P71).
//      Does NOT create additional body roll — bar twists and transfers load directly.
//        ΔF_ARB,f = k_ARB_roll × rollAngle_rad / t_f
//
// Front RCH = 3" (measured, SLA geometry).
// Rear  RCH = 4" (estimated, Watts-link solid axle — no published Ford spec).
function tireLoads(lateralG, springLLTD) {
  const mFront = VEH.weight * VEH.frontBias;       // front axle weight share (lbs)
  const mRear  = VEH.weight * (1 - VEH.frontBias); // rear axle weight share (lbs)

  // Geometric (link) load transfer per axle — independent of spring/shock settings
  const geoFront = mFront * lateralG * VEH.rollCenterHeight     / VEH.trackWidth;
  const geoRear  = mRear  * lateralG * VEH.rollCenterHeightRear / VEH.trackWidth;

  // Elastic load transfer — total moment arm is algebraically equivalent to textbook:
  //   m_f(h_CG - h_RC,f) + m_r(h_CG - h_RC,r) = weight × (h_CG - avgRCH)
  const avgRCH = VEH.frontBias * VEH.rollCenterHeight + (1 - VEH.frontBias) * VEH.rollCenterHeightRear;
  const elasticTotal = VEH.weight * lateralG * (VEH.cgHeight - avgRCH) / VEH.trackWidth;

  // Elastic distributed by spring roll stiffness ratio only (k_φ,f / (k_φ,f + k_φ,r))
  // Dampers do not resist steady-state roll — springLLTD is the correct distribution ratio here.
  const elasticFront = elasticTotal * springLLTD;
  const elasticRear  = elasticTotal * (1 - springLLTD);

  // ARB load transfer (front axle only — no rear ARB on P71).
  // Uses lap-average body roll angle at baseline spring stiffness (3.1 deg/G × lateralG).
  // Since tireLoads() doesn't receive setup, approximate roll at lateralG using baseline stiffness.
  // This is conservative (stiffer actual setup → less roll → slightly less ARB LT).
  // At OVAL_CORNER_G lateralG: matches the empirically observed 2.5 PSI RF gap exactly.
  const rollDeg = lateralG * 3.1; // baseline roll rate deg/G × lateralG
  const rollRad = rollDeg * Math.PI / 180;
  const arbFront = ARB.frontRollStiffness * rollRad / VEH.trackWidth; // lbs

  // Total load transfer per axle
  const ltFront = geoFront + elasticFront + arbFront;
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

// ============ PERFORMANCE METRIC ============
const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const OUTSIDE = { LF: false, RF: true, LR: false, RR: true };
const IS_FRONT = { LF: true, RF: true, LR: false, RR: false };

function calcPerformance(setup, tires, inflationTemp = COLD_PSI_TEMP, geoCtx = null) {
  const refG = 1.0;
  const ss = shockStiffness(setup, geoCtx);
  const loads = tireLoadsCtx(refG, ss.springLLTD, geoCtx);
  // Pressure optimum uses actual cornering G — 1G loads give absurd optPsi (52 PSI RF, 14 PSI LF)
  const cornerLoads = tireLoadsCtx(OVAL_CORNER_G, ss.springLLTD, geoCtx);
  const roll = bodyRoll(refG, rollStiffness(setup, geoCtx));

  // Toe and caster from setup (with defaults for backward compat)
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  // Actual body roll at the corner apex — used for both front ground-camber conversion
  // and rear solid-axle ground camber. Computed once here, shared across all corners.
  // MUST use OVAL_RACING_G (instantaneous apex G = 0.813), NOT OVAL_CORNER_G (lap-average G = 0.407).
  // OVAL_CORNER_G is correct only for tire pressure/thermal load averages — not for
  // instantaneous suspension geometry at the corner apex.
  const cornerRoll = roll * OVAL_RACING_G;

  let totalForce = 0;
  let frontForce = 0;
  let rearForce = 0;

  for (const c of CORNERS) {
    const load = loads[c];
    // Use average temp for grip calculation
    const avgTemp = tires[c].temp;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);
    let mu = 1.0;

    // Temperature
    mu *= tempGripFactor(avgTemp);

    // Pressure — use actual cornering loads (not 1G) for realistic optPsi
    mu *= pressureGripFactor(hp, cornerLoads[c], c);

    // Camber (with caster-induced dynamic camber for fronts)
    const outside = OUTSIDE[c];
    const front = IS_FRONT[c];
    if (front) {
      // Caster camber gain: geometric ≈ caster × sin(steer_angle), ~0.18/deg at 10° steer.
      // The two front wheels go OPPOSITE directions: RF (outside) gains negative, LF (inside)
      // gains positive. This is the caster geometry — same effect on both SLA and MacPherson.
      const casterCamberGain = outside
        ? -(caster[c] * CASTER_COEFF_RF * refG)  // RF: calibrated at 20° steer, scaled to 3.77° apex
        :  (caster[c] * CASTER_COEFF_LF * refG); // LF: calibrated at 20° steer, scaled to 3.77° apex
      // SLA body roll camber at actual corner apex (cornerRoll = roll × OVAL_RACING_G).
      // RF (outside, jounce): SLA gains NEGATIVE camber — key advantage over MacPherson.
      // LF (inside, droop): gains POSITIVE camber — same direction as MacPherson droop.
      // SLA jounce coefficient: 1.7" wheel displacement at 3.1° roll → 1.1° camber gain.
      //   1.1° / 3.1° = 0.355°/° roll.
      // Droop coefficient measured 2026-04-22: LF 2.0 deg/in × 0.383 in/deg-roll = 0.766
      //   RF 0.857 deg/in × 0.383 = 0.328. Average 0.547. Use LF value for inside droop.
      const jounceRF = geoCtx?.jounceRF ?? 0.355;
      const droopLF  = geoCtx?.droopLF  ?? 0.547;
      const bodyRollCamber = outside
        ? -(cornerRoll * jounceRF)
        :  (cornerRoll * droopLF);
      // KPI camber: steering adds +positive on outside (RF), -negative on inside (LF).
      // Formula: KPI_deg × (1 - cos(steerAngle)). At 10° steer: 9.5° × 0.01519 ≈ +0.144°
      const kpiCamber = outside ? GEOM.kpiCamberGain : -GEOM.kpiCamberGain;
      const effectiveCamber = setup.camber[c] + casterCamberGain + bodyRollCamber + kpiCamber;
      // Convert chassis-frame effective camber → ground-frame (tire-to-road) angle.
      // RF (outside): chassis rolls away from corner → ground = effective + cornerRoll
      // LF (inside):  chassis rolls toward corner  → ground = effective − cornerRoll
      const geomGroundCamber = outside
        ? effectiveCamber + cornerRoll
        : effectiveCamber - cornerRoll;
      // Add sidewall compliance camber: loaded sidewall deflects outward, adding positive camber
      // at the contact patch regardless of which corner. Uses actual corner load (not refG load).
      const groundCamber = geomGroundCamber + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, true, cornerLoads[c]);
      // Caster direct effect (trail, stability)
      mu *= casterGripFactor(caster[c], outside, true);
    } else {
      // Solid rear axle: no static camber. Body roll IS the ground-frame camber.
      // Outside rear leans away (positive ground camber), inside leans in (negative).
      const groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      mu *= camberGripFactor(groundCamber, outside, false);
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

  // LLTD driveability: quadratic drag for setups far from optimal LLTD.
  // Optimal oval LLTD ≈ 0.46 (recommended asymmetric setup).
  // ±0.05 dev: ~0.75%, ±0.10: ~3%, ±0.20: ~11%, ±0.35: ~27%. Floor 85%.
  // Stronger penalty needed to disfavor balanced-front (LF=9/RF=9) setups
  // that push LLTD to 0.33 — those are genuinely hard to drive on an oval.
  const OPTIMAL_LLTD = 0.46;
  const lltdDev = Math.abs(ss.frontLLTD - OPTIMAL_LLTD);
  totalForce *= Math.max(0.85, 1 - 3.0 * lltdDev * lltdDev);

  // Toe drag penalty on straights (reduces overall performance slightly)
  const dragPenalty = toeDragFactor(toe);
  totalForce /= dragPenalty;

  return totalForce / VEH.weight;
}

// ============ WORK FACTORS (for thermal model) ============
function calcWorkFactors(setup, geoCtx) {
  const ss = shockStiffness(setup, geoCtx);
  const loads = tireLoadsCtx(1.0, ss.springLLTD, geoCtx);
  const avgLoad = VEH.weight / 4;
  return {
    LF: loads.LF / avgLoad,
    RF: loads.RF / avgLoad,
    LR: loads.LR / avgLoad,
    RR: loads.RR / avgLoad,
  };
}

// Compute steady-state equilibrium refTires for any setup + wfFn.
// Used by testGain and optSetup so that load→temperature cascades correctly
// when shocks change: stiffer shock → more load on that corner → higher equil temp → grip change.
function eqTires(setup, ambientTemp, wfFn) {
  const wf = wfFn(setup);
  const tires = {};
  for (const c of CORNERS) {
    const tEq = ambientTemp +
      (THERMAL.heatBase + THERMAL.heatLoad * wf[c] * THERMAL.refSpeed) / THERMAL.coolRate;
    tires[c] = { temp: tEq, inside: tEq, middle: tEq, outside: tEq, wear: 0 };
  }
  return tires;
}

// ============ I/M/O TIRE TEMPERATURE UPDATE ============
// Each tire tracks inside, middle, outside temperatures separately.
// The "temp" field is the average used for grip calculations.
function updateTireTemps(tires, workFactors, ambient, lapTime, setup, inflationTemp = COLD_PSI_TEMP) {
  const newTires = {};
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };
  // Body roll used for both rear solid-axle camber and SLA front camber
  const roll = bodyRoll(1.0, rollStiffness(setup));

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
      // Caster gain: RF (outside) gains negative, LF (inside) gains positive — geometric.
      const casterGain = outside
        ? -(caster[c] * CASTER_COEFF_RF)
        :  (caster[c] * CASTER_COEFF_LF);
      camberVal += casterGain;
    } else {
      // Rear: body roll effect (solid axle)
      camberVal = outside ? roll : -roll;
    }

    // Camber shifts heat distribution within the tire (I/M/O zones).
    // Calibrated against 4-session pyrometer dataset (87–95°F, 25-lap oval races):
    //
    //   Outside tires (RF, RR): centrifugal cornering load dominates zone distribution.
    //     The base outsideTire mults [0.82, 1.0, 1.18] already capture this correctly.
    //     Applying a camberShift here moves heat the wrong direction — zero it out.
    //
    //   Inside front (LF): camber loads the inside (motor-side) edge, compounded by
    //     steering scrub from toe-out. Observed inside-outside deltas are large.
    //     Coefficient 0.04/deg matches multi-session pyrometer data.
    //
    //   Inside rear (LR): solid rear axle rolls with the body but no steering scrub.
    //     The body-roll camber effect is much weaker in practice (nearly flat I/O pattern
    //     observed). Use a small coefficient (0.008) to avoid over-predicting the spread.
    let camberShift;
    if (outside) {
      camberShift = 0;                    // centrifugal load dominates; base mults are correct
    } else if (front) {
      camberShift = -camberVal * 0.04;    // camber + steering scrub; calibrated to pyrometer data
    } else {
      camberShift = -camberVal * 0.008;   // body roll only, no scrub; small effect
    }
    const insideMult = zoneMults[0] + camberShift;
    const middleMult = zoneMults[1];
    const outsideMult = zoneMults[2] - camberShift;

    // Toe effect on temperature: toe out heats inside edges of both fronts
    // Coefficient updated to 0.05 (from 0.03) based on observed LF inside-hot pattern.
    let toeInsideBoost = 0;
    let toeOutsideBoost = 0;
    if (front) {
      toeInsideBoost  = -toe * 0.05;   // toe out → positive boost to inside
      toeOutsideBoost =  toe * 0.03;   // toe out → slight cooling of outside
    }

    // Pressure effect on temperature: over-inflation → hotter middle
    const avgTemp = (tires[c].inside + tires[c].middle + tires[c].outside) / 3;
    const hp = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);
    const cornerLoadsTherm = tireLoads(OVAL_CORNER_G, shockStiffness(setup).springLLTD);
    const optPsi = optimalHotPsi(c, cornerLoadsTherm[c]);
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
// How aggressively grip improvements translate to lap time gains.
// 0.55 was too aggressive — gave 16.3s optimal vs real fastest 17.1.
// 0.28 caps the theoretical perfect setup at ~16.8s (realistic for short oval
// where straight time is engine-limited and grip has diminishing returns).
const LAP_SENSITIVITY = 0.28;

let _baselineMetric = null;

function getBaselineMetric() {
  if (_baselineMetric === null) {
    const calibTires = {
      LF: { inside: 104, middle: 102, outside: 94, temp: 100, wear: 0 },
      RF: { inside: 106, middle: 113, outside: 131, temp: 117, wear: 0 },
      LR: { inside: 101, middle: 102, outside: 91, temp: 98, wear: 0 },
      RR: { inside: 100, middle: 117, outside: 130, temp: 116, wear: 0 },
    };
    _baselineMetric = calcPerformance(DEFAULT_SETUP, calibTires);
  }
  return _baselineMetric;
}

function metricToLapTime(metric) {
  const base = getBaselineMetric();
  return BASELINE_LAP * Math.pow(base / metric, LAP_SENSITIVITY);
}

// Physics-derived speeds.
// Corner: back-calculated from 17.4s baseline via kinematics (see suggested.md §2).
//   v_corner = sqrt(OVAL_RACING_G × g × OVAL_RACING_R) ≈ 47.6 mph on the effective racing line.
//   NOT derived from OVAL_CORNER_G (0.375) — that is a pressure/load calibration constant.
// Straight peak: car accelerates from corner exit to peak then brakes back to corner entry.
//   v_peak² = v_corner² + 2·a_acc·L·a_brake / (a_acc + a_brake)
function metricToSpeeds(metric) {
  const scale = Math.sqrt(metric / getBaselineMetric());

  // Corner speed from back-calculated actual racing G and effective racing line radius
  const v_corner = Math.sqrt(OVAL_RACING_G * G * OVAL_RACING_R);              // ft/s ≈ 69.8 (47.6 mph)
  const cornerBaseMph = v_corner / 1.4667;

  // Engine thrust force at low speed (2nd gear, conservative peak-torque estimate)
  const f_engine = VEH.peakTorque * VEH.gear2Ratio * VEH.driveEff / VEH.tireRadius;
  const a_acc   = f_engine / VEH.mass;                                        // ft/s²
  const a_brake = VEH.brakingG * G;                                           // ft/s²

  // Peak speed over the straight (acceleration then braking back to corner speed)
  const v_peak_sq = v_corner * v_corner +
    2 * a_acc * TRACK.straightLength * a_brake / (a_acc + a_brake);
  const straightBaseMph = Math.sqrt(v_peak_sq) / 1.4667;

  return {
    cornerMph: Math.round(cornerBaseMph * scale * 10) / 10,
    peakMph:   Math.round(straightBaseMph * scale * 10) / 10,
  };
}

// ============ DEFAULT SETUP (user's current) ============
export const DEFAULT_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: 2.75, RF: -2.25 }, // measured 2026-04-22
  caster: { LF: 9.0, RF: 3.0 },    // current alignment (2026-04-22 post strut swap)
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ RECOMMENDED SETUP ============
// Grid-searched over 419,904 combinations of available shocks (all unique rating×spring tuples),
// caster (3.0–7.0° in 0.5° steps), camber sweep, analytically derived PSI, fixed toe −0.25".
//
// Best lap: 17.261s @ 90°F (vs 17.4s baseline @ 65°F) — gain: −0.139s.
// Top cluster: multiple shock combos tie at 17.261s (LF=4/RF=4, LF=6/RF=3, LF=1/RF=6 all hit ~46% LLTD).
// This entry uses LF=4/RF=4 (both FCS 1336349 Police/Taxi, 475 lbs/in) — most practical symmetric option.
//
// Updated 2026-04-14: load-weighted damper LLTD fix — RF shock (outside, 62% of front load)
// now weighted ~1.65× more than LF in the LLTD calculation.
// Updated 2026-04-22: cold PSI recalculated for ARB (+165 lbs RF), rear RCH 18", frontBias 0.57.
//   Optimal hot: RF 45, LF 23, RR 37, LR 15 PSI. Back-calculated at equilibrium temps (68°F inflation).
export const RECOMMENDED_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 1, RR: 1 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: 2.5, RF: -3.25 },
  caster: { LF: 3.0, RF: 5.5 },
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ PETE SETUP ============
// Pete's race setup — LF/RF FCS 1336349 (rating 4), LR/RR KYB 555603 (rating 2)
export const PETE_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: -2.25, RF: -2.75 },
  caster: { LF: 3.5, RF: 8.0 },
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ DYLAN SETUP ============
// Dylan's race setup — LF/RF FCS 1336349 (rating 4), LR/RR KYB 555603 (rating 2)
export const DYLAN_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: -2.0, RF: -2.75 },
  caster: { LF: 4.0, RF: 3.25 },
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ JOSH SETUP ============
// Josh's race setup — LF/RF FCS 1336349 (rating 4), LR/RR KYB 555603 (rating 2)
export const JOSH_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: -0.75, RF: -1.75 },
  caster: { LF: 5.0, RF: 7.0 },
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ JOEY SETUP ============
// Joey's race setup — LF/RF KYB SR4140 (rating 6, 440 lbs/in spring), LR/RR KYB 554355 (rating 4)
export const JOEY_SETUP = {
  shocks: { LF: 6, RF: 6, LR: 4, RR: 4 },
  springs: { LF: 440, RF: 440, LR: 160, RR: 160 },
  camber: { LF: 1.0, RF: -3.5 },
  caster: { LF: 6.0, RF: 5.0 },
  toe: -0.25,
  coldPsi: { LF: 20, RF: 38, LR: 16, RR: 35 },
};

// ============ FIGURE 8 DEFAULT SETUP ============
// Retained as a symmetric reference setup for the F8 optimizer.
export const DEFAULT_SETUP_F8 = {
  shocks: { LF: 4, RF: 4, LR: 3, RR: 3 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: -2.5, RF: -2.5 },
  caster: { LF: 4.0, RF: 4.0 },
  toe: -0.25,
  coldPsi: { LF: 34, RF: 34, LR: 29, RR: 29 },
};

// ============ FIGURE 8 BASELINE SETUP ============
// Real-world calibration run: 20 laps @ 75°F → 23.283s best lap.
// LF/RF: FCS 1336349 (rating 4), LR/RR: KYB 555603 (rating 2)
// Camber: LF -2.75° RF -3.0°  Caster: LF 5.5° RF 3.75°
// Cold PSI: all fronts 35, all rears 30
// Pyrometer (avg): LF I:133 M:130 O:136, RF I:125 M:125 O:120,
//                  LR I:128 M:129 O:127, RR I:120 M:121 O:120
// NOTE: LF runs ~10°F hotter than RF, LR ~8°F hotter than RR.
//   Cause: asymmetric caster (LF 5.5° vs RF 3.75°) loads LF harder when it is
//   the outside tire in right turns. The symmetric F8 thermal model cannot predict
//   this L/R difference; right-side temps (RF/RR) are the best model calibration point.
export const F8_BASELINE_SETUP = {
  shocks: { LF: 4, RF: 4, LR: 2, RR: 2 },
  springs: { LF: 475, RF: 475, LR: 160, RR: 160 },
  camber: { LF: -2.75, RF: -3.0 },
  caster: { LF: 5.5, RF: 3.75 },
  toe: -0.25,
  coldPsi: { LF: 35, RF: 35, LR: 30, RR: 30 },
};

// ============ MAIN SIMULATION ============
export function simulateRace(setup, ambientTemp = 65, numLaps = 25, inflationTemp = COLD_PSI_TEMP) {
  // Initialize tires with I/M/O at slightly above ambient
  let tires = {};
  for (const c of CORNERS) {
    const initTemp = ambientTemp + 5;
    tires[c] = { inside: initTemp, middle: initTemp, outside: initTemp, temp: initTemp, wear: 0 };
  }

  const workFactors = calcWorkFactors(setup);
  const laps = [];

  for (let i = 1; i <= numLaps; i++) {
    const metric = calcPerformance(setup, tires, inflationTemp);
    const lapTime = metricToLapTime(metric);
    const speeds = metricToSpeeds(metric);

    // Hot pressures (based on avg temp)
    const hPsi = {};
    for (const c of CORNERS) {
      hPsi[c] = Math.round(hotPressure(setup.coldPsi[c], tires[c].temp, inflationTemp) * 10) / 10;
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
    tires = updateTireTemps(tires, workFactors, ambientTemp, lapTime, setup, inflationTemp);
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
// Optional geoOverrides shape:
// {
//   rcHeightFront:    number (inches),  // measured front roll center height
//   rcHeightRear:     number (inches),  // measured rear roll center height (Watts pivot)
//   trackWidthFront:  number (inches),  // measured front track width
//   slaJounceCoeffRF: number (°/°roll), // from 57.3/fvsa_rf × wheelDisp/degRoll
//   slaDroopCoeffLF:  number (°/°roll), // from 57.3/fvsa_lf × wheelDisp/degRoll
//   rearSpringBase:   number (inches),  // measured rear spring perch base width
//   icLateralFront:   number (inches),  // IC lateral distance from centerline
//   mrFront:          number,           // front spring motion ratio (springPickup/armLength)
//   cgHeight:         number (inches),  // measured CG height
//   frontBias:        number (0-1),     // measured front weight fraction (from corner scales)
// }
// When a field is omitted or null, the hardcoded VEH constant is used.
export function analyzeSetup(setup, ambientTemp = 65, inflationTemp = COLD_PSI_TEMP, geoOverrides = null) {
  const geo = geoOverrides || {};
  // Resolve geometry — use measured values when provided, fall back to hardcoded VEH constants.
  // Bundle into geoCtx so every downstream function (calcPerformance, calcWorkFactors, shockStiffness)
  // uses the same measured values consistently — including testGain() recommendation calculations.
  const geoCtx = geoOverrides ? {
    rcF:            (geo.rcHeightFront   != null ? geo.rcHeightFront   : VEH.rollCenterHeight     * 12) / 12, // ft
    rcR:            (geo.rcHeightRear    != null ? geo.rcHeightRear    : VEH.rollCenterHeightRear * 12) / 12, // ft
    tw:             (geo.trackWidthFront != null ? geo.trackWidthFront : VEH.trackWidth           * 12) / 12, // ft
    jounceRF:       geo.slaJounceCoeffRF  != null ? geo.slaJounceCoeffRF  : 0.355,  // °/° roll
    droopLF:        geo.slaDroopCoeffLF   != null ? geo.slaDroopCoeffLF   : 0.547,  // °/° roll
    rearSpringBase: geo.rearSpringBase    != null ? geo.rearSpringBase / 12 : null,  // ft
    icLateralFront: geo.icLateralFront    != null ? geo.icLateralFront / 12 : null,  // ft
    mrFront:        geo.mrFront           != null ? geo.mrFront            : null,   // dimensionless
    cgHeight:       geo.cgHeight          != null ? geo.cgHeight / 12       : null,  // ft (null → VEH.cgHeight used in tireLoadsCtx)
    frontBias:      geo.frontBias         != null ? geo.frontBias           : null,  // fraction (null → VEH.frontBias)
  } : null;

  const ss = shockStiffness(setup, geoCtx);
  const loads = tireLoadsCtx(1.0, ss.springLLTD, geoCtx);
  // Use actual cornering G for pressure targets — 1G gives absurd RF/LF optPsi
  const cornerLoads = tireLoadsCtx(OVAL_CORNER_G, ss.springLLTD, geoCtx);
  const avgLoad = VEH.weight / 4;
  const roll = bodyRoll(1.0, rollStiffness(setup, geoCtx));
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  // ── Desired roll angle per axle end (Circle Track balance method) ──
  // A balanced setup means both ends want to roll to the same angle at a given lateral G.
  // When front and rear desired roll angles match, weight transfer is proportionate and
  // tires run at ideal temperatures end-to-end. Mismatch > 1° indicates structural imbalance.
  //
  // Formula: desiredRollAngle_deg = (axleMass × lateralG × rollMomentArm) / rollStiffness_lbft_per_rad
  //   rollMomentArm = CG height minus roll center height (ft)
  //   rollStiffness_lbft_per_rad: computed from spring rate × (half track or half spring base)²
  //
  // Front roll stiffness: spring rate × (half track width)²
  //   Uses average of LF+RF spring rate (may differ). Track width = tw (measured or VEH default).
  const rcF_ds = geoCtx?.rcF ?? VEH.rollCenterHeight;
  const rcR_ds = geoCtx?.rcR ?? VEH.rollCenterHeightRear;
  const tw_ds  = geoCtx?.tw  ?? VEH.trackWidth;
  const springLF_ds = (setup.springs?.LF ?? setup.springs?.front ?? BASE_SPRING_FRONT) * 12; // lbs/ft
  const springRF_ds = (setup.springs?.RF ?? setup.springs?.front ?? BASE_SPRING_FRONT) * 12;
  const springR_ds  = (setup.springs?.LR ?? setup.springs?.rear  ?? BASE_SPRING_REAR)  * 12;
  // Apply motion ratio squared (Goodman §15.6): K_wheel = K_spring × MR²
  // Front SLA MR=0.87 (spring pickup at mid-span of lower arm), rear solid axle MR=1.0.
  const frontRollStiffness = ((springLF_ds + springRF_ds) / 2) * Math.pow(tw_ds / 2, 2) * MR_FRONT * MR_FRONT; // lb-ft/rad
  // Rear: use measured spring base if available, otherwise use track width (conservative for solid axle)
  const rearHalfBase = geoCtx?.rearSpringBase != null ? geoCtx.rearSpringBase / 2 : tw_ds / 2;
  const rearRollStiffness  = springR_ds * Math.pow(rearHalfBase, 2) * MR_REAR * MR_REAR; // lb-ft/rad
  // Include ARB in front roll stiffness (it resists front roll directly)
  const frontRollStiffnessTotal = frontRollStiffness + ARB.frontRollStiffness;
  const mFront_ds = VEH.mass * VEH.frontBias * G; // lbs (sprung mass approximation)
  const mRear_ds  = VEH.mass * (1 - VEH.frontBias) * G;
  const frontMomentArm_ds = VEH.cgHeight - rcF_ds; // ft
  const rearMomentArm_ds  = VEH.cgHeight - rcR_ds;  // ft
  // Desired roll angle in degrees at OVAL_CORNER_G (lap-average lateral G for steady-state balance)
  const desiredRollFront = (mFront_ds * OVAL_CORNER_G * frontMomentArm_ds / frontRollStiffnessTotal) * (180 / Math.PI);
  const desiredRollRear  = (mRear_ds  * OVAL_CORNER_G * rearMomentArm_ds  / rearRollStiffness)       * (180 / Math.PI);
  const rollAngleImbalance = Math.abs(desiredRollFront - desiredRollRear);

  // Steady-state equilibrium temps from thermal model
  const workFactors = calcWorkFactors(setup, geoCtx);
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

    // Pressure — use actual cornering G loads (not 1G) for realistic optPsi
    // At OVAL_CORNER_G: RF≈45 PSI, LF≈23 PSI, RR≈37 PSI, LR≈15 PSI
    // (includes ARB +165 lbs RF, rear RCH 18", frontBias 0.57)
    const hp = hotPressure(setup.coldPsi[c], tEq, inflationTemp);
    const optHotPsi = optimalHotPsi(c, cornerLoads[c]);
    const psiDev = hp - optHotPsi;
    const psiGripFactor = pressureGripFactor(hp, cornerLoads[c], c);
    const minHot = MIN_HOT_PSI[c] ?? 12;
    const maxHot = MAX_HOT_PSI[c] ?? 51;
    const isPresLimited = optHotPsi < minHot || optHotPsi > maxHot;
    const recHotPsi = Math.min(Math.max(minHot, optHotPsi), maxHot);
    const recColdPsi = recHotPsi * (inflationTemp + RANKINE) / (tEq + RANKINE);

    // Camber — all calculations in GROUND FRAME (tire-to-road angle)
    // Ground camber > 0 = top of tire leans outward (bad for cornering load)
    // Ground camber < 0 = top leans inward (negative camber, loads outside tread)
    const cornerRoll = roll * OVAL_RACING_G; // body roll at corner apex (instantaneous, not lap-average)
    let groundCamber, idealGroundCamber, camberDev, camberFactor;
    let casterGain = 0, casterFactor = 1, optStaticCamber = null, bodyRollCamber = 0, kpiCamber = 0, swCamber = 0;
    let effectiveCamber = null; // chassis-relative, exposed for display only
    let alignmentOutOfRange = false;

    if (front) {
      // Caster gain: RF (outside) gains negative, LF (inside) gains positive — geometric.
      casterGain = outside ? -(caster[c] * CASTER_COEFF_RF) : (caster[c] * CASTER_COEFF_LF);
      // SLA body roll camber at actual corner apex (cornerRoll = roll × OVAL_RACING_G).
      bodyRollCamber = outside
        ? -(cornerRoll * (geoCtx?.jounceRF ?? 0.355))
        :  (cornerRoll * (geoCtx?.droopLF  ?? 0.547));
      // KPI camber: +positive on outside (RF), -negative on inside (LF). ≈ ±0.144°.
      kpiCamber = outside ? GEOM.kpiCamberGain : -GEOM.kpiCamberGain;
      effectiveCamber = setup.camber[c] + casterGain + bodyRollCamber + kpiCamber;
      // Convert chassis-relative → ground frame
      // RF (outside): chassis rolls away → groundCamber = effective + cornerRoll
      // LF (inside):  chassis rolls toward → groundCamber = effective - cornerRoll
      const geomGroundCamber = outside
        ? effectiveCamber + cornerRoll
        : effectiveCamber - cornerRoll;
      // Sidewall compliance camber: loaded sidewall deflects outward (+positive) at contact patch.
      swCamber = sidewallCamberDeg(cornerLoads[c]);
      groundCamber = geomGroundCamber + swCamber;
      idealGroundCamber = outside ? IDEAL_GROUND_CAMBER_RF : IDEAL_GROUND_CAMBER_LF;
      camberDev = Math.abs(groundCamber - idealGroundCamber);
      camberFactor = camberGripFactor(groundCamber, outside, true, cornerLoads[c]);
      casterFactor = casterGripFactor(caster[c], outside, true);
      // Optimal static camber: back-calculate from ideal ground camber including sidewall offset.
      // idealGround = geomGround + swCamber
      //             = (static + casterGain + bodyRollCamber + kpiCamber ± cornerRoll) + swCamber
      // → static = idealGround - swCamber - casterGain - bodyRollCamber - kpiCamber ∓ cornerRoll
      const effectiveIdeal = outside
        ? idealGroundCamber - swCamber - cornerRoll
        : idealGroundCamber - swCamber + cornerRoll;
      optStaticCamber = Math.round((effectiveIdeal - casterGain - bodyRollCamber - kpiCamber) * 4) / 4;
      // RF (outside front) must always be negative static camber — clamp at 0.
      // A positive result means the model geometry is at an extreme but the physical answer
      // is still "as much negative camber as the hardware allows", not positive.
      if (outside) optStaticCamber = Math.min(optStaticCamber, 0.0);
      // Check against P71 hardware alignment range with camber bolt installed.
      // Camber bolts are assumed always present — they replace one or both front strut pinch bolts
      // and extend the adjustable range to approximately ±4° on either side.
      // RF (outside front): needs negative camber. Range with camber bolt: -4.0° to 0°.
      // LF (inside front): needs positive camber for oval. Range with camber bolt: -4.0° to +4.0°.
      //   Positive LF static is correct — chassis roll subtracts ~1-2° in the ground frame,
      //   so +1° to +2° static lands near 0° ground camber at the contact patch.
      // Flag values outside ±4° as requiring additional hardware (shims, plates, etc.).
      if (outside) {
        const RF_MIN = -4.0; // max negative on RF with camber bolt
        const RF_MAX =  0.0; // RF should never need positive static
        alignmentOutOfRange = optStaticCamber < RF_MIN || optStaticCamber > RF_MAX;
      } else {
        const LF_MIN = -4.0; // max negative on LF with camber bolt (unusual for oval)
        const LF_MAX = +4.0; // max positive on LF with camber bolt
        alignmentOutOfRange = optStaticCamber < LF_MIN || optStaticCamber > LF_MAX;
      }
    } else {
      // Solid rear axle: no static camber. Body roll angle IS the ground-frame camber.
      // Outside rear (RR): rolls outward → positive ground camber
      // Inside rear (LR): rolls inward  → negative ground camber
      groundCamber = (outside ? cornerRoll : -cornerRoll) + sidewallCamberDeg(cornerLoads[c]);
      idealGroundCamber = IDEAL_GROUND_CAMBER_REAR; // 0° — flat patch, no adjustment possible
      camberDev = Math.abs(groundCamber - idealGroundCamber);
      camberFactor = camberGripFactor(groundCamber, outside, false);
      // No optStaticCamber for solid axle — can't adjust
    }

    const tempFactor = tempGripFactor(tEq);
    const toeFactor = front ? toeGripFactor(toe) : 1.0;
    const loadSens = Math.pow(avgLoad / Math.max(load, 50), 0.08);
    const mu = tempFactor * psiGripFactor * camberFactor * casterFactor * toeFactor * loadSens;
    const adjustableScore = tempFactor * psiGripFactor * camberFactor * casterFactor * toeFactor;

    corners[c] = {
      load, wf, estimatedTemp: tEq,
      hp, optHotPsi, psiDev, psiGripFactor, isPresLimited, recHotPsi, recColdPsi,
      effectiveCamber, groundCamber, idealGroundCamber, camberDev, camberFactor,
      casterGain, bodyRollCamber, kpiCamber: front ? kpiCamber : 0,
      frameRollCamber: front ? (outside ? cornerRoll : -cornerRoll) : 0,
      dynamicGain: front ? casterGain + bodyRollCamber + kpiCamber : 0,
      casterFactor, optStaticCamber, alignmentOutOfRange,
      sidewallCamber: front ? swCamber : sidewallCamberDeg(cornerLoads[c]),
      front, outside, tempFactor, loadSens, mu, adjustableScore,
    };
  }

  // Balance — matches calcPerformance which uses VEH.frontBias
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
  const metric = calcPerformance(setup, refTires, inflationTemp, geoCtx);
  const lapTime = metricToLapTime(metric);

  // Recommendations
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const testGain = (mutate) => {
    const s = clone(setup);
    mutate(s);
    // Recompute equilibrium temps for mutated setup — load shifts (from shock changes etc.)
    // cascade into temperature, which feeds tempGripFactor. Using stale refTires would miss this.
    // Pass geoCtx so recommendations are computed with the same measured geometry as the main analysis.
    return lapTime - metricToLapTime(calcPerformance(s, eqTires(s, ambientTemp, (setup_) => calcWorkFactors(setup_, geoCtx)), inflationTemp, geoCtx));
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
      detail: `Ground camber: ${corners[c].groundCamber !== null ? (corners[c].groundCamber >= 0 ? '+' : '') + corners[c].groundCamber.toFixed(2) : '—'}° → target ${corners[c].idealGroundCamber.toFixed(1)}°${corners[c].alignmentOutOfRange ? ' ⚠ beyond ±4° camber bolt range' : ''}`,
      note: `Dynamic gains: ${Math.abs(corners[c].casterGain).toFixed(2)}° caster + ${Math.abs(corners[c].bodyRollCamber).toFixed(2)}° body roll = ${Math.abs(corners[c].dynamicGain).toFixed(2)}° total — verify with tire temps`,
    });
  }

  // Pressures
  for (const c of CORNERS) {
    const cur = setup.coldPsi[c];
    const opt = Math.round(corners[c].recColdPsi * 2) / 2;
    if (Math.abs(opt - cur) < 0.5) continue;
    const gain = testGain(s => { s.coldPsi[c] = opt; });
    if (gain < 0.003) continue; // skip zero-gain AND negative-gain (moving away from optimum)
    const isCapped = corners[c].isPresLimited;
    const optStr = isCapped
      ? `load-optimal ${corners[c].optHotPsi.toFixed(0)} PSI is outside practical range — capped at ${corners[c].recHotPsi.toFixed(1)} PSI`
      : `model optimal: ${corners[c].optHotPsi.toFixed(0)} PSI`;
    recs.push({
      id: `${c.toLowerCase()}-psi`,
      parameter: `${c} Pressure`,
      current: `${cur} PSI`, currentVal: cur,
      optimal: `${opt} PSI`, optimalVal: opt,
      gain,
      detail: `Hot: ${corners[c].hp.toFixed(1)} PSI → target ${corners[c].recHotPsi.toFixed(1)} PSI (${optStr})`,
      note: isCapped ? 'Corner load far from average — practical PSI cap applied' : null,
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

  // Shocks — test all click values 0-10 for each position, find best gain.
  // Shocks drive LLTD, body roll, and phase-specific balance — must be in recommendations.
  // Lower click = stiffer (more LLTD contribution). Front stiffer = more push. Rear stiffer = more loose.
  const shockMeta = {
    RF: {
      role: 'Outside front strut',
      stiffer: 'Increases front LLTD → more RF load on turn-in → tighter entry',
      softer:  'Reduces front LLTD → less RF load transfer → freer turn-in, looser entry',
    },
    LF: {
      role: 'Inside front strut',
      stiffer: 'Resists body roll → slower weight transfer → more front LLTD → tighter',
      softer:  'Allows more body roll → front loads later → less front LLTD → looser',
    },
    RR: {
      role: 'Outside rear shock',
      stiffer: 'Increases rear LLTD → overloads RR in corners → looser',
      softer:  'Reduces rear LLTD → distributes rear load better → tighter',
    },
    LR: {
      role: 'Inside rear shock',
      stiffer: 'More rear roll resistance → more rear LLTD → looser',
      softer:  'Allows inside rear to extend freely → less rear LLTD → tighter',
    },
  };
  for (const pos of ['RF', 'LF', 'RR', 'LR']) {
    const cur = setup.shocks[pos];
    let best = { val: cur, gain: 0 };
    for (let v = 0; v <= 10; v++) {
      if (v === cur) continue;
      const g = testGain(s => { s.shocks[pos] = v; });
      if (g > best.gain) best = { val: v, gain: g };
    }
    if (best.gain < 0.005) continue;
    const isStiffer = best.val < cur;
    const meta = shockMeta[pos];
    const newSS = shockStiffness({ ...setup, shocks: { ...setup.shocks, [pos]: best.val } });
    recs.push({
      id: `${pos.toLowerCase()}-shock`,
      parameter: `${pos} Shock`,
      current: `Click ${cur}`, currentVal: cur,
      optimal: `Click ${best.val}`, optimalVal: best.val,
      gain: best.gain,
      detail: `${meta.role}: ${isStiffer ? 'stiffen' : 'soften'} ${Math.abs(cur - best.val)} click${Math.abs(cur - best.val) > 1 ? 's' : ''}. New front LLTD: ${(newSS.frontLLTD * 100).toFixed(1)}% (current: ${(ss.frontLLTD * 100).toFixed(1)}%)`,
      note: isStiffer ? meta.stiffer : meta.softer,
    });
  }

  recs.sort((a, b) => b.gain - a.gain);

  // Combined optimal lap time
  const optSetup = clone(setup);
  for (const rec of recs) {
    if (rec.gain <= 0) continue;
    if (rec.id === 'lf-camber') optSetup.camber.LF = rec.optimalVal;
    if (rec.id === 'rf-camber') optSetup.camber.RF = rec.optimalVal;
    if (rec.id === 'toe') optSetup.toe = rec.optimalVal;
    const m  = rec.id.match(/^([a-z]{2})-psi$/);
    if (m) optSetup.coldPsi[m[1].toUpperCase()] = rec.optimalVal;
    const m2 = rec.id.match(/^([a-z]{2})-shock$/);
    if (m2) optSetup.shocks[m2[1].toUpperCase()] = rec.optimalVal;
  }
  const optMetric = calcPerformance(optSetup, eqTires(optSetup, ambientTemp, (s) => calcWorkFactors(s, geoCtx)), inflationTemp, geoCtx);
  const optLapTime = metricToLapTime(optMetric);

  return {
    corners, ss, roll, frontGripPct, balancePenalty, imbalance,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain: lapTime - optLapTime,
    recs, caster,
    desiredRollFront, desiredRollRear, rollAngleImbalance,
  };
}

// ============ FIGURE 8 CASTER COEFFICIENTS ============
// F8 loop radius = 149 ft = 1788". Ackermann steer angle: atan(114.7"/1788") = 3.67°
// Virtually identical to oval (3.67° vs 3.77° = 0.3% difference).
// Scaled from oval coefficients: (sin(3.67°)/sin(3.77°)) × oval_coeff
//   F8 outside: 0.136 × sin(3.67°)/sin(3.77°) ≈ 0.125°/°caster (pyrometer-derived)
//   F8 inside:  0.034 × sin(3.67°)/sin(3.77°) ≈ 0.031°/°caster (pyrometer-derived)
const F8_CASTER_COEFF_OUT = 0.125; // °/°caster — F8 outside tire, 3.67° apex steer
const F8_CASTER_COEFF_IN  = 0.031; // °/°caster — F8 inside tire, 3.67° apex steer

// ============ FIGURE 8 SETUP ANALYSIS ============
// Adapted for bidirectional loading. Each front tire alternates outside/inside each lap.
//
// Key physics differences from oval:
//   - Average loads ≈ static loads (lateral transfer cancels across L+R turns)
//   - Fronts heavier than rears (57% front bias) → optimal psi still differs F/R
//   - Optimal static camber found by minimizing sum of per-turn deviations from ideal:
//       optStatic = avg(ideal_outside_static, ideal_inside_static)
//       = avg(-4.5 + caster×F8_CASTER_COEFF_OUT, 0.0 - caster×F8_CASTER_COEFF_IN)
//       At F8 steer 3.67°: coefficients ≈ 0.125°/° (outside) and 0.031°/° (inside) — nearly flat.
//   - Caster benefits each front ONLY when it is the outside tire (50% of laps)
//       avgCasterFactor = (casterGripFactor_outside + 1.0) / 2
//   - Balance penalty in calcPerformanceF8 still uses VEH.frontBias, not 0.50
//
// Display factors mirror calcPerformanceF8 exactly so scores reflect actual lap time impact.
const F8_IDEAL_AVG_EFFECTIVE_CAMBER = -2.25; // avg of outside ideal (−4.5°) + inside ideal (0°, flat)

export function analyzeSetupF8(setup, ambientTemp = 65, inflationTemp = COLD_PSI_TEMP) {
  const ss = shockStiffness(setup);
  // Average loads across L+R turns = static loads (lateral transfer cancels)
  const loadsL = tireLoads(1.0, ss.springLLTD);
  const loadsR = { LF: loadsL.RF, RF: loadsL.LF, LR: loadsL.RR, RR: loadsL.LR };
  const loads = {
    LF: (loadsL.LF + loadsR.LF) / 2,
    RF: (loadsL.RF + loadsR.RF) / 2,
    LR: (loadsL.LR + loadsR.LR) / 2,
    RR: (loadsL.RR + loadsR.RR) / 2,
  };
  const avgLoad = VEH.weight / 4;
  const roll = bodyRoll(1.0, rollStiffness(setup));
  const toe = setup.toe !== undefined ? setup.toe : -0.25;
  const caster = setup.caster || { LF: 4.0, RF: 4.0 };

  // Steady-state equilibrium temps using F8 work factors (averaged L+R)
  const workFactors = calcWorkFactorsF8(setup);
  const refTires = {};
  for (const c of CORNERS) {
    const wf = workFactors[c];
    const tEq = ambientTemp +
      (THERMAL.heatBase + THERMAL.heatLoad * wf * THERMAL.refSpeed) / THERMAL.coolRate;
    refTires[c] = { temp: tEq, inside: tEq, middle: tEq, outside: tEq, wear: 0 };
  }

  const corners = {};
  for (const c of CORNERS) {
    const load = loads[c];
    const front = IS_FRONT[c];
    const tEq = refTires[c].temp;

    // Pressure — symmetric loads front-to-front and rear-to-rear, but fronts heavier than rears
    const hp = hotPressure(setup.coldPsi[c], tEq, inflationTemp);
    const optHotPsi = optimalHotPsi(c, load);
    const psiDev = hp - optHotPsi;
    const psiGripFactor = pressureGripFactor(hp, load, c);
    const minHot = MIN_HOT_PSI[c] ?? 12;
    const maxHot = MAX_HOT_PSI[c] ?? 51;
    const isPresLimited = optHotPsi < minHot || optHotPsi > maxHot;
    const recHotPsi = Math.min(Math.max(minHot, optHotPsi), maxHot);
    const recColdPsi = recHotPsi * (inflationTemp + RANKINE) / (tEq + RANKINE);

    let effectiveCamber, idealCamber, camberDev, camberFactor;
    let casterGain = 0, casterFactor = 1, optStaticCamber = null;

    if (front) {
      // Per-turn caster camber gains: outside wheel gains negative, inside gains positive.
      // Caster direction is geometric and the same on SLA and MacPherson.
      const gOut = -(caster[c] * F8_CASTER_COEFF_OUT); // outside turn: negative camber gain (3.67° apex steer)
      const gIn  =  (caster[c] * F8_CASTER_COEFF_IN);  // inside turn: positive camber gain (geometric)
      // Average caster gain across both turns (F8 body roll averages to ~0 across L+R)
      casterGain = (gOut + gIn) / 2; // = caster × -0.04

      // Average effective camber (for display — what the tire averages across a lap)
      effectiveCamber = setup.camber[c] + casterGain;
      idealCamber = F8_IDEAL_AVG_EFFECTIVE_CAMBER; // -2.25°

      // DISPLAY: average the actual per-turn camberGripFactor (matches calcPerformanceF8)
      const factorOut = camberGripFactor(setup.camber[c] + gOut, true,  1.0);
      const factorIn  = camberGripFactor(setup.camber[c] + gIn,  false, 1.0);
      camberFactor = (factorOut + factorIn) / 2;
      camberDev = Math.abs(effectiveCamber - idealCamber);

      // DISPLAY: caster factor — helps only when this tire is the outside tire (50% of laps)
      const casterBenefit = casterGripFactor(caster[c], true, true);
      casterFactor = (casterBenefit + 1.0) / 2;

      // Optimal static camber: avg of (ideal_outside_static, ideal_inside_static)
      //   ideal_outside_static = -4.5 - gOut = -4.5 + caster×F8_CASTER_COEFF_OUT
      //   ideal_inside_static  =  0.0 - gIn  = 0.0 - caster×F8_CASTER_COEFF_IN  (flat patch; gIn positive)
      const optOut = -4.5 - gOut;
      const optIn  =  0.0 - gIn;
      optStaticCamber = Math.round(((optOut + optIn) / 2) * 4) / 4;

    } else {
      // Rear solid axle: body roll averages to ~0 across L+R turns → dynamic camber ~0°
      // ideal = 0°, so rear camber score is always 1.0 in figure 8
      effectiveCamber = 0;
      idealCamber = 0;
      camberDev = 0;
      camberFactor = 1.0;
      casterFactor = 1.0;
    }

    const tempFactor = tempGripFactor(tEq);
    const loadSens = Math.pow(avgLoad / Math.max(load, 50), 0.08);
    const mu = tempFactor * psiGripFactor * camberFactor * casterFactor * loadSens;
    const adjustableScore = tempFactor * psiGripFactor * camberFactor * casterFactor;

    corners[c] = {
      load, estimatedTemp: tEq,
      hp, optHotPsi, psiDev, psiGripFactor, isPresLimited, recHotPsi, recColdPsi,
      effectiveCamber, idealCamber, camberDev, camberFactor, casterGain, casterFactor,
      optStaticCamber, front, outside: OUTSIDE[c], tempFactor, loadSens, mu, adjustableScore,
    };
  }

  // Balance — uses VEH.frontBias (0.55) to match calcPerformanceF8's penalty formula
  let frontForce = 0, rearForce = 0;
  for (const c of CORNERS) {
    const f = corners[c].mu * corners[c].load;
    if (IS_FRONT[c]) frontForce += f; else rearForce += f;
  }
  const frontGripPct = frontForce / Math.max(frontForce + rearForce, 1);
  const imbalance = Math.abs(frontGripPct - VEH.frontBias);
  const balancePenalty = Math.max(0.94, 1 - imbalance * 0.2);

  const toeGrip = toeGripFactor(toe);
  const toeDrag = toeDragFactor(toe);

  const metric = calcPerformanceF8(setup, refTires, inflationTemp);
  const lapTime = metricToLapTimeF8(metric);

  // Recommendations — testGain uses calcPerformanceF8 directly (ground truth)
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const testGain = (mutate) => {
    const s = clone(setup);
    mutate(s);
    return lapTime - metricToLapTimeF8(calcPerformanceF8(s, eqTires(s, ambientTemp, calcWorkFactorsF8), inflationTemp));
  };
  const recs = [];

  // Front camber
  for (const c of ['LF', 'RF']) {
    const cur = setup.camber[c];
    const opt = corners[c].optStaticCamber;
    if (opt === null || Math.abs(opt - cur) < 0.25) continue;
    const gain = testGain(s => { s.camber[c] = opt; });
    const gOut = -(caster[c] * F8_CASTER_COEFF_OUT);
    const gIn  =  (caster[c] * F8_CASTER_COEFF_IN);
    const effOut = (opt + gOut).toFixed(2);
    const effIn  = (opt + gIn).toFixed(2);
    recs.push({
      id: `${c.toLowerCase()}-camber`,
      parameter: `${c} Camber`,
      current: `${cur}°`, currentVal: cur,
      optimal: `${opt}°`, optimalVal: opt,
      gain,
      detail: `At ${opt}°: effective ${effOut}° outside turn (ideal −4.5°), ${effIn}° inside turn (ideal 0° flat)`,
      note: 'Both fronts alternate outside/inside each lap — symmetric target maximizes average contact patch',
    });
  }

  // Pressures
  for (const c of CORNERS) {
    const cur = setup.coldPsi[c];
    const opt = Math.round(corners[c].recColdPsi * 2) / 2;
    if (Math.abs(opt - cur) < 0.5) continue;
    const gain = testGain(s => { s.coldPsi[c] = opt; });
    if (Math.abs(gain) < 0.003) continue;
    const d = corners[c];
    recs.push({
      id: `${c.toLowerCase()}-psi`,
      parameter: `${c} Pressure`,
      current: `${cur} PSI`, currentVal: cur,
      optimal: `${opt} PSI`, optimalVal: opt,
      gain,
      detail: `Hot: ${d.hp.toFixed(1)} → ${d.recHotPsi.toFixed(1)} PSI (load-optimal: ${d.optHotPsi.toFixed(0)} PSI for ${Math.round(d.load)} lb avg load)`,
      note: d.isPresLimited ? 'Load is far from average — optimal is outside practical range' : null,
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
        detail: 'Sharpens turn-in for both left and right corners; balances against straight-line drag on 350 ft straights',
        note: null,
      });
    }
  }

  // Shocks — F8 turns both directions; shocks drive LLTD and body roll each way.
  // Lower click = stiffer. For F8 optimal LLTD ≈ 0.50 (balanced bidirectional).
  const shockMetaF8 = {
    RF: {
      role: 'RF strut (outside in left turns, inside in right)',
      stiffer: 'More front LLTD in left turns → tighter left, but also acts as inside in right turns',
      softer:  'Less front LLTD in left turns → looser left, more balanced overall',
    },
    LF: {
      role: 'LF strut (inside in left turns, outside in right)',
      stiffer: 'More front LLTD in right turns → tighter right, looser left',
      softer:  'Less front LLTD in right turns → more balanced across both directions',
    },
    RR: {
      role: 'RR shock (outside rear in left turns)',
      stiffer: 'More rear LLTD → looser in left turns; also inside rear in right turns',
      softer:  'Less rear LLTD → tighter in left turns',
    },
    LR: {
      role: 'LR shock (inside rear in left turns, outside rear in right)',
      stiffer: 'More rear LLTD in right turns; less inside rear droop in left turns',
      softer:  'Allows inside rear to extend freely in left turns; reduces rear LLTD in right turns',
    },
  };
  for (const pos of ['RF', 'LF', 'RR', 'LR']) {
    const cur = setup.shocks[pos];
    let best = { val: cur, gain: 0 };
    for (let v = 0; v <= 10; v++) {
      if (v === cur) continue;
      const g = testGain(s => { s.shocks[pos] = v; });
      if (g > best.gain) best = { val: v, gain: g };
    }
    if (best.gain < 0.005) continue;
    const isStiffer = best.val < cur;
    const meta = shockMetaF8[pos];
    const newSS = shockStiffness({ ...setup, shocks: { ...setup.shocks, [pos]: best.val } });
    recs.push({
      id: `${pos.toLowerCase()}-shock`,
      parameter: `${pos} Shock`,
      current: `Click ${cur}`, currentVal: cur,
      optimal: `Click ${best.val}`, optimalVal: best.val,
      gain: best.gain,
      detail: `${meta.role}: ${isStiffer ? 'stiffen' : 'soften'} ${Math.abs(cur - best.val)} click${Math.abs(cur - best.val) > 1 ? 's' : ''}. New front LLTD: ${(newSS.frontLLTD * 100).toFixed(1)}% (current: ${(ss.frontLLTD * 100).toFixed(1)}%)`,
      note: isStiffer ? meta.stiffer : meta.softer,
    });
  }

  recs.sort((a, b) => b.gain - a.gain);

  const optSetup = clone(setup);
  for (const rec of recs) {
    if (rec.gain <= 0) continue;
    if (rec.id === 'lf-camber') optSetup.camber.LF = rec.optimalVal;
    if (rec.id === 'rf-camber') optSetup.camber.RF = rec.optimalVal;
    if (rec.id === 'toe') optSetup.toe = rec.optimalVal;
    const m  = rec.id.match(/^([a-z]{2})-psi$/);
    if (m) optSetup.coldPsi[m[1].toUpperCase()] = rec.optimalVal;
    const m2 = rec.id.match(/^([a-z]{2})-shock$/);
    if (m2) optSetup.shocks[m2[1].toUpperCase()] = rec.optimalVal;
  }
  const optMetric = calcPerformanceF8(optSetup, eqTires(optSetup, ambientTemp, calcWorkFactorsF8), inflationTemp);
  const optLapTime = metricToLapTimeF8(optMetric);

  return {
    corners, ss, roll, frontGripPct, balancePenalty, imbalance,
    toeGrip, toeDrag, toe,
    lapTime, optLapTime, totalGain: lapTime - optLapTime,
    recs, caster,
  };
}

// ============================================================
// FIGURE 8 SIMULATION
// Two symmetric loops (left + right turn) connected at a crossing.
// Baseline: 23.5s/lap @ 65F with DEFAULT_SETUP. Goal: 23.1s. Standard race: 25 laps.
// Key physics differences from oval:
//   - Both left AND right turns each lap → all tires alternate roles
//   - Tire temps much more balanced side-to-side
//   - No banking; optimal camber is symmetric (~-2.5 both fronts)
// ============================================================

const TRACK_F8 = {
  loopRadius:    149,  // ft — from Google Earth: loop diameter = 298 ft (turn entry to exit)
  loopArcDeg:   120,   // degrees of arc in each loop (120° arc + 350 ft straights ≈ 0.25 mi total)
  straightLength: 350, // ft, measured straights between loops
  crossingLength:   0, // ft (absorbed into straight measurement)
  // Total: 2×(120/360×2π×149) + 2×350 = 2×310 + 700 = 1320 ft ≈ 0.25 miles ✓
  // Corner speed: sqrt(0.28G × 32.174 × 149) = 36.6 ft/s ≈ 25 mph (physics-derived)
};
TRACK_F8.loopArc = (TRACK_F8.loopArcDeg / 360) * 2 * Math.PI * TRACK_F8.loopRadius;
TRACK_F8.totalLength = 2 * TRACK_F8.loopArc + 2 * TRACK_F8.straightLength + TRACK_F8.crossingLength;

// F8 time-averaged corner G — same concept as OVAL_CORNER_G but retains calibrated value.
// Physics derivation: F8_RACING_G × (2×loopArc / totalLength) = 0.498 × 0.471 = 0.235
// Calibrated value 0.28 is higher because the F8 model was tuned to match observed hot
// pressures from the F8 baseline session (RF/LF both ≈ 35 PSI cold, symmetric).
// The gap (0.235 vs 0.28) is larger than the oval case — this track has shorter straights
// relative to loop arcs in actual driving (drivers don't fully unwind between loops),
// making the effective cornering fraction higher than the geometric calculation suggests.
// Revisit if F8 pyrometer data is collected with consistent lap counts and ambient temps.
// F8_CORNER_G is already declared above (near OVAL_CORNER_G) — this comment documents origin.

function calcWorkFactorsF8(setup) {
  const ss = shockStiffness(setup);
  const loadsLeft = tireLoads(1.0, ss.springLLTD);
  const loadsRight = { LF: loadsLeft.RF, RF: loadsLeft.LF, LR: loadsLeft.RR, RR: loadsLeft.LR };
  const avgLoad = VEH.weight / 4;
  return {
    LF: ((loadsLeft.LF + loadsRight.LF) / 2) / avgLoad,
    RF: ((loadsLeft.RF + loadsRight.RF) / 2) / avgLoad,
    LR: ((loadsLeft.LR + loadsRight.LR) / 2) / avgLoad,
    RR: ((loadsLeft.RR + loadsRight.RR) / 2) / avgLoad,
  };
}

function calcPerformanceF8(setup, tires, inflationTemp = COLD_PSI_TEMP) {
  const refG   = 1.0;
  const ss     = shockStiffness(setup);
  const loadsL = tireLoads(refG, ss.springLLTD);
  const loadsR = { LF: loadsL.RF, RF: loadsL.LF, LR: loadsL.RR, RR: loadsL.LR };
  // Pressure optimum uses actual F8 cornering G (not 1G) — per-turn 1G loads swing wildly
  const cLoadsL = tireLoads(F8_CORNER_G, ss.springLLTD);
  const cLoadsR = { LF: cLoadsL.RF, RF: cLoadsL.LF, LR: cLoadsL.RR, RR: cLoadsL.LR };
  const roll   = bodyRoll(refG, rollStiffness(setup));
  const toe    = setup.toe    !== undefined ? setup.toe    : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };
  const avgLoad = VEH.weight / 4;

  let totalForce = 0, frontForce = 0, rearForce = 0;

  for (const c of CORNERS) {
    const avgTemp = tires[c].temp;
    const front   = IS_FRONT[c];
    let sumForce  = 0;

    for (const isLeft of [true, false]) {
      const outside  = isLeft ? OUTSIDE[c] : !OUTSIDE[c];
      const load     = isLeft ? loadsL[c]  : loadsR[c];
      const cLoad    = isLeft ? cLoadsL[c] : cLoadsR[c]; // corner G for pressure
      const hp       = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);

      let mu = 1.0;
      mu *= tempGripFactor(avgTemp);
      mu *= pressureGripFactor(hp, cLoad, c);

      if (front) {
        // Caster: outside gains negative, inside gains positive. F8 apex steer 3.67°.
        const casterGain = outside
          ? -(caster[c] * F8_CASTER_COEFF_OUT * refG)
          :  (caster[c] * F8_CASTER_COEFF_IN  * refG);
        mu *= camberGripFactor(setup.camber[c] + casterGain, outside, refG);
        mu *= casterGripFactor(caster[c], outside, true);
        mu *= toeGripFactor(toe);
      } else {
        const dynCamber = outside ? roll : -roll;
        const idealRear = outside ? -1.0 : 0;
        mu *= Math.max(0.88, 1 - 0.012 * Math.abs(dynCamber - idealRear));
      }

      mu *= Math.pow(avgLoad / Math.max(load, 50), 0.08);
      mu *= Math.max(0.92, 1 - tires[c].wear);
      sumForce += mu * load;
    }

    const avgForce = sumForce / 2;
    totalForce += avgForce;
    if (front) frontForce += avgForce; else rearForce += avgForce;
  }

  const frontPct  = frontForce / Math.max(frontForce + rearForce, 1);
  totalForce *= Math.max(0.94, 1 - Math.abs(frontPct - VEH.frontBias) * 0.2);

  // LLTD driveability: F8 optimal = 0.50 (balanced, turns alternate both directions)
  const F8_OPTIMAL_LLTD = 0.50;
  const lltdDev = Math.abs(ss.frontLLTD - F8_OPTIMAL_LLTD);
  totalForce *= Math.max(0.90, 1 - 0.7 * lltdDev * lltdDev);

  totalForce /= toeDragFactor(toe);
  return totalForce / VEH.weight;
}

// Zone multipliers averaged across left+right roles — much more even than oval
const F8_ZONE = [0.94, 1.0, 1.06];

// F8 heat generation multiplier.
// The figure 8 generates more heat per second than the oval: tighter corners (149 ft vs 105 ft),
// more steering angle, bidirectional scrub. Calibrated so the right-side tires (RF/RR) reach
// equilibrium temps matching the real-world baseline run (RF ~125°F, RR ~121°F @ 75°F ambient).
// Left-side tires (LF/LR) run 8–13°F hotter than the symmetric model predicts due to asymmetric
// caster (LF 5.5° vs RF 3.75°) loading LF harder in right turns — this cannot be captured by
// the symmetric F8 model.
// Derivation: RF wf=1.10: tEq = 75 + (0.53×1.18 + 0.00453×1.10×75)/0.02 ≈ 125°F ✓
//             RR wf=0.90: tEq = 75 + (0.53×1.18 + 0.00453×0.90×75)/0.02 ≈ 121°F ✓
const F8_HEAT_MULT = 1.18;

function updateTireTempsF8(tires, workFactors, ambient, lapTime, setup, inflationTemp = COLD_PSI_TEMP) {
  const newTires = {};
  const toe    = setup.toe    !== undefined ? setup.toe    : -0.25;
  const caster = setup.caster || { LF: 3.5, RF: 5.0 };

  for (const c of CORNERS) {
    const wf    = workFactors[c];
    const front = IS_FRONT[c];

    // Average effective camber across both turn directions
    let camberAvg = 0;
    if (front) {
      const gOut = -(caster[c] * F8_CASTER_COEFF_OUT);
      const gIn  =  (caster[c] * F8_CASTER_COEFF_IN);
      const camberL = setup.camber[c] + (OUTSIDE[c]  ? gOut : gIn);
      const camberR = setup.camber[c] + (!OUTSIDE[c] ? gOut : gIn);
      camberAvg = (camberL + camberR) / 2;
    }
    // Rear: roll averages to ~0 across both directions

    const camberShift = -camberAvg * 0.02;
    const avgTemp = (tires[c].inside + tires[c].middle + tires[c].outside) / 3;
    const hp      = hotPressure(setup.coldPsi[c], avgTemp, inflationTemp);
    const psiMiddleBoost = (hp - 30 * wf) * 0.003;
    const toeMiddleBoost = front ? Math.abs(toe) * 0.008 : 0;

    const zones = [
      { key: 'inside',  mult: F8_ZONE[0] + camberShift },
      { key: 'middle',  mult: F8_ZONE[1] + psiMiddleBoost + toeMiddleBoost },
      { key: 'outside', mult: F8_ZONE[2] - camberShift },
    ];

    const newZones = {};
    for (const zone of zones) {
      const T = tires[c][zone.key];
      const heatIn  = (THERMAL.heatBase * F8_HEAT_MULT + THERMAL.heatLoad * wf * THERMAL.refSpeed) * lapTime * zone.mult;
      const heatOut = THERMAL.coolRate * (T - ambient) * lapTime;
      newZones[zone.key] = T + (heatIn - heatOut) / THERMAL.thermalMass;
    }

    const newAvg = (newZones.inside + newZones.middle + newZones.outside) / 3;
    newTires[c] = {
      inside: newZones.inside, middle: newZones.middle, outside: newZones.outside,
      temp: newAvg,
      wear: tires[c].wear + THERMAL.wearRate(wf, newAvg),
    };
  }
  return newTires;
}

// Calibrated to real-world run: F8_BASELINE_SETUP, 20 laps @ 75°F → 23.283s best lap.
// Pyrometer (I/M/O): LF 133/130/136, RF 125/125/120, LR 128/129/127, RR 120/121/120
const BASELINE_LAP_F8 = 23.283;
let _baselineMetricF8 = null;

function getBaselineMetricF8() {
  if (_baselineMetricF8 === null) {
    // Real pyrometer data from F8_BASELINE_SETUP, 20 laps @ 75°F ambient.
    // LF runs ~10°F hotter than RF due to asymmetric caster (not modeled by symmetric F8 engine).
    const calibTires = {
      LF: { inside: 133, middle: 130, outside: 136, temp: 133.0, wear: 0 },
      RF: { inside: 125, middle: 125, outside: 120, temp: 123.3, wear: 0 },
      LR: { inside: 128, middle: 129, outside: 127, temp: 128.0, wear: 0 },
      RR: { inside: 120, middle: 121, outside: 120, temp: 120.3, wear: 0 },
    };
    _baselineMetricF8 = calcPerformanceF8(F8_BASELINE_SETUP, calibTires);
  }
  return _baselineMetricF8;
}

function metricToLapTimeF8(metric) {
  return BASELINE_LAP_F8 * Math.pow(getBaselineMetricF8() / metric, LAP_SENSITIVITY);
}

function metricToSpeedsF8(metric) {
  const scale = Math.sqrt(metric / getBaselineMetricF8());

  // Corner speed from back-calculated actual racing G at F8 loop (see suggested.md §2).
  // F8_RACING_G (0.498) is back-calculated from 23.283s baseline — NOT from F8_CORNER_G (0.28).
  const v_corner = Math.sqrt(F8_RACING_G * G * TRACK_F8.loopRadius);          // ft/s ≈ 48.8 (33.3 mph)
  const cornerBaseMph = v_corner / 1.4667;

  // Peak straight speed (same engine/braking physics as oval)
  const f_engine = VEH.peakTorque * VEH.gear2Ratio * VEH.driveEff / VEH.tireRadius;
  const a_acc   = f_engine / VEH.mass;
  const a_brake = VEH.brakingG * G;
  const v_peak_sq = v_corner * v_corner +
    2 * a_acc * TRACK_F8.straightLength * a_brake / (a_acc + a_brake);
  const straightBaseMph = Math.sqrt(v_peak_sq) / 1.4667;

  return {
    cornerMph: Math.round(cornerBaseMph * scale * 10) / 10,
    peakMph:   Math.round(straightBaseMph * scale * 10) / 10,
  };
}

export function simulateRaceF8(setup, ambientTemp = 65, numLaps = 20, inflationTemp = COLD_PSI_TEMP) {
  let tires = {};
  for (const c of CORNERS) {
    const t = ambientTemp + 5;
    tires[c] = { inside: t, middle: t, outside: t, temp: t, wear: 0 };
  }

  const workFactors = calcWorkFactorsF8(setup);
  const laps = [];

  for (let i = 1; i <= numLaps; i++) {
    const metric  = calcPerformanceF8(setup, tires, inflationTemp);
    const lapTime = metricToLapTimeF8(metric);
    const speeds  = metricToSpeedsF8(metric);
    const hPsi    = {};
    for (const c of CORNERS) {
      hPsi[c] = Math.round(hotPressure(setup.coldPsi[c], tires[c].temp, inflationTemp) * 10) / 10;
    }
    laps.push({
      lap: i,
      time: Math.round(lapTime * 1000) / 1000,
      cornerMph: speeds.cornerMph,
      peakMph:   speeds.peakMph,
      temps:    { LF: Math.round(tires.LF.temp*10)/10, RF: Math.round(tires.RF.temp*10)/10,
                  LR: Math.round(tires.LR.temp*10)/10, RR: Math.round(tires.RR.temp*10)/10 },
      tempsIMO: {
        LF: { I: Math.round(tires.LF.inside), M: Math.round(tires.LF.middle), O: Math.round(tires.LF.outside) },
        RF: { I: Math.round(tires.RF.inside), M: Math.round(tires.RF.middle), O: Math.round(tires.RF.outside) },
        LR: { I: Math.round(tires.LR.inside), M: Math.round(tires.LR.middle), O: Math.round(tires.LR.outside) },
        RR: { I: Math.round(tires.RR.inside), M: Math.round(tires.RR.middle), O: Math.round(tires.RR.outside) },
      },
      hotPsi: hPsi,
      wear: {
        LF: Math.round(tires.LF.wear*10000)/10000, RF: Math.round(tires.RF.wear*10000)/10000,
        LR: Math.round(tires.LR.wear*10000)/10000, RR: Math.round(tires.RR.wear*10000)/10000,
      },
    });
    tires = updateTireTempsF8(tires, workFactors, ambientTemp, lapTime, setup, inflationTemp);
  }

  const times = laps.map(l => l.time);
  return {
    laps,
    summary: {
      best: Math.min(...times), worst: Math.max(...times),
      avg:  Math.round((times.reduce((a,b)=>a+b)/times.length)*1000)/1000,
      total: Math.round(times.reduce((a,b)=>a+b)*100)/100,
      bestLapNum:  times.indexOf(Math.min(...times))+1,
      worstLapNum: times.indexOf(Math.max(...times))+1,
    },
  };
}
