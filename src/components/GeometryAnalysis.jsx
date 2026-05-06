import { useState, useMemo } from 'react';
import { computeGeometry } from './GeometryVisualizer';

// ─── Constants ────────────────────────────────────────────────────────────────
const P71_LOWER_ARM_LENGTH = 13.0;
const P71_UPPER_ARM_LENGTH = 9.5;
const P71_KPI              = 9.5;
const P71_WHEEL_OFFSET     = 1.75;
const P71_FRONT_AXLE_FRAC  = 0.57;
const P71_TOTAL_WEIGHT     = 3700;

// Camber-related platform limits (Sec 2 / Synopsis use these).
// P71 with aftermarket camber bolt typically tops out around −3.0° to −3.2°
// before strut/spindle interference. Some classes also rule-cap static at
// −4.0°. We use −3.0° as the realistic shop maximum.
const P71_MAX_STATIC_NEG_CAMBER = -3.0;   // deg, realistic max with cam bolt
const P71_RULES_STATIC_LIMIT    = -4.0;   // deg, common class rule cap
// Sidewall compliance scales with vertical load. Empirical fit from
// Hoosier/Michelin 235/55R17 sidewall data: ~0.0004°/lb above ~600 lb baseline,
// referenced at 1400 lb where the model previously hardcoded 0.48°.
const SIDEWALL_DEFL_REF_LOAD    = 1400;   // lbs — calibration point
const SIDEWALL_DEFL_REF_DEG     = 0.48;   // deg at ref load
const SIDEWALL_DEFL_RATE        = 0.0004; // deg/lb above ref

// Track-type specific targets
const TARGETS = {
  oval: {
    label:               'Oval (left-turn)',
    idealRFGroundCamber: -2.0,
    idealLFGroundCamber: +0.75,
    idealFrontRC_low:    15,
    idealFrontRC_high:   25,
    idealRearRC_low:     12,
    idealRearRC_high:    16,
    idealFVSA_low:       14,
    idealFVSA_high:      22,
    casterCoeffRF:       0.136,  // °/°caster at 3.77° steer
    casterCoeffLF:       0.034,
    apexSteer:           3.77,   // ° — Ackermann at 1/4-mile oval
    trackG:              0.813,
    bodyRollPerG:        3.1,
    slaJounceCoeff:      0.355,
    slaDroopCoeff:       0.547,
    cgHeight:            22,
    symmetric:           false,
  },
  figure8: {
    label:               'Figure-8',
    // Figure-8: both tires need to handle being the outside tire
    // Target both RF and LF at -1.5° to -2.0° ground camber
    idealRFGroundCamber: -1.75,
    idealLFGroundCamber: -1.75,
    idealFrontRC_low:    10,
    idealFrontRC_high:   20,
    idealRearRC_low:     10,
    idealRearRC_high:    18,
    idealFVSA_low:       14,
    idealFVSA_high:      22,
    // At crossover / figure-8 the steer angles are higher (~8-12° at turn-in)
    casterCoeffRF:       0.29,   // °/°caster at ~8° steer
    casterCoeffLF:       0.29,
    apexSteer:           8.0,
    trackG:              0.75,   // lower average G — mixed directions
    bodyRollPerG:        3.1,
    slaJounceCoeff:      0.355,
    slaDroopCoeff:       0.547,
    cgHeight:            22,
    symmetric:           true,
  },
};

function num(v) { return parseFloat(v) || 0; }

