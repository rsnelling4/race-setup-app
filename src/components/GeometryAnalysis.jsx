import { useState, useMemo } from 'react';
import { computeGeometry } from './GeometryVisualizer';

// ─── Constants ────────────────────────────────────────────────────────────────
const P71_LOWER_ARM_LENGTH = 13.0;
const P71_UPPER_ARM_LENGTH = 9.5;
const P71_KPI              = 9.5;    // kingpin inclination °
const P71_WHEEL_OFFSET     = 1.75;  // " — factory wheel offset
const P71_FRONT_AXLE_FRAC  = 0.57;  // front weight fraction
const P71_TOTAL_WEIGHT     = 3700;  // lbs

// Oval-specific targets derived from session data and physics model
const OVAL = {
  idealRFGroundCamber:  -2.0,   // ° — pyrometer-validated target
  idealLFGroundCamber:  +0.75,  // °
  idealFrontRC_low:     15,     // " — acceptable range low
  idealFrontRC_high:    25,     // " — acceptable range high
  idealRearRC_low:      12,     // "
  idealRearRC_high:     16,     // "
  idealFVSA_low:        14,     // " — shorter FVSA = more camber gain per inch travel
  idealFVSA_high:       22,     // "
  casterCoeffRF:        0.136,  // °/°caster at 3.77° steer (pyrometer-validated)
  casterCoeffLF:        0.034,
  apexSteer:            3.77,   // ° — Ackermann at 1/4-mile oval
  trackG:               0.813,  // lateral G at apex
  bodyRollPerG:         3.1,    // °/G baseline
  slaJounceCoeff:       0.355,  // °/° roll — RF jounce (measured)
  slaDroopCoeff:        0.547,  // °/° roll — LF droop (measured)
  cgHeight:             22,     // " — stock P71 estimated
};

function num(v) { return parseFloat(v) || 0; }

