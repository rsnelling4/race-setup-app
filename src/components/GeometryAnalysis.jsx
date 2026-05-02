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
  const frontAxleWeight = P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC;
  const rearAxleWeight  = P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC);
  const trackFt         = trackWidthF / 12;
  const geoLLTDF = rcAvg  != null && trackFt > 0 ? (frontAxleWeight * T.trackG * rcAvg  / 12) / (P71_TOTAL_WEIGHT * T.trackG * trackFt) : null;
  const geoLLTDR = trackFt > 0                   ? (rearAxleWeight  * T.trackG * rearRC / 12) / (P71_TOTAL_WEIGHT * T.trackG * trackFt) : 0;

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

  const rcDiffNote = a.rcDiff != null
    ? a.rcDiff > 2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is ${a.rcDiff.toFixed(1)}" higher than rear (${a.rearRC.toFixed(1)}"). Front is geometrically stiffer in roll — ${isOval ? 'intentional on a left-turn oval' : 'may produce understeer on figure-8 with mixed turn directions'}.`
      : a.rcDiff < -2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is lower than rear (${a.rearRC.toFixed(1)}") by ${Math.abs(a.rcDiff).toFixed(1)}". Rear transfers load geometrically faster — tends to cause oversteer at turn-in.`
      : `Front RC (${a.rcAvg?.toFixed(1)}") and rear RC (${a.rearRC.toFixed(1)}") are nearly equal. Roll stiffness relies on springs and ARB rather than geometry.`
    : '';

  // ── Parts / spring / shock recommendations ────────────────────────────────
  const partsRecs = [];

  // Spring rate from ride height + bumpstop gap
  for (const pos of ['LF', 'RF', 'LR', 'RR']) {
    const sd = a.shockData[pos];
    if (!sd) continue;
    if (sd.jounceAvail != null && sd.jounceAvail < 0.5) {
      partsRecs.push({
        pos, type: 'SPRING — STIFFER or LONGER',
        color: '#f87171',
        detail: `${pos} bumpstop gap is only ${sd.jounceAvail.toFixed(2)}" at ride height. The suspension hits the bumpstop early in jounce — this creates a sudden increase in spring rate mid-corner, which feels like a harsh impact and can cause the car to push or bounce off the corner. Fix: stiffer spring (keeps the car higher), shorter bump rubber, or raise ride height.`,
      });
    }
    if (sd.compression < 0.5) {
      partsRecs.push({
        pos, type: 'SHOCK — TOPPED OUT',
        color: '#f87171',
        detail: `${pos} shock is only ${sd.compression.toFixed(2)}" compressed at ride height — nearly at full extension. The shock has no droop travel, which means the wheel cannot follow the road surface downward. This causes wheel hop and loss of traction on bumps and in corners. Fix: longer shock (more travel), lower ride height, or different spring perch position.`,
      });
    }
    if (sd.free && sd.inst && sd.jounceAvail != null) {
      const totalStroke = sd.free - sd.inst + sd.jounceAvail;
      const droopUsed   = sd.free - sd.inst;
      const jounceUsed  = sd.jounceAvail;
      if (totalStroke < 2.0) {
        partsRecs.push({
          pos, type: 'SHOCK — INSUFFICIENT TRAVEL',
          color: '#f59e0b',
          detail: `${pos} total available travel (${droopUsed.toFixed(2)}" droop + ${jounceUsed.toFixed(2)}" to bumpstop) = ${totalStroke.toFixed(2)}". Less than 2" total is very tight — rough track surfaces or load changes will quickly use up available travel. Consider a longer-travel shock or increasing ride height.`,
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

  // ARB effectiveness warning
  if (a.momentArm != null && a.momentArm < 2 && a.momentArm >= 0) {
    partsRecs.push({
      pos: 'FRONT', type: 'SPRINGS — RAISE RIDE HEIGHT',
      color: '#60a5fa',
      detail: `CG-to-RC moment arm is only ${a.momentArm.toFixed(2)}" — the front ARB and springs are transferring almost no load elastically. The front 29.5mm ARB is largely wasted. Raising the car 1" (stiffer or taller springs) would grow the moment arm to ~${(a.momentArm + 1.5).toFixed(1)}", restoring spring/ARB effectiveness. Consider P71 Police/Taxi struts (475 lb/in) or Heavy Duty (700 lb/in) if currently on base struts.`,
    });
  }

  // Figure-8 specific: symmetric caster recommendation
  if (!isOval && Math.abs(a.rfCaster - a.lfCaster) > 1.0) {
    partsRecs.push({
      pos: 'CASTER', type: 'ALIGNMENT — SYMMETRIC CASTER',
      color: '#a78bfa',
      detail: `Figure-8 needs symmetric caster — car turns both left and right. Current: LF ${a.lfCaster}° / RF ${a.rfCaster}°, split of ${Math.abs(a.rfCaster - a.lfCaster).toFixed(1)}°. Large caster split will give asymmetric camber gain in left vs right turns. Target: within 0.5° side-to-side. Adjust via P71 lower arm eccentric camber/caster bolts.`,
    });
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
            text={`The Watts link pivot height sets rear RC. Target ${T.idealRearRC_low}–${T.idealRearRC_high}" for ${T.label}. Aftermarket adjustable Watts link brackets allow raising or lowering by 1–4".`}
            fixMethod={`Adjustable Watts link center pivot bracket. Each 1" raise increases rear geometric LLTD ~0.5–1%. ${isOval ? 'Target 12–16" for oval.' : 'For figure-8 target 10–18" — symmetric handling, lower RC reduces rear-end stiffness in both directions.'}`}
          />}
        >
          Rear RC at {a.rearRC.toFixed(1)}" — target {T.idealRearRC_low}–{T.idealRearRC_high}". {rearRCSev === 'good' ? 'Within target range.' : 'Outside target range — see fix method.'}
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
            text={`FVSA = distance from IC to wheel center. Sets camber gain rate. Target ${T.idealFVSA_low}–${T.idealFVSA_high}" for ${T.label}.`}
            fixMethod="Fixed by hardpoint geometry. Not adjustable without fabrication."
          />}
        >
          {a.rf.fvsa != null
            ? `RF FVSA ${a.rf.fvsa.toFixed(1)}" — ${a.rf.fvsa >= T.idealFVSA_low && a.rf.fvsa <= T.idealFVSA_high ? 'within target' : 'outside target'} (${T.idealFVSA_low}–${T.idealFVSA_high}"). Camber gain ≈ ${(57.3 / a.rf.fvsa).toFixed(2)}°/inch of travel.`
            : 'Cannot compute — IC not found.'}
        </Finding>

        <Finding
          title="LF FVSA"
          value={a.lf.fvsa?.toFixed(1)} unit='"'
          sev={fvsaSev(a.lf.fvsa)}
          tip={<Tip changeable={false} text="LF FVSA sets how fast LF gains camber in droop (during cornering). For figure-8, LF and RF FVSA should be similar." fixMethod="Fixed geometry." />}
        >
          {a.lf.fvsa != null && a.rf.fvsa != null
            ? `LF ${a.lf.fvsa.toFixed(1)}" vs RF ${a.rf.fvsa.toFixed(1)}" — delta ${(a.lf.fvsa - a.rf.fvsa).toFixed(1)}". ${!isOval && Math.abs(a.lf.fvsa - a.rf.fvsa) > 3 ? 'Large FVSA asymmetry for figure-8 — expect noticeably different camber response L vs R turn.' : 'Asymmetry is manageable.'}`
            : '—'}
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
            text="Scrub radius is the distance between the kingpin axis projected to ground and the tire contact patch center. Small positive (0.3–1.5 in) = light direct steering. Fixed by KPI (9.5°, cast into spindle) and wheel offset."
            fixMethod="Fixed on P71. Wheel spacers/different offset can modify slightly — do not change unless specific steering complaint."
          />}
        >
          Scrub radius = (wheel center {a.wh.toFixed(2)}" × tan({P71_KPI}° KPI)) − {P71_WHEEL_OFFSET}" offset = {a.scrubRadius.toFixed(3)}". {a.scrubRadius < 1.5 ? 'Low scrub — light steering feel.' : 'Moderate scrub — adequate feel.'}
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
          title="Geometric Front LLTD"
          value={a.geoLLTDF != null ? (a.geoLLTDF * 100).toFixed(1) : '—'} unit="%"
          sev={a.geoLLTDF != null ? (Math.abs(a.geoLLTDF - (isOval ? 0.46 : 0.50)) < 0.06 ? 'good' : 'warning') : 'info'}
          tip={<Tip
            changeable={false}
            text={`Geometric LLTD = (front axle weight × G × front RC height) / (total weight × G × track width). Target: ${isOval ? '46% for oval (biased to front — higher RC)' : '50% for figure-8 (symmetric — balanced RC front/rear)'}.`}
            fixMethod="Lower front RC (raise car on taller springs) to shift from geometric to elastic (spring-tunable) LLTD."
          />}
        >
          {a.geoLLTDF != null
            ? `Geometric front LLTD: ${(a.geoLLTDF * 100).toFixed(1)}% (target ${isOval ? '46' : '50'}%). ${a.geoLLTDF > (isOval ? 0.46 : 0.50) ? 'Over target from geometry alone — cannot tune below this with spring/ARB changes alone.' : 'Under target — remaining LLTD must come from elastic (springs, ARB, shocks).'}`
            : 'Enter all hardpoints to compute.'}
        </Finding>

        <Finding
          title="Geometric Rear LLTD"
          value={(a.geoLLTDR * 100).toFixed(1)} unit="%"
          sev={a.geoLLTDR > 0.28 ? 'warning' : 'good'}
          tip={<Tip
            changeable={true}
            text="Rear LLTD driven by Watts link pivot height. Higher pivot = more rear geometric transfer = stiffer rear in roll = more oversteer tendency."
            fixMethod="Adjustable Watts link pivot bracket. 1 in raise = ~0.5–1% rear LLTD increase."
          />}
        >
          Rear geometric LLTD: {(a.geoLLTDR * 100).toFixed(1)}% = ({(P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC)).toFixed(0)} lbs × {T.trackG}G × {(a.rearRC / 12).toFixed(3)} ft RC) / (3700 × {T.trackG}G × {(a.trackWidthF / 12).toFixed(3)} ft). {a.geoLLTDF != null ? `Combined geometric: ${((a.geoLLTDF + a.geoLLTDR) * 100).toFixed(1)}%.` : ''}
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — SHOCK & SPRING TRAVEL ANALYSIS
      ══════════════════════════════════════════════════════════════════ */}
      {Object.keys(a.shockData).length > 0 && (
        <Section title="7 — SHOCK & SPRING TRAVEL ANALYSIS" color="#a78bfa">
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
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8 — PARTS & SETUP RECOMMENDATIONS
      ══════════════════════════════════════════════════════════════════ */}
      <Section title={`${Object.keys(a.shockData).length > 0 ? '8' : '7'} — PARTS & SETUP RECOMMENDATIONS`} color="#f87171">
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
