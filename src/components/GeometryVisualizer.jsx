import { useMemo } from 'react';

// ─── Geometry engine ──────────────────────────────────────────────────────────
// All coordinates: x = inches from car centerline (positive = right/RF side),
//                  y = inches above ground (positive = up).
// The SVG will mirror x so left side is visually left.

const P71_UPPER_ARM_LENGTH   = 9.5;   // inches, inner pivot to upper BJ
const P71_LOWER_ARM_LENGTH   = 13.0;  // inches, inner pivot to lower BJ
const P71_UPPER_PIVOT_X_INB  = 9.5;   // inches inboard from upper BJ → inner pivot X from CL
const P71_UPPER_PIVOT_H_EST  = 13.5;  // inches — estimated, pending measurement

function num(v) { return parseFloat(v) || 0; }

function lineIntersect(p1, p2, p3, p4) {
  // Returns intersection of line p1→p2 and line p3→p4 (infinite lines)
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // parallel
  const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom;
  return { x: p1.x + t * dx1, y: p1.y + t * dy1 };
}

function yAtX(p1, p2, x) {
  // y value of line through p1→p2 at given x
  if (Math.abs(p2.x - p1.x) < 1e-10) return p1.y;
  const t = (x - p1.x) / (p2.x - p1.x);
  return p1.y + t * (p2.y - p1.y);
}

export function computeGeometry(geo, side) {
  // side: 'RF' (right/outside) or 'LF' (left/inside)
  const sign = side === 'RF' ? 1 : -1; // RF is positive x side

  const halfTrack = num(geo.trackWidth?.front || 64) / 2;
  const wh        = num(geo.wheelCenterHeight || 13.0);

  // Hardpoints in (x, y) — x from centerline, y from ground
  const loBJ = { x: sign * halfTrack, y: num(geo.lowerBallJoint?.[side]  || (side === 'RF' ? 6.75 : 7.75)) };
  const upBJ = { x: sign * halfTrack, y: num(geo.upperBallJoint?.[side]  || (side === 'RF' ? 17.625 : 18.5)) };

  const loPivH = num(geo.lowerArmPivot?.[side] || (side === 'RF' ? 9.375 : 10.0));
  const upPivH = num(geo.upperArmPivot?.[side] || P71_UPPER_PIVOT_H_EST);
  const upPivEstimated = !geo.upperArmPivot?.[side];

  // Inner pivot X positions (inboard of wheel)
  const loPivX = sign * (halfTrack - P71_LOWER_ARM_LENGTH);
  const upPivX = sign * (halfTrack - P71_UPPER_ARM_LENGTH);

  const loPiv = { x: loPivX, y: loPivH };
  const upPiv = { x: upPivX, y: upPivH };

  // Contact patch
  const cp = { x: sign * halfTrack, y: 0 };

  // Instant center = intersection of extended lower arm line and upper arm line
  const ic = lineIntersect(loPiv, loBJ, upPiv, upBJ);

  // Roll center line: from contact patch through IC → find y at x=0 (centerline)
  let rcHeight = null;
  let rcLine = null;
  if (ic) {
    rcHeight = yAtX(cp, ic, 0);
    rcLine = { cp, ic, rcHeight };
  }

  // Wheel center
  const wheelCenter = { x: sign * halfTrack, y: wh };

  // FVSA (Front View Swing Arm) length = distance from IC to wheel center
  let fvsa = null;
  if (ic) {
    const dx = wheelCenter.x - ic.x;
    const dy = wheelCenter.y - ic.y;
    fvsa = Math.sqrt(dx * dx + dy * dy);
  }

  return {
    side, halfTrack, loBJ, upBJ, loPiv, upPiv, cp, ic, wheelCenter,
    rcHeight, rcLine, fvsa, upPivEstimated,
  };
}

// ─── SVG coordinate transform ─────────────────────────────────────────────────
// We map real-world inches into SVG pixels.
// View: from x = -80" to +80" (left to right), y = -10" to +50" (bottom to top)
const VIEW = { xMin: -82, xMax: 82, yMin: -12, yMax: 52 };
const SVG_W = 820, SVG_H = 420;

