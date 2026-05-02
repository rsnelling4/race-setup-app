import { useState, useMemo } from 'react';
import { computeGeometry } from './GeometryVisualizer';

// ─── Constants ────────────────────────────────────────────────────────────────
const P71_LOWER_ARM_LENGTH = 13.0;
const P71_UPPER_ARM_LENGTH = 9.5;
const P71_KPI              = 9.5;
const P71_WHEEL_OFFSET     = 1.75;
const P71_FRONT_AXLE_FRAC  = 0.57;
const P71_TOTAL_WEIGHT     = 3700;

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
  const rollAtApex  = T.bodyRollPerG * T.trackG;

  // Static alignment from geo profile (falls back to sensible defaults)
  const rfStatic = num(geo.camber?.RF || -2.25);
  const lfStatic = num(geo.camber?.LF ||  2.75);
  const rfCaster = num(geo.caster?.RF ||  6.0);
  const lfCaster = num(geo.caster?.LF ||  9.0);

  // ── Oval: left turn only ──────────────────────────────────────────────────
  const rfCasterGain = -(rfCaster * T.casterCoeffRF);
  const lfCasterGain =  (lfCaster * T.casterCoeffLF);
  const rfBodyRoll   = -(rollAtApex * T.slaJounceCoeff);
  const lfBodyRoll   =  (rollAtApex * T.slaDroopCoeff);
  const swCamber     = 0.48; // sidewall compliance at RF load ~1400 lbs

  // Ground camber: RF is outside, LF is inside (for oval left turn)
  const rfGroundCamber = rfStatic + rfCasterGain + rfBodyRoll + rollAtApex + swCamber;
  const lfGroundCamber = lfStatic + lfCasterGain + lfBodyRoll - rollAtApex;
  const rfCamberDev    = rfGroundCamber - T.idealRFGroundCamber;
  const lfCamberDev    = lfGroundCamber - T.idealLFGroundCamber;

  // ── Figure-8: also compute right turn (roles swap) ────────────────────────
  // In a right turn: LF becomes outside, RF becomes inside
  let rfGroundCamberRight = null, lfGroundCamberRight = null;
  let rfCamberDevRight = null, lfCamberDevRight = null;
  if (T.symmetric) {
    // Right turn: LF is now outside (jounce), RF is now inside (droop)
    const lfBodyRollRight = -(rollAtApex * T.slaJounceCoeff);  // LF jounces
    const rfBodyRollRight =  (rollAtApex * T.slaDroopCoeff);   // RF droops
    rfGroundCamberRight   = rfStatic - rfCasterGain + rfBodyRollRight - rollAtApex + swCamber;
    lfGroundCamberRight   = lfStatic - lfCasterGain + lfBodyRollRight + rollAtApex;
    rfCamberDevRight      = rfGroundCamberRight - T.idealLFGroundCamber; // RF is now inside
    lfCamberDevRight      = lfGroundCamberRight - T.idealRFGroundCamber; // LF is now outside
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
  const irF  = parseFloat(geo.installRatio?.front) || 0.52;  // P71 SLA default
  const irR  = parseFloat(geo.installRatio?.rear)  || 1.0;   // solid axle default
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
    rollAtApex, rfStatic, lfStatic, rfCaster, lfCaster,
    rfCasterGain, lfCasterGain, rfBodyRoll, lfBodyRoll, swCamber,
    rfGroundCamber, lfGroundCamber, rfCamberDev, lfCamberDev,
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
        <Finding
          title="Front Roll Center"
          value={a.rcAvg?.toFixed(2)} unit='"'
          sev={frontRCSev}
          tip={<Tip
            changeable={false}
            text="On the P71 SLA front suspension, roll center height is set by the control arm geometry — hardpoints welded/bolted to the factory subframe. The only shop-adjustable input is ride height: lowering changes arm angles and migrates the RC downward."
            fixMethod='Ride height adjustment (spring swap or spring spacers) shifts RC. Each 1" of lowering drops front RC approximately 1–2" depending on arm angles. On a figure-8, a lower RC (10–20") is preferred to allow more elastic roll and spring/ARB tuning authority.'
          />}
        >
          Front RC at {a.rcAvg?.toFixed(1)}" — target range {T.idealFrontRC_low}–{T.idealFrontRC_high}". RF line intersects CL at {a.rf.rcHeight?.toFixed(1)}", LF at {a.lf.rcHeight?.toFixed(1)}".
          {a.rcAvg != null && a.rcAvg > T.idealFrontRC_high
            ? ` RC is above the target range — most front lateral load transfer is geometric (through arms), reducing spring/ARB effectiveness.`
            : a.rcAvg != null && a.rcAvg < T.idealFrontRC_low
            ? ` RC is below target — more elastic roll expected, spring/ARB tuning is dominant.`
            : ` RC is within target range.`}
        </Finding>

        <Finding
          title="Rear Roll Center (Watts Link)"
          value={a.rearRC.toFixed(2)} unit='"'
          sev={rearRCSev}
          tip={<Tip
            changeable={true}
            text={`The Watts link pivot height sets rear RC. Target ${T.idealRearRC_low}–${T.idealRearRC_high}" for ${T.label}. Aftermarket adjustable Watts link brackets allow raising or lowering by 1–4". Note: the Watts link roll axis (line connecting front and rear lateral restraint centers in the side view) also controls roll steer — if the roll axis tilts downward toward the front, the axle has roll understeer geometry; tilted up toward the front = roll oversteer. (Milliken §17.4)`}
            fixMethod={`Adjustable Watts link center pivot bracket. Each 1" raise increases rear geometric LLTD ~0.5–1%. ${isOval ? 'Target 12–16" for oval.' : 'For figure-8 target 10–18" — symmetric handling, lower RC reduces rear-end stiffness in both directions.'} Keep Watts link as level as possible in the side view to minimize roll steer — a heavily angled Watts link imparts a steering correction on the rear axle as the suspension rolls, which is difficult to predict and tune around.`}
          />}
        >
          Rear RC at {a.rearRC.toFixed(1)}" — target {T.idealRearRC_low}–{T.idealRearRC_high}". {rearRCSev === 'good' ? 'Within target range.' : 'Outside target range — see fix method.'} Watts link provides near-linear lateral motion for the axle (better than a Panhard bar, which arcs laterally as it rotates). Roll steer is controlled by the fore-aft inclination of the Watts link in the side view — a level Watts link minimizes roll steer tendency.
        </Finding>

        <Finding
          title="Front vs Rear RC Differential"
          value={a.rcDiff != null ? sign(a.rcDiff) : '—'} unit='"'
          sev={a.rcDiff != null ? (isOval ? (a.rcDiff > 0 ? 'good' : 'warning') : (Math.abs(a.rcDiff) < 3 ? 'good' : 'warning')) : 'info'}
          tip={<Tip
            changeable={false}
            text={`The front/rear RC differential sets the balance of geometric vs elastic load transfer. ${isOval ? 'On oval, front higher than rear is intentional — biases load to the outside (RF) in left turns.' : 'On figure-8, a small differential (front ≈ rear) helps keep the car balanced through both left and right turns.'}`}
            fixMethod="Adjust rear Watts link pivot height to change differential. Front RC only moves with ride height changes."
          />}
        >
          {rcDiffNote}
        </Finding>

        <Finding
          title="CG-to-Roll-Center Moment Arm"
          value={a.momentArm?.toFixed(2)} unit='"'
          sev={momentArmSev}
          tip={<Tip
            changeable={false}
            text="The moment arm is the vertical distance between CG height and front RC height. Near-zero = ARB and springs transfer almost no elastic load, geometry dominates. Larger arm = springs and ARB dominate."
            fixMethod="Grow the moment arm by lowering the RC (raise the car on taller/stiffer springs) or by reducing RC height via fabrication. Not directly adjustable on P71."
          />}
        >
          {a.momentArm != null && (
            a.momentArm < 3 && a.momentArm > 0
              ? `Moment arm of ${a.momentArm.toFixed(2)}" — elastic load transfer through springs and ARB is nearly zero. Front LLTD is geometry-dominated. ARB stiffness changes have minimal effect on balance at this RC height.`
              : a.momentArm < 0
              ? `⚠ Roll center is ABOVE the CG (${Math.abs(a.momentArm).toFixed(2)}" above). Body moves toward the outside of the corner rather than rolling normally. Check ride height — likely too low.`
              : `Moment arm of ${a.momentArm.toFixed(2)}" — elastic load transfer through springs and ARB is active. Standard spring/ARB tuning applies.`
          )}
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — CAMBER CHAIN
      ══════════════════════════════════════════════════════════════════ */}
      <Section title={isOval ? '2 — CAMBER CHAIN (LEFT TURN ONLY)' : '2 — CAMBER CHAIN (LEFT TURN)'} color="#f97316">

        <Finding
          title="RF Ground Camber at Apex"
          value={rfGroundStr} unit="°"
          sev={rfCamberSev}
          tip={<Tip
            changeable={true}
            text={`Ground camber is what the tire actually sees at the contact patch during cornering. ${isOval ? 'On oval, RF is always the outside tire — needs −2.0° ideal.' : 'On figure-8 left turn, RF is the outside tire — target −1.75°.'}`}
            fixMethod={`Increase negative RF static camber. Target static ≈ ${(a.rfStatic - a.rfCamberDev).toFixed(2)}°. Install P71 camber bolt (replaces one strut pinch bolt) to extend range to ~−4°. Set at alignment rack.`}
          />}
        >
          Chain at {T.trackG}G ({a.rollAtApex.toFixed(2)}° body roll):{'\n'}
          {'  '}Static: {sign(a.rfStatic)}°{'\n'}
          {'  '}+ Caster gain ({a.rfCaster}° × −{T.casterCoeffRF}°/° at {T.apexSteer}° steer): {a.rfCasterGain.toFixed(2)}°{'\n'}
          {'  '}+ SLA jounce ({a.rollAtApex.toFixed(2)}° × −{T.slaJounceCoeff}°/°): {a.rfBodyRoll.toFixed(2)}°{'\n'}
          {'  '}+ Roll-frame conversion: +{a.rollAtApex.toFixed(2)}°{'\n'}
          {'  '}+ Sidewall compliance: +0.48°{'\n'}
          {'  '}= Ground camber: {rfGroundStr}° (ideal {T.idealRFGroundCamber}°){'\n\n'}
          {Math.abs(a.rfCamberDev) < 0.3
            ? 'Within 0.3° of ideal — contact patch well loaded.'
            : a.rfCamberDev > 0
            ? `${a.rfCamberDev.toFixed(2)}° short of ideal (INSUFFICIENT negative). Outside tread overloaded — pyrometer will show outside hotter. Fix: increase static negative camber to ≈ ${(a.rfStatic - a.rfCamberDev).toFixed(2)}°.`
            : `${Math.abs(a.rfCamberDev).toFixed(2)}° past ideal (OVER-CAMBERED). Inside tread overloaded — inside zone hotter on pyrometer. Reduce negative camber.`}
        </Finding>

        <Finding
          title="LF Ground Camber at Apex"
          value={lfGroundStr} unit="°"
          sev={lfCamberSev}
          tip={<Tip
            changeable={true}
            text={isOval
              ? 'LF is the inside tire on a left-turn oval. Ideal ground camber near +0.75° — body roll droops LF in the positive direction, so positive static is needed.'
              : 'LF is the inside tire on a left turn. For figure-8, LF also becomes the outside tire in right turns — symmetric static camber is needed.'}
            fixMethod={isOval
              ? 'Adjust LF static camber at alignment rack. Oval typical: +2° to +3° static — SLA droop subtracts ~1.4° during cornering. Camber bolt provides ±4° range.'
              : 'For figure-8: LF and RF static camber should be nearly equal (both slightly negative, −1° to −2°). Adjust at alignment rack.'}
          />}
        >
          {isOval
            ? `Chain: static ${sign(a.lfStatic)}° + caster gain ${a.lfCasterGain.toFixed(2)}° + SLA droop +${a.lfBodyRoll.toFixed(2)}° − roll frame ${a.rollAtApex.toFixed(2)}° = ${lfGroundStr}° (ideal ${T.idealLFGroundCamber}°).`
            : `Left turn (inside): static ${sign(a.lfStatic)}° + caster ${a.lfCasterGain.toFixed(2)}° + droop +${a.lfBodyRoll.toFixed(2)}° − roll ${a.rollAtApex.toFixed(2)}° = ${lfGroundStr}° (ideal ${T.idealLFGroundCamber}°).`}
          {'\n\n'}
          {Math.abs(a.lfCamberDev) < 0.3
            ? 'LF contact patch well balanced.'
            : a.lfCamberDev > 0
            ? `LF is ${a.lfCamberDev.toFixed(2)}° too positive — inside edge overloaded. Reduce static LF camber.`
            : `LF is ${Math.abs(a.lfCamberDev).toFixed(2)}° too negative — outer edge overloaded. Increase static LF camber.`}
        </Finding>
      </Section>

      {/* Figure-8: right turn camber chain */}
      {!isOval && a.rfGroundCamberRight != null && (
        <Section title="2B — CAMBER CHAIN (RIGHT TURN)" color="#f97316">
          <Finding
            title="LF Ground Camber — Right Turn (LF is now outside)"
            value={sign(a.lfGroundCamberRight)} unit="°"
            sev={camberSev(a.lfCamberDevRight)}
            tip={<Tip
              changeable={true}
              text="In a right turn on figure-8, LF becomes the outside tire. It jounces (compresses), caster gain reverses direction, and roll-frame conversion reverses. Target: −1.75°."
              fixMethod="Reduce LF static camber toward −1° to −2° to handle being the outside tire in right turns. This is a compromise — symmetric static settings are the only way to balance both turn directions."
            />}
          >
            Right turn LF (outside): static {sign(a.lfStatic)}° − caster {Math.abs(a.lfCasterGain).toFixed(2)}° + jounce {(a.rollAtApex * T.slaJounceCoeff * -1).toFixed(2)}° + roll +{a.rollAtApex.toFixed(2)}° + sidewall +0.48° = {sign(a.lfGroundCamberRight)}° (ideal {T.idealRFGroundCamber}°).{'\n\n'}
            {Math.abs(a.lfCamberDevRight) < 0.3 ? 'Within 0.3° of ideal.' : a.lfCamberDevRight > 0 ? `${a.lfCamberDevRight.toFixed(2)}° short of ideal — add more negative LF static camber.` : `${Math.abs(a.lfCamberDevRight).toFixed(2)}° over-cambered for right turn outside.`}
          </Finding>

          <Finding
            title="RF Ground Camber — Right Turn (RF is now inside)"
            value={sign(a.rfGroundCamberRight)} unit="°"
            sev={camberSev(a.rfCamberDevRight)}
            tip={<Tip
              changeable={true}
              text="In a right turn, RF becomes the inside tire. It droops, caster gain reverses, and roll-frame conversion reverses. For a balanced figure-8 setup, RF inside camber at right turn should be near −1.75° as well (same target as inside tire)."
              fixMethod="RF camber at right-turn inside is determined by static setting minus all the dynamic gains (which work against negative camber when on the inside). Symmetric static around −1.5° to −2° is the target."
            />}
          >
            Right turn RF (inside): static {sign(a.rfStatic)}° − caster {Math.abs(a.rfCasterGain).toFixed(2)}° + droop +{(a.rollAtApex * T.slaDroopCoeff).toFixed(2)}° − roll {a.rollAtApex.toFixed(2)}° = {sign(a.rfGroundCamberRight)}°.{'\n\n'}
            {Math.abs(a.rfCamberDevRight) < 0.3 ? 'Within 0.3° of ideal for inside tire.' : `${Math.abs(a.rfCamberDevRight).toFixed(2)}° from ideal — figure-8 requires compromise between left and right turn camber.`}
          </Finding>

          <Finding title="Figure-8 Camber Compromise Summary" sev="info">
            Left turn: RF outside {rfGroundStr}° (ideal {T.idealRFGroundCamber}°) / LF inside {lfGroundStr}° (ideal {T.idealLFGroundCamber}°){'\n'}
            Right turn: LF outside {sign(a.lfGroundCamberRight)}° (ideal {T.idealRFGroundCamber}°) / RF inside {sign(a.rfGroundCamberRight)}°{'\n\n'}
            A perfectly symmetric static setting (both sides equal negative camber) minimizes the worst-case deviation across both turn directions. The optimal static is approximately −{(Math.abs(T.idealRFGroundCamber + a.rfBodyRoll + a.rollAtApex - 0.48 + a.rfCasterGain) / 2).toFixed(2)}° for both sides as a starting point — tune from there with pyrometer data.
          </Finding>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — INSTANT CENTER & FVSA
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="3 — INSTANT CENTER & SWING ARM LENGTH" color="#a78bfa">
        <Finding
          title="RF Instant Center"
          value={a.rf.ic ? `(${a.rf.ic.x.toFixed(1)}", ${a.rf.ic.y.toFixed(1)}")` : '—'}
          unit=""
          sev={a.rf.ic ? 'info' : 'warning'}
          tip={<Tip
            changeable={false}
            text="The IC is where the upper and lower control arm lines intersect when extended. Its location sets camber gain rate per inch of suspension travel. Fixed by factory arm geometry."
            fixMethod="IC location cannot be changed without fabricating new pickup points. Slight shift possible via ride height change (arm angle changes)."
          />}
        >
          {a.rf.ic
            ? `RF IC: ${Math.abs(a.rf.ic.x).toFixed(1)}" inboard of wheel CL at ${a.rf.ic.y.toFixed(1)}" height. Camber gain: ${(57.3 / (a.rf.fvsa ?? 1)).toFixed(3)}°/inch of travel.`
            : 'RF IC could not be computed — check all four hardpoints are entered.'}
        </Finding>

        <Finding
          title="LF Instant Center"
          value={a.lf.ic ? `(${a.lf.ic.x.toFixed(1)}", ${a.lf.ic.y.toFixed(1)}")` : '—'}
          unit=""
          sev={a.lf.ic ? 'info' : 'warning'}
          tip={<Tip changeable={false} text="The LF IC is typically slightly further from the wheel than RF on an asymmetric oval setup. For figure-8, LF and RF ICs should be nearly symmetric." fixMethod="Fixed geometry." />}
        >
          {a.lf.ic
            ? `LF IC: ${Math.abs(a.lf.ic.x).toFixed(1)}" inboard, ${a.lf.ic.y.toFixed(1)}" height. L/R IC height difference: ${Math.abs((a.rf.ic?.y ?? 0) - a.lf.ic.y).toFixed(2)}"${!isOval && Math.abs((a.rf.ic?.y ?? 0) - a.lf.ic.y) > 1.5 ? ' — significant asymmetry for figure-8, will produce different camber gain rates L vs R' : ''}.`
            : 'LF IC could not be computed.'}
        </Finding>

        <Finding
          title="RF FVSA"
          value={a.rf.fvsa?.toFixed(1)} unit='"'
          sev={fvsaSev(a.rf.fvsa)}
          tip={<Tip
            changeable={false}
            text={`FVSA (Front View Swing Arm) = distance from front-view IC to wheel center. Sets camber change rate per inch of travel: rate = arctan(1/FVSA) ≈ 57.3/FVSA °/in. Target ${T.idealFVSA_low}–${T.idealFVSA_high}" for ${T.label}. NOTE: do not confuse with SVSA (Side View Swing Arm) — Milliken §17.4 states SVSA should be ≥60" to prevent power hop/brake hop. SVSA is a fore-aft measurement (controls anti-dive/squat and wheel path); FVSA is a lateral measurement (controls camber gain). The P71 short FVSA of 14–22" is intentionally short for high camber gain rate in roll — this is correct. (Milliken §17.3 Fig.17.9)`}
            fixMethod="Fixed by hardpoint geometry. Not adjustable without fabrication."
          />}
        >
          {a.rf.fvsa != null
            ? `RF FVSA ${a.rf.fvsa.toFixed(1)}" — ${a.rf.fvsa >= T.idealFVSA_low && a.rf.fvsa <= T.idealFVSA_high ? 'within target' : 'outside target'} (${T.idealFVSA_low}–${T.idealFVSA_high}"). Camber gain = arctan(1/${a.rf.fvsa.toFixed(1)}) ≈ ${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(3)}°/in of travel.`
            : 'Cannot compute — IC not found.'}
        </Finding>

        <Finding
          title="LF FVSA"
          value={a.lf.fvsa?.toFixed(1)} unit='"'
          sev={fvsaSev(a.lf.fvsa)}
          tip={<Tip changeable={false} text="LF FVSA sets how fast LF gains camber in droop (during cornering). For figure-8, LF and RF FVSA should be similar. Camber change rate = arctan(1/FVSA length) — Milliken §17.3." fixMethod="Fixed geometry." />}
        >
          {a.lf.fvsa != null && a.rf.fvsa != null
            ? `LF ${a.lf.fvsa.toFixed(1)}" (${(Math.atan(1/a.lf.fvsa) * 180/Math.PI).toFixed(3)}°/in) vs RF ${a.rf.fvsa.toFixed(1)}" (${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(3)}°/in) — delta ${(a.lf.fvsa - a.rf.fvsa).toFixed(1)}". ${!isOval && Math.abs(a.lf.fvsa - a.rf.fvsa) > 3 ? 'Large FVSA asymmetry for figure-8 — expect noticeably different camber response L vs R turn.' : 'Asymmetry is manageable.'}`
            : '—'}
        </Finding>

        <Finding
          title="Camber Compensation (Milliken §7.3)"
          value={a.rfCamberComp != null ? `~${a.rfCamberComp}` : '—'} unit="% (RF outside)"
          sev={a.rfCamberComp == null ? 'info' : a.rfCamberComp >= 60 ? 'good' : a.rfCamberComp >= 40 ? 'warning' : 'critical'}
          tip={<Tip
            changeable={false}
            text="Milliken §7.3: 'Camber compensation' is the fraction of body roll angle that is recovered as wheel camber change. 100% = outside wheel stays perfectly vertical (infinite FVSA). 0% = wheel leans with the body, adding positive camber to the outside tire and hurting lateral force. Milliken's MRA test case found MAXIMUM lateral track force with 100% camber compensation. The P71's short FVSA produces high camber gain rate, which is geometrically recovering body roll — this is the correct design direction. Longer FVSA = lower compensation = more camber loss. The formula: compensation ≈ arctan(1/FVSA) × (t/2) × (π/180) — fraction of 1° roll recovered per 1° body angle."
            fixMethod="Fixed geometry — FVSA is set by arm hardpoints. Short FVSA (high gain) is intentionally chosen for high camber compensation on this vehicle. Do not increase FVSA to 'reduce camber gain' — it will reduce compensation and hurt outside tire performance."
          />}
        >
          {a.rfCamberComp != null
            ? `RF outside tire camber compensation ≈ ${a.rfCamberComp}% (FVSA ${a.rf.fvsa?.toFixed(1)}" = ${(Math.atan(1/a.rf.fvsa) * 180/Math.PI).toFixed(3)}°/in gain rate). Milliken §7.3 optimum is 100%. ${a.rfCamberComp >= 60 ? 'Good — geometric compensation is working in the right direction.' : a.rfCamberComp >= 40 ? 'Moderate — outside tire is losing significant camber angle to body roll. Static negative camber is compensating.' : 'Low — outside tire is losing much of its static camber advantage to body roll. This means the −2° static camber target is doing most of the work rather than geometric recovery.'}`
            : 'Enter all four front hardpoints to compute camber compensation.'}
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — SUSPENSION ASYMMETRY
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="4 — LF/RF SUSPENSION ASYMMETRY" color="#f59e0b">
        <Finding
          title="Ball Joint Height Asymmetry (LF vs RF)"
          value={(a.bjAsymmetry >= 0 ? '+' : '') + a.bjAsymmetry.toFixed(3)} unit='"'
          sev={isOval ? asymSev : (Math.abs(a.bjAsymmetry) > 0.5 ? 'warning' : 'good')}
          tip={<Tip
            changeable={true}
            text={isOval
              ? 'LF higher than RF is common on oval setups — RF sits lower to bias RF corner toward more negative camber. On figure-8 this asymmetry causes the car to handle differently L vs R — undesirable.'
              : 'For figure-8, LF and RF should be as symmetric as possible. More than 0.5" asymmetry will produce noticeably different IC positions and camber gain rates for left vs right turns.'}
            fixMethod={isOval
              ? 'If intentional for oval: document as baseline. If unintentional: check spring seats, spring free lengths, ride heights.'
              : 'For figure-8: normalize LF and RF ball joint heights by adjusting spring perch height or spring free length to equalize side-to-side ride height.'}
          />}
        >
          LF lower BJ {a.bjAsymmetry.toFixed(3)}" {a.bjAsymmetry > 0 ? 'higher' : 'lower'} than RF.
          {isOval
            ? (Math.abs(a.bjAsymmetry) < 1.5 ? ' Within typical oval asymmetry range.' : ' Large asymmetry — verify against intended setup.')
            : (Math.abs(a.bjAsymmetry) < 0.5 ? ' Good symmetry for figure-8.' : ' Significant asymmetry will cause L/R handling difference on figure-8.')}
        </Finding>

        <Finding
          title="Wheel Center Height vs Tire Radius"
          value={a.wh.toFixed(3)} unit='"'
          sev={Math.abs(a.wh - 13.59) > 1.0 ? 'warning' : Math.abs(a.wh - 13.59) > 0.5 ? 'info' : 'good'}
          tip={<Tip
            changeable={true}
            text="Wheel center height should match tire radius (13.59 in for 235/55R17 at rated pressure). Below means car is running lower than tire-neutral ride height."
            fixMethod="Check cold pressures first. If still low: stiffer or taller springs, or spring spacers."
          />}
        >
          Measured {a.wh.toFixed(3)}" vs 235/55R17 radius 13.59". Delta: {(a.wh - 13.59).toFixed(3)}". Car is {Math.abs(a.wh - 13.59).toFixed(2)}" {a.wh < 13.59 ? 'lower' : 'higher'} than tire-neutral.
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — SCRUB RADIUS & STEERING
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="5 — SCRUB RADIUS & STEERING GEOMETRY" color="#60a5fa">
        <Finding
          title="Estimated Scrub Radius"
          value={a.scrubRadius.toFixed(3)} unit='"'
          sev={a.scrubRadius > 0 && a.scrubRadius < 1.5 ? 'good' : a.scrubRadius < 0 ? 'warning' : 'info'}
          tip={<Tip
            changeable={false}
            text="Scrub radius is the distance between the kingpin axis projected to ground and the tire contact patch center. Small positive (0.3–1.5 in) = light direct steering. Fixed by KPI (9.5°, cast into spindle) and wheel offset. (Milliken §17.3)"
            fixMethod="Fixed on P71. Wheel spacers/different offset can modify slightly — do not change unless specific steering complaint."
          />}
        >
          Scrub radius = (wheel center {a.wh.toFixed(2)}" × tan({P71_KPI}° KPI)) − {P71_WHEEL_OFFSET}" offset = {a.scrubRadius.toFixed(3)}". {a.scrubRadius < 1.5 ? 'Low scrub — light steering feel.' : 'Moderate scrub — adequate feel.'}
        </Finding>

        <Finding
          title="Scrub Motion Direction"
          value={(() => {
            const icY = a.rf.ic?.y;
            const icX = a.rf.ic?.x;
            if (icY == null) return '—';
            if (icY > 0 && icX != null && icX < 0) return 'SCRUB OUT on jounce';
            if (icY < 0) return 'SCRUB IN on jounce';
            return 'Minimal scrub';
          })()}
          unit=""
          sev={(() => {
            const icY = a.rf.ic?.y;
            if (icY == null) return 'info';
            return icY > 0 ? 'info' : 'warning';
          })()}
          tip={<Tip
            changeable={false}
            text="Scrub motion is lateral tire movement relative to the ground as the suspension travels. Milliken §17.3: if the front view IC is above ground level and inboard, the tire moves outward (scrubs out) as it rises in jounce. If IC is below ground, the tire moves inward. Scrub-out in jounce is the normal P71 condition — it means as the RF loads in a corner and jounces, the contact patch moves outward slightly, widening the effective track width and increasing mechanical advantage slightly. On rough tracks, scrub introduces lateral velocity at the tire that disturbs slip angles."
            fixMethod="Fixed geometry — IC is set by control arm hardpoints. On a rough track where lateral disturbance is a concern, a longer FVSA (further-out IC) reduces the scrub rate per inch of travel."
          />}
        >
          {(() => {
            const icY = a.rf.ic?.y;
            const icX = a.rf.ic?.x;
            if (icY == null) return 'Enter all four hardpoints to determine IC and scrub direction.';
            const rate = a.rf.fvsa != null ? (Math.abs(a.rf.ic.x) / a.rf.fvsa).toFixed(3) : '—';
            if (icY > 0 && icX != null && icX < 0) {
              return `RF IC is above ground (${icY.toFixed(1)}" height) and inboard — tire scrubs outward in jounce. Scrub rate ≈ ${rate} in/in of travel. On smooth oval surfaces this is benign; on rough pavement lateral disturbances disturb slip angles and introduce understeer transients (Milliken §17.3 Fig.17.11).`;
            }
            if (icY < 0) {
              return `RF IC is below ground — tire scrubs inward in jounce. Less common for SLA front suspensions — check hardpoint measurements.`;
            }
            return `IC at ground level — minimum scrub condition. Ideal for rough tracks.`;
          })()}
        </Finding>

        <Finding
          title="Arm Length Ratio (Upper/Lower)"
          value={(P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH).toFixed(3)} unit=""
          sev="info"
          tip={<Tip
            changeable={false}
            text="Ratio < 1.0 means shorter upper arm — wheel gains negative camber in jounce. P71 0.731 ratio produces the SLA jounce coefficient of −0.355°/° roll. Cannot change without custom fabrication."
            fixMethod="Fixed P71 geometry. Cannot be changed with available aftermarket parts."
          />}
        >
          Upper {P71_UPPER_ARM_LENGTH}" / lower {P71_LOWER_ARM_LENGTH}" = {(P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH).toFixed(3)}. Shorter upper arm forces wheel to gain negative camber in jounce — the SLA's key oval advantage over MacPherson struts.
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — LLTD
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="6 — LATERAL LOAD TRANSFER DISTRIBUTION (LLTD)" color="#22c55e">
        <Finding
          title="Geometric LLTD Split (Front Share of Geometric Transfer)"
          value={a.geoLLTDF != null ? (a.geoLLTDF * 100).toFixed(1) : '—'} unit="% of geometric LT to front"
          sev={a.geoLLTDF != null
            ? (isOval
              ? (a.geoLLTDF >= 0.58 && a.geoLLTDF <= 0.72 ? 'good' : a.geoLLTDF < 0.50 ? 'warning' : 'info')
              : (a.geoLLTDF >= 0.52 && a.geoLLTDF <= 0.68 ? 'good' : 'warning'))
            : 'info'}
          tip={<Tip
            changeable={false}
            text={`This is the fraction of GEOMETRIC load transfer (through RC links) that goes to the front axle vs rear axle. Formula: front_geo_LT / (front_geo_LT + rear_geo_LT) = (W_F × RC_F) / (W_F × RC_F + W_R × RC_R). This is NOT the same as the simulation's 46% total LLTD target — that 46% includes elastic (springs) + ARB + damper components on top of geometric. Geometric-only: with P71's 57% front weight and 20" front RC vs 14.5" rear RC, the normal result is ~62–66% of geometric transfer going to the front. A higher front RC vs rear RC means more geometric front bias, which is intentional on a left-turn oval — it loads the outside (RF) tire harder through the links before the springs even see the load.`}
            fixMethod="Lower front RC (raise ride height on stiffer springs) to shift geometric transfer rearward. Raise rear Watts pivot to shift geometric transfer forward to the front. On oval, having front geometric fraction 60–70% is correct — the RF needs to be loaded."
          />}
        >
          {a.geoLLTDF != null
            ? (() => {
                const gF = (a.geoLLTDF * 100).toFixed(1);
                const gR = (a.geoLLTDR * 100).toFixed(1);
                const rcF = a.rcAvg?.toFixed(1) ?? '—';
                const rcR = a.rearRC.toFixed(1);
                const tgt = isOval ? '60–70%' : '55–65%';
                const inRange = isOval ? (a.geoLLTDF >= 0.58 && a.geoLLTDF <= 0.72) : (a.geoLLTDF >= 0.52 && a.geoLLTDF <= 0.68);
                const wF = (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC).toFixed(0);
                const wR = (P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC)).toFixed(0);
                const ltF = (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * (a.rcAvg ?? 0) / 12).toFixed(0);
                const ltR = (P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC) * a.rearRC / 12).toFixed(0);
                return `Of the total geometric (link) load transfer, ${gF}% goes to the front axle and ${gR}% to the rear. Target range: ${tgt}.\n\nFront RC ${rcF}" → geo LT ∝ ${wF} lbs × ${rcF}" = ${ltF} lb·ft\nRear RC ${rcR}" → geo LT ∝ ${wR} lbs × ${rcR}" = ${ltR} lb·ft\n\n${inRange ? 'Geometric split is in target range.' : a.geoLLTDF < (isOval ? 0.58 : 0.52) ? 'Front geometric fraction below target — front RC is low relative to rear. Raise front RC or lower rear RC.' : 'Front geometric fraction above target — front RC is very high relative to rear. Consider lowering front RC to reduce geometric front bias.'}\n\nNOTE: The setup optimizer targets 46% TOTAL LLTD (geometric + elastic + ARB combined). Geometric-only fraction of 60–66% front is normal — elastic transfer (springs/ARB) adds rear stiffness to bring the total closer to neutral.`;
              })()
            : 'Enter front roll center hardpoints to compute geometric LLTD split.'}
        </Finding>

        <Finding
          title="Geometric Rear Fraction"
          value={a.geoLLTDF != null ? (a.geoLLTDR * 100).toFixed(1) : '—'} unit="% of geometric LT to rear"
          sev={a.geoLLTDF != null ? (a.geoLLTDR >= 0.28 && a.geoLLTDR <= 0.42 ? 'good' : 'info') : 'info'}
          tip={<Tip
            changeable={true}
            text="Rear geometric fraction = rear_geo_LT / (front_geo_LT + rear_geo_LT) = 1 − front fraction. The rear RC is set by the Watts link center pivot. Higher rear RC = more rear geometric transfer = rear tires load up sooner in a corner = oversteer tendency. Target rear fraction: 28–42% (most goes to front because front RC is higher on P71)."
            fixMethod="Adjustable Watts link pivot bracket. Raising the pivot 1 inch increases rear geometric transfer — shifts more load to rear geometric path, increasing rear-end stiffness and oversteer tendency. Lowering reduces rear geometric fraction."
          />}
        >
          {a.geoLLTDF != null
            ? `Rear Watts RC ${a.rearRC.toFixed(1)}" → ${(a.geoLLTDR * 100).toFixed(1)}% of geometric transfer to rear axle (front: ${(a.geoLLTDF * 100).toFixed(1)}%). Why LLTD matters: a pair of unevenly loaded tires produces less combined lateral force than the same total load split evenly (Milliken §12.3 item 11 — load sensitivity). More front LLTD = front tires more unequal = less front grip = understeer. More rear LLTD = rear tires more unequal = less rear grip = oversteer.`
            : `Rear RC at ${a.rearRC.toFixed(1)}". Enter front hardpoints to compute geometric split.`}
        </Finding>

        <Finding
          title="Geometric Roll Rate Distribution (Milliken §7.3)"
          value={a.rollRateFrontFrac != null ? `${(a.rollRateFrontFrac * 100).toFixed(1)}` : '—'} unit="% of geometric LT to front"
          sev={a.rollRateFrontFrac == null ? 'info'
            : isOval
              ? (a.rollRateFrontFrac >= 0.58 && a.rollRateFrontFrac <= 0.72 ? 'good' : 'warning')
              : (a.rollRateFrontFrac >= 0.52 && a.rollRateFrontFrac <= 0.68 ? 'good' : 'warning')}
          tip={<Tip
            changeable={true}
            text="Milliken §7.3: MRA analysis of a 3570 lb sports sedan found MAXIMUM lateral acceleration with 42% TOTAL LLTD to the front — but that 42% is total (geometric + elastic + ARB). The geometric component alone is typically 60–70% front on this type of SLA/solid-axle car because the front RC is higher. The elastic (spring/ARB) component adds predominantly rearward transfer, bringing total down to the 42–46% range. These are additive: total LLTD = geometric + elastic + damper components. The geometric fraction shown here is geometric-only. To see total LLTD, use the Setup Optimizer tab with your geometry profile loaded."
            fixMethod="Geometric fraction: lower front RC (raise ride height) to reduce front geometric fraction. Raise rear Watts link to increase rear geometric fraction. Spring/ARB stiffness then adds elastic transfer on top. For the total LLTD to hit 46% optimal, the springs and ARB need to contribute predominantly rearward transfer to counterbalance the front-biased geometric path."
          />}
        >
          {a.rollRateFrontFrac != null
            ? `Geometric-only split: ${(a.rollRateFrontFrac * 100).toFixed(1)}% front / ${((1-a.rollRateFrontFrac)*100).toFixed(1)}% rear. Normal range ${isOval ? '58–72%' : '52–68%'} front for this platform. ${isOval ? 'Elastic transfer (springs+ARB) adds predominantly rear stiffness, pulling total LLTD down toward the 46% optimal target in the Setup Optimizer.' : 'For figure-8, target symmetric split — front RC close to rear RC height.'}`
            : 'Enter front roll center data to compute roll rate distribution.'}
        </Finding>

        {isOval && (
          <Finding
            title="Stagger Effect — Diagonal Weight Jacking (Milliken §7.1)"
            value="—" unit=""
            sev="info"
            tip={<Tip
              changeable={true}
              text="Milliken §7.1 (Model to Reality — Stagger): Tire stagger (diameter difference between left and right on an axle) has the same load effect as diagonal weight jacking. A larger right rear tire effectively pre-loads the RF/LR diagonal (wedge), shifting load to the RF corner. This is used on ovals to dial out the car's tendency to push at corner entry — adding RR stagger tightens corner entry by increasing RF and LR load. Stagger is measured as the difference in tire circumference: (RR circ) - (LR circ). Typical oval stagger: 0–3 inches depending on tire compound and track banking."
              fixMethod="Select tires of different diameter for left vs right side. RR larger than LR adds wedge (tighter). LR larger adds reverse wedge (looser). Check with tape measure around tire sidewall — do not rely on nominal size. Measure hot after a session for accuracy."
            />}
          >
            Stagger is the oval equivalent of diagonal weight jacking (Milliken §7.1). A larger RR tire shifts load toward the RF/LR diagonal — same effect as turning the LR spring perch up. Use to trim mid-corner balance: more RR stagger = tighter mid-corner. Measure tire circumference after session when tires are at operating temp. Enter stagger in the Track Day session notes to track changes vs. handling feedback.
          </Finding>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — US/OS BALANCE — STEADY-STATE STABILITY (Milliken Ch.5)
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="7 — US/OS BALANCE — STEADY-STATE STABILITY" color="#fb923c">

        <Finding
          title="Ackermann Steer Angle"
          value={a.ackermannDeg.toFixed(2)} unit="°"
          sev="info"
          tip={<Tip
            changeable={false}
            text="Milliken §5.3: The Ackermann (geometric) steer angle δ = ℓ/R (radians) is the steer angle required to negotiate a turn of radius R with zero tire slip. For the P71: wheelbase = 114.7 in (9.558 ft). This is the baseline around which cornering stiffness and slip angles are measured. At race speeds the actual steer angle deviates from Ackermann by the sum of front and rear slip angles."
            fixMethod="Not directly adjustable — set by wheelbase and turn radius. Increase apex radius (wider line) to reduce Ackermann angle and reduce required slip."
          />}
        >
          δ_Ackermann = (9.558 ft wheelbase) / ({num(geo.apexRadius) || 145} ft radius) × (180/π) = {a.ackermannDeg.toFixed(2)}°. At {T.apexSteer}° actual steer, front slip angle contribution = {(T.apexSteer - a.ackermannDeg).toFixed(2)}° relative to geometric. This is the baseline from which over/understeer deviates — a neutral car would steer at exactly the Ackermann angle.
        </Finding>

        <Finding
          title="Static Margin (Weight Distribution Baseline)"
          value={(a.smEstimate * 100).toFixed(0)} unit="% (negative = slight OS tendency)"
          sev={a.smEstimate < -0.1 ? 'warning' : 'info'}
          tip={<Tip
            changeable={false}
            text="Milliken §5.11 (Eq.5.48a): Static Margin SM = [-(a/ℓ)CF + (b/ℓ)CR] / C. With equal cornering stiffness per unit load (CF/WF = CR/WR — neutral tire assumption), SM reduces to: SM = b/ℓ − a/ℓ = rear weight fraction − front weight fraction. P71: 57% front → SM = 0.43 − 0.57 = −0.14. Negative SM means the CG is ahead of the Neutral Steer Point → slight geometric understeer tendency in linear range. At race speeds (0.813G) the rear axle carries additional load from weight transfer, shifting effective cornering stiffness rearward and pushing toward oversteer — the geometric baseline reverses. This is why LLTD balance is the primary diagnostic at speed."
            fixMethod="SM is set by wheelbase geometry and weight distribution. On the P71, 57% front bias is fixed. The operating point at 0.813G shifts away from the linear SM prediction — see LLTD section for the race-speed diagnostic."
          />}
        >
          P71 weight distribution: 57% front (2,109 lbs), 43% rear (1,591 lbs). Static Margin from weight distribution alone ≈ −14% (slight geometric OS tendency in linear range, &lt;0.3G). At {T.trackG}G race speed the vehicle operates far above the linear range — the bicycle model gives qualitative direction only. LLTD analysis (Section 6) is the dominant diagnostic at race speed.
        </Finding>

        <Finding
          title="LLTD-Derived US/OS Tendency"
          value={a.lltdUGSign ?? '—'}
          unit=""
          sev={
            a.lltdUGSign == null ? 'info'
            : a.lltdUGSign.includes('UNDERSTEER') ? 'warning'
            : a.lltdUGSign.includes('OVERSTEER')  ? 'warning'
            : 'good'
          }
          tip={<Tip
            changeable={true}
            text="At 0.813G (nonlinear range), effective cornering stiffness drops with increasing load — whichever axle carries more geometric lateral load transfer will see its tires load up faster and degrade first. Front geometric fraction >72% → front tires load up harder geometrically → push tendency. Front fraction <55% → rear loads up harder → loose tendency. Normal P71 geometric split is 60–68% front (front RC is higher than rear). This geometric imbalance is corrected by elastic transfer (springs/ARB) which adds rear stiffness — the 46% total LLTD target in the optimizer combines all three components."
            fixMethod="Lower front RC (raise car on taller/stiffer springs) to reduce front geometric fraction. Raise rear Watts link pivot to increase rear geometric fraction. These shift relative loading without changing spring rates. Spring and ARB changes add elastic LLTD on top."
          />}
        >
          {a.lltdFrontFrac != null
            ? `Geometric split: ${(a.lltdFrontFrac * 100).toFixed(1)}% of geometric LT to front / ${((1 - a.lltdFrontFrac) * 100).toFixed(1)}% to rear. Normal range ${isOval ? '60–70%' : '55–65%'} front. ${a.lltdFrontFrac > 0.72 ? 'Above 72% — front is heavily geometry-loaded. Consider lowering front RC or raising rear Watts pivot.' : a.lltdFrontFrac < 0.55 ? 'Below 55% — rear RC is high relative to front. Front is under-loaded geometrically — car may be loose on entry.' : 'Normal geometric split — front RC is appropriately higher than rear for this platform.'} The optimizer\'s 46% TOTAL LLTD target includes elastic (springs) + ARB on top of this geometric base.`
            : 'Enter front roll center data (Section 1) to compute LLTD-derived US/OS tendency.'
          }
        </Finding>

        <Finding
          title="Linear Model Validity Caveat"
          value={`${T.trackG}G — NONLINEAR`}
          unit=""
          sev="info"
          tip={<Tip
            changeable={false}
            text="Milliken §5.11: The bicycle model (Bundorf UG, Static Margin, Characteristic/Critical Speed) is valid in the linear range — approximately 0 to 0.3G lateral acceleration. Above this, tire Cα drops with increasing load and the linear UG formulas overestimate stability. The P71 operates at 0.813G on the oval — well into the nonlinear range. Use pyrometer data and LLTD geometry as the primary diagnostics. The bicycle model provides qualitative direction (which end saturates first) but not quantitative values."
            fixMethod="No fix needed — this is a physics boundary, not a setup issue. Use LLTD section (Section 6) and tire temperature analysis in the Simulation tab for race-speed balance diagnosis."
          />}
        >
          Bicycle model linear range: ~0–0.3G. P71 at {T.trackG}G is {((T.trackG / 0.3) * 100 - 100).toFixed(0)}% above the linear limit. Characteristic speed (Vchar = √(1/K)) and Bundorf understeer gradient are directionally correct but not quantitatively reliable at race lateral G. The Static Margin and LLTD analysis give the correct qualitative push/loose diagnosis — pyrometer cross-check provides ground truth.
        </Finding>

        <Finding
          title="Compliance Steer Audit — Front (Milliken §23)"
          value="UNDERSTEER BIAS" unit=""
          sev="warning"
          tip={<Tip
            changeable={true}
            text="Milliken §23: Lateral force compliance steer on the front is understeer if the steering system is softer than the suspension links. The P71 uses a recirculating ball steering box with rubber mounts — under cornering lateral force, the steering box mount flexes and the tie rods deflect, allowing the front wheels to steer slightly away from the turn (toe-out on the outside wheel = understeer). This is in addition to the geometric aligning torque compliance steer (Milliken §23: 'almost always understeer on the front'). The effect is proportional to lateral force — at 0.813G it is significant."
            fixMethod="(1) Replace rubber steering box mount with solid or poly mount — eliminates the largest single compliance source. (2) Replace rubber tie rod end bushings with poly or spherical rod ends. (3) Stiffen K-member control arm bushings with poly inserts. Each reduces lateral force compliance steer. Effect: 0.25–0.75°/g reduction in effective understeer gradient. Measure before/after by noting required steering wheel angle change at fixed speed in a constant-radius turn."
          />}
        >
          P71 compliance sources adding understeer on the front (Milliken §23 — effects that steer tire away from turn center = understeer): (1) Rubber steering box mount — flexes under tie rod lateral load, allows box to move, toes front wheels out. (2) Rubber control arm bushings — allow arm to deflect rearward under braking/lateral load, altering effective caster and toe. (3) Aligning torque compliance — tire aligning torque tries to straighten front wheels (understeer direction). Solid axle rear is immune to lateral force compliance steer — this is the key advantage of the P71's solid rear over IRS.
        </Finding>

        <Finding
          title="Compliance Camber Audit (Milliken §23)"
          value="BOTH ENDS: OS tendency" unit=""
          sev="info"
          tip={<Tip
            changeable={true}
            text="Milliken §23: Lateral force compliance camber — the tire lateral force acts below all suspension components, causing the top of the tire to lean away from the turn center (positive camber on outside wheel). On the front: 'lateral force compliance camber on the front is always an understeer effect' — outside tire gains positive camber, loses lateral force. On the rear: 'lateral force compliance camber on the rear will be an oversteer effect.' P71 solid rear axle: the axle beam itself does not camber relative to the chassis — this oversteer source is eliminated on the rear. This is already modeled: the swCamber = 0.48° term in the camber chain represents front lateral force compliance camber (outside RF tire gaining ~0.48° positive camber under cornering load)."
            fixMethod="Front compliance camber is partially addressed by: (1) static negative camber pre-loading the outside tire against compliance deflection — the −2° static target accounts for this. (2) Stiffer control arm bushings reduce the lateral deflection. (3) Spherical ball joint replacement removes elastic compliance from the joint itself. The solid rear axle already eliminates rear compliance camber."
          />}
        >
          Front: RF outside tire gains ~{(0.48).toFixed(2)}° positive camber under cornering load (lateral force compliance camber — already modeled as swCamber term in Section 2 camber chain). This is understeer-directional on the front. Static −2° RF camber target is sized to account for this deflection. Rear: P71 solid beam axle does not camber under lateral load — rear compliance camber oversteer source is eliminated. Key advantage of solid axle over IRS for oval racing.
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8 — RIDE & ROLL RATE ANALYSIS (Milliken Ch.16)
      ══════════════════════════════════════════════════════════════════ */}
      {(a.kwFavg || a.kwRavg) ? (
        <Section title="8 — RIDE & ROLL RATE ANALYSIS" color="#c084fc">

          <Finding
            title="Wheel Rates"
            value={a.kwFavg != null ? `F ${a.kwFavg.toFixed(0)} / R ${a.kwRavg?.toFixed(0) ?? '—'}` : '—'} unit="lb/in"
            sev={a.kwFavg != null ? 'info' : 'info'}
            tip={<Tip
              changeable={true}
              text="Milliken §16.1: Wheel center rate = spring rate × installation ratio². IR is the fraction of wheel travel that compresses the spring. P71 SLA front IR ≈ 0.52 (spring mounted part-way along lower arm). Wheel rate is always LOWER than spring rate because the spring moves less than the wheel. This is why switching to a stiffer spring rate has less effect on handling than expected — the IR squares the reduction."
              fixMethod="Wheel rate is changed by selecting a different spring rate OR by moving the spring attachment point to change IR. Moving spring mount outboard (closer to wheel) increases IR and wheel rate. Moving inboard decreases both. Spring rate is the easier adjustment for P71."
            />}
          >
            Front wheel rate: {a.kwLF?.toFixed(0) ?? '—'} lb/in (LF) / {a.kwRF?.toFixed(0) ?? '—'} lb/in (RF) — from {a.ksLF ?? a.ksRF ?? '—'} lb/in spring × {a.irF.toFixed(2)}² IR.{'\n'}
            Rear wheel rate: {a.kwLR?.toFixed(0) ?? '—'} lb/in (LR) / {a.kwRR?.toFixed(0) ?? '—'} lb/in (RR) — from {a.ksLR ?? a.ksRR ?? '—'} lb/in spring × {a.irR.toFixed(2)}² IR.
          </Finding>

          <Finding
            title="Ride Frequency"
            value={a.rideFreqF_cpm != null ? `F ${a.rideFreqF_cpm.toFixed(0)} / R ${a.rideFreqR_cpm?.toFixed(0) ?? '—'}` : '—'} unit="cpm"
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
            tip={<Tip
              changeable={true}
              text="Milliken §16.2: Ride frequency ω = (1/2π)√(K_w×386.4/W_corner) in Hz × 60 = cpm. Older Indy-type race cars (no ground effects): 95–120 cpm. Passenger cars: 30–50 cpm. Racing sedans: 80–120 cpm. Front frequency MUST be higher than rear (front-heavy car) to prevent 'pitch coupling' where front and rear bounce reinforce each other. If rear frequency is higher than front, the car will exhibit a hobby-horse pitching resonance — very unsettling and reduces tire contact. Milliken §16.2: front higher than rear is the standard prescription for rear-drive race cars."
              fixMethod="Increase front spring rate to raise front frequency. Reduce rear spring rate to lower rear frequency (or raise front). For the P71, target F: 100–120 cpm, R: 90–108 cpm with F always higher."
            />}
          >
            {a.rideFreqF_cpm != null
              ? `Front: ${a.rideFreqF_cpm.toFixed(0)} cpm (${(a.rideFreqF_cpm/60).toFixed(2)} Hz). Rear: ${a.rideFreqR_cpm?.toFixed(0) ?? '—'} cpm. Target range: front 95–120, rear 85–110, front always higher. ${a.rideFreqF_cpm && a.rideFreqR_cpm && a.rideFreqF_cpm < a.rideFreqR_cpm ? '⚠ REAR FREQUENCY EXCEEDS FRONT — pitch coupling likely. Increase front spring rate or reduce rear spring rate.' : a.rideFreqF_cpm >= 95 && a.rideFreqF_cpm <= 130 ? 'Front frequency in target range.' : a.rideFreqF_cpm < 95 ? 'Front frequency below race target — spring rate too soft for roll stiffness requirements.' : 'Front frequency above 130 cpm — very stiff, may cause issues on rough surfaces.'}`
              : 'Enter spring rates to compute ride frequency.'}
          </Finding>

          <Finding
            title="Spring Roll Rate & Roll Gradient"
            value={a.rollGradient != null ? a.rollGradient.toFixed(2) : '—'} unit="deg/g (springs only)"
            sev={(() => {
              const rg = a.rollGradient;
              if (rg == null) return 'info';
              if (rg <= 2.5) return 'good';
              if (rg <= 4.0) return 'warning';
              return 'critical';
            })()}
            tip={<Tip
              changeable={true}
              text="Milliken §16.2, Table 16.1: Roll gradient (φ/A_Y) = body roll per g of lateral acceleration. Formula: (W×H_CG)/(K_φF+K_φR) × (180/π) in deg/g. Table 16.1 reference values: Passenger car 7–8.5, Very firm domestic 4.2, Extremely firm/sport 3.0, Racing car only 1.5. This section shows springs-only roll gradient. ARB adds additional roll stiffness — see ARB requirement below. Table 16.5: for non-aero sedans, target 1.0–1.8 deg/g with ARBs included."
              fixMethod="Reduce roll gradient by: (1) stiffer springs, (2) front and/or rear ARB, (3) lowering CG height. For the P71 targeting 1.5 deg/g, the springs alone should provide 2–3 deg/g with ARBs making up the remainder. If springs provide <1.5 deg/g already, the car may be over-sprung for the chassis."
            />}
          >
            {a.rollGradient != null
              ? `Springs-only roll rate: K_φF ${a.kPhiF_spring?.toFixed(0) ?? '—'} + K_φR ${a.kPhiR_spring?.toFixed(0) ?? '—'} = ${a.kPhiTotal?.toFixed(0) ?? '—'} lb-ft/rad. Roll gradient (springs): ${a.rollGradient.toFixed(2)} deg/g. Body roll at ${T.trackG}G apex: ${a.rollFromSprings?.toFixed(1) ?? '—'}° from springs alone. ${a.rollGradient > 3.1 ? `Higher than current model assumption of 3.1°/g — springs are soft. ARBs will add stiffness (see below).` : a.rollGradient < 1.5 ? `Springs already stiffer than 1.5 deg/g target — ARBs may not be required for roll control. Check bumpstop contacts.` : `Springs within expected range. ARBs fine-tune to final target.`}`
              : 'Enter spring rates and rear spring track to compute roll gradient.'}
          </Finding>

          <Finding
            title="ARB Requirement (to reach 1.5 deg/g target)"
            value={a.arbFRequired_deg != null ? `F ${a.arbFRequired_deg.toFixed(0)} / R ${a.arbRRequired_deg?.toFixed(0) ?? '—'}` : '—'} unit="lb-ft/deg"
            sev={a.arbFRequired_deg == null ? 'info' : (a.arbFRequired_deg > 0 || (a.arbRRequired_deg ?? 0) > 0) ? 'warning' : 'good'}
            tip={<Tip
              changeable={true}
              text="Milliken §16.2: After computing spring-only roll rate, the difference between the required total roll rate (for target roll gradient) and the spring-provided roll rate must be supplied by ARBs. Target roll gradient: 1.5 deg/g (Milliken Table 16.1 racing cars) with 55% front LLTD for oval. Required total K_φ = W×H_CG / (target_RG×π/180). ARB contribution: K_φB = K_φBB × (L² / (I_B² × T²)) — where L is ARB lever arm length, I_B is linear installation ratio, T is track width. Milliken notes that ARB sizing from these values gives the physical bar dimensions via Chapter 21."
              fixMethod="If ARB requirement is positive, add/stiffen ARBs at that axle. Front ARB increases front LLTD → more push. Rear ARB increases rear LLTD → more loose. For oval: start with less rear ARB and more front ARB. For figure-8: balance front and rear equally. P71 stock ARB diameter ≈ 1.0–1.125 in solid front bar — stiffer aftermarket bars available."
            />}
          >
            {a.arbFRequired_deg != null
              ? `Required total K_φ for ${a.targetRollGrad} deg/g: ${(a.kPhiRequired ?? 0).toFixed(0)} lb-ft/rad. Springs provide ${a.kPhiTotal?.toFixed(0) ?? 0} lb-ft/rad (${((a.kPhiTotal ?? 0) / (a.kPhiRequired ?? 1) * 100).toFixed(0)}% of target). ${(a.arbFRequired_deg ?? 0) > 0 || (a.arbRRequired_deg ?? 0) > 0 ? `ARBs must supply: Front ${a.arbFRequired_deg?.toFixed(0)} lb-ft/deg + Rear ${a.arbRRequired_deg?.toFixed(0)} lb-ft/deg additional roll stiffness.` : 'Springs alone exceed roll gradient target — no ARB required for roll control. ARBs can still be used to adjust front/rear LLTD balance.'}`
              : 'Enter spring rates to compute ARB requirement.'}
          </Finding>

          <Finding
            title="Target Spring Rate (if not yet selected)"
            value={`F ${a.ksF_target.toFixed(0)} / R ${a.ksR_target.toFixed(0)}`} unit="lb/in at spring"
            sev="info"
            tip={<Tip
              changeable={true}
              text="Milliken §21.4 / §16.2: Back-solving from target ride frequency (front 108 cpm / rear 97 cpm) and installation ratio. Formula: K_s = (2πω)² × W_corner / (IR² × 386.4). These are starting point spring rates — actual selection depends on bumpstop gap, available wheel travel, and roll stiffness requirements. Ref 6 recommends measuring spring rate over ±25mm (±1 in) of the design load length for accurate rate on nonlinear springs."
              fixMethod="Select the nearest standard spring rate from a spring catalog (e.g., Hypercoil, Eibach, Afco). Rates are typically available in 25 or 50 lb/in increments. After selecting springs, enter the actual rate above to verify wheel rate, ride frequency, and roll gradient."
            />}
          >
            Target spring rates for front 108 cpm / rear 97 cpm at IR {a.irF.toFixed(2)} / {a.irR.toFixed(2)}: Front {a.ksF_target.toFixed(0)} lb/in → wheel rate {(a.ksF_target * a.irF * a.irF).toFixed(0)} lb/in. Rear {a.ksR_target.toFixed(0)} lb/in → wheel rate {(a.ksR_target * a.irR * a.irR).toFixed(0)} lb/in. Spring load at static corner weight: Front {a.springLoadF.toFixed(0)} lbs / Rear {a.springLoadR.toFixed(0)} lbs (= corner weight / IR).
          </Finding>

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
            const comprPct = sd.free > 0 ? ((sd.compression / (sd.free * 0.4)) * 100).toFixed(0) : '—';
            const sev = sd.jounceAvail != null && sd.jounceAvail < 0.5 ? 'critical'
              : sd.compression < 0.5 ? 'critical'
              : sd.jounceAvail != null && sd.jounceAvail < 1.0 ? 'warning'
              : 'good';
            return (
              <Finding
                key={pos}
                title={`${pos} Shock Travel`}
                sev={sev}
              >
                Free length: {sd.free.toFixed(2)}" | Installed: {sd.inst.toFixed(2)}" | Shaft compressed: {sd.compression.toFixed(2)}"{'\n'}
                Jounce available to bumpstop: {sd.jounceAvail != null ? sd.jounceAvail.toFixed(2) + '"' : 'not measured'}{'\n'}
                {sd.jounceAvail != null && sd.jounceAvail < 0.5 && '⚠ CRITICAL: Less than 0.5" to bumpstop — will hit stop in normal cornering. Stiffer spring or shorter bump rubber needed.\n'}
                {sd.compression < 0.5 && '⚠ CRITICAL: Shock nearly topped out — no droop travel. Wheel cannot follow road surface downward. Longer shock or lower ride height needed.\n'}
                {sd.bump && sd.jounceAvail != null && `Wheel bump travel measured: ${sd.bump}" — shock bumpstop gap ${sd.jounceAvail}". ${parseFloat(sd.bump) > parseFloat(sd.jounceAvail) ? 'Wheel travel exceeds bumpstop gap — bumpstop will be contacted during recorded bump measurement.' : 'Bumpstop gap exceeds wheel travel — shock is not the limiting factor.'}`}
              </Finding>
            );
          })}

          {(a.rhFrontAvg || a.rhRearAvg) && (
            <Finding title="Ride Height Summary" sev="info">
              {a.rhFrontAvg && `Front avg: ${a.rhFrontAvg.toFixed(2)}"`}
              {a.rhRearAvg  && `  Rear avg: ${a.rhRearAvg.toFixed(2)}"`}
              {a.rhRake     && `  Rake (F−R): ${sign(a.rhRake)}"`}
              {a.rhSideSplit && `  L−R split: ${sign(a.rhSideSplit)}"`}
              {a.rhRake != null && a.rhRake < -0.5 && '\n⚠ Rear is significantly higher than front — rear-heavy rake can cause front plow (push). Consider stiffer front springs or taller front ride height.'}
              {a.rhRake != null && a.rhRake > 1.5 && '\n⚠ Front is significantly higher than rear — strong nose-up rake. Improves straight-line aero but may increase understeer at corner entry.'}
              {a.rhSideSplit != null && Math.abs(a.rhSideSplit) > 1.0 && !isOval && '\n⚠ Large L/R ride height split for figure-8 — will produce handling difference between left and right turns.'}
            </Finding>
          )}

          {/* ── Milliken Ch.22 Damper Analysis ───────────────────────────── */}
          {a.cCritF != null && (
            <Finding
              title="Critical Damping & Target Forces (Milliken §22.3)"
              value={`F ${a.cCritF.toFixed(2)} / R ${a.cCritR?.toFixed(2) ?? '—'}`} unit="lb·s/in C_crit"
              sev="info"
              tip={<Tip
                changeable={true}
                text="Milliken §22.3: Critical damping coefficient C_crit = 2√(km) where k = wheel rate (lb/in) and m = sprung corner mass (slugs = lbs/386.4). Damping ratio ζ = C / C_crit. Target ratios (Milliken Table 22.2, non-aero oval): ride ζ = 0.40–0.50, roll ζ = 0.71. Passenger cars typically ζ = 0.25. Racing sedans need higher ratios to control body motion without aero downforce. At 5 in/sec shaft speed (the body-control range — most important per §22.3), the target damping force = C_crit × ζ × 5. Rebound is manufactured at ~2× bump force to keep body forces symmetric — the car lifts at the same rate it pushes down, so the driver feels symmetric transient response."
                fixMethod="Dyno-test the shock at 5 in/sec shaft speed to measure actual bump and rebound forces. Compare to target range. If too soft: increase damper adjustment (KONI: turn clockwise, number increases). If too stiff: decrease adjustment. Set bump first to match ζ=0.40–0.50 target, then verify rebound is ~2× bump."
              />}
            >
              {`C_crit computed from wheel rates: Front ${a.cCritF.toFixed(3)} lb·s/in, Rear ${a.cCritR?.toFixed(3) ?? '—'} lb·s/in.\n`}
              {`Sprung mass: F ${(a.wSF/2).toFixed(0)} lbs/corner, R ${(a.wSR/2).toFixed(0)} lbs/corner.\n\n`}
              {`Target BUMP force at ${a.refSpeed} in/sec (ζ = ${a.zetaLow}–${a.zetaHigh}):\n`}
              {`  Front: ${a.fDampBumpF_min?.toFixed(0)}–${a.fDampBumpF_max?.toFixed(0)} lbs\n`}
              {`  Rear:  ${a.fDampBumpR_min?.toFixed(0) ?? '—'}–${a.fDampBumpR_max?.toFixed(0) ?? '—'} lbs\n\n`}
              {`Target REBOUND force at ${a.refSpeed} in/sec (~2× bump, ζ = ${a.zetaLow}–${a.zetaHigh}):\n`}
              {`  Front: ${a.fDampRebF_min?.toFixed(0)}–${a.fDampRebF_max?.toFixed(0)} lbs\n`}
              {`  Rear:  ${a.fDampRebR_min?.toFixed(0) ?? '—'}–${a.fDampRebR_max?.toFixed(0) ?? '—'} lbs`}
            </Finding>
          )}

          {(a.fBumpF_meas || a.fBumpR_meas || a.fRebF_meas || a.fRebR_meas) && (
            <Finding
              title="Measured Damping Ratio (Milliken §22.3)"
              value={a.zetaF_bump != null ? `F bump ζ=${a.zetaF_bump.toFixed(2)}` : '—'} unit=""
              sev={(() => {
                const zb = a.zetaF_bump; const zr = a.zetaF_reb;
                if (!zb) return 'info';
                const bOk = zb >= 0.35 && zb <= 0.75;
                const rOk = zr ? zr >= 0.60 && zr <= 1.5 : true;
                if (!bOk || !rOk) return 'warning';
                return 'good';
              })()}
              tip={<Tip
                changeable={true}
                text="Damping ratio ζ = F_measured / (C_crit × V_shaft). Calculated from entered dyno force at 5 in/sec. Target: bump ζ = 0.40–0.50, rebound ζ = 0.71–1.0 (rebound always higher than bump). A ζ below 0.25 (comfort damping) produces excessive body motion and tire bounce. A ζ above 1.0 is overdamped — the wheel cannot return fast enough after a bump, causing the car to progressively settle lower on rough surfaces ('jack down'). The 1:2 bump:rebound ratio is manufactured into the shock internally and cannot be changed without reshimming the valving."
                fixMethod="KONI shock adjustment: turn adjustment knob clockwise to increase damping (both bump and rebound increase together on a single-adjustable shock). Each click changes ζ by approximately 0.05–0.10 depending on shock model. Measure corner weights before and after shock adjustment — jacking down from excessive rebound will show as lowered ride height at that corner."
              />}
            >
              {[
                a.zetaF_bump != null && `Front bump: ${a.fBumpF_meas} lbs at 5 in/sec → ζ_bump = ${a.zetaF_bump.toFixed(2)} ${a.zetaF_bump >= 0.40 && a.zetaF_bump <= 0.71 ? '✓ in target range' : a.zetaF_bump < 0.40 ? '⚠ SOFT — increase damper adjustment' : '⚠ STIFF — reduce damper adjustment or reshim valving'}`,
                a.zetaF_reb != null && `Front rebound: ${a.fRebF_meas} lbs at 5 in/sec → ζ_reb = ${a.zetaF_reb.toFixed(2)} ${a.zetaF_reb >= 0.60 && a.zetaF_reb <= 1.4 ? '✓ in range' : a.zetaF_reb > 1.4 ? '⚠ EXCESSIVE REBOUND — jacking down risk (see below)' : '⚠ LOW REBOUND — poor body control on return stroke'}`,
                a.brRatioF != null && `Front bump:rebound ratio = 1:${a.brRatioF.toFixed(2)} ${a.brRatioF >= 1.5 && a.brRatioF <= 2.5 ? '✓ (target 1:2)' : a.brRatioF > 2.5 ? '⚠ REBOUND TOO HIGH relative to bump — dominant jacking down risk' : '⚠ REBOUND TOO LOW — symmetric damping, poor body control'}`,
                a.zetaR_bump != null && `Rear bump: ${a.fBumpR_meas} lbs at 5 in/sec → ζ_bump = ${a.zetaR_bump.toFixed(2)} ${a.zetaR_bump >= 0.40 && a.zetaR_bump <= 0.71 ? '✓ in target range' : a.zetaR_bump < 0.40 ? '⚠ SOFT' : '⚠ STIFF'}`,
                a.zetaR_reb != null && `Rear rebound: ${a.fRebR_meas} lbs at 5 in/sec → ζ_reb = ${a.zetaR_reb.toFixed(2)} ${a.zetaR_reb >= 0.60 && a.zetaR_reb <= 1.4 ? '✓ in range' : a.zetaR_reb > 1.4 ? '⚠ EXCESSIVE REBOUND — jacking down risk' : '⚠ LOW REBOUND'}`,
                a.brRatioR != null && `Rear bump:rebound ratio = 1:${a.brRatioR.toFixed(2)} ${a.brRatioR >= 1.5 && a.brRatioR <= 2.5 ? '✓ (target 1:2)' : a.brRatioR > 2.5 ? '⚠ REBOUND TOO HIGH' : '⚠ REBOUND TOO LOW'}`,
              ].filter(Boolean).join('\n')}
            </Finding>
          )}

          {(a.zetaF_reb != null && a.zetaF_reb > 1.2) || (a.zetaR_reb != null && a.zetaR_reb > 1.2) ? (
            <Finding
              title="Jacking Down Diagnostic (Milliken §22.4)"
              value="RISK — EXCESSIVE REBOUND" unit=""
              sev="critical"
              tip={<Tip
                changeable={true}
                text="Milliken §22.4 ('jacking down'): If rebound damping is excessive, the shock cannot extend fast enough after a jounce event. The spring can't push the body back up in time before the next bump arrives. The car progressively settles lower on the bumpstops — the driver feels the car getting stiffer and lower through a long corner or rough section. On exit, the car may suddenly become very loose as it comes off the bumpstop. Distinguished from a handling problem by measuring ride height before and after a session — if the car is measurably lower after 10 laps, jacking down is occurring."
                fixMethod="(1) Reduce rebound damping — KONI adjustment reduces both bump and rebound together on a single-adjustable shock. (2) Target rebound ζ = 0.71–1.0, not higher. (3) Verify bumpstop gap — if bumpstop gap is zero or negative, the car IS on the bumpstop at ride height and no damper setting will help (fix spring first). (4) On two-adjustable shocks: reduce rebound click independently without changing bump."
              />}
            >
              {[
                a.zetaF_reb != null && a.zetaF_reb > 1.2 && `Front rebound ζ=${a.zetaF_reb.toFixed(2)} — significantly overdamped in rebound. Spring cannot recover from jounce events at race speed. Progressive settling toward front bumpstops through a long corner. Check front bumpstop gap after session — if it has decreased since start, jacking down is confirmed.`,
                a.zetaR_reb != null && a.zetaR_reb > 1.2 && `Rear rebound ζ=${a.zetaR_reb.toFixed(2)} — overdamped rear rebound. Rear will jack down on rough exit from turn, suddenly releasing all rear roll stiffness — snaps loose at exit. Critical on oval.`,
              ].filter(Boolean).join('\n')}
            </Finding>
          ) : null}

          {a.cCritF != null && (
            <Finding
              title="Transient Balance: Bump vs Rebound (Milliken §22.5)"
              value="Front bump → push | Rear bump → loose" unit=""
              sev="info"
              tip={<Tip
                changeable={true}
                text="Milliken §22.5: Increasing front bump damping increases the front tire's resistance to jounce — in a transient maneuver (trail braking, turn-in), the front resists deflection and transfers more force laterally, but delays weight transfer to the outside. The net effect is MORE UNDERSTEER (PUSH) on initial turn-in. Increasing rear bump damping has the opposite effect — the rear resists jounce under lateral loading, delaying rear weight transfer, which momentarily increases rear grip on entry → MORE OVERSTEER (LOOSE) tendency on turn-in. This is a transient effect only — does not affect steady-state cornering balance."
                fixMethod="KONI single-adjustable: adjustment changes bump and rebound together. To tune transient balance without a two-adjustable shock: (1) If the car pushes on entry, soften front or stiffen rear damping. (2) If the car is loose on entry, stiffen front or soften rear damping. Always verify the change fixes the symptom without inducing jacking down on the affected end."
              />}
            >
              {`Transient handling effects of shock adjustment (Milliken §22.5):\n`}
              {`  Front SOFTER bump → less entry push, more neutral turn-in\n`}
              {`  Front STIFFER bump → more push on entry\n`}
              {`  Rear SOFTER bump → tighter entry (less initial oversteer)\n`}
              {`  Rear STIFFER bump → looser entry (more oversteer at turn-in)\n\n`}
              {`Use these effects to fine-tune first-lap or corner-entry balance. Steady-state mid-corner balance is controlled by RC heights and ARB — shocks tune the transient response only.`}
            </Finding>
          )}

          {a.fHop_hz != null && (
            <Finding
              title="Wheel Hop Frequency (Milliken §22.6)"
              value={`~${a.fHop_cpm.toFixed(0)}`} unit="cpm unsprung resonance"
              sev={a.fHop_cpm > 600 && a.fHop_cpm < 800 ? 'good' : 'info'}
              tip={<Tip
                changeable={false}
                text="Milliken §22.6: Wheel hop occurs at the unsprung mass resonant frequency — the wheel bouncing on the tire spring. f_hop = (1/2π)√(K_tire/m_unsprung). For the P71: estimated tire rate K_T ≈ 1,200 lb/in (235/55R17 at ~30 psi race pressure), unsprung mass ~85 lbs/corner → f_hop ≈ 11–12 Hz (660–720 cpm). Milliken §22.6: if the shock's transmissibility at the wheel hop frequency exceeds ~2.5, the wheel hops and grip is lost. High rebound damping at high shaft speeds (above ~15 in/sec) is the primary tool to control wheel hop — the shock limits wheel oscillation amplitude. However, for a street-derived sedan (P71), shaft speeds above 15 in/sec are rarely seen — the car is not a race-purpose vehicle with high-frequency road inputs."
                fixMethod="If wheel hop is observed (visible wheel bouncing, chattering on straights): (1) increase rear damping — the rear solid axle is heaviest and most prone to wheel hop due to high unsprung mass. (2) Reduce tire pressure slightly — lowers K_T and drops hop frequency, reduces amplitude. (3) Check shock shaft bushings — worn bushings increase play and promote hop. (4) Verify wheel balance — imbalance excites hop at specific speeds (resonant speed = f_hop × tire circumference in ft/min)."
              />}
            >
              {`Unsprung resonance: K_tire ≈ 1200 lb/in, m_unsprung = 85 lbs/corner → f_hop ≈ ${a.fHop_hz.toFixed(1)} Hz (${a.fHop_cpm.toFixed(0)} cpm).\n`}
              {`This is well above the body ride frequency (${a.rideFreqF_cpm?.toFixed(0) ?? '~100'} cpm body vs ${a.fHop_cpm.toFixed(0)} cpm wheel) — the two resonances do not interact. Wheel hop is controlled by high-speed rebound damping (above 10 in/sec shaft speed). At oval speeds the excitation of wheel hop resonance is minimal — prioritize low-speed (0–5 in/sec) body control over high-speed damping tuning.`}
            </Finding>
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

    </div>
  );
}