// ─── Analysis engine ─────────────────────────────────────────────────────────
export function analyzeGeometry(geo, trackType = 'oval') {
  const T = TARGETS[trackType] || TARGETS.oval;
  const rf = computeGeometry(geo, 'RF');
  const lf = computeGeometry(geo, 'LF');

  const halfTrack   = rf.halfTrack;
  const trackWidthF = halfTrack * 2;
  const trackWidthR = num(geo.trackWidth?.rear || 65.125);
  const wh          = num(geo.wheelCenterHeight || 13.0);
  const rcAvg       = (rf.rcHeight != null && lf.rcHeight != null)
    ? (rf.rcHeight + lf.rcHeight) / 2
    : rf.rcHeight ?? lf.rcHeight;
  const rearRC      = num(geo.rearRollCenter || 14.5);
  const cgH         = T.cgHeight - (num(geo.rideLowering) * 0.65);
  const momentArm   = rcAvg != null ? cgH - rcAvg : null;

  // Static alignment from geo profile.
  // NOTE: use ?? not || for camber/caster — 0° is a valid entry and || would
  // incorrectly fall through to the default when the profile stores "0".
  const _rfStaticRaw = geo.camber?.RF != null && geo.camber.RF !== '' ? parseFloat(geo.camber.RF) : null;
  const _lfStaticRaw = geo.camber?.LF != null && geo.camber.LF !== '' ? parseFloat(geo.camber.LF) : null;
  const _rfCasterRaw = geo.caster?.RF != null && geo.caster.RF !== '' ? parseFloat(geo.caster.RF) : null;
  const _lfCasterRaw = geo.caster?.LF != null && geo.caster.LF !== '' ? parseFloat(geo.caster.LF) : null;
  // Defaults: stock-symmetric (0° camber) and P71 factory caster cross (3.5/5.0°)
  const rfStatic = _rfStaticRaw ?? 0.0;
  const lfStatic = _lfStaticRaw ?? 0.0;
  const rfCaster = _rfCasterRaw ?? 5.0;
  const lfCaster = _lfCasterRaw ?? 3.5;

  // ── (A) Use COMPUTED body roll from springs/ARB (not constant T.bodyRollPerG)
  // We need rollGradient here, but it depends on spring rates which are read
  // below. So compute springs early enough to feed the camber chain.
  // If no spring rates entered, fall back to T.bodyRollPerG (the old constant).
  const _ksLF = parseFloat(geo.springRate?.LF) || null;
  const _ksRF = parseFloat(geo.springRate?.RF) || null;
  const _ksLR = parseFloat(geo.springRate?.LR) || null;
  const _ksRR = parseFloat(geo.springRate?.RR) || null;
  const _irF  = parseFloat(geo.installRatio?.front) || 0.85;  // P71 SLA — 11" spring pickup ÷ 13" arm
  const _irR  = parseFloat(geo.installRatio?.rear)  || 1.0;
  const _tsRear = parseFloat(geo.rearSpringTrack) || num(geo.rearSpringBase) || 44;
  const _kwFavg_pre = (_ksLF && _ksRF) ? ((_ksLF + _ksRF)/2) * _irF * _irF
                    : (_ksLF || _ksRF) ? (_ksLF || _ksRF) * _irF * _irF : null;
  const _kwRavg_pre = (_ksLR && _ksRR) ? ((_ksLR + _ksRR)/2) * _irR * _irR
                    : (_ksLR || _ksRR) ? (_ksLR || _ksRR) * _irR * _irR : null;
  const _trackFt_F = trackWidthF / 12;
  const _trackFt_R = trackWidthR / 12;
  const _tsFt_pre  = _tsRear / 12;
  const _kPhiF_spring_pre = _kwFavg_pre ? (_kwFavg_pre * _trackFt_F * _trackFt_F * 12 / 2) : null;
  const _kPhiR_spring_pre = _kwRavg_pre ? (_kwRavg_pre * _tsFt_pre * _tsFt_pre * 12 / 2) : null;
  // Add ARB contribution if entered (lb-ft/deg → lb-ft/rad)
  const _arbFEntered_deg = parseFloat(geo.arbStiffness?.front) || 0;
  const _arbREntered_deg = parseFloat(geo.arbStiffness?.rear)  || 0;
  const _arbF_rad = _arbFEntered_deg * (180/Math.PI);
  const _arbR_rad = _arbREntered_deg * (180/Math.PI);
  const _kPhiF_total_pre = _kPhiF_spring_pre != null ? _kPhiF_spring_pre + _arbF_rad : null;
  const _kPhiR_total_pre = _kPhiR_spring_pre != null ? _kPhiR_spring_pre + _arbR_rad : null;
  const _kPhiTotal_pre = (_kPhiF_total_pre && _kPhiR_total_pre) ? _kPhiF_total_pre + _kPhiR_total_pre : null;
  const _cgH_ft_pre = cgH / 12;
  const rollGradient_total = _kPhiTotal_pre
    ? ((P71_TOTAL_WEIGHT * _cgH_ft_pre) / _kPhiTotal_pre) * (180/Math.PI)
    : null; // deg/g including ARB
  // Sanity cap: no real race car exceeds ~8°/G body roll — if computed value is
  // above that, the spring rate inputs are likely wrong (wrong units, typo, etc.)
  // Cap at 8°/G and flag so the user sees a warning rather than absurd camber outputs.
  const ROLL_GRAD_PHYSICAL_MAX = 8.0; // °/G
  const rollGradientCapped = rollGradient_total != null
    ? Math.min(rollGradient_total, ROLL_GRAD_PHYSICAL_MAX)
    : null;
  const rollGradientSuspect = rollGradient_total != null && rollGradient_total > ROLL_GRAD_PHYSICAL_MAX;
  // Use computed roll if springs available, else fall back to literature constant.
  const rollPerG_used = rollGradientCapped ?? T.bodyRollPerG;
  const rollAtApex    = rollPerG_used * T.trackG;
  const rollIsComputed = rollGradient_total != null;

  // ── (B) Sidewall compliance scales with RF apex load ──────────────────────
  // RF outside vertical load = static corner weight + lateral load transfer
  //   F_RF = W_corner_F + (W_F × G × CG/track)  — for left turn, all front LT
  //   goes to RF (only on a single-track-front simplification, but close)
  const _wCornerF_pre = (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC) / 2;
  const _latLoadTransferF = (rcAvg != null)
    ? (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * T.trackG * (cgH / 12)) / (trackWidthF / 12)
    : (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * T.trackG * 0.3); // fallback
  const rfApexLoad = _wCornerF_pre + _latLoadTransferF;
  // Sidewall deflection: linear above 600 lb baseline, 0.48° at 1400 lb ref
  const swCamber = Math.max(
    0,
    SIDEWALL_DEFL_REF_DEG + (rfApexLoad - SIDEWALL_DEFL_REF_LOAD) * SIDEWALL_DEFL_RATE
  );

  // ── Oval: left turn only ──────────────────────────────────────────────────
  const rfCasterGain = -(rfCaster * T.casterCoeffRF);
  const lfCasterGain =  (lfCaster * T.casterCoeffLF);
  const rfBodyRoll   = -(rollAtApex * T.slaJounceCoeff);
  const lfBodyRoll   =  (rollAtApex * T.slaDroopCoeff);

  // Ground camber: RF is outside, LF is inside (for oval left turn)
  const rfGroundCamber = rfStatic + rfCasterGain + rfBodyRoll + rollAtApex + swCamber;
  const lfGroundCamber = lfStatic + lfCasterGain + lfBodyRoll - rollAtApex;
  const rfCamberDev    = rfGroundCamber - T.idealRFGroundCamber;
  const lfCamberDev    = lfGroundCamber - T.idealLFGroundCamber;

  // ── (C) Static camber demand check ────────────────────────────────────────
  // Static needed to reach the ideal RF ground camber, given current dynamic
  // contributions. If demanded > P71 cam-bolt limit, the chain CANNOT reach
  // ideal via static alone — driver must reduce roll/load/sidewall instead.
  const rfStaticDemanded = T.idealRFGroundCamber
    - (rfCasterGain + rfBodyRoll + rollAtApex + swCamber);
  // Reachable on P71 with cam bolt (~−3.0°); rules cap typically −4.0°.
  const rfStaticReachable    = rfStaticDemanded >= P71_MAX_STATIC_NEG_CAMBER; // less negative than limit
  const rfStaticWithinRules  = rfStaticDemanded >= P71_RULES_STATIC_LIMIT;
  const rfStaticGapToReach   = rfStaticReachable ? 0 : (P71_MAX_STATIC_NEG_CAMBER - rfStaticDemanded); // positive = how many more degrees of negative would be needed

  // ── Figure-8: also compute right turn (roles swap) ────────────────────────
  // In a right turn: LF becomes outside, RF becomes inside
  let rfGroundCamberRight = null, lfGroundCamberRight = null;
  let rfCamberDevRight = null, lfCamberDevRight = null;
  if (T.symmetric) {
    // Right turn: LF is now outside (jounce/loaded), RF is now inside (droop/unloaded)
    const lfBodyRollRight = -(rollAtApex * T.slaJounceCoeff);  // LF jounces into negative camber
    const rfBodyRollRight =  (rollAtApex * T.slaDroopCoeff);   // RF droops into positive camber
    // swCamber only applies to the loaded outside tire (LF in right turn); RF is unloaded
    rfGroundCamberRight   = rfStatic - rfCasterGain + rfBodyRollRight - rollAtApex;
    lfGroundCamberRight   = lfStatic - lfCasterGain + lfBodyRollRight + rollAtApex + swCamber;
    rfCamberDevRight      = rfGroundCamberRight - T.idealLFGroundCamber; // RF is inside — target is LF ideal
    lfCamberDevRight      = lfGroundCamberRight - T.idealRFGroundCamber; // LF is outside — target is RF ideal
  }

  const armRatio    = P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH;
  const scrubRadius = wh * Math.tan(P71_KPI * Math.PI / 180) - P71_WHEEL_OFFSET;
  const bjAsymmetry    = num(geo.lowerBallJoint?.LF || 7.75) - num(geo.lowerBallJoint?.RF || 6.75);
  const pivotAsymmetry = num(geo.lowerArmPivot?.LF  || 10.0) - num(geo.lowerArmPivot?.RF  || 9.375);
  const fvsaAsymmetry  = rf.fvsa != null && lf.fvsa != null ? lf.fvsa - rf.fvsa : null;
  const rcDiff         = rcAvg != null ? rcAvg - rearRC : null;

  // ── Geometric LLTD ────────────────────────────────────────────────────────
  // Geometric load transfer per axle: ΔF_geo = (axle_weight × lateral_G × RC_height) / track_width
  // Units cancel so G cancels too. Result is in lbs of load transferred per G per axle.
  // geoLLTDF/R expressed as a FRACTION OF TOTAL GEOMETRIC TRANSFER (front / (front+rear)).
  // This is different from the simulation's frontLLTD (46% target) which includes elastic+ARB.
  // Geometric-only fraction: ~60–70% front is normal on a P71 with high front RC (20"+).
  const frontAxleWeight = P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC;
  const rearAxleWeight  = P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC);
  const trackFt         = trackWidthF / 12;
  // Absolute geometric transfer per axle (lbs at 1G):
  const geoLTF_lbs = rcAvg  != null ? frontAxleWeight * (rcAvg  / 12) / trackFt : null;
  const geoLTR_lbs =                  rearAxleWeight  * (rearRC / 12) / trackFt;
  // Fraction of total geometric transfer that goes to the front axle:
  const geoLLTDF = geoLTF_lbs != null ? geoLTF_lbs / (geoLTF_lbs + geoLTR_lbs) : null;
  const geoLLTDR = geoLTF_lbs != null ? geoLTR_lbs / (geoLTF_lbs + geoLTR_lbs) : 0;

  // ── Shock travel analysis ─────────────────────────────────────────────────
  const shockData = {};
  for (const pos of ['LF', 'RF', 'LR', 'RR']) {
    const free = parseFloat(geo.shockFreeLength?.[pos]);
    const inst = parseFloat(geo.shockInstalled?.[pos]);
    const gap  = parseFloat(geo.shockBumpGap?.[pos]);
    const bump = parseFloat(geo.bumpTravel?.[pos]);
    const droop = parseFloat(geo.droopTravel?.[pos]);
    if (free && inst) {
      const compression = free - inst;
      const jounceAvail = gap || null;
      const droopAvail  = compression > 0 ? compression : null; // shaft can extend back out
      shockData[pos] = { free, inst, compression, jounceAvail, droopAvail, gap, bump, droop };
    }
  }

  // ── Ride height analysis ──────────────────────────────────────────────────
  const rhLF = parseFloat(geo.rideHeight?.LF) || null;
  const rhRF = parseFloat(geo.rideHeight?.RF) || null;
  const rhLR = parseFloat(geo.rideHeight?.LR) || null;
  const rhRR = parseFloat(geo.rideHeight?.RR) || null;
  const rhFrontAvg = rhLF && rhRF ? (rhLF + rhRF) / 2 : null;
  const rhRearAvg  = rhLR && rhRR ? (rhLR + rhRR) / 2 : null;
  const rhRake     = rhFrontAvg && rhRearAvg ? rhFrontAvg - rhRearAvg : null;
  const rhSideSplit = rhLF && rhRF && rhLR && rhRR ? ((rhLF + rhLR) / 2 - (rhRF + rhRR) / 2) : null;

  // ── Milliken Ch.16 Ride & Roll Rates ─────────────────────────────────────
  // Spring rates from measurement inputs
  const ksLF = parseFloat(geo.springRate?.LF) || null;
  const ksRF = parseFloat(geo.springRate?.RF) || null;
  const ksLR = parseFloat(geo.springRate?.LR) || null;
  const ksRR = parseFloat(geo.springRate?.RR) || null;
  const irF  = parseFloat(geo.installRatio?.front) || 0.85;  // P71 SLA — 11" spring pickup ÷ 13" arm
  const irR  = parseFloat(geo.installRatio?.rear)  || 1.0;   // solid axle direct-acting
  const tsRear = parseFloat(geo.rearSpringTrack) || num(geo.rearSpringBase) || 44; // rear spring track in

  // Wheel rates = spring rate × IR²
  const kwLF = ksLF ? ksLF * irF * irF : null;
  const kwRF = ksRF ? ksRF * irF * irF : null;
  const kwLR = ksLR ? ksLR * irR * irR : null;
  const kwRR = ksRR ? ksRR * irR * irR : null;
  const kwFavg = (kwLF && kwRF) ? (kwLF + kwRF)/2 : (kwLF ?? kwRF);
  const kwRavg = (kwLR && kwRR) ? (kwLR + kwRR)/2 : (kwLR ?? kwRR);

  // Sprung weight per axle (subtract unsprung — estimate 85 lbs/corner for P71)
  const wUnsprung = 85;
  const wSF = P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC - 2 * wUnsprung;   // ~1939 lbs sprung front
  const wSR = P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC) - 2 * wUnsprung; // ~1421 lbs sprung rear

  // Ride frequency (cpm): ω = (1/2π)√(K_w×12×386.4/W_axle) × 60
  // The 12 converts lb/in → lb/ft for dimensional consistency with g in ft/s²
  // But simpler: ω_Hz = (1/2π)√(K_w [lb/in] × 386.4 [in/s²] / W [lb])
  const rideFreqF_cpm = kwFavg ? ((1/(2*Math.PI)) * Math.sqrt(kwFavg * 386.4 / (wSF/2)) * 60) : null;
  const rideFreqR_cpm = kwRavg ? ((1/(2*Math.PI)) * Math.sqrt(kwRavg * 386.4 / (wSR/2)) * 60) : null;

  // Roll gradient: φ/A_Y = -W×H / (K_φF + K_φR)  [Milliken §16.2]
  // Front roll rate from springs (SLA independent): K_φF = 12 × K_wF × (t_F/2)² / 2 × 2
  //   = K_wF × t_F² / 2  [lb-ft/rad, with t in ft]
  // Front roll rate per axle: K_φF = K_wF[lb/in] × (trackFt)² × 12 / 2  [lb-ft/deg × 57.3]
  // Milliken formula: K_φ [lb-ft/rad] = K_w [lb/in] × t² [ft²] × 12 / 2
  const trackFt_F = trackWidthF / 12;
  const trackFt_R = trackWidthR / 12;
  const tsFt = tsRear / 12;

  // Front: independent SLA — springs provide K_φF = K_wF × t_F² × 12 / 2
  const kPhiF_spring = kwFavg ? (kwFavg * trackFt_F * trackFt_F * 12 / 2) : null;

  // Rear: solid axle — springs are at spring track (T_S), not full track (T_R)
  // For solid axle with tire rate K_T: K_φR = 12(K_WR×T_S²/2)(K_T×T_R²/2) / (K_T×T_R²/2 + K_WR×T_S²/2)
  // Simplified (stiff tires assumption): K_φR ≈ K_WR × T_S² × 12 / 2
  const kPhiR_spring = kwRavg ? (kwRavg * tsFt * tsFt * 12 / 2) : null;

  // Total spring roll rate
  const kPhiTotal = (kPhiF_spring && kPhiR_spring) ? kPhiF_spring + kPhiR_spring : null;

  // Roll gradient (deg/g): φ/A_Y = (W × H_CG / (K_φF + K_φR)) × (180/π)
  // W in lbs, H_CG in ft, K_φ in lb-ft/rad → result in rad/g × 180/π = deg/g
  const cgH_ft = cgH / 12;
  const rollGradient = kPhiTotal
    ? ((P71_TOTAL_WEIGHT * cgH_ft) / kPhiTotal) * (180/Math.PI)
    : null;

  // Roll at apex from spring-derived gradient
  const rollFromSprings = rollGradient ? rollGradient * T.trackG : null;

  // Required total roll rate for target roll gradient (Table 16.1: 1.5 deg/g racing)
  const targetRollGrad = 1.5; // deg/g — racing only target
  const kPhiRequired = (P71_TOTAL_WEIGHT * cgH_ft) / (targetRollGrad * Math.PI/180); // lb-ft/rad
  const kPhiFRequired = isNaN(kPhiRequired) ? null : kPhiRequired * 0.55; // 55% front for oval
  const kPhiRRequired = isNaN(kPhiRequired) ? null : kPhiRequired * 0.45;

  // ARB requirement: additional roll stiffness needed beyond springs
  const arbFRequired = kPhiF_spring != null ? Math.max(0, (kPhiFRequired ?? 0) - kPhiF_spring) : null;
  const arbRRequired = kPhiR_spring != null ? Math.max(0, (kPhiRRequired ?? 0) - kPhiR_spring) : null;
  // Convert lb-ft/rad to lb-ft/deg
  const arbFRequired_deg = arbFRequired != null ? arbFRequired * (Math.PI/180) : null;
  const arbRRequired_deg = arbRRequired != null ? arbRRequired * (Math.PI/180) : null;

  // ── Milliken Ch.21 Spring stress & bumpstop series rate ──────────────────
  const G_steel = 11e6; // psi shear modulus
  const dF_wire = parseFloat(geo.springWireDia?.front)  || null;
  const dR_wire = parseFloat(geo.springWireDia?.rear)   || null;
  const DF_coil = parseFloat(geo.springCoilDia?.front)  || null;
  const DR_coil = parseFloat(geo.springCoilDia?.rear)   || null;
  const NF_coil = parseFloat(geo.springActiveCoils?.front) || null;
  const NR_coil = parseFloat(geo.springActiveCoils?.rear)  || null;

  // Spring rate from first principles: S = Gd⁴ / (8D³N)
  const ksF_calc = (dF_wire && DF_coil && NF_coil)
    ? G_steel * Math.pow(dF_wire,4) / (8 * Math.pow(DF_coil,3) * NF_coil)
    : null;
  const ksR_calc = (dR_wire && DR_coil && NR_coil)
    ? G_steel * Math.pow(dR_wire,4) / (8 * Math.pow(DR_coil,3) * NR_coil)
    : null;

  // Static spring load: F_s = corner_weight / IR  (Milliken §21.4)
  // Corner weight = (total weight × axle fraction) / 2
  const wCornerF = (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC) / 2;   // ~1054 lbs
  const wCornerR = (P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC)) / 2; // ~793 lbs
  const springLoadF = wCornerF / irF;   // static load on front spring
  const springLoadR = wCornerR / irR;   // static load on rear spring

  // Max cornering load on outside spring = static + lateral transfer
  // Lateral load transfer on front = frontAxleWeight × G × rcAvg / trackWidth
  const latTransferF = rcAvg != null
    ? (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * T.trackG * rcAvg / trackWidthF)
    : P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * T.trackG * 0.3; // rough estimate if no RC
  const springLoadF_max = (wCornerF + latTransferF) / irF;
  const springLoadR_max = (wCornerR + (P71_TOTAL_WEIGHT * (1-P71_FRONT_AXLE_FRAC) * T.trackG * rearRC / trackWidthR)) / irR;

  // Max shear stress (uncorrected): f = 8DW/πd³  (Eq.21.13)
  const stressF_static  = dF_wire && DF_coil ? (8 * DF_coil * springLoadF) / (Math.PI * Math.pow(dF_wire, 3)) : null;
  const stressF_max     = dF_wire && DF_coil ? (8 * DF_coil * springLoadF_max) / (Math.PI * Math.pow(dF_wire, 3)) : null;
  const stressR_static  = dR_wire && DR_coil ? (8 * DR_coil * springLoadR) / (Math.PI * Math.pow(dR_wire, 3)) : null;
  const stressR_max     = dR_wire && DR_coil ? (8 * DR_coil * springLoadR_max) / (Math.PI * Math.pow(dR_wire, 3)) : null;
  // Limit: oil-tempered 0.5" wire at 50% tensile ≈ 82,500 psi (Table 21.2/21.3)
  const stressLimit = 82500;

  // Wahl correction factor: K_w = (4C-1)/(4C-4) + 0.615/C, C = D/d (spring index)
  const wahlF = dF_wire && DF_coil ? (() => {
    const C = DF_coil / dF_wire;
    return (4*C-1)/(4*C-4) + 0.615/C;
  })() : null;
  const wahlR = dR_wire && DR_coil ? (() => {
    const C = DR_coil / dR_wire;
    return (4*C-1)/(4*C-4) + 0.615/C;
  })() : null;
  const stressF_wahl = stressF_max && wahlF ? stressF_max * wahlF : null;
  const stressR_wahl = stressR_max && wahlR ? stressR_max * wahlR : null;

  // Springs in series with bumpstop (§21.3, Eq.21.16): S = S1×S2/(S1+S2)
  const ksBumpF = parseFloat(geo.bumpstopRate?.front) || null;
  const ksBumpR = parseFloat(geo.bumpstopRate?.rear)  || null;
  const ksF_eff = (ksLF || ksRF) && ksBumpF
    ? ((ksLF || ksRF) * ksBumpF) / ((ksLF || ksRF) + ksBumpF) : null;
  const ksR_eff = (ksLR || ksRR) && ksBumpR
    ? ((ksLR || ksRR) * ksBumpR) / ((ksLR || ksRR) + ksBumpR) : null;

  // Target spring rate from desired frequency (back-solve for user without springs yet)
  // ω_target = 108 cpm (midpoint of 95–120) → ω_Hz = 1.8
  const freqTarget_hz = 1.8;
  const ksF_target = Math.pow(2*Math.PI*freqTarget_hz, 2) * (wSF/2) / (irF*irF*386.4);
  const ksR_target = Math.pow(2*Math.PI*(freqTarget_hz*0.9), 2) * (wSR/2) / (irR*irR*386.4); // rear 10% lower

  // ── Milliken Ch.22 Damper Analysis ───────────────────────────────────────
  // Critical damping coefficient: C_crit = 2√(k×m) where k=wheel rate (lb/in), m=sprung mass/corner (slugs)
  // Units: k [lb/in], m [lb/386.4 → slugs], C_crit [lb·s/in]
  // Damping force at shaft speed V: F_d = C × V
  const mSF_corner = (wSF / 2) / 386.4; // sprung front corner mass, slugs
  const mSR_corner = (wSR / 2) / 386.4; // sprung rear corner mass, slugs
  const cCritF = kwFavg ? 2 * Math.sqrt(kwFavg * mSF_corner) : null;
  const cCritR = kwRavg ? 2 * Math.sqrt(kwRavg * mSR_corner) : null;

  // Milliken Table 22.2 — non-aero oval: ride ζ = 0.40–0.50, roll ζ = 0.71
  // Target bump (jounce) at ζ_low=0.40, rebound at ζ_high=0.71 (2× bump rule)
  // Damping force at 5 in/sec reference shaft speed
  const refSpeed = 5; // in/sec — body control range (most important per Milliken §22.3)
  const zetaLow = 0.40;
  const zetaHigh = 0.71;
  const fDampBumpF_min  = cCritF ? cCritF * zetaLow  * refSpeed : null;
  const fDampBumpF_max  = cCritF ? cCritF * zetaHigh * refSpeed : null;
  const fDampRebF_min   = cCritF ? cCritF * zetaLow  * refSpeed * 2 : null; // rebound ~2× bump
  const fDampRebF_max   = cCritF ? cCritF * zetaHigh * refSpeed * 2 : null;
  const fDampBumpR_min  = cCritR ? cCritR * zetaLow  * refSpeed : null;
  const fDampBumpR_max  = cCritR ? cCritR * zetaHigh * refSpeed : null;
  const fDampRebR_min   = cCritR ? cCritR * zetaLow  * refSpeed * 2 : null;
  const fDampRebR_max   = cCritR ? cCritR * zetaHigh * refSpeed * 2 : null;

  // Measured damping forces from inputs (optional — user-entered at 5 in/sec)
  const fBumpF_meas  = parseFloat(geo.dampingForce?.bumpFront)  || null;
  const fRebF_meas   = parseFloat(geo.dampingForce?.rebFront)   || null;
  const fBumpR_meas  = parseFloat(geo.dampingForce?.bumpRear)   || null;
  const fRebR_meas   = parseFloat(geo.dampingForce?.rebRear)    || null;

  // Compute measured ζ from entered forces (F = C×V = 2√(km)×ζ×V → ζ = F/(2√(km)×V))
  const zetaF_bump  = (fBumpF_meas && cCritF) ? fBumpF_meas / (cCritF * refSpeed) : null;
  const zetaF_reb   = (fRebF_meas  && cCritF) ? fRebF_meas  / (cCritF * refSpeed) : null;
  const zetaR_bump  = (fBumpR_meas && cCritR) ? fBumpR_meas / (cCritR * refSpeed) : null;
  const zetaR_reb   = (fRebR_meas  && cCritR) ? fRebR_meas  / (cCritR * refSpeed) : null;

  // Bump:rebound ratio check — target ~1:2 (rebound ~2× bump)
  const brRatioF = (fBumpF_meas && fRebF_meas) ? fRebF_meas / fBumpF_meas : null;
  const brRatioR = (fBumpR_meas && fRebR_meas) ? fRebR_meas / fBumpR_meas : null;

  // Wheel hop frequency: unsprung mass resonance on tire spring
  // f_hop = (1/2π)√(K_tire / m_unsprung) — tire rate ~1200 lb/in for 235/55R17
  const kTire = 1200; // lb/in estimate for 235/55R17 at race pressure
  const mUnsprung_slug = wUnsprung / 386.4;
  const fHop_hz = (1 / (2 * Math.PI)) * Math.sqrt(kTire / mUnsprung_slug);
  const fHop_cpm = fHop_hz * 60;

  // ── Milliken Ch.7 Pair Analysis — camber compensation & FLT h_e ──────────
  // Camber compensation: fraction of body roll angle recovered as wheel camber change.
  // 100% = outside wheel stays vertical (infinite FVSA). 0% = wheel leans with body.
  // P71 SLA: camber gain rate = arctan(1/FVSA) °/in. Body rolls at (rollAtApex/rollAtApex_deg).
  // Compensation% = (camberGain °/in × roll_in) / rollAtApex_deg × 100
  // Roll inches = rollAtApex_deg / (roll gradient °/in across half-track)
  // Simpler: for a 1° body roll, outside wheel gains arctan(1/FVSA)/jounceCoeff degrees of camber.
  // jounceCoeff maps roll angle to suspension travel (from our existing slaJounceCoeff).
  // At 1° body roll, jounce ≈ (halfTrack/2 × sin(1°)) ≈ halfTrack×0.00873/2 inches.
  // camberGainPerDegRoll = arctan(1/FVSA) × (halfTrack × π/180 / 2) in deg/deg
  const rfCamberComp = rf.fvsa != null
    ? Math.min(100, Math.round((Math.atan(1/rf.fvsa) * 180/Math.PI) * ((halfTrack/2) * (Math.PI/180)) * 100))
    : null;
  // Roll rate distribution: Milliken §7.2: P_K = K_a / (K_F + K_R - W_S*H_S*y"*A_Z)
  // We don't have spring/ARB rates, but we can compute geometric LLTD fraction as proxy for P_K.
  // Milliken §7.3 optimal for this vehicle class: ~42% front roll rate.
  // Our geoLLTDF/geoLLTDR ratio is the geometric proxy.
  // geoLLTDF already IS the front fraction (sums to 1.0 with geoLLTDR after the fix)
  const rollRateFrontFrac = geoLLTDF;

  // ── Milliken Ch.5 US/OS Balance — Steady-State Stability ──────────────────
  // Bundorf understeer gradient: UG = 57.3(WF/CF - WR/CR) deg/g
  // For P71, assuming equal cornering stiffness per unit load (neutral tire assumption),
  // CF/WF = CR/WR, so UG_tire ≈ 0. All observed push/loose is LLTD + camber-driven.
  //
  // Static Margin: SM = [-(a/ℓ)CF + (b/ℓ)CR] / C  (Milliken §5.11, Eq.5.48a)
  // With equal Cα/lb assumption: SM ≈ b/ℓ - a/ℓ = weight distribution from rear.
  // P71: WF=57% → a/ℓ=0.57, b/ℓ=0.43 → SM ≈ 0.43 - 0.57 = -0.14 (slight OS tendency)
  // Neutral Steer Point: NSP/ℓ = CR/C ≈ 0.5 (midpoint with equal stiffness per axle)
  // CG is at 57% from rear, which is forward of NSP → mild understeer baseline.
  // HOWEVER: at 0.813G the rear tires are more loaded (weight transfer rearward) which
  // shifts effective cornering stiffness rearward → pushes car toward oversteer at speed.
  const wheelbase_ft = 9.558; // 114.7 in
  const ackermannDeg = (wheelbase_ft / (num(geo.apexRadius) || 145)) * (180 / Math.PI);
  // SM estimate from weight distribution alone (tire Cα/lb assumed equal)
  // SM > 0 = understeer tendency, SM < 0 = oversteer tendency
  const smEstimate = 0.43 - 0.57; // b/ℓ - a/ℓ = rear fraction - front fraction
  // geoLLTDF is already the front fraction (0..1). Use directly for US/OS diagnosis.
  // Thresholds on geometric front fraction:
  //   >72% → front heavily biased geometrically → push (front loads up faster)
  //   <55% → rear-biased geometrically → loose
  //   55–72% → normal range for oval P71 geometry
  const lltdFrontFrac = geoLLTDF; // already a fraction
  const lltdTotal = null; // no longer meaningful — kept to avoid breaking downstream refs
  const lltdUGSign = lltdFrontFrac != null
    ? (lltdFrontFrac > 0.72 ? 'UNDERSTEER (front geo-dominated)' : lltdFrontFrac < 0.55 ? 'OVERSTEER (rear geo-dominant)' : 'NORMAL GEOMETRIC SPLIT')
    : null;

  return {
    T,
    rf, lf, halfTrack, trackWidthF, trackWidthR, wh,
    rcAvg, rearRC, cgH, momentArm,
    rollAtApex, rollPerG_used, rollIsComputed, rollGradientSuspect, rfApexLoad,
    rfStatic, lfStatic, rfCaster, lfCaster,
    rfCasterGain, lfCasterGain, rfBodyRoll, lfBodyRoll, swCamber,
    rfGroundCamber, lfGroundCamber, rfCamberDev, lfCamberDev,
    rfStaticDemanded, rfStaticReachable, rfStaticWithinRules, rfStaticGapToReach,
    rfGroundCamberRight, lfGroundCamberRight, rfCamberDevRight, lfCamberDevRight,
    armRatio, scrubRadius, bjAsymmetry, pivotAsymmetry, fvsaAsymmetry,
    rcDiff, geoLLTDF, geoLLTDR,
    shockData, rhLF, rhRF, rhLR, rhRR, rhFrontAvg, rhRearAvg, rhRake, rhSideSplit,
    upPivEstimated: rf.upPivEstimated,
    ackermannDeg, smEstimate, lltdFrontFrac, lltdUGSign, lltdTotal,
    rfCamberComp, rollRateFrontFrac,
    ksLF, ksRF, ksLR, ksRR, irF, irR, tsRear,
    kwLF, kwRF, kwLR, kwRR, kwFavg, kwRavg,
    wSF, wSR, rideFreqF_cpm, rideFreqR_cpm,
    kPhiF_spring, kPhiR_spring, kPhiTotal, rollGradient, rollFromSprings,
    kPhiRequired, arbFRequired, arbRRequired, arbFRequired_deg, arbRRequired_deg,
    targetRollGrad,
    ksF_calc, ksR_calc, springLoadF, springLoadR, springLoadF_max, springLoadR_max,
    stressF_static, stressF_max, stressR_static, stressR_max, stressLimit,
    wahlF, wahlR, stressF_wahl, stressR_wahl,
    ksBumpF, ksBumpR, ksF_eff, ksR_eff,
    ksF_target, ksR_target, wCornerF, wCornerR,
    cCritF, cCritR, refSpeed, zetaLow, zetaHigh,
    fDampBumpF_min, fDampBumpF_max, fDampRebF_min, fDampRebF_max,
    fDampBumpR_min, fDampBumpR_max, fDampRebR_min, fDampRebR_max,
    fBumpF_meas, fRebF_meas, fBumpR_meas, fRebR_meas,
    zetaF_bump, zetaF_reb, zetaR_bump, zetaR_reb,
    brRatioF, brRatioR, fHop_hz, fHop_cpm,
  };
}

// ─── Severity helpers ─────────────────────────────────────────────────────────
const SEV = {
  good:    { color: '#22c55e', bg: '#052e16', border: '#166534', icon: '✓' },
  info:    { color: '#60a5fa', bg: '#0c1a2e', border: '#1e40af', icon: 'ℹ' },
  warning: { color: '#f59e0b', bg: '#1c1206', border: '#92400e', icon: '!' },
  critical:{ color: '#f87171', bg: '#1c0808', border: '#991b1b', icon: '✕' },
};