function tx(x) {
  return ((x - VIEW.xMin) / (VIEW.xMax - VIEW.xMin)) * SVG_W;
}
function ty(y) {
  // SVG y is inverted (0 at top)
  return SVG_H - ((y - VIEW.yMin) / (VIEW.yMax - VIEW.yMin)) * SVG_H;
}
function tp(p) { return `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`; }

// Extend a line from p1 through p2 to hit a clipping boundary
function extendLine(p1, p2, xMin, xMax, yMin, yMax) {
  const pts = [];
  // Find t values for x and y boundaries
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const ts = [];
  if (Math.abs(dx) > 1e-10) {
    ts.push((xMin - p1.x) / dx);
    ts.push((xMax - p1.x) / dx);
  }
  if (Math.abs(dy) > 1e-10) {
    ts.push((yMin - p1.y) / dy);
    ts.push((yMax - p1.y) / dy);
  }
  for (const t of ts) {
    const px = p1.x + t * dx, py = p1.y + t * dy;
    if (px >= xMin - 0.1 && px <= xMax + 0.1 && py >= yMin - 0.1 && py <= yMax + 0.1) {
      pts.push({ x: px, y: py, t });
    }
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.t - b.t);
  return [pts[0], pts[pts.length - 1]];
}

// ─── Label helper ─────────────────────────────────────────────────────────────
function Label({ x, y, text, sub, color = '#e2e8f0', anchor = 'middle', dy = 0 }) {
  return (
    <g>
      <text x={tx(x)} y={ty(y) + dy} textAnchor={anchor} fill={color}
        fontSize="11" fontFamily="monospace" fontWeight="600">
        {text}
      </text>
      {sub && (
        <text x={tx(x)} y={ty(y) + dy + 13} textAnchor={anchor} fill={color}
          fontSize="9.5" fontFamily="monospace" opacity="0.8">
          {sub}
        </text>
      )}
    </g>
  );
}

function Dot({ p, r = 5, color }) {
  return <circle cx={tx(p.x)} cy={ty(p.y)} r={r} fill={color} stroke="#0f172a" strokeWidth="1.5" />;
}