// ─── Analysis engine ─────────────────────────────────────────────────────────
export function analyzeGeometry(geo) {
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
  const cgH         = OVAL.cgHeight - (num(geo.rideLowering) * 0.65);
  const momentArm   = rcAvg != null ? cgH - rcAvg : null;

  // ── Derived: body roll at oval apex ───────────────────────────────────────
  // Using baseline roll rate (spring/shock data not available in geo profile)
  const rollAtApex = OVAL.bodyRollPerG * OVAL.trackG; // ≈ 2.52°

  // ── Derived: RF ground camber from current static settings ───────────────
  const rfStatic = num(geo.camber?.RF || -2.25);
  const lfStatic = num(geo.camber?.LF ||  2.75);
  const rfCaster = num(geo.caster?.RF ||  6.0);
  const lfCaster = num(geo.caster?.LF ||  9.0);

  const rfCasterGain    = -(rfCaster * OVAL.casterCoeffRF);
  const lfCasterGain    =  (lfCaster * OVAL.casterCoeffLF);
  const rfBodyRoll      = -(rollAtApex * OVAL.slaJounceCoeff);
  const lfBodyRoll      =  (rollAtApex * OVAL.slaDroopCoeff);
  const rfCornerRoll    = rollAtApex;  // ground frame addition for RF (outside)
  const lfCornerRoll    = -rollAtApex; // ground frame subtraction for LF (inside)
  const swCamber        = 0.48;        // sidewall compliance at RF load ~1400 lbs

  const rfGroundCamber  = rfStatic + rfCasterGain + rfBodyRoll + rfCornerRoll + swCamber;
  const lfGroundCamber  = lfStatic + lfCasterGain + lfBodyRoll + lfCornerRoll;
  const rfCamberDev     = rfGroundCamber - OVAL.idealRFGroundCamber;
  const lfCamberDev     = lfGroundCamber - OVAL.idealLFGroundCamber;

  // ── Arm length ratio (upper/lower) ────────────────────────────────────────
  const armRatio = P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH; // 0.731

  // ── Scrub radius ──────────────────────────────────────────────────────────
  const scrubRadius = wh * Math.tan(P71_KPI * Math.PI / 180) - P71_WHEEL_OFFSET;

  // ── Asymmetry analysis ────────────────────────────────────────────────────
  const bjAsymmetry     = num(geo.lowerBallJoint?.LF || 7.75) - num(geo.lowerBallJoint?.RF || 6.75);
  const pivotAsymmetry  = num(geo.lowerArmPivot?.LF  || 10.0) - num(geo.lowerArmPivot?.RF  || 9.375);
  const fvsaAsymmetry   = rf.fvsa != null && lf.fvsa != null ? lf.fvsa - rf.fvsa : null;

  // ── Front/rear RC height difference (RC migration) ───────────────────────
  const rcDiff = rcAvg != null ? rcAvg - rearRC : null; // positive = front higher

  // ── Geometric LLTD estimate ───────────────────────────────────────────────
  const frontAxleWeight = P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC;
  const rearAxleWeight  = P71_TOTAL_WEIGHT * (1 - P71_FRONT_AXLE_FRAC);
  const trackFt         = trackWidthF / 12;
  const geoLLTDF = rcAvg  != null && trackFt > 0 ? (frontAxleWeight * OVAL.trackG * rcAvg  / 12) / (P71_TOTAL_WEIGHT * OVAL.trackG * trackFt) : null;
  const geoLLTDR = trackFt > 0                   ? (rearAxleWeight  * OVAL.trackG * rearRC / 12) / (P71_TOTAL_WEIGHT * OVAL.trackG * trackFt) : 0;

  return {
    rf, lf, halfTrack, trackWidthF, trackWidthR, wh,
    rcAvg, rearRC, cgH, momentArm,
    rollAtApex, rfStatic, lfStatic, rfCaster, lfCaster,
    rfCasterGain, lfCasterGain, rfBodyRoll, lfBodyRoll,
    rfGroundCamber, lfGroundCamber, rfCamberDev, lfCamberDev,
    armRatio, scrubRadius, bjAsymmetry, pivotAsymmetry, fvsaAsymmetry,
    rcDiff, geoLLTDF, geoLLTDR,
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

// ─── Tooltip component ────────────────────────────────────────────────────────
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

// ─── Analysis card ────────────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function GeometryAnalysis({ geo }) {
  const a = useMemo(() => analyzeGeometry(geo), [geo]);

  // ── severity helpers ──────────────────────────────────────────────────────
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

  const rfCamberSev   = camberSev(a.rfCamberDev);
  const lfCamberSev   = camberSev(a.lfCamberDev);
  const frontRCSev    = rcSev(a.rcAvg, OVAL.idealFrontRC_low, OVAL.idealFrontRC_high);
  const rearRCSev     = rcSev(a.rearRC, OVAL.idealRearRC_low, OVAL.idealRearRC_high);
  const asymSev       = Math.abs(a.bjAsymmetry) > 1.5 ? 'warning' : Math.abs(a.bjAsymmetry) > 0.75 ? 'info' : 'good';
  const momentArmSev  = a.momentArm != null ? (Math.abs(a.momentArm) < 3 ? 'good' : a.momentArm < 0 ? 'critical' : 'info') : 'info';
  const fvsaSev       = (s) => {
    if (s == null) return 'info';
    if (s >= OVAL.idealFVSA_low && s <= OVAL.idealFVSA_high) return 'good';
    if (s < 10 || s > 30) return 'critical';
    return 'warning';
  };

  const rfGroundStr  = a.rfGroundCamber >= 0 ? `+${a.rfGroundCamber.toFixed(2)}` : a.rfGroundCamber.toFixed(2);
  const lfGroundStr  = a.lfGroundCamber >= 0 ? `+${a.lfGroundCamber.toFixed(2)}` : a.lfGroundCamber.toFixed(2);
  const rcDiffNote   = a.rcDiff != null
    ? a.rcDiff > 2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is ${a.rcDiff.toFixed(1)}" higher than rear RC (${a.rearRC.toFixed(1)}"). Front is geometrically stiffer in roll — this is intentional on a left-turn oval.`
      : a.rcDiff < -2
      ? `Front RC (${a.rcAvg?.toFixed(1)}") is lower than rear RC (${a.rearRC.toFixed(1)}"}) by ${Math.abs(a.rcDiff).toFixed(1)}". The rear transfers load geometrically faster than the front — tends to cause oversteer at turn-in.`
      : `Front RC (${a.rcAvg?.toFixed(1)}") and rear RC (${a.rearRC.toFixed(1)}") are nearly equal. Roll stiffness distribution relies on springs and ARB rather than geometry.`
    : '';

  return (
    <div style={{ fontFamily: 'monospace', marginTop: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 8,
        padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ color: '#60a5fa', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          Car Geometry Analysis — Crown Victoria P71 Oval
        </div>
        <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.6 }}>
          All findings are calculated from your measured hardpoints and current alignment settings.
          Oval-specific targets are based on 1/4-mile left-turn at ~48 mph (0.813G apex).
          Pyrometer-validated April 2026. {a.upPivEstimated &&
            <span style={{ color: '#f59e0b' }}>⚠ Upper arm pivot is estimated — RC and FVSA values will shift when measured.</span>}
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
            text="On the P71 SLA front suspension, roll center height is set by the geometry of the control arms — specifically the angles and lengths of the upper and lower arms. These are determined by the hardpoints welded and bolted to the factory subframe, which cannot be relocated without fabrication. The only shop-adjustable input is ride height: lowering the car changes the arm angles and migrates the RC downward."
            fixMethod='Ride height adjustment (spring swap or spring spacers) shifts RC. Each 1" of lowering drops front RC approximately 1–2" depending on arm angles. At current geometry the RC is already high relative to the CG — lowering will bring the moment arm closer to zero, which reduces body roll.'
          />}
        >
          Front RC at {a.rcAvg?.toFixed(1)}" is {a.rcAvg != null && a.rcAvg >= OVAL.idealFrontRC_low && a.rcAvg <= OVAL.idealFrontRC_high ? 'within the target range (15–25")' : a.rcAvg != null && a.rcAvg > OVAL.idealFrontRC_high ? `above the target range (15–25"). A very high front RC means most lateral load transfer at the front happens geometrically through the arms, not elastically through springs and ARB. This reduces body roll but creates jacking forces — the body rises under cornering load rather than rolling. At oval speeds (0.813G) jacking is minor but the near-zero moment arm (see below) means the ARB and springs contribute very little to LLTD.` : 'below the target range — more elastic roll expected.'}.
          {'\n\n'}RF line intersects CL at {a.rf.rcHeight?.toFixed(1)}", LF at {a.lf.rcHeight?.toFixed(1)}". The {Math.abs((a.rf.rcHeight ?? 0) - (a.lf.rcHeight ?? 0)).toFixed(1)}" left-right split is caused by the LF/RF ball joint height asymmetry in your setup.
        </Finding>

        <Finding
          title="Rear Roll Center (Watts Link)"
          value={a.rearRC.toFixed(2)} unit='"'
          sev={rearRCSev}
          tip={<Tip
            changeable={true}
            text='The P71 Watts link roll center height is set by the height of the center pivot bracket on the rear axle housing. On a P71 this bracket is welded to the axle, but aftermarket fabricators sell adjustable Watts link brackets that bolt to the axle and allow raising or lowering the pivot by 1–4".'
            fixMethod='Aftermarket adjustable Watts link center pivot bracket. Each 1" the pivot is raised lowers oversteer tendency by increasing geometric rear load transfer. Target 12–16" for a left-turn oval. Your measured 14.5" is well within range — no change needed unless handling specifically points to rear load transfer imbalance.'
          />}
        >
          {rearRCSev === 'good'
            ? `Rear RC at ${a.rearRC.toFixed(1)}" is within the oval target range (12–16"). The Watts link provides a well-defined lateral force path — the rear axle pushes against the car body at a single height, resisting lateral movement without inducing torque steer. At 14.5" it is ${(a.rearRC - 12).toFixed(1)}" above the minimum, giving a healthy geometric rear load transfer contribution.`
            : `Rear RC at ${a.rearRC.toFixed(1)}" is outside the target range.`}
        </Finding>

        <Finding
          title="Front vs Rear RC Differential"
          value={a.rcDiff != null ? (a.rcDiff >= 0 ? '+' : '') + a.rcDiff.toFixed(1) : '—'} unit='"'
          sev={a.rcDiff != null ? (a.rcDiff > 0 ? 'good' : 'warning') : 'info'}
          tip={<Tip
            changeable={false}
            text='The front/rear RC differential is determined by both suspension designs independently. On the P71, the front RC is a result of SLA geometry (fixed) and the rear RC is the Watts link pivot (adjustable within ~4"). The differential sets the natural balance of geometric vs elastic load transfer front vs rear.'
            fixMethod="Lower the rear Watts link pivot to reduce rear geometric load transfer (softer rear entry), or raise it to increase it (stiffer rear, less rotation). Front RC can only be moved by ride-height changes. The current differential (front higher) favors oval left-turn balance."
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
            text="The moment arm is the vertical distance between CG height and front RC height. It is the lever arm that elastic (spring/ARB) load transfer acts through. A near-zero moment arm means the ARB and springs transfer almost no load — all transfer is geometric (through the control arms). A large moment arm means springs and ARB dominate. The P71's high front RC makes this arm very small."
            fixMethod="Not directly adjustable — it is a result of CG height (fixed by car weight distribution and cage) and RC height (fixed by arm geometry and ride height). The only path to a larger moment arm is lowering the front RC, which means raising the car (taller springs) or changing arm pickup points (fabrication required)."
          />}
        >
          {a.momentArm != null && (
            a.momentArm < 3 && a.momentArm > 0
              ? `Moment arm of ${a.momentArm.toFixed(2)}" is nearly zero — the front RC is only ${a.momentArm.toFixed(2)}" below the CG. At 0.813G lateral, elastic load transfer through the front springs and ARB is approximately ${(3700 * 0.57 * 0.813 * (a.momentArm / 12) / (64 / 12)).toFixed(0)} lbs — a very small number. The ARB is contributing minimal LLTD delta. This means front LLTD is dominated by geometric transfer through the arms and rear RC height, not by spring/ARB stiffness tuning. Adjusting front shock or spring stiffness will have less effect on RF load than on a car with a lower front RC.`
              : a.momentArm < 0
              ? `⚠ Roll center is ABOVE the CG height (${Math.abs(a.momentArm).toFixed(2)}" above). This inverts the elastic load transfer — the springs now resist lateral body movement rather than allowing it, causing the body to move toward the outside of the corner rather than roll away. This is a setup anomaly that needs investigation. Likely cause: ride height is too low, which raises the RC while lowering the CG.`
              : `Moment arm of ${a.momentArm.toFixed(2)}" means elastic load transfer through springs and ARB is active. Each degree of body roll transfers load through both the springs and the geometric path. Standard oval tuning applies.`
          )}
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — CAMBER CHAIN
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="2 — RF CAMBER CHAIN (CONTACT PATCH ANALYSIS)" color="#f97316">

        <Finding
          title="RF Ground Camber at Apex"
          value={rfGroundStr} unit="°"
          sev={rfCamberSev}
          tip={<Tip
            changeable={true}
            text="Ground camber is what the tire actually sees at the contact patch during cornering. It is not the same as static camber — it includes all the dynamic additions: caster gain from steering, body roll jounce through the SLA, roll-frame conversion, and sidewall deflection. On this oval the caster contribution is tiny (0.136°/° at 3.77° steer). Static camber is the dominant tuning lever."
            fixMethod={`Increase negative RF static camber. Target static: approximately ${(-OVAL.idealRFGroundCamber - Math.abs(num(geo.caster?.RF || 6) * OVAL.casterCoeffRF) - Math.abs(OVAL.trackG * OVAL.bodyRollPerG * OVAL.slaJounceCoeff) + 0.48).toFixed(2)}° to ${(-OVAL.idealRFGroundCamber - Math.abs(num(geo.caster?.RF || 6) * OVAL.casterCoeffRF) - Math.abs(OVAL.trackG * OVAL.bodyRollPerG * OVAL.slaJounceCoeff) + 0.48 + 0.25).toFixed(2)}°. Install a P71 camber bolt (replaces one front strut pinch bolt) to extend range to ~−4°. At alignment rack: move RF camber in negative direction 0.25° increments, measure pyrometer each session.`}
          />}
        >
          Chain breakdown at {OVAL.trackG}G apex with {a.rollAtApex.toFixed(2)}° body roll:{'\n'}
          {'  '}Static: {a.rfStatic >= 0 ? '+' : ''}{a.rfStatic.toFixed(2)}°{'\n'}
          {'  '}+ Caster gain ({a.rfCaster}° × −{OVAL.casterCoeffRF}°/°): {a.rfCasterGain.toFixed(2)}°{'\n'}
          {'  '}+ SLA jounce ({a.rollAtApex.toFixed(2)}° × −{OVAL.slaJounceCoeff}°/°): {a.rfBodyRoll.toFixed(2)}°{'\n'}
          {'  '}+ Roll-frame conversion: +{a.rollAtApex.toFixed(2)}°{'\n'}
          {'  '}+ Sidewall compliance: +0.48°{'\n'}
          {'  '}= Ground camber: {rfGroundStr}° (ideal −2.0°){'\n\n'}
          {Math.abs(a.rfCamberDev) < 0.3
            ? `Within 0.3° of ideal — contact patch is well loaded. Pyrometer should show even spread or slight outside warmth.`
            : a.rfCamberDev > 0
            ? `${a.rfCamberDev.toFixed(2)}° short of ideal (INSUFFICIENT negative camber). The outside tread edge is carrying disproportionate load. Pyrometer will show outside zone hotter than inside. Every 1° short of −2.0° costs approximately 1.75% RF lateral grip. Current deficit: ~${(a.rfCamberDev * 1.75).toFixed(1)}% RF grip penalty. Fix: increase static negative camber.`
            : `${Math.abs(a.rfCamberDev).toFixed(2)}° past ideal (OVER-CAMBERED). Inside tread edge is overloaded. Pyrometer will show inside zone hotter. At −1°/° penalty past ideal costs ~1.0%/°. Current penalty: ~${(Math.abs(a.rfCamberDev) * 1.0).toFixed(1)}%.`}
        </Finding>

        <Finding
          title="LF Ground Camber at Apex"
          value={lfGroundStr} unit="°"
          sev={lfCamberSev}
          tip={<Tip
            changeable={true}
            text="The LF (inside tire on a left-turn oval) contributes less to peak cornering grip but still matters for corner entry stability and braking. Ideal ground camber for LF is near +0° to +0.75° — the body roll droops the LF in the positive direction so it needs positive static to stay balanced."
            fixMethod="Adjust LF static camber at alignment rack. For oval use, +2° to +3° static LF is typical — the SLA droop subtracts ~1.4° during cornering, landing near the target. Camber bolt provides ~±4° range on P71."
          />}
        >
          Chain: static {a.lfStatic >= 0 ? '+' : ''}{a.lfStatic.toFixed(2)}° + caster gain +{a.lfCasterGain.toFixed(2)}° + SLA droop +{a.lfBodyRoll.toFixed(2)}° − roll frame {a.rollAtApex.toFixed(2)}° = {lfGroundStr}° (ideal +0.75°).{'\n\n'}
          {Math.abs(a.lfCamberDev) < 0.3
            ? 'LF contact patch is well balanced for oval cornering.'
            : a.lfCamberDev > 0
            ? `LF is running ${a.lfCamberDev.toFixed(2)}° too positive at apex — inside edge of LF carrying load. Reduce static LF camber or reduce body roll to correct.`
            : `LF is running ${Math.abs(a.lfCamberDev).toFixed(2)}° too negative at apex. LF outer edge overloaded — will show as LF outside-hotter pyrometer. Increase LF static camber.`}
        </Finding>

        <Finding
          title="Caster Contribution on This Oval"
          value={`RF −${Math.abs(a.rfCasterGain).toFixed(2)}`} unit="°"
          sev="info"
          tip={<Tip
            changeable={true}
            text="Caster camber gain scales with the sine of the steer angle. On this 1/4-mile oval the Ackermann steer angle is only 3.77° — so caster contributes very little camber gain regardless of caster setting. This was validated by pyrometer data April 2026: RF outside-edge-hotter persisted at both 6° and 8.5° RF caster because the caster contribution changed by only 0.33°."
            fixMethod='Caster is adjustable on the P71 via eccentric adjusters on the lower control arm inner pivot (camber/caster adjustment bolts). However, on this track raising caster to gain camber is not effective — the steer angle is too small. Use caster for mechanical trail tuning (steering feel/return) rather than camber gain. Target 5.5–7° RF caster for optimal mechanical trail (~0.9–1.2").'
          />}
        >
          RF caster ({a.rfCaster}°) contributes only {a.rfCasterGain.toFixed(2)}° of camber at apex — that is {((Math.abs(a.rfCasterGain) / Math.abs(a.rfGroundCamber - a.rfStatic)) * 100).toFixed(0)}% of the total dynamic camber gain. On this oval, caster camber gain is negligible. ALL meaningful camber must come from static alignment. Raising caster to gain camber (road-course thinking) does not work here — at 20° steer the same caster would give {(a.rfCaster * 0.667).toFixed(2)}° gain, but at 3.77° steer it gives only {a.rfCasterGain.toFixed(2)}°.
        </Finding>

        <Finding
          title="Optimal RF Static Camber Target"
          value={`${(-(a.rfBodyRoll + a.rollAtApex - 0.48 + OVAL.idealRFGroundCamber) + a.rfCasterGain).toFixed(2)}`}
          unit="° static"
          sev="info"
          tip={<Tip
            changeable={true}
            text="This is the back-calculated static camber needed to land at exactly −2.0° ground camber at the oval apex. It accounts for the full dynamic chain: SLA jounce, roll-frame, sidewall compliance, and caster gain at 3.77° steer."
            fixMethod="Set alignment to this value at ride height with driver weight in seat. Verify with pyrometer data — if outside still hotter, add another 0.25° negative. The P71 camber bolt extends range to ~−4°. If more than −4° is needed, camber plates (strut hat modification) or subframe offset bushings are required."
          />}
        >
          {`To hit −2.0° ground camber: static = −2.0° − (jounce ${a.rfBodyRoll.toFixed(2)}°) − (roll frame +${a.rollAtApex.toFixed(2)}°) − (sidewall +0.48°) − (caster ${a.rfCasterGain.toFixed(2)}°) = ${(-(a.rfBodyRoll + a.rollAtApex - 0.48 + OVAL.idealRFGroundCamber) + a.rfCasterGain).toFixed(2)}°. Current static is ${a.rfStatic.toFixed(2)}° — delta: ${((-(a.rfBodyRoll + a.rollAtApex - 0.48 + OVAL.idealRFGroundCamber) + a.rfCasterGain) - a.rfStatic).toFixed(2)}° change needed.`}
        </Finding>
      </Section>

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
            text="The instant center (IC) is where the upper and lower control arm lines intersect when extended. Its location determines both camber gain rate (how fast camber changes with suspension travel) and the jacking force coefficient. On the P71 this is set by factory arm geometry and cannot be relocated without fabricating new pickup points."
            fixMethod="IC location is a fixed geometry parameter on the P71. It can be shifted slightly by changing ride height (which changes arm angles) but the relationship is non-linear and hard to predict without simulation. The IC height relative to the wheel center sets the camber gain rate per inch of travel."
          />}
        >
          {a.rf.ic
            ? `RF IC is ${Math.abs(a.rf.ic.x).toFixed(1)}" inboard of the wheel centerline at ${a.rf.ic.y.toFixed(1)}" height. Inboard ICs (between the wheel and car CL) are typical for P71 short-SLA geometry. The line from the contact patch through this IC determines the camber gain slope — a steeper line means faster camber change per inch of suspension travel.`
            : 'RF IC could not be computed — check that all four hardpoints are entered.'}
        </Finding>

        <Finding
          title="LF Instant Center"
          value={a.lf.ic ? `(${a.lf.ic.x.toFixed(1)}", ${a.lf.ic.y.toFixed(1)}")` : '—'}
          unit=""
          sev={a.lf.ic ? 'info' : 'warning'}
          tip={<Tip
            changeable={false}
            text="The LF IC is typically slightly further from the wheel than the RF IC on an asymmetric oval setup, since the LF is set higher to account for the inside-wheel droop loading during cornering."
            fixMethod="Fixed geometry — same as RF. IC location is determined entirely by control arm hardpoint positions."
          />}
        >
          {a.lf.ic
            ? `LF IC at ${Math.abs(a.lf.ic.x).toFixed(1)}" inboard, ${a.lf.ic.y.toFixed(1)}" height. Left-right IC height difference: ${Math.abs((a.rf.ic?.y ?? 0) - a.lf.ic.y).toFixed(2)}" — caused by the LF being set ${a.bjAsymmetry.toFixed(2)}" higher than RF (measured BJ heights).`
            : 'LF IC could not be computed.'}
        </Finding>

        <Finding
          title="RF Front View Swing Arm (FVSA)"
          value={a.rf.fvsa?.toFixed(1)} unit='"'
          sev={fvsaSev(a.rf.fvsa)}
          tip={<Tip
            changeable={false}
            text="FVSA length is the distance from the IC to the wheel center. It governs camber gain rate: shorter FVSA = more camber change per inch of travel (high camber gain, good for bump absorption), longer FVSA = less camber change per inch (more stable contact patch, better for smooth tracks). The P71's relatively short upper arm creates a moderately short FVSA."
            fixMethod='FVSA is fixed by IC location, which is fixed by hardpoint geometry. Not adjustable without fabrication. On a smooth oval surface, moderate-length FVSA (~15–20") is ideal — it provides enough camber recovery in jounce without overreacting to pavement bumps.'
          />}
        >
          {a.rf.fvsa != null
            ? `RF FVSA of ${a.rf.fvsa.toFixed(1)}" ${a.rf.fvsa >= OVAL.idealFVSA_low && a.rf.fvsa <= OVAL.idealFVSA_high ? 'is within the target range (14–22")' : 'is outside the target range (14–22")'}. Camber gain rate ≈ ${(57.3 / a.rf.fvsa).toFixed(2)}°/inch of travel (1 radian / FVSA in inches = °/inch at the tire). Each inch the RF compresses in jounce, the SLA geometry adds approximately ${(57.3 / a.rf.fvsa * OVAL.slaJounceCoeff / OVAL.bodyRollPerG).toFixed(3)}° of negative camber per degree of body roll.`
            : 'Cannot compute — IC not found.'}
        </Finding>

        <Finding
          title="LF FVSA"
          value={a.lf.fvsa?.toFixed(1)} unit='"'
          sev={fvsaSev(a.lf.fvsa)}
          tip={<Tip
            changeable={false}
            text="LF FVSA is slightly longer than RF because the LF IC is further inboard. The inside tire (LF) sees droop during cornering — the longer FVSA means it gains positive camber more slowly, which is appropriate for the inside wheel."
            fixMethod='Fixed geometry. Monitor FVSA difference between LF and RF — a large asymmetry (>4") means unequal camber change rates side-to-side and can produce different tire wear rates even at symmetric static settings.'
          />}
        >
          {a.lf.fvsa != null && a.rf.fvsa != null
            ? `LF FVSA ${a.lf.fvsa.toFixed(1)}" vs RF ${a.rf.fvsa.toFixed(1)}" — delta ${(a.lf.fvsa - a.rf.fvsa).toFixed(1)}". LF has a ${a.lf.fvsa > a.rf.fvsa ? 'longer' : 'shorter'} swing arm, meaning it gains camber ${a.lf.fvsa > a.rf.fvsa ? 'more slowly' : 'faster'} per inch of travel. ${Math.abs(a.lf.fvsa - a.rf.fvsa) < 3 ? 'Asymmetry is small — camber response is well balanced side-to-side.' : 'Asymmetry is significant — expect noticeably different camber change rates LF vs RF.'}`
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
          sev={asymSev}
          tip={<Tip
            changeable={true}
            text='The LF rides higher than RF on your car — consistently across lower BJ (+1.0"), upper BJ (+0.875"), and lower pivot (+0.625"). This consistent offset is not measurement error. It means the RF side of the car sits lower, which is intentional on many oval setups to bias the RF corner toward more negative camber. However it can also indicate unequal spring compression or ride height.'
            fixMethod='If intentional (oval setup): document as-is and use it as a baseline. If unintentional: check spring seat heights, spring free length, and corner weights. An asymmetric ride height of 1" corresponds to roughly 50–100 lbs of corner weight shift front-to-rear on the RF side. Verify by measuring wheel center height on both sides — if equal at 13" both sides, the asymmetry is in the control arm geometry (intentional), not ride height.'
          />}
        >
          LF lower ball joint is {a.bjAsymmetry.toFixed(3)}" higher than RF lower ball joint. This {Math.abs(a.bjAsymmetry) < 0.5 ? 'small asymmetry is within normal manufacturing tolerance.' : Math.abs(a.bjAsymmetry) < 1.5 ? 'moderate asymmetry may be intentional for oval setup. The RF sitting lower changes the effective arm angles on the RF side, which shifts the RF instant center downward relative to LF — this increases the RF camber gain rate slightly in jounce, which is favorable for oval cornering.' : 'large asymmetry is significant and should be verified against corner weights. An unintended 1"+ ride height difference side-to-side can cause chronic tire wear asymmetry that no alignment change will fully correct.'}
          {'\n\n'}Arm slope comparison:{'\n'}
          {'  '}RF lower arm: {((num(geo.lowerBallJoint?.RF || 6.75) - num(geo.lowerArmPivot?.RF || 9.375)) / 13.0).toFixed(4)} in/in{'\n'}
          {'  '}LF lower arm: {((num(geo.lowerBallJoint?.LF || 7.75) - num(geo.lowerArmPivot?.LF || 10.0)) / 13.0).toFixed(4)} in/in{'\n'}
          Slope difference: {(Math.abs((num(geo.lowerBallJoint?.RF || 6.75) - num(geo.lowerArmPivot?.RF || 9.375)) - (num(geo.lowerBallJoint?.LF || 7.75) - num(geo.lowerArmPivot?.LF || 10.0))) / 13.0).toFixed(4)} in/in — {Math.abs((num(geo.lowerBallJoint?.RF || 6.75) - num(geo.lowerArmPivot?.RF || 9.375)) - (num(geo.lowerBallJoint?.LF || 7.75) - num(geo.lowerArmPivot?.LF || 10.0))) / 13.0 < 0.01 ? 'matched slopes, asymmetry is a pure height offset' : 'different slopes, arms are at different angles side-to-side'}.
        </Finding>

        <Finding
          title="Wheel Center Height vs Tire Radius"
          value={a.wh.toFixed(3)} unit='"'
          sev={Math.abs(a.wh - 13.59) > 1.0 ? 'warning' : Math.abs(a.wh - 13.59) > 0.5 ? 'info' : 'good'}
          tip={<Tip
            changeable={true}
            text='The wheel center height should match the tire radius (13.59" for 235/55R17 at rated pressure). If the car is riding lower, it means the tires are deflected more than nominal at the measured cold pressures, OR the springs are more compressed than stock. A 0.59" deficit at 13.0" measured suggests the car is running about 0.6" lower than a tire-math-neutral ride height.'
            fixMethod="Check tire pressures first — set cold to rated and re-measure. If height is still low, the suspension is compressed past neutral (spring rate is soft or preload is low). Stiffer springs or taller spring spacers will raise the car. Note: at your current race pressures (RF 31 cold) the tire is underinflated below rated — this alone accounts for some of the height deficit."
          />}
        >
          Measured wheel center: {a.wh.toFixed(3)}" vs theoretical tire radius: 13.59" (235/55R17 at rated pressure). Delta: {(a.wh - 13.59).toFixed(3)}". The car is running {Math.abs(a.wh - 13.59).toFixed(2)}" lower than tire-neutral height. This compresses the suspension geometry slightly — arm angles are shallower than design, which {a.wh < 13.59 ? 'lowers the IC slightly and reduces camber gain rate in jounce. Lower ride height also lowers the CG, which partially compensates.' : 'raises the IC above the design position.'} Effect on RC: approximately {(Math.abs(a.wh - 13.59) * 1.5).toFixed(2)}" RC shift from the height deviation.
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — SCRUB RADIUS & STEERING GEOMETRY
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="5 — SCRUB RADIUS & STEERING GEOMETRY" color="#60a5fa">

        <Finding
          title="Estimated Scrub Radius"
          value={a.scrubRadius.toFixed(3)} unit='"'
          sev={a.scrubRadius > 0 && a.scrubRadius < 1.5 ? 'good' : a.scrubRadius < 0 ? 'warning' : 'info'}
          tip={<Tip
            changeable={false}
            text='Scrub radius is the horizontal distance between the kingpin axis (projected to ground) and the tire contact patch center. A small positive scrub radius (0.3–1.5") provides light but direct steering feel. Zero scrub means the tire rotates exactly about its contact point during steering — common on FWD cars. Negative scrub causes the steering to self-center under braking (beneficial for braking stability). On the P71 this is set by KPI (9.5°, fixed), wheel offset (fixed at 1.75" factory), and wheel center height.'
            fixMethod="Scrub radius is effectively fixed on the P71 — KPI is cast into the spindle and cannot be changed. Wheel offset (spacers or different-offset aftermarket wheels) can modify it: a wider wheel (more positive offset) reduces scrub radius. However, NASCAR/oval rules often restrict wheel modifications. Do not change scrub radius unless handling specifically indicates a scrub-related issue (heavy steering, tire fight under braking)."
          />}
        >
          Calculated scrub radius: {a.scrubRadius.toFixed(3)}" = (wheel center {a.wh.toFixed(2)}" × tan({P71_KPI}° KPI)) − {P71_WHEEL_OFFSET}" wheel offset = {(a.wh * Math.tan(P71_KPI * Math.PI / 180)).toFixed(3)}" − {P71_WHEEL_OFFSET}". A positive scrub radius means the tire contact patch is outboard of the kingpin projected axis — the wheel tends to toe-in under braking (stabilizing). At {a.scrubRadius.toFixed(2)}" it is {a.scrubRadius < 1.5 ? 'within the low-scrub range typical of P71 geometry — steering will be light and self-centering.' : 'moderate — steering feel should be adequate.'}
        </Finding>

        <Finding
          title="Arm Length Ratio (Upper/Lower)"
          value={(P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH).toFixed(3)} unit=""
          sev="info"
          tip={<Tip
            changeable={false}
            text='The ratio of upper arm length to lower arm length determines how the wheel moves during suspension travel. A ratio less than 1.0 (shorter upper arm) causes the wheel to gain negative camber in jounce — exactly what you want for the RF on an oval. The P71 9.5"/13.0" ratio = 0.731 produces meaningful negative camber gain in jounce, which is why the SLA jounce coefficient is −0.355°/° of roll.'
            fixMethod="Fixed P71 platform geometry. The ratio is set by Ford's factory arm design. The only way to change this is aftermarket SLA arms, which are not available for P71 off the shelf and would require custom fabrication."
          />}
        >
          Upper arm ({P71_UPPER_ARM_LENGTH}") / lower arm ({P71_LOWER_ARM_LENGTH}") = {(P71_UPPER_ARM_LENGTH / P71_LOWER_ARM_LENGTH).toFixed(3)}. Ratio below 1.0 means the shorter upper arm forces the wheel to arc inward (gain negative camber) as the suspension compresses. This is the SLA's key advantage over MacPherson struts for oval racing — it actively helps the RF tire lean into the corner under load. The jounce camber coefficient of −{OVAL.slaJounceCoeff}°/° roll measured on your car is consistent with this ratio.
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — LLTD & LOAD TRANSFER
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="6 — LATERAL LOAD TRANSFER DISTRIBUTION (LLTD)" color="#22c55e">

        <Finding
          title="Geometric Front LLTD Contribution"
          value={a.geoLLTDF != null ? (a.geoLLTDF * 100).toFixed(1) : '—'} unit="%"
          sev={a.geoLLTDF != null ? (Math.abs(a.geoLLTDF - 0.46) < 0.06 ? 'good' : 'warning') : 'info'}
          tip={<Tip
            changeable={false}
            text="Geometric load transfer is the portion of lateral load transfer that goes through the suspension geometry (control arms pushing laterally), not through the springs. It is calculated as: (front axle weight × G × front RC height) / (total weight × G × track width). A high front RC means more of the front load transfer is geometric — it cannot be tuned with springs or shocks."
            fixMethod="Geometric LLTD is driven by RC height, which is largely fixed on the P71. To shift geometric LLTD: lower the front RC (raise the car on taller springs) to shift transfer to elastic (spring-tunable), or raise the rear Watts link to increase rear geometric transfer. Both approaches have trade-offs."
          />}
        >
          {a.geoLLTDF != null
            ? `Geometric front LLTD: ${(a.geoLLTDF * 100).toFixed(1)}% = (${(3700 * 0.57).toFixed(0)} lbs front × ${OVAL.trackG}G × ${((a.rcAvg ?? 0) / 12).toFixed(3)} ft RC) / (3700 lbs × ${OVAL.trackG}G × ${(a.trackWidthF / 12).toFixed(3)} ft track). The target front LLTD is 46%. The geometric contribution alone is ${(a.geoLLTDF * 100).toFixed(1)}% — ${a.geoLLTDF > 0.46 ? `${((a.geoLLTDF - 0.46) * 100).toFixed(1)}% over target from geometry alone, before any elastic (spring/shock/ARB) contribution. With the high front RC, you cannot achieve 46% LLTD by stiffening the front — it is already over 46% geometrically. To reduce LLTD, lower the front RC (raise the car).` : `${((0.46 - a.geoLLTDF) * 100).toFixed(1)}% below target from geometry — the remaining ${((0.46 - a.geoLLTDF) * 100).toFixed(1)}% must come from elastic (springs, ARB, shocks). Standard oval tuning applies.`}`
            : 'RC not computed — enter all hardpoints.'}
        </Finding>

        <Finding
          title="Geometric Rear LLTD Contribution"
          value={(a.geoLLTDR * 100).toFixed(1)} unit="%"
          sev={a.geoLLTDR > 0.28 ? 'warning' : 'good'}
          tip={<Tip
            changeable={true}
            text="Rear geometric LLTD is driven by the Watts link pivot height. Higher pivot = more rear geometric transfer = rear is stiffer in roll = more likely to oversteer. Lower pivot = softer rear in roll = more understeer tendency."
            fixMethod='Adjust Watts link pivot height with an aftermarket adjustable bracket. Raising the pivot 1" increases rear geometric LLTD by approximately 0.5–1%, which tightens corner entry. Lowering it does the opposite (looser entry). The 14.5" measured pivot is within the target range — only adjust if handling data specifically shows a rear transfer imbalance.'
          />}
        >
          Rear geometric LLTD: {(a.geoLLTDR * 100).toFixed(1)}% = ({(3700 * 0.43).toFixed(0)} lbs rear × {OVAL.trackG}G × {(a.rearRC / 12).toFixed(3)} ft RC) / (3700 × {OVAL.trackG}G × {(a.trackWidthF / 12).toFixed(3)} ft). {a.geoLLTDF != null ? `Combined geometric LLTD: ${((a.geoLLTDF + a.geoLLTDR) * 100).toFixed(1)}% (geometric alone). Elastic (springs + ARB) adds on top of this.` : ''}
        </Finding>

        <Finding
          title="ARB Effectiveness at This RC Height"
          value={a.momentArm?.toFixed(2)} unit='" moment arm'
          sev={a.momentArm != null && a.momentArm < 2 ? 'warning' : 'info'}
          tip={<Tip
            changeable={false}
            text="The ARB can only transfer load elastically — it acts through the body roll angle, which is driven by the moment arm (CG height minus RC height). A near-zero moment arm means the body barely rolls, which means the ARB barely deflects, which means the ARB contributes nearly zero additional LLTD. The P71's large front ARB (29.5mm) is largely wasted at this RC height."
            fixMethod="The ARB effectiveness problem is caused by the high front RC, not the ARB itself. Options: (1) Lower the RC by raising the car — this grows the moment arm and re-activates ARB tuning. (2) Accept that front LLTD is geometry-dominated and tune LLTD primarily through the rear Watts link pivot height instead. (3) Remove or disconnect the front ARB entirely — at near-zero moment arm its contribution is too small to matter and it adds unsprung weight and potential failure modes."
          />}
        >
          {a.momentArm != null
            ? `With a ${a.momentArm.toFixed(2)}" moment arm, the body rolls only ${(OVAL.trackG * OVAL.bodyRollPerG * (a.momentArm / OVAL.cgHeight)).toFixed(2)}° at apex (estimated). The P71's 29.5mm front ARB has an estimated roll stiffness of ~40,500 lb-ft/rad. At this roll angle, ARB load transfer ≈ ${(40500 * (OVAL.trackG * OVAL.bodyRollPerG * (a.momentArm / OVAL.cgHeight) * Math.PI / 180) / (a.trackWidthF / 12 || 1)).toFixed(0)} lbs — compared to the ${(P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * OVAL.trackG).toFixed(0)} lbs of total front lateral force. The ARB is contributing approximately ${(((40500 * (OVAL.trackG * OVAL.bodyRollPerG * (a.momentArm / OVAL.cgHeight) * Math.PI / 180) / (a.trackWidthF / 12 || 1)) / (P71_TOTAL_WEIGHT * P71_FRONT_AXLE_FRAC * OVAL.trackG)) * 100).toFixed(1)}% of front LLTD from elastic transfer.`
            : 'Requires RC height to compute.'}
        </Finding>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — SUMMARY & PRIORITY ACTIONS
      ══════════════════════════════════════════════════════════════════ */}
      <Section title="7 — PRIORITY ACTION SUMMARY" color="#f87171">
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: 14 }}>
          {[
            {
              rank: 1,
              action: 'Measure upper arm inner pivot height',
              why: 'All IC, FVSA, and RC calculations are using the estimated 13.5" upper arm pivot value. A 2" error here shifts the computed RC by ~5". This is the single highest-leverage measurement remaining.',
              type: 'MEASURE', color: '#f87171',
            },
            {
              rank: 2,
              action: `Increase RF static camber to ${(-(a.rfBodyRoll + a.rollAtApex - 0.48 + OVAL.idealRFGroundCamber) + a.rfCasterGain).toFixed(2)}°`,
              why: `Current RF ground camber is ${rfGroundStr}° at apex — ${a.rfCamberDev.toFixed(2)}° short of −2.0° ideal. Every 0.25° of added negative static directly improves RF contact patch loading. Estimated grip gain: ~${(Math.abs(a.rfCamberDev) * 1.75 * 0.25 / (a.rfCamberDev > 0 ? a.rfCamberDev : 1)).toFixed(1)}% per 0.25° step.`,
              type: 'SHOP — ALIGNMENT', color: '#f97316',
            },
            {
              rank: 3,
              action: 'Verify corner weights after camber change',
              why: 'Adding negative RF camber at the alignment rack shifts the RF spring perch angle slightly, which can change corner weight by 10–30 lbs. Re-check after alignment.',
              type: 'SHOP — SCALES', color: '#f59e0b',
            },
            {
              rank: 4,
              action: 'Consider raising front ride height to grow moment arm',
              why: `Current CG–RC moment arm is only ${a.momentArm?.toFixed(2)}" — this nearly nullifies the front ARB and makes spring-based LLTD tuning ineffective. Raising the car 1" (stiffer or taller springs) would grow the moment arm to approximately ${((a.momentArm ?? 0) + 1.5).toFixed(1)}", restoring ARB effectiveness.`,
              type: 'SHOP — SPRINGS', color: '#60a5fa',
            },
            {
              rank: 5,
              action: 'Rear Watts link pivot — no action needed',
              why: `Measured at ${a.rearRC.toFixed(1)}" which is within the 12–16" oval target range. Only revisit if handling shows a specific rear entry/exit imbalance after RF camber is corrected.`,
              type: 'MONITOR', color: '#22c55e',
            },
          ].map(item => (
            <div key={item.rank} style={{
              display: 'flex', gap: 12, marginBottom: 12,
              borderBottom: '1px solid #1e293b', paddingBottom: 12,
            }}>
              <div style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                background: item.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'monospace', fontWeight: 700,
                fontSize: 13, color: '#0f172a',
              }}>
                {item.rank}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{item.action}</span>
                  <span style={{
                    background: '#1e293b', border: `1px solid ${item.color}`, color: item.color,
                    fontSize: 9.5, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 3,
                  }}>{item.type}</span>
                </div>
                <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>{item.why}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