function Tip({ text, changeable, fixMethod }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid #334155', borderRadius: 3,
          color: '#94a3b8', fontSize: 10, padding: '1px 5px', cursor: 'pointer',
          fontFamily: 'monospace', marginLeft: 6, verticalAlign: 'middle',
        }}>
        {open ? '▲ less' : '▼ how to fix'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', zIndex: 50, width: 320,
          background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
          padding: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 10,
              fontFamily: 'monospace', fontWeight: 700, marginBottom: 6,
              background: changeable ? '#052e16' : '#1c1206',
              color: changeable ? '#22c55e' : '#f59e0b',
              border: `1px solid ${changeable ? '#166534' : '#92400e'}`,
            }}>
              {changeable ? 'ADJUSTABLE' : 'FIXED — P71 PLATFORM LIMIT'}
            </span>
          </div>
          <p style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, margin: 0 }}>
            {text}
          </p>
          {fixMethod && (
            <div style={{ marginTop: 8, padding: '6px 8px', background: '#0f172a', borderRadius: 4, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ color: '#60a5fa', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, marginBottom: 3 }}>METHOD</div>
              <p style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, margin: 0 }}>{fixMethod}</p>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function Finding({ title, value, unit, sev, children, tip }) {
  const s = SEV[sev] || SEV.info;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6,
      padding: '10px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: s.color, fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
          {s.icon} {title}
        </span>
        {value != null && (
          <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
            {value}{unit}
          </span>
        )}
        {tip}
      </div>
      {children && (
        <div style={{ color: '#94a3b8', fontSize: 11.5, fontFamily: 'monospace', lineHeight: 1.65, marginTop: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Stock P71 reference baselines ────────────────────────────────────────────
// HONESTY POLICY: every value carries a `verified` field describing where the
// number actually comes from. Ford never released Panther suspension geometry
// data, so anything labeled `estimated` or `back-solved` should be treated as
// a placeholder until verified by direct measurement. The Metric tile shows an
// "(est.)" tag next to any STOCK value that isn't `verified: 'published'`.
//
// VERIFIED SOURCES:
//   Eaton Detroit Spring catalog (P71 spring rates)
//   Ford service manual (alignment specs)
//   Confirmed Police Interceptor parts (29.5mm ARB)
//   Tire Rack 235/55R17 spec (radius)
//   Geometric truth (solid axle direct-acting IR = 1.0)
//
// EVERYTHING ELSE is back-solved, estimated from passenger-car norms, or
// derived from values that themselves are not from a published source.
const S = (val, verified, source = '') => ({ val, verified, source });

const STOCK_P71 = {
  // ── Roll centers (back-solved to match published 2–5" SLA passenger-sedan range) ──
  frontRC:        S(4.0,    'estimated', 'Back-solved to match Suspension Secrets / Milliken passenger-SLA RC range. Earlier 10.5" value was wrong (produced ~19" computed RC).'),
  rearRC:         S(11.0,   'estimated', 'P71 uses a Watts link rear (factory). Center pivot height ~11" est. from frame bracket geometry. No published OEM figure. Aftermarket adjustable Watts brackets allow ±1–4".'),
  rcDiff:         S(-7.0,   'derived',   'frontRC − rearRC (both estimated)'),
  cgHeight:       S(22.0,   'estimated', 'Body-on-frame full-size sedan typical 21–23". No published P71 value.'),
  momentArm:      S(18.0,   'derived',   'cgHeight − frontRC (both estimated)'),

  // ── Static alignment (Ford service manual) ──
  camberRF:       S(-0.3,   'published', 'Ford service manual, Ford WSM Crown Victoria/Grand Marquis (±0.5° tolerance)'),
  camberLF:       S(-0.3,   'published', 'Ford service manual'),
  casterRF:       S(4.5,    'published', 'Ford service manual midpoint (spec range +3.5° to +5.5°)'),
  casterLF:       S(4.5,    'published', 'Ford service manual midpoint'),

  // ── Camber chain output at street 0.5G ──
  rfGroundCamber: S(+0.8,   'derived',   'Computed from −0.3° static + caster gain + light body roll'),
  lfGroundCamber: S(+0.5,   'derived',   'Same derivation'),

  // ── Suspension hardpoints / geometry ──
  bjAsymmetry:    S(0.0,    'verified',  'Stock factory build is symmetric L/R'),
  pivotAsymmetry: S(0.0,    'verified',  'Stock factory build is symmetric L/R'),
  fvsa:           S(32.5,   'derived',   'Computed from back-solved hardpoints'),
  scrubRadius:    S(0.45,   'derived',   'wh × tan(KPI) − offset. KPI 9.5° is "typical SLA" — not P71-measured; the value in raceSimulation.js claims "confirmed" but no source. Stock 16x7 wheel offset 1.75". Verify by measuring the kingpin axis tilt directly.'),
  wheelHeight:    S(13.6,   'published', 'Tire Rack: 235/55R17 nominal radius at 32 psi cold'),

  // ── LLTD (derived from estimated RC values — directly affected if RC is wrong) ──
  geoLLTDF:       S(0.40,   'derived',   'Front geo LT / total geo LT, with frontRC=4 / rearRC=11. Heavily dependent on RC estimates.'),
  rollRateFront:  S(0.40,   'derived',   'Same'),

  // ── Springs / wheel rates / frequencies ──
  springF:        S(475,    'published', 'Eaton Detroit Spring catalog: P71 Police/Taxi front strut (most common). Civilian base 440, Heavy Duty 700.'),
  springR:        S(160,    'published', 'Eaton catalog + multiple Panther vendors confirm stock rear coil'),
  irF:            S(0.85,   'derived',   'Geometric: spring pickup ~11" out on a 13" lower arm = 11/13 ≈ 0.85. Verify on your car by jacking the front wheel up exactly 1" and measuring spring compression — IR = spring travel ÷ wheel travel.'),
  irR:            S(1.0,    'verified',  'Geometric truth: solid axle, spring directly between axle tube and frame'),
  kwF:            S(343,    'derived',   '475 lb/in × 0.85² ≈ 343 lb/in (depends on irF being correct)'),
  kwR:            S(160,    'derived',   '160 lb/in × 1.0² = 160 lb/in'),
  rideFreqF:      S(112,    'derived',   'Computed from kwF=343 and sprung corner mass'),
  rideFreqR:      S(89,     'derived',   'Computed from kwR=160 and sprung corner mass'),
  rollGradient:   S(5.4,    'derived',   'Springs-only roll gradient at 22" CG. Stock ARB adds stiffness — total likely ~3.5 deg/g.'),

  // ── ARB ──
  arbDiameter:    S(1.161,  'published', 'Confirmed Police Interceptor 29.5mm solid front bar (multiple vendor catalogs)'),
  arbR:           S(0,      'verified',  'P71 has no rear ARB stock (civilian Crown Vic also)'),

  // ── Bumpstop / shock / ride height ──
  shockGapF:      S(2.0,    'estimated', 'Approximate stock travel — not verified to a specific service manual figure'),
  shockGapR:      S(2.0,    'estimated', 'Approximate stock travel'),
  rideHeight:     S(0,      'verified',  'Zero by definition — stock IS the reference'),
  rake:           S(0.5,    'estimated', 'Slight nose-up rake observed on stock cars; not from spec sheet'),

  // ── Damping (Milliken Table 22.2 passenger-car typical, not Panther-measured) ──
  zetaBumpF:      S(0.25,   'estimated', 'Estimated for stock OEM Motorcraft strut (factory P71 fitment). Never publicly dyno-tested. Range 0.20–0.30 is typical for passenger-car comfort tuning per Milliken Table 22.2. To verify: dyno your shock at 5 in/sec.'),
  zetaRebF:       S(0.50,   'estimated', 'Estimated stock OEM front rebound. Range 0.40–0.55 typical. Verify by shock dyno.'),
  zetaBumpR:      S(0.25,   'estimated', 'Estimated stock OEM rear bump (KYB or Motorcraft monotube/twin-tube). Verify by shock dyno.'),
  zetaRebR:       S(0.50,   'estimated', 'Estimated stock OEM rear rebound. Verify by shock dyno.'),
  brRatio:        S(2.0,    'verified',  'Standard 1:2 bump:rebound ratio is manufactured into passenger shocks at the valve stack. Universal for OEM applications unless reshimmed.'),
};

// Helper: format a stock value with an "(est.)" tag if not published-verified.
function stockStr(field, fmt = (v) => v) {
  if (field == null) return '—';
  const tag = field.verified === 'published' || field.verified === 'verified'
    ? '' : ' (est.)';
  return `${fmt(field.val)}${tag}`;
}

// ─── Metric tile — structured 4-row layout ────────────────────────────────────
// Replaces free-form Finding for measurable values. Shows Measured / Stock P71 /
// Optimal / Handling Effect at a glance. Tip stays for deep-dive.
function Metric({
  title,           // e.g. "Front Roll Center"
  measured,        // string formatted value e.g. "18.5" or "+1.50°"
  stock,           // string formatted stock value e.g. "10.5" (factory)"
  optimal,         // string optimal range/target e.g. "15–25" (in range ✓)"
  handling,        // string — what this measured value is doing to the car
  sev,             // 'good' | 'info' | 'warning' | 'critical'
  tip,             // existing <Tip /> element for deep dive
  unit = '',
}) {
  const s = SEV[sev] || SEV.info;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6,
      padding: '10px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ color: s.color, fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
          {s.icon} {title}
        </span>
        {tip}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 4, columnGap: 10, fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.5 }}>
        <span style={{ color: '#64748b', fontWeight: 700 }}>MEASURED</span>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{measured ?? '—'}{unit && measured != null ? unit : ''}</span>

        <span style={{ color: '#64748b', fontWeight: 700 }}>STOCK P71</span>
        <span style={{ color: '#94a3b8' }}>{stock ?? '—'}</span>

        <span style={{ color: '#64748b', fontWeight: 700 }}>OPTIMAL</span>
        <span style={{ color: '#94a3b8' }}>{optimal ?? '—'}</span>

        <span style={{ color: s.color, fontWeight: 700 }}>HANDLING</span>
        <span style={{ color: '#cbd5e1' }}>{handling ?? '—'}</span>
      </div>
    </div>
  );
}

function Section({ title, color = '#60a5fa', children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', textAlign: 'left', background: '#0f172a',
          border: 'none', borderBottom: `2px solid ${color}`,
          padding: '8px 12px', cursor: 'pointer', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          marginBottom: collapsed ? 0 : 10, borderRadius: '4px 4px 0 0',
        }}>
        <span style={{ color, fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{title}</span>
        <span style={{ color: '#475569', fontSize: 11 }}>{collapsed ? '▶ expand' : '▼ collapse'}</span>
      </button>
      {!collapsed && <div style={{ padding: '4px 0' }}>{children}</div>}
    </div>
  );
}

function sign(n) { return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2); }

// ─── Main component ───────────────────────────────────────────────────────────
export default function GeometryAnalysis({ geo }) {
  const trackType = geo.trackType || 'oval';
  const a = useMemo(() => analyzeGeometry(geo, trackType), [geo, trackType]);
  const T = a.T;
  const isOval = trackType === 'oval';

  function rcSev(rc, lo, hi) {
    if (rc == null) return 'info';
    if (rc >= lo && rc <= hi) return 'good';
    if (rc < lo - 4 || rc > hi + 4) return 'critical';
    return 'warning';
  }
  function camberSev(dev) {
    const abs = Math.abs(dev);
    if (abs < 0.3) return 'good';
    if (abs < 0.75) return 'warning';
    return 'critical';
  }

  const rfCamberSev  = camberSev(a.rfCamberDev);
  const lfCamberSev  = camberSev(a.lfCamberDev);
  const frontRCSev   = rcSev(a.rcAvg, T.idealFrontRC_low, T.idealFrontRC_high);
  const rearRCSev    = rcSev(a.rearRC, T.idealRearRC_low, T.idealRearRC_high);
  const asymSev      = Math.abs(a.bjAsymmetry) > 1.5 ? 'warning' : Math.abs(a.bjAsymmetry) > 0.75 ? 'info' : 'good';
  const momentArmSev = a.momentArm != null ? (Math.abs(a.momentArm) < 3 ? 'good' : a.momentArm < 0 ? 'critical' : 'info') : 'info';
  const fvsaSev      = (s) => {
    if (s == null) return 'info';
    if (s >= T.idealFVSA_low && s <= T.idealFVSA_high) return 'good';
    if (s < 10 || s > 30) return 'critical';
    return 'warning';
  };

  const rfGroundStr = sign(a.rfGroundCamber);
  const lfGroundStr = sign(a.lfGroundCamber);

  // RC jacking flag: above ~25" the lateral jacking force becomes significant (Milliken §12.2 item 9)
  const frontRCJacking = a.rcAvg != null && a.rcAvg > 25;

  const rcDiffNote = a.rcDiff != null
    ? a.rcDiff > 2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is ${a.rcDiff.toFixed(1)}" higher than rear (${a.rearRC.toFixed(1)}"). Front is geometrically stiffer in roll — ${isOval ? 'intentional on a left-turn oval to bias geometric load to the RF' : 'may produce understeer on figure-8 with mixed turn directions'}. ${frontRCJacking ? 'WARNING: front RC above 25" — jacking forces are significant. The body will rise under cornering load rather than roll, causing unpredictable load transfer. Lowering ride height or RC is needed.' : ''}`
      : a.rcDiff < -2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is lower than rear (${a.rearRC.toFixed(1)}") by ${Math.abs(a.rcDiff).toFixed(1)}". Rear transfers load geometrically faster — tends to cause oversteer at turn-in and loose corner exit.`
      : `Front RC (${a.rcAvg?.toFixed(1)}") and rear RC (${a.rearRC.toFixed(1)}") are nearly equal. Roll stiffness distribution relies on springs and ARB rather than geometry — spring/ARB tuning is effective here.`
    : '';

  // ── Parts / spring / shock recommendations ────────────────────────────────
  const partsRecs = [];

  // Spring rate from ride height + bumpstop gap
  for (const pos of ['LF', 'RF', 'LR', 'RR']) {
    const sd = a.shockData[pos];
    if (!sd) continue;
    if (sd.jounceAvail != null && sd.jounceAvail < 0.5) {
      partsRecs.push({
        pos, type: 'SPRING — STIFFER or SHORTER BUMP RUBBER',
        color: '#f87171',
        detail: `${pos} bumpstop gap is only ${sd.jounceAvail.toFixed(2)}" at ride height. Contact with the bumpstop is upsetting to the car in any circumstance (Milliken §12.3). The solid rubber stop acts as an instantaneous spring rate spike — the effective rate jumps from the coil rate to effectively infinite at contact, causing the tire to momentarily unload and lose grip. Fix options in order of preference: (1) stiffer spring keeps the car higher and away from the stop; (2) shorter/progressive bump rubber — a tapered bump rubber acts as a rising-rate progressive spring rather than a hard stop; (3) raise ride height if spring rate is already correct.`,
      });
    } else if (sd.jounceAvail != null && sd.jounceAvail < 1.0) {
      partsRecs.push({
        pos, type: 'SPRING — BUMPSTOP PROXIMITY WARNING',
        color: '#f59e0b',
        detail: `${pos} bumpstop gap is ${sd.jounceAvail.toFixed(2)}" — marginal. At 0.813G cornering with body roll, this corner is using approximately ${(sd.jounceAvail * 0.6).toFixed(2)}" of available jounce travel dynamically. You are likely contacting the bump rubber in hard cornering. Consider a progressive-taper bump rubber that begins building rate gradually before full contact — this is effectively a rising-rate spring that smooths the transition and prevents the sharp load spike of a hard stop.`,
      });
    }
    if (sd.compression < 0.5) {
      partsRecs.push({
        pos, type: 'SHOCK — TOPPED OUT (NO DROOP TRAVEL)',
        color: '#f87171',
        detail: `${pos} shock is only ${sd.compression.toFixed(2)}" compressed at ride height — nearly at full extension. The shock has no droop travel remaining, meaning the wheel cannot follow the road surface downward when load is removed. This causes wheel hop, loss of traction on bumps, and reduced cornering grip as the tire bounces off the surface. Fix: longer shock body (more total travel), lower ride height, or adjust spring perch position to compress the shock further at ride height.`,
      });
    }
    if (sd.free && sd.inst && sd.jounceAvail != null) {
      const totalStroke = sd.free - sd.inst + sd.jounceAvail;
      const droopUsed   = sd.free - sd.inst;
      const jounceUsed  = sd.jounceAvail;
      if (totalStroke < 2.0) {
        partsRecs.push({
          pos, type: 'SHOCK — INSUFFICIENT TOTAL TRAVEL',
          color: '#f59e0b',
          detail: `${pos} total usable travel (${droopUsed.toFixed(2)}" droop + ${jounceUsed.toFixed(2)}" to bumpstop) = ${totalStroke.toFixed(2)}". Spring rate and wheel travel must be matched to the track surface — on a rough oval this is not enough travel to keep the wheel in contact with the ground over bumps and surface irregularities. The car will skip and lose traction. Consider a longer-travel shock body or increasing ride height.`,
        });
      }
    }
  }

  // Camber from static alignment
  if (a.rfCamberDev > 0.5) {
    const optStatic = a.rfStatic - a.rfCamberDev;
    partsRecs.push({
      pos: 'RF', type: 'ALIGNMENT — CAMBER BOLT',
      color: '#f97316',
      detail: `RF needs ${Math.abs(a.rfCamberDev).toFixed(2)}° more negative camber. Target static: ${optStatic.toFixed(2)}°. ${optStatic < -4.0 ? 'Beyond −4° camber bolt range — camber plates or subframe offset bushings required.' : 'Install a P71 camber bolt (replaces one strut pinch bolt) to extend range to ≈ −4°. Set at alignment rack.'}`,
    });
  }
  if (!isOval && a.lfCamberDev > 0.5) {
    const optStatic = a.lfStatic - a.lfCamberDev;
    partsRecs.push({
      pos: 'LF', type: 'ALIGNMENT — CAMBER BOLT',
      color: '#f97316',
      detail: `LF needs ${Math.abs(a.lfCamberDev).toFixed(2)}° more negative camber for figure-8. Target static: ${optStatic.toFixed(2)}°. Install P71 camber bolt on LF side as well.`,
    });
  }

  // ARB / moment arm effectiveness
  if (a.momentArm != null && a.momentArm < 2 && a.momentArm >= 0) {
    partsRecs.push({
      pos: 'FRONT', type: 'SPRINGS — RAISE RIDE HEIGHT (RESTORE ARB AUTHORITY)',
      color: '#60a5fa',
      detail: `CG-to-RC moment arm is only ${a.momentArm.toFixed(2)}" — nearly zero. The front ARB and springs are transferring almost no load elastically. This is a critical tuning constraint: unevenly loaded tires produce less lateral force than the same total load split evenly (Milliken §12.3 item 11). Because front LLTD is geometry-dominated at this RC height, stiffening the front ARB or spring does NOT redistribute load to the RF — there is no elastic moment to stiffen. The P71 29.5mm ARB is essentially a ride quality device at this geometry. To restore ARB authority: raise the car 1" (stiffer or taller springs) to grow moment arm to ~${(a.momentArm + 1.5).toFixed(1)}", then the ARB will again shift front elastic LLTD. P71 strut options: 700 lb/in Heavy Duty (tallest), 475 lb/in Police/Taxi, 440 lb/in base.`,
    });
  }

  // Roll stiffness balance recommendations (Milliken §12.3 item 11A/11B)
  // geoLLTDF is now the front fraction directly (sums to 1.0 with geoLLTDR)
  // Correct targets: oval 60–70% front geometric fraction, figure-8 52–68%
  if (a.geoLLTDF != null && a.geoLLTDR != null) {
    const frontFrac = a.geoLLTDF; // already a fraction
    const targetLo  = isOval ? 0.58 : 0.52;
    const targetHi  = isOval ? 0.72 : 0.68;
    if (frontFrac < targetLo) {
      partsRecs.push({
        pos: 'LLTD', type: 'REAR RC — TOO HIGH RELATIVE TO FRONT (ENTRY LOOSE)',
        color: '#f59e0b',
        detail: `Front geometric fraction is ${(frontFrac * 100).toFixed(1)}% — below ${(targetLo*100).toFixed(0)}% target. The rear Watts link pivot is transferring a disproportionately large share of load geometrically. The rear axle loads up faster than the front in a corner, causing oversteer/loose entry. Lower the rear Watts link pivot bracket 1–2" to reduce rear geometric transfer. Or raise front ride height to increase front RC height. (Milliken §12.3 2A)`,
      });
    } else if (frontFrac > targetHi) {
      partsRecs.push({
        pos: 'LLTD', type: 'FRONT RC — TOO HIGH (CHRONIC PUSH)',
        color: '#f59e0b',
        detail: `Front geometric fraction is ${(frontFrac * 100).toFixed(1)}% — above ${(targetHi*100).toFixed(0)}% target. The front RC is so high that it's transferring a disproportionate share of load geometrically to the front axle. This cannot be tuned out with springs or ARB — the geometric path bypasses them. Lower the front RC by raising ride height on stiffer springs, which also restores elastic (spring/ARB) tuning authority.`,
      });
    }
  }

  // Figure-8 specific: symmetric caster recommendation + caster effectiveness note
  if (!isOval && Math.abs(a.rfCaster - a.lfCaster) > 1.0) {
    partsRecs.push({
      pos: 'CASTER', type: 'ALIGNMENT — SYMMETRIC CASTER',
      color: '#a78bfa',
      detail: `Figure-8 needs symmetric caster — car turns both left and right. Current: LF ${a.lfCaster}° / RF ${a.rfCaster}°, split of ${Math.abs(a.rfCaster - a.lfCaster).toFixed(1)}°. Large caster split will give asymmetric camber gain in left vs right turns. Target: within 0.5° side-to-side. On figure-8 (${T.apexSteer}° steer angle), caster contributes ${T.casterCoeffRF.toFixed(3)}°/° of camber — meaningfully more than oval. Symmetric caster of 5–6° gives ~1.45° camber gain per side, which materially helps each outside tire. Adjust via P71 lower arm eccentric camber/caster bolts. (Milliken §12.3 4E: at larger steer angles, KPI and caster give useful negative camber on outside wheel.)`,
    });
  } else if (!isOval) {
    // Note caster effectiveness on figure-8 even if symmetric
    const casterAvg = (a.rfCaster + a.lfCaster) / 2;
    const camberContrib = casterAvg * T.casterCoeffRF;
    if (camberContrib < 1.0) {
      partsRecs.push({
        pos: 'CASTER', type: 'ALIGNMENT — INCREASE CASTER (FIGURE-8)',
        color: '#a78bfa',
        detail: `At ${T.apexSteer}° steer angle, current avg caster of ${casterAvg.toFixed(1)}° contributes only ${camberContrib.toFixed(2)}° of camber gain per side. On figure-8, caster is a meaningful camber tuning tool (unlike oval). Increasing symmetric caster to 6–7° would contribute ~${(6.5 * T.casterCoeffRF).toFixed(2)}° of negative camber on the outside wheel in both left and right turns, reducing the static camber needed. Adjust within P71 eccentric bolt range.`,
      });
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', marginTop: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 8,
        padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ color: '#60a5fa', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          Car Geometry Analysis — Crown Victoria P71 — {T.label}
        </div>
        <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.6 }}>
          {isOval
            ? `Targets based on 1/4-mile left-turn oval at ~48 mph (${T.trackG}G apex). Camber chain validated by pyrometer data April 2026.`
            : `Figure-8 targets use symmetric camber goals — both tires must handle being the outside tire. Apex steer angle estimated at ${T.apexSteer}° (${T.trackG}G avg lateral).`}
          {a.upPivEstimated && <span style={{ color: '#f59e0b' }}> ⚠ Upper arm pivot is estimated — RC and FVSA values will shift when measured.</span>}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — ROLL CENTER
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="1 — ROLL CENTER HEIGHTS" color="#22c55e">
        <Metric
          title="Front Roll Center"
          measured={a.rcAvg != null ? `${a.rcAvg.toFixed(2)}"` : null}
          stock={`${stockStr(STOCK_P71.frontRC, v => `${v}"`)} — back-solved to match published 2–5" SLA passenger-sedan range. NOT measured from a real P71.`}
          optimal={`${T.idealFrontRC_low}–${T.idealFrontRC_high}" for ${T.label}`}
          sev={frontRCSev}
          handling={a.rcAvg == null ? 'Enter front hardpoints to compute.'
            : a.rcAvg > T.idealFrontRC_high
              ? `High front RC = lateral load transferred through control arms before springs/ARB engage. Car loads RF abruptly on entry — sharp turn-in but reduced ARB tuning authority. Increases jacking force tendency (body rises in cornering rather than rolling).`
            : a.rcAvg < T.idealFrontRC_low
              ? `Low front RC = elastic (spring/ARB) load transfer dominates. Slower, smoother weight transfer to RF. Body rolls more for the same lateral G — front end "leans into" the corner. Spring/ARB changes have strong tuning authority.`
            : `RC in target range — balance of geometric and elastic load transfer. ARB and spring changes will produce predictable, proportional handling adjustments.`}
          tip={<Tip
            changeable={false}
            text="On the P71 SLA front suspension, roll center height is set by the control arm geometry — hardpoints welded/bolted to the factory subframe. The only shop-adjustable input is ride height: lowering changes arm angles and migrates the RC downward."
            fixMethod='Ride height adjustment (spring swap or spring spacers) shifts RC. Each 1" of lowering drops front RC approximately 1–2" depending on arm angles. On a figure-8, a lower RC (10–20") is preferred to allow more elastic roll and spring/ARB tuning authority.'
          />}
        />

        <Metric
          title="Rear Roll Center (Watts Link)"
          measured={`${a.rearRC.toFixed(2)}"`}
          stock={`${stockStr(STOCK_P71.rearRC, v => `${v}"`)} — Watts link center pivot height. No published Ford figure; estimated from frame bracket geometry.`}
          optimal={`${T.idealRearRC_low}–${T.idealRearRC_high}" for ${T.label}`}
          sev={rearRCSev}
          handling={a.rearRC > T.idealRearRC_high
            ? `Rear RC too high — rear axle loads up geometrically faster than front. Tail sets first in corner = oversteer / loose entry. Lower the Watts link center pivot by ${(a.rearRC - T.idealRearRC_high).toFixed(1)}–${(a.rearRC - (T.idealRearRC_high + T.idealRearRC_low)/2).toFixed(1)}".`
            : a.rearRC < T.idealRearRC_low
              ? `Rear RC too low — rear elastic transfer dominates, slow weight build on rear tires. Car may understeer mid-corner as front loads up before rear catches up.`
            : `In target — Watts link providing balanced geometric transfer. Predictable rotation through corner.`}
          tip={<Tip
            changeable={true}
            text={`The P71 has a factory Watts link rear (not Panhard) — its roll center sits at the center pivot bolt mounted on the axle housing bracket, between the two horizontal balance arms. Stock height ~11" est. (no published Ford figure). Watts gives near-linear lateral motion of the axle (better than a Panhard arc). Aftermarket adjustable Watts brackets allow raising or lowering by 1–4". Target ${T.idealRearRC_low}–${T.idealRearRC_high}" for ${T.label}.`}
            fixMethod={`Adjustable Watts link center pivot bracket. Each 1" raise increases rear geometric LLTD ~0.5–1%. ${isOval ? 'Target 12–16" for oval.' : 'For figure-8 target 10–18" symmetric.'} Keep Watts link as level as possible in side view to minimize roll steer.`}
          />}
        />

        <Metric
          title="Front vs Rear RC Differential"
          measured={a.rcDiff != null ? `${sign(a.rcDiff)}"` : null}
          stock={`${stockStr(STOCK_P71.rcDiff, v => `${sign(v)}"`)} — rear higher than front (front-RC and rear-RC both estimated)`}
          optimal={isOval ? '+2 to +6" (front higher — biases load to RF on left turn)' : '−1 to +1" (near-equal for symmetric figure-8)'}
          sev={a.rcDiff != null ? (isOval ? (a.rcDiff > 0 ? 'good' : 'warning') : (Math.abs(a.rcDiff) < 3 ? 'good' : 'warning')) : 'info'}
          handling={a.rcDiff == null ? '—'
            : isOval && a.rcDiff > 2
              ? `Front-biased geometric split working in your favor on oval — RF loads up first through links, biasing weight to the heavily loaded outside-front tire. Sharp turn-in.`
            : isOval && a.rcDiff < 0
              ? `Rear higher than front on an oval = rear loads up first = corner-entry oversteer / loose. Raise front RC (taller springs) or lower rear Watts pivot.`
            : !isOval && Math.abs(a.rcDiff) > 3
              ? `Large RC differential on figure-8 = car will handle differently in left vs right turns. Equalize by adjusting Watts link to match front RC.`
            : `Differential is appropriate for ${T.label}. Geometric load transfer split is balanced for the track type.`}
          tip={<Tip
            changeable={false}
            text={`The front/rear RC differential sets the balance of geometric vs elastic load transfer. ${isOval ? 'On oval, front higher than rear is intentional — biases load to the outside (RF) in left turns.' : 'On figure-8, a small differential (front ≈ rear) helps keep the car balanced through both left and right turns.'}`}
            fixMethod="Adjust rear Watts link pivot height to change differential. Front RC only moves with ride height changes."
          />}
        />

        <Metric
          title="CG-to-Roll-Center Moment Arm"
          measured={a.momentArm != null ? `${a.momentArm.toFixed(2)}"` : null}
          stock={`${stockStr(STOCK_P71.momentArm, v => `${v}"`)} — CG 22" (est) − front RC 4" (est)`}
          optimal={`6–14" (gives springs/ARB authority while limiting body roll)`}
          sev={momentArmSev}
          handling={a.momentArm == null ? '—'
            : a.momentArm < 0
              ? `⚠ RC is ABOVE the CG by ${Math.abs(a.momentArm).toFixed(2)}". Body moves OUTWARD in cornering rather than rolling — extreme jacking force. Car will skip and feel completely unpredictable. Raise ride height immediately.`
            : a.momentArm < 3
              ? `Moment arm nearly zero — geometry dominates load transfer. Springs and ARB have weak effect on balance. Adjusting front ARB stiffness will barely move LLTD. Raise the car on taller/stiffer springs to restore tuning authority.`
            : a.momentArm > 16
              ? `Long moment arm — heavy elastic body roll. Front end "wallows" into corners. Stiffen springs or add ARB to control roll angle.`
            : `Healthy moment arm — springs and ARB are providing meaningful elastic load transfer. ARB stiffness changes will produce ~1–2% LLTD shift per increment. Spring changes affect balance directly.`}
          tip={<Tip
            changeable={false}
            text="The moment arm is the vertical distance between CG height and front RC height. Near-zero = ARB and springs transfer almost no elastic load, geometry dominates. Larger arm = springs and ARB dominate."
            fixMethod="Grow the moment arm by lowering the RC (raise the car on taller/stiffer springs) or by reducing RC height via fabrication. Not directly adjustable on P71."
          />}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — CAMBER CHAIN
      ══════════════════════════════════════════════════════════════════ */}
      <Section title={isOval ? '2 — CAMBER CHAIN (LEFT TURN ONLY)' : '2 — CAMBER CHAIN (LEFT TURN)'} color="#f97316">

        <Metric
          title="RF Static Camber"
          measured={`${sign(a.rfStatic)}°`}
          stock={`${stockStr(STOCK_P71.camberRF, v => `${sign(v)}°`)} — Ford service manual spec ±0.5°`}
          optimal={`−2.0° to −3.0° for oval RF (most negative — outside tire needs it)`}
          sev={a.rfStatic > -1.0 ? 'warning' : a.rfStatic > -3.5 ? 'good' : 'info'}
          handling={a.rfStatic > -1.0
            ? `Far from race-needed negative — outside RF tire will run flat-foot or positive at apex once body roll is added in. Outside tread will overheat (pyrometer outside zone hot). Install P71 camber bolt and dial to −2.5°.`
            : `Static camber set in race window. Combined with caster gain and body roll droop, gives the RF the negative camber it needs at apex.`}
          tip={<Tip
            changeable={true}
            text="Static camber is the alignment-rack measurement at ride height with the wheel pointed straight. The RF on oval needs heavy negative because body roll, caster gain, and sidewall compliance all add positive camber once the car is loaded."
            fixMethod="Install P71 camber bolt (replaces one strut pinch bolt) to extend range to ~−4°. Set at alignment rack with the car at race ride height and full fluid load."
          />}
        />

        <Metric
          title="RF Ground Camber at Apex"
          measured={`${rfGroundStr}°`}
          stock={`${stockStr(STOCK_P71.rfGroundCamber, v => `${sign(v)}°`)} at street 0.5G — derived, outside tire goes positive on stock car`}
          optimal={`${T.idealRFGroundCamber}° for ${T.label}`}
          sev={!a.rfStaticReachable ? 'critical' : rfCamberSev}
          handling={!a.rfStaticReachable
            ? `⚠ STATIC CAMBER LIMITED. To hit −2.0° ground camber the chain demands ${a.rfStaticDemanded.toFixed(2)}° static — beyond the P71 cam bolt's ~−3.0° limit by ${a.rfStaticGapToReach.toFixed(2)}°. RF will roll onto outside edge at apex regardless of alignment. Real fix is to REDUCE the dynamic terms: stiffer front spring/ARB to cut body roll, +2 psi RF cold to cut sidewall compliance, or lower CG. ${a.rollIsComputed ? `Current computed body roll is ${a.rollAtApex.toFixed(2)}° (from your spring rates) — every 1° less roll buys back 1° of negative ground camber.` : 'Enter your spring rates to get a real-roll number — current calc uses literature 3.1°/g.'}`
            : Math.abs(a.rfCamberDev) < 0.3
              ? `Contact patch fully loaded across the full tread width at apex. Maximum lateral grip from RF — pyrometer should show even temps inside-to-outside.`
            : a.rfCamberDev > 0.3
              ? `${a.rfCamberDev.toFixed(2)}° short of ideal (not enough negative). Outside tread will overload — pyrometer outside zone hottest = ROLLED OUTSIDE EDGE. Lateral grip reduced 5–15% → mid-corner push. Fix: bring static to ${a.rfStaticDemanded.toFixed(2)}°.`
            : `${Math.abs(a.rfCamberDev).toFixed(2)}° past ideal (over-cambered). Only inside edge contacts at apex — pyrometer inside zone hottest. Inside edge wears fast. Reduce static negative.`}
          tip={<Tip
            changeable={true}
            text={`Ground camber chain at ${T.trackG}G (${a.rollAtApex.toFixed(2)}° body roll ${a.rollIsComputed ? '— COMPUTED from your springs/ARB' : '— literature constant, enter spring rates for real value'}):${a.rollGradientSuspect ? '\n⚠ BODY ROLL CAPPED AT 8°/G — your spring rate inputs imply an unrealistically high roll gradient. Check spring rates (lb/in) and install ratio in your geometry profile.' : ''}
  static          ${sign(a.rfStatic)}°
  caster gain     ${a.rfCasterGain.toFixed(2)}°  (${a.rfCaster}° × −${T.casterCoeffRF}°/° at ${T.apexSteer}° steer)
  SLA jounce      ${a.rfBodyRoll.toFixed(2)}°  (${a.rollAtApex.toFixed(2)}° × −${T.slaJounceCoeff}°/°)
  roll-frame      +${a.rollAtApex.toFixed(2)}°
  sidewall        +${a.swCamber.toFixed(2)}°  (RF apex load ≈ ${a.rfApexLoad.toFixed(0)} lb, scales with load)
  = ground        ${rfGroundStr}°  (ideal ${T.idealRFGroundCamber}°)

To reach the ideal at current dynamic terms, static would need to be ${a.rfStaticDemanded.toFixed(2)}°. P71 cam bolt limit is ~−3.0°.`}
            fixMethod={!a.rfStaticReachable
              ? `Static maxed out — cannot cure the rolled edge with alignment alone. Reduce body roll (stiffer front spring/ARB), reduce RF apex load (lower CG, less weight), or stiffen sidewall (+2 psi cold RF, R-comp tire). Each 1° less roll = ~1° more negative ground camber.`
              : `Increase negative RF static camber to ${a.rfStaticDemanded.toFixed(2)}°. Install P71 camber bolt (replaces strut pinch bolt) to extend range to ~−3.0°. Set at alignment rack.`}
          />}
        />

        <Metric
          title="LF Static Camber"
          measured={`${sign(a.lfStatic)}°`}
          stock={`${stockStr(STOCK_P71.camberLF, v => `${sign(v)}°`)} — Ford service manual spec`}
          optimal={isOval ? `+2° to +3° (positive — inside tire droops in left turn)` : `−1.5° to −2° (symmetric for figure-8)`}
          sev={isOval ? (a.lfStatic < 1.5 ? 'warning' : 'good') : (Math.abs(a.lfStatic + 1.75) < 1 ? 'good' : 'warning')}
          handling={isOval && a.lfStatic < 1.5
            ? `Insufficient positive LF camber for oval — when LF droops in left turn, contact patch will lift onto the outer edge. Set LF static to +2.5°.`
            : isOval
              ? `Set up correctly for oval — LF positive static lets the inside tire stay flat as it droops.`
            : Math.abs(a.lfStatic + 1.75) < 1
              ? `Symmetric setting suitable for figure-8 — LF can handle being outside tire in right turns.`
            : `Asymmetric LF setting — figure-8 needs LF and RF static camber to match within ±0.5°.`}
          tip={<Tip
            changeable={true}
            text={isOval ? 'LF on oval needs positive static camber so it lays flat when it droops during left turn cornering.' : 'For figure-8 LF must handle being outside in right turns — match RF static settings.'}
            fixMethod="Adjust at alignment rack. P71 camber bolt provides ±4° range from stock."
          />}
        />

        <Metric
          title="LF Ground Camber at Apex"
          measured={`${lfGroundStr}°`}
          stock={`${stockStr(STOCK_P71.lfGroundCamber, v => `${sign(v)}°`)} at street 0.5G — derived`}
          optimal={`${T.idealLFGroundCamber}° for ${T.label}`}
          sev={lfCamberSev}
          handling={Math.abs(a.lfCamberDev) < 0.3
            ? `LF inside tire contact patch balanced at apex.`
            : a.lfCamberDev > 0.3
              ? `LF too positive at apex — inside tire on its inner edge. ${isOval ? 'Inside tire is unloaded so the effect on grip is small, but tire wear will be biased.' : 'Reduce static LF camber.'}`
            : `LF too negative — outer edge overloaded. Increase static LF camber.`}
          tip={<Tip
            changeable={true}
            text={isOval
              ? 'LF is the inside tire on a left-turn oval. Ideal ground camber near +0.75° — body roll droops LF in the positive direction, so positive static is needed.'
              : 'LF is the inside tire on a left turn. For figure-8, LF also becomes the outside tire in right turns — symmetric static camber is needed.'}
            fixMethod={isOval
              ? 'Adjust LF static camber at alignment rack. Oval typical: +2° to +3° static — SLA droop subtracts ~1.4° during cornering. Camber bolt provides ±4° range.'
              : 'For figure-8: LF and RF static camber should be nearly equal (both slightly negative, −1° to −2°). Adjust at alignment rack.'}
          />}
        />

        <Metric
          title="Caster (RF / LF)"
          measured={`RF ${a.rfCaster}° / LF ${a.lfCaster}°`}
          stock={`${stockStr(STOCK_P71.casterRF, v => `${v}°`)} / ${stockStr(STOCK_P71.casterLF, v => `${v}°`)} — Ford service manual midpoint, symmetric`}
          optimal={isOval ? `RF 5–7° / LF 3–5° (RF higher pulls the car LEFT — more RF self-centering steers it toward the inside)` : `Both 5–7° symmetric (figure-8 turns both directions)`}
          sev={isOval ? ((a.rfCaster - a.lfCaster) > 1.5 && (a.rfCaster - a.lfCaster) < 4 ? 'good' : 'warning') : (Math.abs(a.lfCaster - a.rfCaster) < 1 ? 'good' : 'warning')}
          handling={isOval
            ? (a.rfCaster - a.lfCaster) >= 1.5 && (a.rfCaster - a.lfCaster) <= 4
              ? `Caster split working in your favor — higher RF caster gives the right-front more self-centering, which steers the car gently left down straights and reduces steering effort entering left turns.`
              : (a.rfCaster - a.lfCaster) < 1.5
                ? `Caster split too small or symmetric — no left-pull benefit. Increase RF caster or decrease LF caster to add natural left-turn pull. RF 2–4° more than LF is typical.`
              : `RF caster MUCH higher than LF — heavy left-pull, may make right corrections difficult on straights.`
            : Math.abs(a.lfCaster - a.rfCaster) < 1
              ? `Symmetric caster — figure-8 will turn left and right with equal effort.`
              : a.rfCaster > a.lfCaster
                ? `RF higher than LF — car will pull LEFT on straights. For figure-8 this creates left/right imbalance.`
                : `LF higher than RF — car will pull RIGHT on straights. For figure-8 this creates left/right imbalance.`}
          tip={<Tip
            changeable={true}
            text="Caster is the fore-aft tilt of the steering axis. Higher caster = more self-centering torque on that wheel. The wheel with MORE caster pulls the car AWAY from its side (toward the opposite side) because it resists being turned more than the other. On oval: RF higher than LF → car pulls left naturally."
            fixMethod="P71 lower control arm uses eccentric caster bolts — turn each to shift the lower arm pivot fore/aft. ±2° range typical. Set at alignment rack."
          />}
        />
      </Section>

      {/* Figure-8: right turn camber chain */}
      {!isOval && a.rfGroundCamberRight != null && (
        <Section title="2B — CAMBER CHAIN (RIGHT TURN)" color="#f97316">
          <Metric
            title="LF Ground Camber — Right Turn (LF is now outside)"
            measured={`${sign(a.lfGroundCamberRight)}°`}
            stock={`+0.8° at street 0.5G (positive — flat-foot)`}
            optimal={`${T.idealRFGroundCamber}° (LF is outside in right turn)`}
            sev={camberSev(a.lfCamberDevRight)}
            handling={Math.abs(a.lfCamberDevRight) < 0.3
              ? `LF outside contact patch loaded correctly in right turn — full lateral grip.`
              : a.lfCamberDevRight > 0.3
                ? `${a.lfCamberDevRight.toFixed(2)}° short of ideal — outside tread overloaded in right turn. Push tendency right turns. Add negative LF static.`
              : `${Math.abs(a.lfCamberDevRight).toFixed(2)}° over-cambered for right-turn outside — inside edge overloaded.`}
            tip={<Tip
              changeable={true}
              text="In a right turn on figure-8, LF becomes the outside tire. It jounces (compresses), caster gain reverses direction, and roll-frame conversion reverses. Target: −1.75°."
              fixMethod="Reduce LF static camber toward −1° to −2° to handle being the outside tire in right turns. This is a compromise — symmetric static settings are the only way to balance both turn directions."
            />}
          />

          <Metric
            title="RF Ground Camber — Right Turn (RF is now inside)"
            measured={`${sign(a.rfGroundCamberRight)}°`}
            stock={`+0.8° at street 0.5G`}
            optimal={`${T.idealLFGroundCamber}° (RF is inside in right turn)`}
            sev={camberSev(a.rfCamberDevRight)}
            handling={Math.abs(a.rfCamberDevRight) < 0.3
              ? `RF inside contact patch balanced in right turn.`
              : `${Math.abs(a.rfCamberDevRight).toFixed(2)}° from ideal — figure-8 requires compromise; pyrometer data needed.`}
            tip={<Tip
              changeable={true}
              text="In a right turn, RF becomes the inside tire. It droops, caster gain reverses, and roll-frame conversion reverses."
              fixMethod="Symmetric static around −1.5° to −2° is the target for figure-8."
            />}
          />

          {(() => {
            // Optimal static: the value that puts the OUTSIDE tire at ideal ground camber.
            // Dynamic terms when a tire is outside: casterGain + bodyRoll_jounce + rollFrame + swCamber
            // Use RF caster for RF (left turn outside) and LF caster for LF (right turn outside).
            const dynRF = a.rfCasterGain + a.rfBodyRoll + a.rollAtApex + a.swCamber;
            const dynLF = -(a.lfCaster * T.casterCoeffLF) + (-(a.rollAtApex * T.slaJounceCoeff)) + a.rollAtApex + a.swCamber;
            const optRF = T.idealRFGroundCamber - dynRF;
            const optLF = T.idealRFGroundCamber - dynLF;
            const optAvg = (optRF + optLF) / 2;
            const reachable = optAvg >= P71_MAX_STATIC_NEG_CAMBER;
            return (
              <Finding title="Figure-8 Camber Compromise Summary" sev={reachable ? 'info' : 'warning'}>
                Left turn: RF outside {rfGroundStr}° (ideal {T.idealRFGroundCamber}°) / LF inside {lfGroundStr}° (ideal {T.idealLFGroundCamber}°){'\n'}
                Right turn: LF outside {sign(a.lfGroundCamberRight)}° (ideal {T.idealRFGroundCamber}°) / RF inside {sign(a.rfGroundCamberRight)}°{'\n\n'}
                Optimal static for RF (left-turn outside): {optRF.toFixed(2)}°{'\n'}
                Optimal static for LF (right-turn outside): {optLF.toFixed(2)}°{'\n'}
                Best symmetric compromise (set both sides): {optAvg.toFixed(2)}°{'\n'}
                {!reachable
                  ? `⚠ ${optAvg.toFixed(2)}° is beyond the P71 cam bolt limit (−3.0°). Cannot reach ideal with static alone — reduce body roll with stiffer springs/ARB. Every 1° less roll buys back ~0.65° of negative ground camber.`
                  : `Set both sides to ${optAvg.toFixed(2)}° as a starting point — tune from there with pyrometer data.`}
              </Finding>
            );
          })()}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — INSTANT CENTER & FVSA
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="3 — INSTANT CENTER & SWING ARM LENGTH" color="#a78bfa">
        <Metric
          title="RF Instant Center"
          measured={a.rf.ic ? `(${a.rf.ic.x.toFixed(1)}", ${a.rf.ic.y.toFixed(1)}")` : null}
          stock={`(~−18", ~10") (typical SLA stock geometry)`}
          optimal={`IC inboard of wheel, above ground — fixed by P71 hardpoints`}
          sev={a.rf.ic ? 'info' : 'warning'}
          handling={a.rf.ic
            ? `IC ${Math.abs(a.rf.ic.x).toFixed(1)}" inboard at ${a.rf.ic.y.toFixed(1)}" height = camber gain rate of ${(57.3 / (a.rf.fvsa ?? 1)).toFixed(2)}°/in of suspension travel. As RF jounces in cornering, this rate continuously adds negative camber to keep the outside tire flat — this is the P71's biggest oval advantage over MacPherson cars.`
            : 'Enter all four front hardpoints to compute.'}
          tip={<Tip
            changeable={false}
            text="The IC is where the upper and lower control arm lines intersect when extended. Its location sets camber gain rate per inch of suspension travel. Fixed by factory arm geometry."
            fixMethod="IC location cannot be changed without fabricating new pickup points. Slight shift possible via ride height change (arm angle changes)."
          />}
        />

        <Metric
          title="LF Instant Center"
          measured={a.lf.ic ? `(${a.lf.ic.x.toFixed(1)}", ${a.lf.ic.y.toFixed(1)}")` : null}
          stock={`Symmetric to RF (~+18", ~10")`}
          optimal={isOval ? `Slight L/R asymmetry acceptable on oval` : `Match RF within ±1" for figure-8`}
          sev={a.lf.ic ? 'info' : 'warning'}
          handling={a.lf.ic && a.rf.ic
            ? `L/R IC height differs by ${Math.abs((a.rf.ic?.y ?? 0) - a.lf.ic.y).toFixed(2)}". ${!isOval && Math.abs((a.rf.ic?.y ?? 0) - a.lf.ic.y) > 1.5 ? 'Significant asymmetry for figure-8 — different camber gain rates L vs R will make the car feel inconsistent corner-to-corner.' : 'Acceptable symmetry.'}`
            : 'LF IC could not be computed.'}
          tip={<Tip changeable={false} text="LF IC: typically symmetric to RF on stock platform. Asymmetry in measurements points to LF/RF spring or arm height differences." fixMethod="Fixed geometry." />}
        />

        <Metric
          title="RF FVSA (Front View Swing Arm)"
          measured={a.rf.fvsa != null ? `${a.rf.fvsa.toFixed(1)}"` : null}
          stock={`${stockStr(STOCK_P71.fvsa, v => `${v}"`)} — derived from back-solved hardpoints`}
          optimal={`${T.idealFVSA_low}–${T.idealFVSA_high}" for ${T.label}`}
          sev={fvsaSev(a.rf.fvsa)}
          handling={a.rf.fvsa == null ? 'Cannot compute — IC not found.'
            : a.rf.fvsa < T.idealFVSA_low
              ? `Very short FVSA = aggressive ${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(2)}°/in camber gain. Outside tire stays well-cambered but susceptible to scrub on rough surfaces (lateral movement of contact patch in jounce).`
            : a.rf.fvsa > T.idealFVSA_high
              ? `Long FVSA = gentle ${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(2)}°/in camber gain. Less roll compensation — more burden on static camber to keep RF outside tire flat. Less scrub disturbance.`
            : `In target — ${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(2)}°/in camber gain provides good roll compensation without excessive scrub.`}
          tip={<Tip
            changeable={false}
            text={`FVSA = distance from front-view IC to wheel center. Sets camber change rate: rate = arctan(1/FVSA) ≈ 57.3/FVSA °/in. Target ${T.idealFVSA_low}–${T.idealFVSA_high}" for ${T.label}.`}
            fixMethod="Fixed by hardpoint geometry. Not adjustable without fabrication."
          />}
        />

        <Metric
          title="LF FVSA"
          measured={a.lf.fvsa != null ? `${a.lf.fvsa.toFixed(1)}"` : null}
          stock={`${stockStr(STOCK_P71.fvsa, v => `${v}"`)} — symmetric with RF`}
          optimal={isOval ? `Within ±3" of RF FVSA` : `Match RF within ±1" for figure-8`}
          sev={fvsaSev(a.lf.fvsa)}
          handling={a.lf.fvsa != null && a.rf.fvsa != null
            ? `Delta vs RF: ${(a.lf.fvsa - a.rf.fvsa).toFixed(1)}". ${!isOval && Math.abs(a.lf.fvsa - a.rf.fvsa) > 3 ? 'Large FVSA asymmetry for figure-8 — different camber gain L vs R = car will feel different turning each direction.' : 'Asymmetry within manageable range.'}`
            : '—'}
          tip={<Tip changeable={false} text="LF FVSA sets how fast LF gains camber in droop (during cornering). Camber change rate = arctan(1/FVSA length) — Milliken §17.3." fixMethod="Fixed geometry." />}
        />

        <Metric
          title="Camber Compensation (Milliken §7.3)"
          measured={a.rfCamberComp != null ? `~${a.rfCamberComp}%` : null}
          stock={`~50% (typical SLA at stock geometry)`}
          optimal={`60–100% (more is better — outside tire stays vertical)`}
          sev={a.rfCamberComp == null ? 'info' : a.rfCamberComp >= 60 ? 'good' : a.rfCamberComp >= 40 ? 'warning' : 'critical'}
          handling={a.rfCamberComp == null ? 'Enter all four front hardpoints.'
            : a.rfCamberComp >= 60
              ? `Geometry recovers ${a.rfCamberComp}% of body roll as camber gain — outside tire stays nearly vertical. Lateral grip near maximum.`
            : a.rfCamberComp >= 40
              ? `Moderate compensation — outside tire loses ${100-a.rfCamberComp}% of static camber to body roll. Static negative camber must compensate, increasing tire wear.`
            : `Low compensation — outside tire loses most of static camber to body roll. RF will run heavily on outside edge. Need more aggressive static negative camber.`}
          tip={<Tip
            changeable={false}
            text="Milliken §7.3: 'Camber compensation' is the fraction of body roll angle that is recovered as wheel camber change. 100% = outside wheel stays perfectly vertical."
            fixMethod="Fixed geometry — FVSA is set by arm hardpoints."
          />}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — SUSPENSION ASYMMETRY
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="4 — LF/RF SUSPENSION ASYMMETRY" color="#f59e0b">
        <Metric
          title="Ball Joint Height Asymmetry (LF vs RF)"
          measured={`${(a.bjAsymmetry >= 0 ? '+' : '')}${a.bjAsymmetry.toFixed(3)}"`}
          stock={`${stockStr(STOCK_P71.bjAsymmetry, v => `${v}"`)} — factory build is symmetric L/R`}
          optimal={isOval ? `+0.5 to +1.5" (LF higher — biases RF to more negative camber)` : `±0.25" (symmetric for figure-8)`}
          sev={isOval ? asymSev : (Math.abs(a.bjAsymmetry) > 0.5 ? 'warning' : 'good')}
          handling={isOval
            ? a.bjAsymmetry > 0.3 && a.bjAsymmetry < 1.8
              ? `Oval-tuned asymmetry — RF rides lower, gaining built-in negative camber. Reduces static camber needed at the alignment rack.`
              : Math.abs(a.bjAsymmetry) > 1.8
                ? `Large asymmetry — verify against intended setup. May indicate sagging spring on one side.`
              : `Symmetric — leaving lateral camber bias on the table. Could drop RF spring perch ½ turn for more RF negative camber.`
            : Math.abs(a.bjAsymmetry) < 0.5
              ? `Good figure-8 symmetry — car will handle the same in left vs right turns.`
              : `Will cause noticeably different IC positions and camber gain rates L vs R turn — equalize spring perches.`}
          tip={<Tip
            changeable={true}
            text={isOval
              ? 'LF higher than RF is common on oval setups — RF sits lower to bias RF corner toward more negative camber.'
              : 'For figure-8, LF and RF should be as symmetric as possible.'}
            fixMethod={isOval
              ? 'If intentional for oval: document as baseline. If unintentional: check spring seats, spring free lengths, ride heights.'
              : 'For figure-8: normalize LF and RF ball joint heights by adjusting spring perch height or spring free length to equalize side-to-side ride height.'}
          />}
        />

        <Metric
          title="Wheel Center Height vs Tire Radius"
          measured={`${a.wh.toFixed(3)}"`}
          stock={`${stockStr(STOCK_P71.wheelHeight, v => `${v}"`)} — Tire Rack 235/55R17 spec at 32 psi cold`}
          optimal={`13.59" (matches tire-neutral radius — neither over- nor under-loaded)`}
          sev={Math.abs(a.wh - 13.59) > 1.0 ? 'warning' : Math.abs(a.wh - 13.59) > 0.5 ? 'info' : 'good'}
          handling={Math.abs(a.wh - 13.59) < 0.3
            ? `At tire-neutral height — car is at design ride height, springs operating in their intended range.`
            : a.wh < 13.59
              ? `${(13.59 - a.wh).toFixed(2)}" lower than tire-neutral — car is sitting on compressed springs and may be near bumpstops in cornering. Lowered ride height tends to push, especially on rough surfaces.`
            : `${(a.wh - 13.59).toFixed(2)}" higher than tire-neutral — car may be on droop side or pressures over-inflated. Body rolls more for given lateral G.`}
          tip={<Tip
            changeable={true}
            text="Wheel center height should match tire radius (13.59 in for 235/55R17 at rated pressure)."
            fixMethod="Check cold pressures first. If still low: stiffer or taller springs, or spring spacers."
          />}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — SCRUB RADIUS & STEERING
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="5 — SCRUB RADIUS & STEERING GEOMETRY" color="#60a5fa">
        <Metric
          title="Scrub Radius"
          measured={`${a.scrubRadius.toFixed(3)}"`}
          stock={`${stockStr(STOCK_P71.scrubRadius, v => `${v}"`)} — derived from KPI 9.5° (typical SLA, not P71-verified) and 1.75" offset`}
          optimal={`+0.3 to +1.5" (small positive = light, direct steering feel)`}
          sev={a.scrubRadius > 0 && a.scrubRadius < 1.5 ? 'good' : a.scrubRadius < 0 ? 'warning' : 'info'}
          handling={a.scrubRadius < 0
            ? `Negative scrub — steering will feel "floppy" and disconnected from the road. Wheel offset may be wrong (too far outboard).`
            : a.scrubRadius < 0.5
              ? `Very low scrub — light, low-effort steering with little road feel. Acceptable but quick to upset by single-wheel impacts.`
            : a.scrubRadius < 1.5
              ? `Healthy positive scrub — steering has clear road feel and self-centering. Single-wheel bumps cause manageable kickback.`
            : `Moderate scrub — adequate feel but heavier steering. Single-wheel impacts cause noticeable kickback.`}
          tip={<Tip
            changeable={false}
            text="Scrub radius is the distance between the kingpin axis projected to ground and the tire contact patch center. Fixed by KPI (cast into the spindle/knuckle) and wheel offset. The model assumes KPI = 9.5° based on typical SLA values — this is NOT P71-verified. To be sure: measure your spindle's kingpin tilt directly, or look up the spindle part number in a service manual."
            fixMethod="Fixed by KPI (spindle casting, not adjustable) and wheel offset. Different wheel offset shifts scrub by the same amount the offset changes. Do not modify unless you have a specific steering complaint."
          />}
        />

        <Metric
          title="Scrub Motion Direction"
          measured={(() => {
            const icY = a.rf.ic?.y;
            const icX = a.rf.ic?.x;
            if (icY == null) return null;
            if (icY > 0 && icX != null && icX < 0) return 'SCRUB OUT on jounce';
            if (icY < 0) return 'SCRUB IN on jounce';
            return 'Minimal scrub';
          })()}
          stock={`SCRUB OUT on jounce (stock SLA condition)`}
          optimal={`SCRUB OUT or minimal — SCRUB IN is a measurement error indicator`}
          sev={(() => {
            const icY = a.rf.ic?.y;
            if (icY == null) return 'info';
            return icY > 0 ? 'info' : 'warning';
          })()}
          handling={(() => {
            const icY = a.rf.ic?.y;
            const icX = a.rf.ic?.x;
            if (icY == null) return 'Enter all four hardpoints.';
            const rate = a.rf.fvsa != null ? (Math.abs(a.rf.ic.x) / a.rf.fvsa).toFixed(3) : '—';
            if (icY > 0 && icX != null && icX < 0) {
              return `As RF jounces in cornering, contact patch moves OUTWARD ~${rate} in per inch of travel. On smooth surfaces this widens effective track width slightly (helpful). On rough pavement, the lateral motion disturbs slip angles and introduces understeer transients over bumps.`;
            }
            if (icY < 0) return `Tire scrubs inward in jounce — unusual for SLA. Likely a hardpoint measurement error. Verify IC position.`;
            return `Minimum scrub — ideal for rough tracks. Suspension travel doesn't disturb slip angle.`;
          })()}
          tip={<Tip
            changeable={false}
            text="Scrub motion is lateral tire movement relative to the ground as the suspension travels."
            fixMethod="Fixed geometry — IC is set by control arm hardpoints."
          />}
        />

        <Metric
          title="Arm Length Ratio (Upper/Lower)"
          measured={(P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH).toFixed(3)}
          stock={`0.731 (P71 OEM — 9.5" upper / 13.0" lower)`}
          optimal={`0.65–0.80 (shorter upper = more camber gain in jounce — race-favorable)`}
          sev="info"
          handling={`Shorter upper arm forces the outside wheel to gain negative camber as it jounces in cornering. This is the P71's key oval advantage over MacPherson cars — the SLA geometry actively recovers body roll. Ratio is fixed and not adjustable.`}
          tip={<Tip
            changeable={false}
            text="Ratio < 1.0 means shorter upper arm — wheel gains negative camber in jounce. P71 0.731 ratio produces the SLA jounce coefficient of −0.355°/° roll."
            fixMethod="Fixed P71 geometry. Cannot be changed with available aftermarket parts."
          />}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — LLTD
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="6 — LATERAL LOAD TRANSFER DISTRIBUTION (LLTD)" color="#22c55e">
        <Metric
          title="Geometric LLTD — Front Share"
          measured={a.geoLLTDF != null ? `${(a.geoLLTDF * 100).toFixed(1)}%` : null}
          stock={`~50% (stock front RC ≈ rear RC, balanced split)`}
          optimal={isOval ? `60–70% front (oval — bias load to outside-front via geometry)` : `52–68% front (figure-8)`}
          sev={a.geoLLTDF != null
            ? (isOval
              ? (a.geoLLTDF >= 0.58 && a.geoLLTDF <= 0.72 ? 'good' : a.geoLLTDF < 0.50 ? 'warning' : 'info')
              : (a.geoLLTDF >= 0.52 && a.geoLLTDF <= 0.68 ? 'good' : 'warning'))
            : 'info'}
          handling={a.geoLLTDF == null ? 'Enter front hardpoints.'
            : isOval && a.geoLLTDF >= 0.58 && a.geoLLTDF <= 0.72
              ? `Geometry biases load to RF outside tire — sharp turn-in, RF loads up before springs deflect. Springs/ARB add rear elastic transfer to bring total LLTD toward the 46% optimum target.`
            : a.geoLLTDF < 0.55
              ? `Front geometric fraction LOW — rear loads up faster than front in a corner = entry oversteer / loose. Front RC needs to come up or rear Watts needs to drop.`
            : a.geoLLTDF > 0.72
              ? `Front geometric fraction VERY HIGH — front tires take a disproportionate share of load before springs engage. Chronic push that ARBs cannot tune out (geometry bypasses elastic path). Lower front RC.`
            : `Geometric split is workable — minor tuning via spring/ARB will bring total LLTD to optimum.`}
          tip={<Tip
            changeable={false}
            text="Fraction of GEOMETRIC load transfer (through RC links) that goes to the front axle. Optimizer's 46% target is TOTAL (geometric + elastic + ARB); geometric-only is normally higher on a P71."
            fixMethod="Lower front RC (raise ride height on stiffer springs) to shift geometric transfer rearward. Raise rear Watts pivot to shift geometric transfer forward."
          />}
        />

        <Metric
          title="Geometric LLTD — Rear Share"
          measured={a.geoLLTDF != null ? `${(a.geoLLTDR * 100).toFixed(1)}%` : null}
          stock={`~50% (stock symmetric split)`}
          optimal={`28–42% rear (most geometric LT to front because front RC is higher)`}
          sev={a.geoLLTDF != null ? (a.geoLLTDR >= 0.28 && a.geoLLTDR <= 0.42 ? 'good' : 'info') : 'info'}
          handling={a.geoLLTDF == null ? '—'
            : a.geoLLTDR > 0.45
              ? `Rear taking too much geometric load = rear tires unevenly loaded, less combined grip, oversteer tendency. Lower the Watts link pivot.`
            : a.geoLLTDR < 0.28
              ? `Rear geometric load too low — rear tires loaded evenly, lots of grip back there. Car may push since rear is "stuck" while front is overloaded.`
            : `Rear taking healthy minority share — rear stays planted while front geometry dominates load distribution. Predictable rotation.`}
          tip={<Tip
            changeable={true}
            text="Higher rear RC = more rear geometric transfer = rear tires load up sooner = oversteer tendency. The Watts link pivot height directly controls this."
            fixMethod="Adjustable Watts link pivot bracket. Raising the pivot 1 inch increases rear geometric transfer."
          />}
        />

        <Metric
          title="Geometric Roll Rate Distribution (Milliken §7.3)"
          measured={a.rollRateFrontFrac != null ? `${(a.rollRateFrontFrac * 100).toFixed(1)}%` : null}
          stock={`~50% (stock balanced)`}
          optimal={isOval ? `58–72% front (oval)` : `52–68% front (figure-8)`}
          sev={a.rollRateFrontFrac == null ? 'info'
            : isOval
              ? (a.rollRateFrontFrac >= 0.58 && a.rollRateFrontFrac <= 0.72 ? 'good' : 'warning')
              : (a.rollRateFrontFrac >= 0.52 && a.rollRateFrontFrac <= 0.68 ? 'good' : 'warning')}
          handling={a.rollRateFrontFrac == null ? '—'
            : `Geometric-only split. Springs and ARB add elastic transfer on TOP of this — bringing the total LLTD toward the 42–46% optimum found by Milliken's MRA testing. ${isOval ? 'Oval needs predominantly rear-biased elastic transfer to compensate for the front-heavy geometric split.' : 'Figure-8 wants near-symmetric front/rear elastic transfer.'}`}
          tip={<Tip
            changeable={true}
            text="Milliken §7.3: MRA analysis of a 3570 lb sports sedan found MAXIMUM lateral acceleration with 42% TOTAL LLTD to the front — geometric + elastic + ARB combined."
            fixMethod="Geometric fraction: lower front RC to reduce front share. Spring/ARB stiffness adds elastic transfer on top."
          />}
        />

        {isOval && (
          <Finding
            title="Stagger Effect — Diagonal Weight Jacking (Milliken §7.1)"
            value="—" unit=""
            sev="info"
            tip={<Tip
              changeable={true}
              text="Milliken §7.1: Tire stagger has the same load effect as diagonal weight jacking. RR larger than LR adds wedge (tighter). Used on ovals to dial out push."
              fixMethod="Select tires of different diameter for left vs right side. Measure tire circumference with tape after session at operating temp."
            />}
          >
            Stagger is the oval equivalent of diagonal weight jacking. A larger RR tire shifts load toward the RF/LR diagonal — same effect as turning the LR spring perch up. Use to trim mid-corner balance: more RR stagger = tighter mid-corner. Measure tire circumference after session when tires are at operating temp.
          </Finding>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — US/OS BALANCE — STEADY-STATE STABILITY (Milliken Ch.5)
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="7 — US/OS BALANCE — STEADY-STATE STABILITY" color="#fb923c">

        <Metric
          title="Ackermann Steer Angle"
          measured={`${a.ackermannDeg.toFixed(2)}°`}
          stock={`Same — set by P71 wheelbase (114.7") and turn radius`}
          optimal={`Match actual steer to Ackermann + slip angles (no fixed target)`}
          sev="info"
          handling={`δ_Ackermann = (9.558 ft wheelbase) / ${num(geo.apexRadius) || 145} ft radius × 180/π = ${a.ackermannDeg.toFixed(2)}°. At ${T.apexSteer}° actual steer, front slip angle contribution = ${(T.apexSteer - a.ackermannDeg).toFixed(2)}°. A neutral car would steer at exactly Ackermann; more steering needed = understeer, less = oversteer.`}
          tip={<Tip
            changeable={false}
            text="Milliken §5.3: The Ackermann (geometric) steer angle δ = ℓ/R is the angle required to negotiate a turn of radius R with zero tire slip."
            fixMethod="Increase apex radius (wider line) to reduce Ackermann angle and reduce required slip."
          />}
        />

        <Metric
          title="Static Margin (Weight Distribution)"
          measured={`${(a.smEstimate * 100).toFixed(0)}%`}
          stock={`−14% (P71 57% front weight is fixed)`}
          optimal={`−5% to +5% near-neutral (negative = OS tendency, positive = US tendency)`}
          sev={a.smEstimate < -0.1 ? 'warning' : 'info'}
          handling={`P71 weight distribution (57% front, 43% rear) puts CG ahead of the Neutral Steer Point → slight geometric understeer in the linear range. At ${T.trackG}G race speed the rear loads up from weight transfer and the car shifts toward OS — LLTD becomes the dominant diagnostic, not static margin.`}
          tip={<Tip
            changeable={false}
            text="SM = b/ℓ − a/ℓ = rear weight fraction − front weight fraction. P71: 57% front → SM ≈ −14%."
            fixMethod="Weight distribution is fixed on P71. Use LLTD section for race-speed balance diagnosis."
          />}
        />

        <Metric
          title="LLTD-Derived US/OS Tendency"
          measured={a.lltdUGSign ?? null}
          stock={`Stock LLTD ~50/50 = mild understeer at limit (front-heavy weight)`}
          optimal={`NORMAL GEOMETRIC SPLIT (front fraction in 55–72% range)`}
          sev={a.lltdUGSign == null ? 'info'
            : a.lltdUGSign.includes('UNDERSTEER') ? 'warning'
            : a.lltdUGSign.includes('OVERSTEER')  ? 'warning'
            : 'good'}
          handling={a.lltdFrontFrac == null ? 'Enter front RC data.'
            : a.lltdFrontFrac > 0.72
              ? `Front geometry-overloaded — chronic mid-corner push that ARB changes won't cure (geometry bypasses springs). Lower front RC (raise ride height) is the only real fix.`
            : a.lltdFrontFrac < 0.55
              ? `Front under-loaded geometrically — car loose on entry as rear loads up first. Raise front RC or lower rear Watts.`
            : `Geometric split is in the normal P71 race window. Springs and ARB carry the elastic load transfer to bring total LLTD to optimum 46%.`}
          tip={<Tip
            changeable={true}
            text="Whichever axle carries more geometric load transfer will see its tires load up faster and degrade first. >72% front → push. <55% front → loose."
            fixMethod="Lower front RC to reduce front geometric fraction. Raise rear Watts pivot to increase rear geometric fraction."
          />}
        />

        <Metric
          title="Compliance Steer — Front (Milliken §23)"
          measured={`UNDERSTEER BIAS (rubber-mounted P71 steering)`}
          stock={`Same — stock rubber bushings everywhere`}
          optimal={`Minimize compliance with poly bushings + solid steering box mount`}
          sev="warning"
          handling={`At ${T.trackG}G, lateral force at the tires deflects rubber steering box mount and tie rod bushings — front wheels toe OUT slightly = adds understeer (~0.25–0.75°/g effective UG). This is in addition to the geometric setup. Driver feels: "more steering needed than expected" mid-corner.`}
          tip={<Tip
            changeable={true}
            text="Milliken §23: Lateral force compliance steer on the front is almost always an understeer effect. Rubber bushings amplify this on the P71."
            fixMethod="Replace rubber steering box mount with solid/poly. Replace tie rod end bushings with poly or spherical. Stiffen K-member control arm bushings with poly inserts."
          />}
        />

        <Metric
          title="Compliance Camber — Front & Rear"
          measured={`Front: +0.48° outside (modeled) / Rear: 0° (solid axle)`}
          stock={`Same — front rubber bushings deflect, rear solid axle does not`}
          optimal={`Stiffer front bushings reduce the +0.48° front compliance gain`}
          sev="info"
          handling={`Front: lateral force tilts the RF outside tire ~0.48° positive in cornering — already accounted for in the −2° static camber target. Rear: P71 solid beam axle doesn't tilt under load, so the rear compliance-camber oversteer found on IRS cars is eliminated. Key reason solid axle is preferred for ovals.`}
          tip={<Tip
            changeable={true}
            text="Milliken §23: Lateral compliance camber tilts outside tire positive on the front (US effect). Rear solid axle is immune."
            fixMethod="Front: poly control arm bushings or spherical ball joints reduce compliance. Already modeled in the camber chain."
          />}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8 — RIDE & ROLL RATE ANALYSIS (Milliken Ch.16)
      ══════════════════════════════════════════════════════════════════ */}
      {(a.kwFavg || a.kwRavg) ? (
        <Section title="8 — RIDE & ROLL RATE ANALYSIS" color="#c084fc">

          <Metric
            title="Wheel Rates"
            measured={a.kwFavg != null ? `F ${a.kwFavg.toFixed(0)} / R ${a.kwRavg?.toFixed(0) ?? '—'} lb/in` : null}
            stock={`F ${stockStr(STOCK_P71.kwF)} / R ${stockStr(STOCK_P71.kwR)} lb/in — derived: 475 × 0.85² (IR from arm geometry) / 160 × 1.0²`}
            optimal={`F 130–250 / R 130–200 lb/in (race-tuned, depends on track roughness)`}
            sev={a.kwFavg != null ? 'info' : 'info'}
            handling={a.kwFavg == null ? 'Enter spring rates to compute.'
              : `Wheel rate determines how much load each tire sees per inch of wheel travel. Higher = stiffer ride, less body roll, more responsive but less compliant on rough surfaces. F: ${a.kwLF?.toFixed(0) ?? '—'}/${a.kwRF?.toFixed(0) ?? '—'}, R: ${a.kwLR?.toFixed(0) ?? '—'}/${a.kwRR?.toFixed(0) ?? '—'}. Note: wheel rate is ALWAYS lower than spring rate because IR² < 1.`}
            tip={<Tip
              changeable={true}
              text={`Milliken §16.1: Wheel center rate = spring rate × installation ratio². P71 SLA front IR ≈ 0.85 (geometric: ~11" spring pickup ÷ 13" arm length). Verify on your car by jacking the wheel up 1" and measuring spring travel.`}
              fixMethod="Change spring rate or move spring attachment outboard (increases IR). Spring rate is the easier P71 adjustment."
            />}
          />

          <Metric
            title="Ride Frequency"
            measured={a.rideFreqF_cpm != null ? `F ${a.rideFreqF_cpm.toFixed(0)} / R ${a.rideFreqR_cpm?.toFixed(0) ?? '—'} cpm` : null}
            stock={`F ${stockStr(STOCK_P71.rideFreqF)} / R ${stockStr(STOCK_P71.rideFreqR)} cpm — derived from stock springs + sprung mass`}
            optimal={`F 95–120 / R 85–110 cpm — front MUST exceed rear (anti-pitch)`}
            sev={(() => {
              const f = a.rideFreqF_cpm; const r = a.rideFreqR_cpm;
              if (!f && !r) return 'info';
              const fOk = f >= 95 && f <= 130;
              const rOk = r ? r >= 85 && r <= 120 : true;
              const coupled = f && r && f < r;
              if (coupled) return 'warning';
              if (!fOk || !rOk) return 'warning';
              return 'good';
            })()}
            handling={a.rideFreqF_cpm == null ? 'Enter spring rates.'
              : a.rideFreqF_cpm < a.rideFreqR_cpm
                ? `⚠ REAR FREQ EXCEEDS FRONT — pitch coupling will produce hobby-horse motion. Car bobs front-rear over bumps, tires lose contact intermittently. Stiffen front or soften rear immediately.`
              : a.rideFreqF_cpm < 95
                ? `Front too soft for race — too much body motion, slow weight transfer to RF on entry. Add front spring rate.`
              : a.rideFreqF_cpm > 130
                ? `Front very stiff — fast weight transfer but tire contact patch will skip on bumps. Rough surfaces cost grip.`
              : `In race window — front higher than rear means the chassis settles to a level attitude after a bump (anti-pitch). Predictable transient response.`}
            tip={<Tip
              changeable={true}
              text="Milliken §16.2: Ride frequency ω = (1/2π)√(K_w×386.4/W_corner) in Hz × 60 = cpm. Front MUST be higher than rear to prevent pitch coupling."
              fixMethod="Increase front spring rate to raise front frequency. P71 target: F 100–120 cpm, R 90–108 cpm."
            />}
          />

          <Metric
            title="Spring Roll Rate & Roll Gradient"
            measured={a.rollGradient != null ? `${a.rollGradient.toFixed(2)} deg/g (springs only)` : null}
            stock={`${stockStr(STOCK_P71.rollGradient, v => `${v}`)} deg/g — derived from stock springs and 22" CG estimate`}
            optimal={`1.0–1.8 deg/g (with ARBs) for non-aero racing sedan (Milliken Table 16.5)`}
            sev={(() => {
              const rg = a.rollGradient;
              if (rg == null) return 'info';
              if (rg <= 2.5) return 'good';
              if (rg <= 4.0) return 'warning';
              return 'critical';
            })()}
            handling={a.rollGradient == null ? 'Enter springs and rear spring track.'
              : a.rollGradient > 4.0
                ? `Roll gradient much too high — at ${T.trackG}G apex car will roll ${a.rollFromSprings?.toFixed(1)}° from springs alone. Camber chain is stretched (outside tire goes positive), tires roll over onto sidewalls. Need stiffer springs AND ARBs.`
              : a.rollGradient > 2.5
                ? `Springs alone are soft — ARBs must add the rest. With ARB, total roll gradient should hit 1.5 deg/g (~${(a.rollFromSprings * 1.5/a.rollGradient).toFixed(1)}° at apex).`
              : a.rollGradient < 1.5
                ? `Springs already stiffer than 1.5 deg/g target — body barely rolls. ARBs not needed for roll control (can be used for LLTD balance only).`
              : `Springs within expected range. ARBs will fine-tune to final target.`}
            tip={<Tip
              changeable={true}
              text="Milliken Table 16.1 reference: Passenger 7–8.5 deg/g, Firm domestic 4.2, Sport 3.0, Racing 1.5."
              fixMethod="Reduce roll gradient with stiffer springs, ARBs, or lower CG. For P71 targeting 1.5 deg/g: springs alone should provide 2–3 deg/g, ARBs make up the rest."
            />}
          />

          <Metric
            title="ARB Requirement (to reach 1.5 deg/g)"
            measured={a.arbFRequired_deg != null ? `F ${a.arbFRequired_deg.toFixed(0)} / R ${a.arbRRequired_deg?.toFixed(0) ?? '—'} lb-ft/deg` : null}
            stock={`F ~50 / R 0 lb-ft/deg (stock 29.5mm front bar, no rear bar)`}
            optimal={`Whatever brings springs + ARBs to 1.5 deg/g total — varies with springs`}
            sev={a.arbFRequired_deg == null ? 'info' : (a.arbFRequired_deg > 0 || (a.arbRRequired_deg ?? 0) > 0) ? 'warning' : 'good'}
            handling={a.arbFRequired_deg == null ? 'Enter spring rates.'
              : (a.arbFRequired_deg > 0 || (a.arbRRequired_deg ?? 0) > 0)
                ? `Springs supply ${((a.kPhiTotal ?? 0) / (a.kPhiRequired ?? 1) * 100).toFixed(0)}% of needed roll stiffness. ARBs must add the rest: Front ${a.arbFRequired_deg?.toFixed(0)} lb-ft/deg + Rear ${a.arbRRequired_deg?.toFixed(0)} lb-ft/deg. Front bar increases front LLTD (push); rear bar increases rear LLTD (loose). Use ARB front-rear ratio to bias balance.`
              : `Springs alone exceed the roll gradient target — no ARB needed for roll control. ARBs may still be used for fine LLTD balance.`}
            tip={<Tip
              changeable={true}
              text="Milliken §16.2: ARBs supply the additional roll stiffness springs alone don't provide. Front ARB → more push. Rear ARB → more loose."
              fixMethod={`Stock P71 ARB ≈ 1.0–1.125" solid front bar (~50 lb-ft/deg). Stiffer aftermarket bars available.`}
            />}
          />

          <Metric
            title="Target Spring Rate (if not yet selected)"
            measured={`F ${a.ksF_target.toFixed(0)} / R ${a.ksR_target.toFixed(0)} lb/in`}
            stock={`F ${stockStr(STOCK_P71.springF)} / R ${stockStr(STOCK_P71.springR)} lb/in — Eaton Detroit Spring catalog (Police/Taxi front, stock rear coil)`}
            optimal={`Match calc target — gives 108/97 cpm front/rear ride frequency`}
            sev="info"
            handling={`Calculated targets to hit 108 cpm front / 97 cpm rear at IR ${a.irF.toFixed(2)}/${a.irR.toFixed(2)}. F${a.ksF_target.toFixed(0)} lb/in spring → ${(a.ksF_target * a.irF * a.irF).toFixed(0)} lb/in wheel rate. R${a.ksR_target.toFixed(0)} → ${(a.ksR_target * a.irR * a.irR).toFixed(0)} lb/in wheel. Static spring load: F${a.springLoadF.toFixed(0)} lb / R${a.springLoadR.toFixed(0)} lb. Adjust ±50 lb/in for track roughness preferences.`}
            tip={<Tip
              changeable={true}
              text="Milliken §21.4: Back-solved from target ride frequency. Formula: K_s = (2πω)² × W_corner / (IR² × 386.4)."
              fixMethod="Select nearest standard rate from spring catalog (Hypercoil, Eibach, Afco) — typically 25 or 50 lb/in increments."
            />}
          />

          {(a.stressF_max || a.stressR_max) && (
            <Finding
              title="Spring Stress Check (Milliken §21.2)"
              value={(() => {
                const sf = a.stressF_wahl ?? a.stressF_max;
                const sr = a.stressR_wahl ?? a.stressR_max;
                if (!sf && !sr) return '—';
                const worst = Math.max(sf ?? 0, sr ?? 0);
                return `${(worst/1000).toFixed(0)}k psi max`;
              })()} unit=""
              sev={(() => {
                const sf = a.stressF_wahl ?? a.stressF_max ?? 0;
                const sr = a.stressR_wahl ?? a.stressR_max ?? 0;
                const worst = Math.max(sf, sr);
                if (worst > a.stressLimit) return 'critical';
                if (worst > a.stressLimit * 0.85) return 'warning';
                return 'good';
              })()}
              tip={<Tip
                changeable={true}
                text="Milliken §21.2 (Eq.21.13): Maximum uncorrected shear stress f = 8DW/πd³. The Wahl correction factor K_w = (4C−1)/(4C−4) + 0.615/C where C = D/d (spring index) — multiply by K_w for corrected stress. Table 21.2: oil-tempered alloy steel limit is 50% of tensile strength. Table 21.3: 0.5 in wire oil-tempered → tensile ~165,000 psi → max stress limit ~82,500 psi. Maximum load W is static corner weight plus lateral load transfer — the outside spring at peak corner G sees the highest load."
                fixMethod="If stress exceeds limit: (1) increase wire diameter d — stress drops as d³, very sensitive. (2) reduce mean coil diameter D — stress drops linearly with D. (3) reduce spring rate target (softer spring). (4) switch to higher-grade steel (oil-tempered > hard-drawn). Contact spring manufacturer for actual material grade and Wahl-corrected limit."
              />}
            >
              {[
                a.stressF_max && `Front: static load ${a.springLoadF.toFixed(0)} lb → max load at ${T.trackG}G: ${a.springLoadF_max.toFixed(0)} lb. Uncorrected stress ${a.stressF_max.toFixed(0)} psi${a.wahlF ? `, Wahl-corrected ${a.stressF_wahl?.toFixed(0)} psi (K_w=${a.wahlF.toFixed(2)})` : ''}. Limit: ${a.stressLimit.toLocaleString()} psi. ${(a.stressF_wahl ?? a.stressF_max) > a.stressLimit ? '⚠ EXCEEDS LIMIT — spring may yield under race loads.' : (a.stressF_wahl ?? a.stressF_max) > a.stressLimit * 0.85 ? 'Approaching limit — verify material grade with supplier.' : 'Within safe operating range.'}`,
                a.stressR_max && `Rear: static load ${a.springLoadR.toFixed(0)} lb → max load at ${T.trackG}G: ${a.springLoadR_max.toFixed(0)} lb. Uncorrected stress ${a.stressR_max.toFixed(0)} psi${a.wahlR ? `, Wahl-corrected ${a.stressR_wahl?.toFixed(0)} psi (K_w=${a.wahlR.toFixed(2)})` : ''}. ${(a.stressR_wahl ?? a.stressR_max) > a.stressLimit ? '⚠ EXCEEDS LIMIT.' : 'Within range.'}`,
                a.ksF_calc && `Front rate from dimensions (Gd⁴/8D³N): ${a.ksF_calc.toFixed(0)} lb/in ${a.ksLF ? `vs entered ${a.ksLF} lb/in — ${Math.abs(a.ksF_calc - a.ksLF) < 20 ? 'consistent.' : 'discrepancy — verify active coil count or dimensions.'}` : '(no entered rate to compare).'}`,
                a.ksR_calc && `Rear rate from dimensions: ${a.ksR_calc.toFixed(0)} lb/in ${a.ksRR ? `vs entered ${a.ksRR} lb/in — ${Math.abs(a.ksR_calc - a.ksRR) < 20 ? 'consistent.' : 'discrepancy.'}` : ''}.`,
              ].filter(Boolean).join('\n')}
            </Finding>
          )}

          {(a.ksF_eff || a.ksR_eff) && (
            <Finding
              title="Bumpstop Series Rate (Milliken §21.3)"
              value={`F ${a.ksF_eff?.toFixed(0) ?? '—'} / R ${a.ksR_eff?.toFixed(0) ?? '—'}`} unit="lb/in (coil+bump combined)"
              sev="warning"
              tip={<Tip
                changeable={true}
                text="Milliken §21.3 (Eq.21.16): When the shock contacts the bumpstop, the bumpstop and main spring act in series. Combined rate S = S₁×S₂/(S₁+S₂). If S_bump >> S_coil, combined rate ≈ S_coil (soft bump rubber adds little). If S_bump ≈ S_coil, combined rate ≈ S_coil/2 (large reduction — bumpstop acting as progressive spring softener, NOT stiffener). A truly effective bumpstop as a progressive spring must be much stiffer than the main spring — typically 5–10× stiffer — so the combined rate is 80–90% of the main spring rate immediately at contact, then rises as the bump rubber compresses further."
                fixMethod="For bumpstop to add a progressive rate increase: choose bump rubber stiffness ≥ 5× main spring rate. If using 475 lb/in coil: bump rubber should be ≥ 2,500 lb/in at initial contact. Shorter, harder bump rubbers give higher initial rate. Longer softer rubbers give gentler progressive onset. Do not use bump rubbers softer than the main spring — this creates a rate dip at contact."
              />}
            >
              {[
                a.ksF_eff && `Front: ${a.ksLF ?? a.ksRF} lb/in coil + ${a.ksBumpF} lb/in bumpstop in series = ${a.ksF_eff.toFixed(0)} lb/in combined at bumpstop contact. ${a.ksBumpF < (a.ksLF ?? a.ksRF) * 5 ? `Bumpstop is only ${(a.ksBumpF / (a.ksLF ?? a.ksRF)).toFixed(1)}× coil rate — combined rate is SOFTER than coil alone. Use stiffer bump rubber (≥${((a.ksLF ?? a.ksRF) * 5).toFixed(0)} lb/in) for a true progressive rate increase.` : 'Bumpstop is stiff relative to coil — effective rate increase at contact.'}`,
                a.ksR_eff && `Rear: ${a.ksLR ?? a.ksRR} lb/in coil + ${a.ksBumpR} lb/in bumpstop = ${a.ksR_eff.toFixed(0)} lb/in combined.`,
              ].filter(Boolean).join('\n')}
            </Finding>
          )}
        </Section>
      ) : (
        <Section title="8 — RIDE & ROLL RATE ANALYSIS" color="#c084fc">
          <Finding title="Spring Rates Not Entered" sev="info">
            Enter spring rates (lb/in at spring), installation ratios, and rear spring track in the Spring Rates section of the Suspension Geometry inputs. The model will then compute: wheel rates, ride frequencies (cpm), spring-only roll gradient (deg/g), and required ARB stiffness to reach the 1.5 deg/g racing target (Milliken §16.2, Table 16.1).
          </Finding>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 9 — SHOCK & SPRING TRAVEL ANALYSIS
      ══════════════════════════════════════════════════════════════════ */}
      {Object.keys(a.shockData).length > 0 && (
        <Section title="9 — SHOCK & SPRING TRAVEL ANALYSIS" color="#a78bfa">
          {Object.entries(a.shockData).map(([pos, sd]) => {
            const sev = sd.jounceAvail != null && sd.jounceAvail < 0.5 ? 'critical'
              : sd.compression < 0.5 ? 'critical'
              : sd.jounceAvail != null && sd.jounceAvail < 1.0 ? 'warning'
              : 'good';
            const stockGap = pos.endsWith('F') ? STOCK_P71.shockGapF.val : STOCK_P71.shockGapR.val;
            return (
              <Metric
                key={pos}
                title={`${pos} Shock Travel`}
                measured={`${sd.compression.toFixed(2)}" compressed, ${sd.jounceAvail != null ? sd.jounceAvail.toFixed(2) + '" to bumpstop' : 'gap not measured'}`}
                stock={`~${stockGap}" bumpstop gap (stock ride height with OEM springs)`}
                optimal={`1.0–1.5" bumpstop gap, 1.0–2.0" droop available — race-tuned`}
                sev={sev}
                handling={
                  sd.jounceAvail != null && sd.jounceAvail < 0.5
                    ? `⚠ Less than 0.5" to bumpstop — will hit stop in normal cornering. Bumpstop contact spikes wheel rate to effectively infinite, the tire momentarily unloads and loses grip. Driver feels a sharp "snap" mid-corner. Need stiffer spring or shorter/progressive bump rubber.`
                  : sd.compression < 0.5
                    ? `⚠ Shock nearly topped out — no droop travel. Wheel cannot follow road downward when load lifts. Causes wheel hop, loss of contact on bumps. Need longer shock body or lower ride height.`
                  : sd.jounceAvail != null && sd.jounceAvail < 1.0
                    ? `Marginal jounce gap — likely hitting bumpstop in hard cornering. Consider progressive-taper bump rubber to soften the contact.`
                  : `Good shock geometry. Free ${sd.free.toFixed(2)}" / installed ${sd.inst.toFixed(2)}" with adequate jounce + droop room for race conditions.`
                }
                tip={<Tip
                  changeable={true}
                  text={`Shock travel = total stroke between full droop and full bump. Bumpstop gap is the distance the shaft can compress before contacting the rubber stop. Stock P71: ~${stockGap}" gap.`}
                  fixMethod="Increase bumpstop gap with stiffer/taller springs, longer shock body, or shorter bump rubber. Decrease with shorter springs or longer bump rubber."
                />}
              />
            );
          })}

          {(a.rhFrontAvg || a.rhRearAvg) && (
            <Metric
              title="Ride Height Summary"
              measured={[
                a.rhFrontAvg && `F ${a.rhFrontAvg.toFixed(2)}"`,
                a.rhRearAvg && `R ${a.rhRearAvg.toFixed(2)}"`,
                a.rhRake != null && `Rake ${sign(a.rhRake)}"`,
                a.rhSideSplit != null && `L−R ${sign(a.rhSideSplit)}"`,
              ].filter(Boolean).join(' · ')}
              stock={`Stock rake +0.5" (front higher than rear)`}
              optimal={isOval ? `Race rake 0 to +1.0" front-up; minimal L−R split` : `Symmetric — minimal F−R rake and zero L−R split`}
              sev={a.rhRake != null && (a.rhRake < -0.5 || a.rhRake > 1.5) ? 'warning' : (!isOval && a.rhSideSplit != null && Math.abs(a.rhSideSplit) > 1.0) ? 'warning' : 'good'}
              handling={
                a.rhRake != null && a.rhRake < -0.5
                  ? `Rear higher than front (${Math.abs(a.rhRake).toFixed(2)}" reverse rake) — biases load forward in cornering, front pushes mid-corner. Stiffen/raise front or lower rear.`
                : a.rhRake != null && a.rhRake > 1.5
                  ? `Strong nose-up rake (${a.rhRake.toFixed(2)}") — front weight transfers rearward during braking, may cause loose entry. Helps straight-line aero stability.`
                : !isOval && a.rhSideSplit != null && Math.abs(a.rhSideSplit) > 1.0
                  ? `L/R ride height split of ${Math.abs(a.rhSideSplit).toFixed(2)}" on figure-8 — left and right turns will feel different. Equalize spring perches.`
                : `Ride height profile is suitable for current track type.`
              }
              tip={<Tip
                changeable={true}
                text={`Ride height affects roll center, CG height, and rake-driven aerodynamic balance. Each 1" of lowering drops CG ~0.65" but also lowers RC ~1–2".`}
                fixMethod="Adjust by spring perch position, spring spacers, or different spring free length. Always measure on level surface with full fluid load."
              />}
            />
          )}

          {/* ── Milliken Ch.22 Damper Analysis ───────────────────────────── */}
          {a.cCritF != null && (
            <Metric
              title="Critical Damping & Target Forces (Milliken §22.3)"
              measured={`C_crit F ${a.cCritF.toFixed(2)} / R ${a.cCritR?.toFixed(2) ?? '—'} lb·s/in`}
              stock={`Stock damping ζ ≈ 0.25 (passenger comfort target)`}
              optimal={`Target bump force at 5 in/sec — F ${a.fDampBumpF_min?.toFixed(0)}–${a.fDampBumpF_max?.toFixed(0)} lbs / R ${a.fDampBumpR_min?.toFixed(0) ?? '—'}–${a.fDampBumpR_max?.toFixed(0) ?? '—'} lbs`}
              sev="info"
              handling={`These are the MAXIMUM body-control forces your shocks should hit at 5 in/sec shaft speed. Bump (compression) at ζ=0.40–0.71. Rebound (extension) ~2× bump. Sprung mass: F ${(a.wSF/2).toFixed(0)} lb/corner, R ${(a.wSR/2).toFixed(0)} lb/corner. Use these as targets when dyno-testing your shocks.`}
              tip={<Tip
                changeable={true}
                text="Milliken §22.3: C_crit = 2√(km) where k=wheel rate, m=sprung corner mass. Target ζ for non-aero oval: bump 0.40–0.50, rebound 0.71."
                fixMethod="Dyno-test shock at 5 in/sec, compare to target range. KONI clockwise increases damping. Set bump first, then verify rebound is ~2× bump."
              />}
            />
          )}

          {(a.fBumpF_meas || a.fBumpR_meas || a.fRebF_meas || a.fRebR_meas) && (
            <Metric
              title="Measured Damping Ratio (Milliken §22.3)"
              measured={[
                a.zetaF_bump != null && `F bump ζ=${a.zetaF_bump.toFixed(2)}`,
                a.zetaF_reb != null && `F reb ζ=${a.zetaF_reb.toFixed(2)}`,
                a.zetaR_bump != null && `R bump ζ=${a.zetaR_bump.toFixed(2)}`,
                a.zetaR_reb != null && `R reb ζ=${a.zetaR_reb.toFixed(2)}`,
              ].filter(Boolean).join(' · ')}
              stock={`Stock ζ ~0.25 bump / ~0.50 rebound (passenger comfort)`}
              optimal={`Bump ζ 0.40–0.71 / Rebound ζ 0.71–1.0 / B:R ratio 1:2`}
              sev={(() => {
                const zb = a.zetaF_bump; const zr = a.zetaF_reb;
                if (!zb) return 'info';
                const bOk = zb >= 0.35 && zb <= 0.75;
                const rOk = zr ? zr >= 0.60 && zr <= 1.5 : true;
                if (!bOk || !rOk) return 'warning';
                return 'good';
              })()}
              handling={[
                a.zetaF_bump != null && `Front bump ζ=${a.zetaF_bump.toFixed(2)}: ${a.zetaF_bump >= 0.40 && a.zetaF_bump <= 0.71 ? '✓ in target' : a.zetaF_bump < 0.40 ? 'SOFT — body bobs, slow to settle. Increase clicks.' : 'STIFF — too harsh, tires skip on bumps. Reduce clicks.'}`,
                a.zetaF_reb != null && `Front rebound ζ=${a.zetaF_reb.toFixed(2)}: ${a.zetaF_reb >= 0.60 && a.zetaF_reb <= 1.4 ? '✓ in range' : a.zetaF_reb > 1.4 ? 'EXCESSIVE — jacking down risk (car settles lower over multiple bumps)' : 'LOW — poor body control returning from bump'}`,
                a.brRatioF != null && `Front B:R = 1:${a.brRatioF.toFixed(2)}: ${a.brRatioF >= 1.5 && a.brRatioF <= 2.5 ? '✓ symmetric transient response' : a.brRatioF > 2.5 ? 'rebound dominates → jacking down on rough surfaces' : 'too symmetric → rough body control'}`,
                a.zetaR_bump != null && `Rear bump ζ=${a.zetaR_bump.toFixed(2)}: ${a.zetaR_bump >= 0.40 && a.zetaR_bump <= 0.71 ? '✓' : a.zetaR_bump < 0.40 ? 'SOFT' : 'STIFF'}`,
                a.zetaR_reb != null && `Rear rebound ζ=${a.zetaR_reb.toFixed(2)}: ${a.zetaR_reb >= 0.60 && a.zetaR_reb <= 1.4 ? '✓' : a.zetaR_reb > 1.4 ? 'EXCESSIVE — jacking down risk' : 'LOW'}`,
              ].filter(Boolean).join(' • ')}
              tip={<Tip
                changeable={true}
                text="ζ = F_measured / (C_crit × V). Below 0.25 = comfort, body bounces. Above 1.0 = overdamped, jacks down."
                fixMethod="KONI clockwise increases damping. Each click changes ζ ~0.05–0.10. Measure corner weights before/after — jacking down shows as lowered ride height."
              />}
            />
          )}

          {(a.zetaF_reb != null && a.zetaF_reb > 1.2) || (a.zetaR_reb != null && a.zetaR_reb > 1.2) ? (
            <Metric
              title="Jacking Down Diagnostic (Milliken §22.4)"
              measured={`RISK — EXCESSIVE REBOUND DAMPING`}
              stock={`Stock ζ_reb ~0.50 — no jacking down risk`}
              optimal={`Rebound ζ ≤ 1.0 — fast enough recovery between bumps`}
              sev="critical"
              handling={[
                a.zetaF_reb != null && a.zetaF_reb > 1.2 && `Front rebound ζ=${a.zetaF_reb.toFixed(2)} overdamped — spring can't push body up between bumps. Car settles progressively LOWER through long corners, eventually riding the bumpstops. On exit it pops up suddenly = unpredictable.`,
                a.zetaR_reb != null && a.zetaR_reb > 1.2 && `Rear rebound ζ=${a.zetaR_reb.toFixed(2)} overdamped — rear jacks down on rough exit, then snaps loose when it pops back up. Critical on oval.`,
                'Verify by measuring corner weights before and after a session — if ride height is lower after 10 laps, jacking down is confirmed.',
              ].filter(Boolean).join(' ')}
              tip={<Tip
                changeable={true}
                text="Milliken §22.4: Excess rebound prevents the spring from extending the shock fast enough after a jounce event. Car settles lower bump-by-bump."
                fixMethod="Reduce rebound damping (KONI counter-clockwise). Target ζ_reb 0.71–1.0. On 2-adj shocks: reduce rebound click without changing bump."
              />}
            />
          ) : null}

          {a.cCritF != null && (
            <Metric
              title="Transient Balance: Bump vs Rebound (Milliken §22.5)"
              measured={`Front bump → push | Rear bump → loose (turn-in only)`}
              stock={`Stock damping is balanced — no transient bias either way`}
              optimal={`Tune to driver preference for entry balance`}
              sev="info"
              handling={`SHOCK ADJUSTMENT EFFECTS ON CORNER ENTRY (transient only — steady-state mid-corner is controlled by RC and ARB):
• Front SOFTER bump → less entry push, more neutral turn-in
• Front STIFFER bump → more push on entry
• Rear SOFTER bump → tighter entry (less initial oversteer)
• Rear STIFFER bump → looser entry (more oversteer at turn-in)`}
              tip={<Tip
                changeable={true}
                text="Milliken §22.5: Front bump damping resists outside-tire jounce, delays weight transfer = push on entry. Rear bump damping has opposite effect = loose on entry."
                fixMethod="If car pushes on entry: soften front bump or stiffen rear bump. If loose on entry: stiffen front or soften rear. Verify no jacking down side-effect."
              />}
            />
          )}

          {a.fHop_hz != null && (
            <Metric
              title="Wheel Hop Frequency (Milliken §22.6)"
              measured={`~${a.fHop_cpm.toFixed(0)} cpm (${a.fHop_hz.toFixed(1)} Hz unsprung resonance)`}
              stock={`Same — unsprung mass and tire rate are platform-fixed`}
              optimal={`660–720 cpm — well above body ride frequency (no resonance overlap)`}
              sev={a.fHop_cpm > 600 && a.fHop_cpm < 800 ? 'good' : 'info'}
              handling={`Wheel hop = unsprung mass bouncing on tire spring (K_T ≈ 1200 lb/in, m_unsprung ≈ 85 lb/corner). Body ride freq ${a.rideFreqF_cpm?.toFixed(0) ?? '~100'} cpm vs wheel ${a.fHop_cpm.toFixed(0)} cpm — separated, no interaction. Wheel hop is controlled by HIGH-speed rebound damping (>10 in/sec). On a street-derived P71 high shaft speeds are rare; prioritize 0–5 in/sec body control instead.`}
              tip={<Tip
                changeable={false}
                text="Milliken §22.6: f_hop = (1/2π)√(K_tire/m_unsprung). If shock transmissibility at f_hop exceeds 2.5, wheel hops and grip is lost."
                fixMethod="If wheel hop visible: increase rear high-speed damping. Reduce tire pressure slightly. Check shock shaft bushings for play."
              />}
            />
          )}
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8 — PARTS & SETUP RECOMMENDATIONS
      ══════════════════════════════════════════════════════════════════ */}
      <Section title={`${Object.keys(a.shockData).length > 0 ? '10' : '9'} — PARTS & SETUP RECOMMENDATIONS`} color="#f87171">
        {partsRecs.length === 0 ? (
          <Finding title="No urgent parts issues identified" sev="good">
            All measured shock travel, alignment, and geometry values are within acceptable ranges. Continue with tire data (pyrometer) to fine-tune alignment. Enter shock measurements if not yet done for travel analysis.
          </Finding>
        ) : (
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: 14 }}>
            {partsRecs.map((rec, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, marginBottom: 12,
                borderBottom: '1px solid #1e293b', paddingBottom: 12,
              }}>
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  background: rec.color, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontFamily: 'monospace', fontWeight: 700,
                  fontSize: 13, color: '#0f172a',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{rec.pos}</span>
                    <span style={{
                      background: '#1e293b', border: `1px solid ${rec.color}`, color: rec.color,
                      fontSize: 9.5, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 3,
                    }}>{rec.type}</span>
                  </div>
                  <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>{rec.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Always-present geometry action items */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: 14, marginTop: 12 }}>
          <div style={{ color: '#60a5fa', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, marginBottom: 10 }}>
            GEOMETRY MEASUREMENT PRIORITIES
          </div>
          {[
            a.upPivEstimated && {
              rank: 1, color: '#f87171', type: 'MEASURE',
              action: 'Measure upper arm inner pivot height',
              why: 'All IC, FVSA, and RC calculations use the estimated 13.5" value. A 2" error here shifts computed RC by ~5". Highest-leverage remaining measurement.',
            },
            a.rcAvg == null && {
              rank: 2, color: '#f87171', type: 'MEASURE',
              action: 'Enter all four front SLA hardpoints',
              why: 'Roll center and instant center cannot be computed without all four hardpoints (lower BJ, upper BJ, lower pivot, upper pivot). Currently showing defaults.',
            },
            Object.keys(a.shockData).length < 4 && {
              rank: 3, color: '#f59e0b', type: 'MEASURE',
              action: 'Measure shock free length, installed length, and bumpstop gap',
              why: 'Without shock travel data, spring rate and shock length recommendations cannot be made. Enter all four corners in the Shock Physical Measurements section.',
            },
            (!geo.camber?.RF && !geo.camber?.LF) && {
              rank: 4, color: '#f59e0b', type: 'MEASURE',
              action: 'Enter current static camber and caster settings',
              why: 'Camber chain analysis is using default estimates (RF −2.25°, LF +2.75°). Enter actual alignment settings for accurate ground camber predictions.',
            },
          ].filter(Boolean).map(item => item && (
            <div key={item.rank} style={{
              display: 'flex', gap: 12, marginBottom: 10,
              borderBottom: '1px solid #1e293b', paddingBottom: 10,
            }}>
              <div style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                background: item.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'monospace', fontWeight: 700,
                fontSize: 11, color: '#0f172a',
              }}>{item.rank}</div>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{item.action}</span>
                  <span style={{ background: '#1e293b', border: `1px solid ${item.color}`, color: item.color, fontSize: 9.5, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 3 }}>{item.type}</span>
                </div>
                <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}>{item.why}</div>
              </div>
            </div>
          ))}
          {!a.upPivEstimated && a.rcAvg != null && Object.keys(a.shockData).length === 4 && geo.camber?.RF && (
            <div style={{ color: '#22c55e', fontFamily: 'monospace', fontSize: 11 }}>
              ✓ All critical geometry measurements present. Tune from pyrometer and handling feedback.
            </div>
          )}
        </div>
      </Section>

      <TrackPositionSynopsis a={a} isOval={isOval} T={T} />

    </div>
  );
}

// ─── Track Position Synopsis ─────────────────────────────────────────────────
// Final tile: synthesize all current measurements into 4 buckets describing
// what the car will do at each phase of a corner / on straights.
function TrackPositionSynopsis({ a, isOval, T }) {
  // Build the 4 narratives from current analysis values.

  const lines = {
    entry: [],
    mid:   [],
    exit:  [],
    str:   [],
  };

  // ── CORNER ENTRY (turn-in, trail-braking, weight transfer) ──────────────
  if (a.lltdFrontFrac != null) {
    if (a.lltdFrontFrac > 0.72) {
      lines.entry.push(`Geometry-dominant front load (${(a.lltdFrontFrac*100).toFixed(0)}% front geo LLTD) → RF loads instantly on turn-in. Sharp, abrupt entry but limited ARB tuning authority for trail-brake balance.`);
    } else if (a.lltdFrontFrac < 0.55) {
      lines.entry.push(`Rear loads up faster than front on entry (front geo LLTD ${(a.lltdFrontFrac*100).toFixed(0)}%). Entry tends LOOSE — tail will step out under trail-braking.`);
    } else {
      lines.entry.push(`Balanced entry — front LLTD ${(a.lltdFrontFrac*100).toFixed(0)}% gives predictable weight transfer to RF without abrupt loading.`);
    }
  }

  if (a.zetaF_bump != null && a.zetaF_bump < 0.40) {
    lines.entry.push(`Front bump damping is soft (ζ=${a.zetaF_bump.toFixed(2)}) → body bobs forward on turn-in, slow weight transfer to RF. Entry feels vague.`);
  } else if (a.zetaF_bump != null && a.zetaF_bump > 0.71) {
    lines.entry.push(`Front bump damping is stiff (ζ=${a.zetaF_bump.toFixed(2)}) → resists turn-in jounce, adds ENTRY PUSH per Milliken §22.5.`);
  }

  if (a.zetaR_bump != null && a.zetaR_bump > 0.71) {
    lines.entry.push(`Rear bump damping is stiff (ζ=${a.zetaR_bump.toFixed(2)}) → delays rear weight transfer, adds ENTRY OVERSTEER (loose).`);
  }

  if (a.rhRake != null && a.rhRake > 1.5) {
    lines.entry.push(`Strong nose-up rake (+${a.rhRake.toFixed(2)}") shifts weight rearward under braking → loose entry possible.`);
  } else if (a.rhRake != null && a.rhRake < -0.5) {
    lines.entry.push(`Reverse rake (rear higher) keeps front loaded under braking → push tendency on entry.`);
  }

  // ── MID-CORNER (steady-state lateral G) ─────────────────────────────────
  if (!a.rfStaticReachable) {
    lines.mid.push(`⚠ RF ROLLING ONTO OUTSIDE EDGE — chain demands ${a.rfStaticDemanded.toFixed(2)}° static to reach −2.0° ground camber, beyond P71 cam bolt limit (−3.0°). Cannot fix with alignment. Real levers: stiffer front spring/ARB to cut body roll (each 1° less roll = ~1° more negative ground camber), +2 psi RF cold to cut sidewall flex (apex load ≈ ${a.rfApexLoad.toFixed(0)} lb), or lower CG.`);
  } else if (a.rfCamberDev != null) {
    if (Math.abs(a.rfCamberDev) < 0.3) {
      lines.mid.push(`RF camber dialed in for ${T.label} apex — full contact patch loaded, max lateral grip.`);
    } else if (a.rfCamberDev > 0) {
      lines.mid.push(`RF ${a.rfCamberDev.toFixed(2)}° short of ideal at apex → outside tread overheats, mid-corner PUSH. Pyrometer outside zone hottest. Take static to ${a.rfStaticDemanded.toFixed(2)}°.`);
    } else {
      lines.mid.push(`RF over-cambered ${Math.abs(a.rfCamberDev).toFixed(2)}° → only inside edge contacts at apex, reduced lateral grip.`);
    }
  }

  if (a.rollGradient != null) {
    if (a.rollGradient > 4.0) {
      lines.mid.push(`Heavy body roll (${a.rollGradient.toFixed(1)} deg/g springs only) — outside tire goes positive at apex, sidewalls roll over. Need stiffer springs and/or ARB.`);
    } else if (a.rollGradient > 2.5) {
      lines.mid.push(`Moderate roll (${a.rollGradient.toFixed(1)} deg/g) — ARB needed to bring total to 1.5 deg/g target.`);
    } else {
      lines.mid.push(`Roll well controlled (${a.rollGradient.toFixed(1)} deg/g) — body stays flat, camber chain stays in spec at apex.`);
    }
  }

  if (a.momentArm != null && a.momentArm > 0 && a.momentArm < 3) {
    lines.mid.push(`CG-to-RC moment arm only ${a.momentArm.toFixed(2)}" → ARB stiffness changes have little effect on mid-corner balance. Tune via RC heights instead.`);
  }

  if (a.rfCamberComp != null && a.rfCamberComp < 40) {
    lines.mid.push(`Low geometric camber compensation (~${a.rfCamberComp}%) → outside tire loses most of static camber to body roll mid-corner. Static negative is doing all the work.`);
  }

  if (a.geoLLTDF != null) {
    if (isOval && a.geoLLTDF > 0.72) {
      lines.mid.push(`Geometric front LLTD too high (${(a.geoLLTDF*100).toFixed(0)}%) → chronic mid-corner push. ARB cannot tune this out — must lower front RC.`);
    } else if (a.geoLLTDF < 0.55) {
      lines.mid.push(`Front geometric LLTD low (${(a.geoLLTDF*100).toFixed(0)}%) → rear takes too much load mid-corner, tail walks out.`);
    }
  }

  // ── CORNER EXIT (throttle application, weight shift rearward) ───────────
  if (a.zetaR_reb != null && a.zetaR_reb > 1.2) {
    lines.exit.push(`⚠ Rear rebound overdamped (ζ=${a.zetaR_reb.toFixed(2)}) → rear jacks down through corner, pops up at exit = sudden loss of rear roll stiffness, snaps loose.`);
  }

  if (a.zetaF_reb != null && a.zetaF_reb > 1.2) {
    lines.exit.push(`Front rebound overdamped (ζ=${a.zetaF_reb.toFixed(2)}) → front settles low into bumpstops through corner, releases at exit = unpredictable balance.`);
  }

  const shockExitIssues = Object.entries(a.shockData)
    .filter(([pos, sd]) => pos.endsWith('R') && sd.jounceAvail != null && sd.jounceAvail < 0.5);
  if (shockExitIssues.length > 0) {
    lines.exit.push(`Rear bumpstop contact under power (gap < 0.5") → rear wheel rate spikes infinite at exit, tire unloads briefly = loss of traction off the apex.`);
  }

  if (a.rcDiff != null) {
    if (isOval && a.rcDiff < 0) {
      lines.exit.push(`Rear RC higher than front → rear loads up first under throttle, exit OVERSTEER. Lower the Watts pivot.`);
    } else if (isOval && a.rcDiff > 6) {
      lines.exit.push(`Front RC much higher than rear → strong front geometric bias, exit tends PUSH as front holds load while rear rotates.`);
    }
  }

  if (a.kwRavg != null && a.kwRavg < 130) {
    lines.exit.push(`Soft rear wheel rate (${a.kwRavg.toFixed(0)} lb/in) → rear squats under throttle, may lift inside rear (especially with no LSD/limited slip). Power lost to spinning inside wheel.`);
  }

  // Compliance steer is constant — but matters most under throttle when slip angles change rapidly
  lines.exit.push(`Stock rubber bushings produce ~0.25–0.75°/g compliance understeer — most felt as mid-corner push that holds through exit unless poly bushings installed.`);

  // ── STRAIGHTS (stability, ride, tire heating) ───────────────────────────
  if (a.rideFreqF_cpm != null && a.rideFreqR_cpm != null) {
    if (a.rideFreqF_cpm < a.rideFreqR_cpm) {
      lines.str.push(`⚠ Pitch coupling (rear freq ${a.rideFreqR_cpm.toFixed(0)} > front ${a.rideFreqF_cpm.toFixed(0)} cpm) → hobby-horse motion over bumps, intermittent tire contact, unsettled feel on straights.`);
    } else if (a.rideFreqF_cpm < 95) {
      lines.str.push(`Soft front (${a.rideFreqF_cpm.toFixed(0)} cpm) → bobby ride, slow to settle after bumps. Front grip varies bump-to-bump.`);
    } else if (a.rideFreqF_cpm > 130) {
      lines.str.push(`Very stiff front (${a.rideFreqF_cpm.toFixed(0)} cpm) → tires skip over bumps, lose contact. Rough surfaces cost grip.`);
    } else {
      lines.str.push(`Ride frequencies tuned for race (F ${a.rideFreqF_cpm.toFixed(0)} / R ${a.rideFreqR_cpm.toFixed(0)} cpm, front higher) → stable straight-line behavior, anti-pitch.`);
    }
  }

  if (a.scrubRadius < 0) {
    lines.str.push(`Negative scrub radius → steering feels disconnected on straights, kickback amplifies single-wheel impacts.`);
  } else if (a.scrubRadius > 1.5) {
    lines.str.push(`Moderate scrub (${a.scrubRadius.toFixed(2)}") → adequate road feel but heavier steering effort, more bump kickback.`);
  }

  if (isOval) {
    const casterDiff = a.lfCaster - a.rfCaster;
    if (casterDiff >= 1.5 && casterDiff <= 4) {
      lines.str.push(`Asymmetric caster (LF +${casterDiff.toFixed(1)}° vs RF) pulls car gently LEFT down straights → reduced steering effort, helps left turn entry.`);
    } else if (Math.abs(casterDiff) < 1) {
      lines.str.push(`Symmetric caster on oval — leaving the easy left-pull benefit on the table. Set LF to 8–9° for built-in left bias.`);
    }
  }

  if (a.fHop_hz != null && (a.zetaF_reb == null || a.zetaF_reb < 0.6)) {
    lines.str.push(`Wheel hop frequency ${a.fHop_cpm.toFixed(0)} cpm — at this rebound damping, may see chatter on rough straights. Increase rebound if visible wheel bounce.`);
  }

  // Render
  const Block = ({ title, items, color, icon }) => (
    <div style={{ background: '#0f172a', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 4, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ color, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, marginBottom: 6 }}>
        {icon} {title}
      </div>
      {items.length === 0
        ? <div style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', fontStyle: 'italic' }}>No notable issues — measurements within normal range for this phase.</div>
        : items.map((line, i) => (
            <div key={i} style={{ color: '#cbd5e1', fontSize: 11.5, fontFamily: 'monospace', lineHeight: 1.6, marginBottom: 4 }}>
              • {line}
            </div>
          ))
      }
    </div>
  );

  return (
    <Section title="11 — TRACK POSITION SYNOPSIS — what the car will do on track" color="#22d3ee">
      <div style={{ background: '#0c1a2e', border: '1px solid #1e3a5f', borderRadius: 6, padding: 10, marginBottom: 10 }}>
        <div style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6 }}>
          Synthesis of all current measurements above, mapped to corner phases. Each bullet identifies a specific
          measurement that will affect that phase of the corner.
        </div>
      </div>

      <Block title="CORNER ENTRY — turn-in, trail-braking" items={lines.entry} color="#f87171" icon="◗" />
      <Block title="MID-CORNER — steady-state apex" items={lines.mid} color="#fb923c" icon="◉" />
      <Block title="CORNER EXIT — throttle application" items={lines.exit} color="#22c55e" icon="◖" />
      <Block title="STRAIGHTS — ride, stability, tire heating" items={lines.str} color="#60a5fa" icon="—" />
    </Section>
  );
}