// ─── Main visualizer ──────────────────────────────────────────────────────────
export default function GeometryVisualizer({ geo }) {
  const rf = useMemo(() => computeGeometry(geo, 'RF'), [geo]);
  const lf = useMemo(() => computeGeometry(geo, 'LF'), [geo]);

  // Roll center = average of the two side RC intersections at CL
  const rcAvg = (rf.rcHeight != null && lf.rcHeight != null)
    ? (rf.rcHeight + lf.rcHeight) / 2
    : rf.rcHeight ?? lf.rcHeight;

  const halfTrack = rf.halfTrack;

  // Moment center: lateral = CL (x=0), height = RC
  const mc = rcAvg != null ? { x: 0, y: rcAvg } : null;

  // CG height
  const cgH = 22 + (num(geo.rideLowering) * -0.65); // stock 22" adjusted for lowering
  const cg  = { x: 0, y: cgH };

  // ── Build extended arm lines (dashed) ────────────────────────────────────────
  function extArm(piv, bj) {
    const ext = extendLine(piv, bj, VIEW.xMin, VIEW.xMax, VIEW.yMin, VIEW.yMax);
    return ext ? `M${tp(ext[0])} L${tp(ext[1])}` : '';
  }

  // ── RC lines (from contact patch through IC to CL) ───────────────────────────
  function rcLinePath(side) {
    const g = side === 'RF' ? rf : lf;
    if (!g.ic || g.rcHeight == null) return '';
    const ext = extendLine(g.cp, g.ic, VIEW.xMin, VIEW.xMax, -5, VIEW.yMax);
    return ext ? `M${tp(ext[0])} L${tp(ext[1])}` : '';
  }

  const hasIC = rf.ic && lf.ic;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxWidth: SVG_W, display: 'block', background: '#0f172a', borderRadius: 8 }}
        aria-label="Front suspension geometry diagram"
      >
        {/* ── Ground line ─────────────────────────────────────────────── */}
        <line x1={0} y1={ty(0)} x2={SVG_W} y2={ty(0)} stroke="#334155" strokeWidth="2" />
        <text x={tx(0)} y={ty(0) + 14} textAnchor="middle" fill="#475569" fontSize="10" fontFamily="monospace">
          GROUND
        </text>

        {/* ── Centerline ──────────────────────────────────────────────── */}
        <line x1={tx(0)} y1={0} x2={tx(0)} y2={SVG_H}
          stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />

        {/* ── Extended arm lines (dashed) ─────────────────────────────── */}
        {/* RF */}
        <path d={extArm(rf.loPiv, rf.loBJ)} stroke="#f97316" strokeWidth="1" strokeDasharray="5,4" opacity="0.5" fill="none" />
        <path d={extArm(rf.upPiv, rf.upBJ)} stroke="#fb923c" strokeWidth="1" strokeDasharray="5,4" opacity="0.5" fill="none" />
        {/* LF */}
        <path d={extArm(lf.loPiv, lf.loBJ)} stroke="#60a5fa" strokeWidth="1" strokeDasharray="5,4" opacity="0.5" fill="none" />
        <path d={extArm(lf.upPiv, lf.upBJ)} stroke="#93c5fd" strokeWidth="1" strokeDasharray="5,4" opacity="0.5" fill="none" />

        {/* ── RC lines (from contact patch through IC) ─────────────────── */}
        <path d={rcLinePath('RF')} stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" fill="none" />
        <path d={rcLinePath('LF')} stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" fill="none" />

        {/* ── Solid arm lines ──────────────────────────────────────────── */}
        {/* RF lower arm */}
        <line x1={tp(rf.loPiv).split(',')[0]} y1={tp(rf.loPiv).split(',')[1]}
              x2={tp(rf.loBJ).split(',')[0]}  y2={tp(rf.loBJ).split(',')[1]}
              stroke="#f97316" strokeWidth="3.5" strokeLinecap="round" />
        {/* RF upper arm */}
        <line x1={tp(rf.upPiv).split(',')[0]} y1={tp(rf.upPiv).split(',')[1]}
              x2={tp(rf.upBJ).split(',')[0]}  y2={tp(rf.upBJ).split(',')[1]}
              stroke="#fb923c" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={rf.upPivEstimated ? '6,3' : 'none'} />
        {/* LF lower arm */}
        <line x1={tp(lf.loPiv).split(',')[0]} y1={tp(lf.loPiv).split(',')[1]}
              x2={tp(lf.loBJ).split(',')[0]}  y2={tp(lf.loBJ).split(',')[1]}
              stroke="#60a5fa" strokeWidth="3.5" strokeLinecap="round" />
        {/* LF upper arm */}
        <line x1={tp(lf.upPiv).split(',')[0]} y1={tp(lf.upPiv).split(',')[1]}
              x2={tp(lf.upBJ).split(',')[0]}  y2={tp(lf.upBJ).split(',')[1]}
              stroke="#93c5fd" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={lf.upPivEstimated ? '6,3' : 'none'} />

        {/* ── Spindles (vertical line between ball joints) ─────────────── */}
        <line x1={tp(rf.loBJ).split(',')[0]} y1={tp(rf.loBJ).split(',')[1]}
              x2={tp(rf.upBJ).split(',')[0]}  y2={tp(rf.upBJ).split(',')[1]}
              stroke="#e2e8f0" strokeWidth="2" />
        <line x1={tp(lf.loBJ).split(',')[0]} y1={tp(lf.loBJ).split(',')[1]}
              x2={tp(lf.upBJ).split(',')[0]}  y2={tp(lf.upBJ).split(',')[1]}
              stroke="#e2e8f0" strokeWidth="2" />

        {/* ── Tire outlines (simple rect) ───────────────────────────────── */}
        {[rf, lf].map(g => {
          const cx = tx(g.wheelCenter.x), cy = ty(g.wheelCenter.y);
          const r  = tx(0) - tx(-13.6); // tire radius in px
          const w  = tx(0) - tx(-4.7);  // half-width in px (~4.7" = 235mm/2)
          return (
            <g key={g.side}>
              <rect x={cx - w} y={cy - r} width={w * 2} height={r * 2}
                rx="6" fill="#1e293b" stroke={g.side === 'RF' ? '#f97316' : '#60a5fa'}
                strokeWidth="2" opacity="0.9" />
            </g>
          );
        })}

        {/* ── Chassis body (trapezoid suggestion) ──────────────────────── */}
        <rect x={tx(-28)} y={ty(28)} width={tx(28) - tx(-28)} height={ty(14) - ty(28)}
          rx="4" fill="#1e3a5f" stroke="#2563eb" strokeWidth="1.5" opacity="0.6" />

        {/* ── Hardpoint dots ────────────────────────────────────────────── */}
        {[rf, lf].map(g => (
          <g key={g.side}>
            <Dot p={g.loBJ}      color={g.side === 'RF' ? '#f97316' : '#60a5fa'} />
            <Dot p={g.upBJ}      color={g.side === 'RF' ? '#fb923c' : '#93c5fd'} />
            <Dot p={g.loPiv}     color={g.side === 'RF' ? '#ea580c' : '#3b82f6'} r={4} />
            <Dot p={g.upPiv}     color={g.side === 'RF' ? '#fdba74' : '#bfdbfe'} r={4}
              opacity={g.upPivEstimated ? 0.5 : 1} />
            <Dot p={g.wheelCenter} color="#94a3b8" r={3} />
            <Dot p={g.cp}        color="#e2e8f0" r={4} />
          </g>
        ))}

        {/* ── IC dots ───────────────────────────────────────────────────── */}
        {rf.ic && <Dot p={rf.ic} color="#a78bfa" r={6} />}
        {lf.ic && <Dot p={lf.ic} color="#c4b5fd" r={6} />}

        {/* ── Roll Center dot ───────────────────────────────────────────── */}
        {mc && (
          <>
            <circle cx={tx(0)} cy={ty(mc.y)} r={8}
              fill="#22c55e" stroke="#0f172a" strokeWidth="2" />
            <text x={tx(0) + 12} y={ty(mc.y) + 4} fill="#22c55e"
              fontSize="11" fontFamily="monospace" fontWeight="700">
              RC {mc.y.toFixed(1)}"
            </text>
          </>
        )}

        {/* ── CG dot ────────────────────────────────────────────────────── */}
        <circle cx={tx(0)} cy={ty(cg.y)} r={6}
          fill="#fbbf24" stroke="#0f172a" strokeWidth="2" />
        <text x={tx(0) + 12} y={ty(cg.y) + 4} fill="#fbbf24"
          fontSize="11" fontFamily="monospace" fontWeight="700">
          CG {cg.y.toFixed(1)}"
        </text>

        {/* ── CG to RC moment arm line ──────────────────────────────────── */}
        {mc && (
          <>
            <line x1={tx(0)} y1={ty(mc.y)} x2={tx(0)} y2={ty(cg.y)}
              stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,3" />
            <text x={tx(0) - 8} y={(ty(mc.y) + ty(cg.y)) / 2 + 4}
              textAnchor="end" fill="#f59e0b" fontSize="10" fontFamily="monospace">
              {Math.abs(cg.y - mc.y).toFixed(1)}" arm
            </text>
          </>
        )}

        {/* ── IC labels ─────────────────────────────────────────────────── */}
        {rf.ic && (
          <g>
            <rect x={tx(rf.ic.x) - 50} y={ty(rf.ic.y) - 30} width={100} height={28}
              rx="3" fill="#1e293b" stroke="#a78bfa" strokeWidth="1" />
            <text x={tx(rf.ic.x)} y={ty(rf.ic.y) - 17} textAnchor="middle"
              fill="#a78bfa" fontSize="10" fontFamily="monospace" fontWeight="700">IC R</text>
            <text x={tx(rf.ic.x)} y={ty(rf.ic.y) - 6} textAnchor="middle"
              fill="#a78bfa" fontSize="9" fontFamily="monospace">
              ({rf.ic.x.toFixed(1)}", {rf.ic.y.toFixed(1)}")
            </text>
          </g>
        )}
        {lf.ic && (
          <g>
            <rect x={tx(lf.ic.x) - 50} y={ty(lf.ic.y) - 30} width={100} height={28}
              rx="3" fill="#1e293b" stroke="#c4b5fd" strokeWidth="1" />
            <text x={tx(lf.ic.x)} y={ty(lf.ic.y) - 17} textAnchor="middle"
              fill="#c4b5fd" fontSize="10" fontFamily="monospace" fontWeight="700">IC L</text>
            <text x={tx(lf.ic.x)} y={ty(lf.ic.y) - 6} textAnchor="middle"
              fill="#c4b5fd" fontSize="9" fontFamily="monospace">
              ({lf.ic.x.toFixed(1)}", {lf.ic.y.toFixed(1)}")
            </text>
          </g>
        )}

        {/* ── FVSA length labels ────────────────────────────────────────── */}
        {rf.fvsa != null && (
          <text x={SVG_W - 8} y={ty(6)} textAnchor="end"
            fill="#a78bfa" fontSize="10" fontFamily="monospace">
            R FVSA: {rf.fvsa.toFixed(1)}"
          </text>
        )}
        {lf.fvsa != null && (
          <text x={8} y={ty(6)} textAnchor="start"
            fill="#c4b5fd" fontSize="10" fontFamily="monospace">
            L FVSA: {lf.fvsa.toFixed(1)}"
          </text>
        )}

        {/* ── Camber labels (top corners) ───────────────────────────────── */}
        <text x={tx(-halfTrack)} y={16} textAnchor="middle"
          fill="#60a5fa" fontSize="11" fontFamily="monospace">
          L Camb: {num(geo.camber?.LF ?? 2.75).toFixed(3)}°
        </text>
        <text x={tx(halfTrack)} y={16} textAnchor="middle"
          fill="#f97316" fontSize="11" fontFamily="monospace">
          R Camb: {num(geo.camber?.RF ?? -2.25).toFixed(3)}°
        </text>

        {/* ── Track width annotation ────────────────────────────────────── */}
        <line x1={tx(-halfTrack)} y1={ty(-8)} x2={tx(halfTrack)} y2={ty(-8)}
          stroke="#475569" strokeWidth="1" />
        <line x1={tx(-halfTrack)} y1={ty(-9)} x2={tx(-halfTrack)} y2={ty(-7)} stroke="#475569" strokeWidth="1" />
        <line x1={tx(halfTrack)}  y1={ty(-9)} x2={tx(halfTrack)}  y2={ty(-7)} stroke="#475569" strokeWidth="1" />
        <text x={tx(0)} y={ty(-8) + 13} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
          Track width: {(halfTrack * 2).toFixed(3)}"
        </text>

        {/* ── Per-side RC heights at CL ─────────────────────────────────── */}
        {rf.rcHeight != null && (
          <text x={tx(4)} y={ty(rf.rcHeight) - 4} fill="#a78bfa" fontSize="9" fontFamily="monospace">
            RC-R {rf.rcHeight.toFixed(1)}"
          </text>
        )}
        {lf.rcHeight != null && (
          <text x={tx(-4)} y={ty(lf.rcHeight) - 4} textAnchor="end" fill="#c4b5fd" fontSize="9" fontFamily="monospace">
            RC-L {lf.rcHeight.toFixed(1)}"
          </text>
        )}

        {/* ── Estimated note ────────────────────────────────────────────── */}
        {(rf.upPivEstimated || lf.upPivEstimated) && (
          <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle"
            fill="#f59e0b" fontSize="9.5" fontFamily="monospace">
            ⚠ Upper arm inner pivot estimated ({P71_UPPER_PIVOT_H_EST}" assumed) — measure to confirm
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── Data table below diagram ─────────────────────────────────────────────────
export function GeometryTable({ geo }) {
  const rf = useMemo(() => computeGeometry(geo, 'RF'), [geo]);
  const lf = useMemo(() => computeGeometry(geo, 'LF'), [geo]);
  const rcAvg = (rf.rcHeight != null && lf.rcHeight != null)
    ? (rf.rcHeight + lf.rcHeight) / 2
    : rf.rcHeight ?? lf.rcHeight;
  const cgH = 22 + (num(geo.rideLowering) * -0.65);

  const row = (label, val, note) => (
    <tr key={label}>
      <td style={{ padding: '4px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '4px 10px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{val}</td>
      {note && <td style={{ padding: '4px 10px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{note}</td>}
    </tr>
  );

  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: '#1e293b', borderRadius: 6 }}>
        <tbody>
          <tr><td colSpan={3} style={{ padding: '6px 10px', color: '#60a5fa', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#0f172a' }}>INSTANT CENTERS</td></tr>
          {rf.ic && row('RF IC location', `(${rf.ic.x.toFixed(1)}", ${rf.ic.y.toFixed(1)}")`, 'x from CL, y above ground')}
          {lf.ic && row('LF IC location', `(${lf.ic.x.toFixed(1)}", ${lf.ic.y.toFixed(1)}")`, 'x from CL, y above ground')}
          {rf.fvsa != null && row('RF FVSA length', `${rf.fvsa.toFixed(1)}"`, 'IC to wheel center')}
          {lf.fvsa != null && row('LF FVSA length', `${lf.fvsa.toFixed(1)}"`, 'IC to wheel center')}

          <tr><td colSpan={3} style={{ padding: '6px 10px', color: '#22c55e', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#0f172a' }}>ROLL CENTER</td></tr>
          {rf.rcHeight != null && row('RF RC at CL', `${rf.rcHeight.toFixed(2)}"`, 'RF contact patch → IC → CL')}
          {lf.rcHeight != null && row('LF RC at CL', `${lf.rcHeight.toFixed(2)}"`, 'LF contact patch → IC → CL')}
          {rcAvg != null && row('Front RC height (avg)', `${rcAvg.toFixed(2)}"`, 'used in physics model')}
          {row('Rear RC height', `${num(geo.rearRollCenter || 14.5).toFixed(2)}"`, 'Watts link pivot — measured')}

          <tr><td colSpan={3} style={{ padding: '6px 10px', color: '#fbbf24', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#0f172a' }}>MOMENT CENTER / CG</td></tr>
          {row('CG height (est)', `${cgH.toFixed(1)}"`, 'stock 22" ± lowering adj.')}
          {rcAvg != null && row('CG → RC moment arm', `${Math.abs(cgH - rcAvg).toFixed(2)}"`, 'drives elastic load transfer')}
          {rcAvg != null && row('RC as % of CG height', `${((rcAvg / cgH) * 100).toFixed(1)}%`, '100% = no elastic roll')}

          <tr><td colSpan={3} style={{ padding: '6px 10px', color: '#f97316', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#0f172a' }}>ARM GEOMETRY</td></tr>
          {row('RF lower arm slope', rf.loBJ && rf.loPiv ? `${((rf.loBJ.y - rf.loPiv.y) / P71_LOWER_ARM_LENGTH).toFixed(3)} in/in` : '—', 'negative = drops outboard')}
          {row('LF lower arm slope', lf.loBJ && lf.loPiv ? `${((lf.loBJ.y - lf.loPiv.y) / P71_LOWER_ARM_LENGTH).toFixed(3)} in/in` : '—', '')}
          {row('RF upper arm slope', rf.upBJ && rf.upPiv ? `${((rf.upBJ.y - rf.upPiv.y) / P71_UPPER_ARM_LENGTH).toFixed(3)} in/in` : '—', rf.upPivEstimated ? '⚠ pivot estimated' : 'measured')}
          {row('LF upper arm slope', lf.upBJ && lf.upPiv ? `${((lf.upBJ.y - lf.upPiv.y) / P71_UPPER_ARM_LENGTH).toFixed(3)} in/in` : '—', lf.upPivEstimated ? '⚠ pivot estimated' : 'measured')}
        </tbody>
      </table>
    </div>
  );
}
