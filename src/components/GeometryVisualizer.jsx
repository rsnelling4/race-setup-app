import { useMemo } from 'react';

// ─── Geometry engine ──────────────────────────────────────────────────────────
const P71_UPPER_ARM_LENGTH  = 9.5;
const P71_LOWER_ARM_LENGTH  = 13.0;
const P71_UPPER_PIVOT_H_EST = 13.5;

function num(v) { return parseFloat(v) || 0; }

function lineIntersect(p1, p2, p3, p4) {
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom;
  return { x: p1.x + t * dx1, y: p1.y + t * dy1 };
}

function yAtX(p1, p2, x) {
  if (Math.abs(p2.x - p1.x) < 1e-10) return p1.y;
  const t = (x - p1.x) / (p2.x - p1.x);
  return p1.y + t * (p2.y - p1.y);
}

export function computeGeometry(geo, side) {
  const sign     = side === 'RF' ? 1 : -1;
  const halfTrack = num(geo.trackWidth?.front || 64) / 2;
  const wh       = num(geo.wheelCenterHeight || 13.0);

  const loBJ = { x: sign * halfTrack, y: num(geo.lowerBallJoint?.[side]  || (side === 'RF' ? 6.75  : 7.75)) };
  const upBJ = { x: sign * halfTrack, y: num(geo.upperBallJoint?.[side]  || (side === 'RF' ? 17.625: 18.5)) };

  const loPivH = num(geo.lowerArmPivot?.[side]  || (side === 'RF' ? 9.375 : 10.0));
  const upPivH = num(geo.upperArmPivot?.[side]  || P71_UPPER_PIVOT_H_EST);
  const upPivEstimated = !geo.upperArmPivot?.[side];

  const loPiv = { x: sign * (halfTrack - P71_LOWER_ARM_LENGTH), y: loPivH };
  const upPiv = { x: sign * (halfTrack - P71_UPPER_ARM_LENGTH), y: upPivH };
  const cp    = { x: sign * halfTrack, y: 0 };
  const wheelCenter = { x: sign * halfTrack, y: wh };

  const ic = lineIntersect(loPiv, loBJ, upPiv, upBJ);
  let rcHeight = null;
  if (ic) rcHeight = yAtX(cp, ic, 0);

  let fvsa = null;
  if (ic) {
    const dx = wheelCenter.x - ic.x, dy = wheelCenter.y - ic.y;
    fvsa = Math.sqrt(dx * dx + dy * dy);
  }

  return { side, halfTrack, loBJ, upBJ, loPiv, upPiv, cp, ic, wheelCenter, rcHeight, fvsa, upPivEstimated };
}

// ─── SVG viewport ─────────────────────────────────────────────────────────────
// Wider x range so ICs (which sit inboard around ±15") have room.
// Taller y range (up to 55") so RC (~20") and CG (~22") don't pile up.
const VIEW = { xMin: -85, xMax: 85, yMin: -16, yMax: 58 };
const SVG_W = 900, SVG_H = 500;

function tx(x) { return ((x - VIEW.xMin) / (VIEW.xMax - VIEW.xMin)) * SVG_W; }
function ty(y) { return SVG_H - ((y - VIEW.yMin) / (VIEW.yMax - VIEW.yMin)) * SVG_H; }
function tp(p) { return `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`; }

function extendLine(p1, p2, xMin, xMax, yMin, yMax) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const ts = [];
  if (Math.abs(dx) > 1e-10) { ts.push((xMin - p1.x) / dx); ts.push((xMax - p1.x) / dx); }
  if (Math.abs(dy) > 1e-10) { ts.push((yMin - p1.y) / dy); ts.push((yMax - p1.y) / dy); }
  const pts = ts.map(t => ({ x: p1.x + t * dx, y: p1.y + t * dy, t }))
    .filter(p => p.x >= xMin - 0.1 && p.x <= xMax + 0.1 && p.y >= yMin - 0.1 && p.y <= yMax + 0.1);
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.t - b.t);
  return [pts[0], pts[pts.length - 1]];
}

// ─── Callout box ──────────────────────────────────────────────────────────────
function Callout({ cx, cy, lines, color, anchor = 'start', dx = 0, dy = 0 }) {
  const lh = 14, pad = 6;
  const maxLen = Math.max(...lines.map(l => l.length));
  const w = maxLen * 6.5 + pad * 2;
  const h = lines.length * lh + pad * 2;
  const bx = anchor === 'end' ? cx + dx - w : cx + dx;
  const by = cy + dy;
  return (
    <g>
      <rect x={bx} y={by} width={w} height={h} rx="3"
        fill="#0f172a" stroke={color} strokeWidth="1" opacity="0.92" />
      {lines.map((line, i) => (
        <text key={i} x={bx + pad} y={by + pad + (i + 1) * lh - 2}
          fill={i === 0 ? color : '#94a3b8'} fontSize="10.5" fontFamily="monospace"
          fontWeight={i === 0 ? '700' : '400'}>
          {line}
        </text>
      ))}
    </g>
  );
}

function Dot({ p, r = 5, fill, stroke = '#0f172a', sw = 1.5 }) {
  return <circle cx={tx(p.x)} cy={ty(p.y)} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
}

function LeaderLine({ x1, y1, x2, y2, color }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.6" />;
}

// ─── Main visualizer ──────────────────────────────────────────────────────────
export default function GeometryVisualizer({ geo }) {
  const rf = useMemo(() => computeGeometry(geo, 'RF'), [geo]);
  const lf = useMemo(() => computeGeometry(geo, 'LF'), [geo]);

  const rcAvg = (rf.rcHeight != null && lf.rcHeight != null)
    ? (rf.rcHeight + lf.rcHeight) / 2
    : rf.rcHeight ?? lf.rcHeight;
  const halfTrack = rf.halfTrack;
  const cgH = 22 + (num(geo.rideLowering) * -0.65);
  const cg  = { x: 0, y: cgH };
  const mc  = rcAvg != null ? { x: 0, y: rcAvg } : null;

  function extArm(piv, bj) {
    const ext = extendLine(piv, bj, VIEW.xMin, VIEW.xMax, VIEW.yMin, VIEW.yMax);
    return ext ? `M${tp(ext[0])} L${tp(ext[1])}` : '';
  }

  function rcLinePath(g) {
    if (!g.ic || g.rcHeight == null) return '';
    const ext = extendLine(g.cp, g.ic, VIEW.xMin, VIEW.xMax, VIEW.yMin, VIEW.yMax);
    return ext ? `M${tp(ext[0])} L${tp(ext[1])}` : '';
  }

  // ── line segments as pixel coords for convenience ──────────────────────────
  function px(p) { return { x: tx(p.x), y: ty(p.y) }; }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxWidth: SVG_W, display: 'block', background: '#0f172a', borderRadius: 8 }}
        aria-label="Front suspension geometry diagram"
      >
        {/* ── Ground line ─────────────────────────────────────────────── */}
        <line x1={0} y1={ty(0)} x2={SVG_W} y2={ty(0)} stroke="#334155" strokeWidth="2" />
        <text x={tx(0)} y={ty(0) + 14} textAnchor="middle" fill="#475569" fontSize="10" fontFamily="monospace">GROUND</text>

        {/* ── Centerline ──────────────────────────────────────────────── */}
        <line x1={tx(0)} y1={0} x2={tx(0)} y2={SVG_H} stroke="#334155" strokeWidth="1" strokeDasharray="4,5" />

        {/* ── Extended arm lines (very faint dashes) ──────────────────── */}
        <path d={extArm(rf.loPiv, rf.loBJ)} stroke="#f97316" strokeWidth="1" strokeDasharray="4,5" opacity="0.3" fill="none" />
        <path d={extArm(rf.upPiv, rf.upBJ)} stroke="#fb923c" strokeWidth="1" strokeDasharray="4,5" opacity="0.3" fill="none" />
        <path d={extArm(lf.loPiv, lf.loBJ)} stroke="#60a5fa" strokeWidth="1" strokeDasharray="4,5" opacity="0.3" fill="none" />
        <path d={extArm(lf.upPiv, lf.upBJ)} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4,5" opacity="0.3" fill="none" />

        {/* ── RC lines (contact patch → IC → centerline) ──────────────── */}
        <path d={rcLinePath(rf)} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="7,4" opacity="0.6" fill="none" />
        <path d={rcLinePath(lf)} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="7,4" opacity="0.6" fill="none" />

        {/* ── Solid arm lines ──────────────────────────────────────────── */}
        {[
          [rf.loPiv, rf.loBJ, '#f97316', 3.5, false],
          [rf.upPiv, rf.upBJ, '#fb923c', 3,   rf.upPivEstimated],
          [lf.loPiv, lf.loBJ, '#3b82f6', 3.5, false],
          [lf.upPiv, lf.upBJ, '#60a5fa', 3,   lf.upPivEstimated],
        ].map(([a, b, color, sw, dashed], i) => (
          <line key={i}
            x1={tx(a.x)} y1={ty(a.y)} x2={tx(b.x)} y2={ty(b.y)}
            stroke={color} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={dashed ? '6,3' : 'none'} />
        ))}

        {/* ── Spindles ────────────────────────────────────────────────── */}
        <line x1={tx(rf.loBJ.x)} y1={ty(rf.loBJ.y)} x2={tx(rf.upBJ.x)} y2={ty(rf.upBJ.y)} stroke="#cbd5e1" strokeWidth="2.5" />
        <line x1={tx(lf.loBJ.x)} y1={ty(lf.loBJ.y)} x2={tx(lf.upBJ.x)} y2={ty(lf.upBJ.y)} stroke="#cbd5e1" strokeWidth="2.5" />

        {/* ── Tire outlines ────────────────────────────────────────────── */}
        {[rf, lf].map(g => {
          const cx = tx(g.wheelCenter.x), cy = ty(g.wheelCenter.y);
          const r  = Math.abs(tx(0) - tx(-13.6));
          const w  = Math.abs(tx(0) - tx(-4.7));
          return (
            <rect key={g.side} x={cx - w} y={cy - r} width={w * 2} height={r * 2}
              rx="5" fill="#1e293b" stroke={g.side === 'RF' ? '#f97316' : '#3b82f6'}
              strokeWidth="2.5" opacity="0.9" />
          );
        })}

        {/* ── Chassis body — positioned high, away from arm geometry ───── */}
        <rect x={tx(-22)} y={ty(40)} width={tx(22) - tx(-22)} height={ty(28) - ty(40)}
          rx="4" fill="#1e3a5f" stroke="#2563eb" strokeWidth="1.5" opacity="0.5" />

        {/* ── Hardpoint dots — drawn last so they sit on top of arms ───── */}
        {[rf, lf].map(g => {
          const isRF = g.side === 'RF';
          return (
            <g key={g.side}>
              {/* lower BJ */}
              <Dot p={g.loBJ}  fill={isRF ? '#f97316' : '#3b82f6'} r={5} />
              {/* upper BJ */}
              <Dot p={g.upBJ}  fill={isRF ? '#fb923c' : '#60a5fa'} r={5} />
              {/* lower pivot */}
              <Dot p={g.loPiv} fill={isRF ? '#ea580c' : '#1d4ed8'} r={4} stroke="#e2e8f0" sw={1} />
              {/* upper pivot */}
              <Dot p={g.upPiv} fill={isRF ? '#fdba74' : '#93c5fd'} r={4} stroke="#e2e8f0" sw={1}
                opacity={g.upPivEstimated ? 0.45 : 1} />
              {/* contact patch */}
              <Dot p={g.cp} fill="#e2e8f0" r={4} />
            </g>
          );
        })}

        {/* ── IC dots ───────────────────────────────────────────────────── */}
        {rf.ic && <Dot p={rf.ic} fill="#a78bfa" r={7} stroke="#0f172a" sw={2} />}
        {lf.ic && <Dot p={lf.ic} fill="#c4b5fd" r={7} stroke="#0f172a" sw={2} />}

        {/* ── IC callout boxes — pinned to outer bottom corners ─────────── */}
        {lf.ic && (
          <>
            <LeaderLine x1={tx(lf.ic.x)} y1={ty(lf.ic.y)} x2={38} y2={SVG_H - 62} color="#c4b5fd" />
            <Callout cx={8} cy={SVG_H - 88} lines={['IC Left', `x ${lf.ic.x.toFixed(1)}"`, `y ${lf.ic.y.toFixed(1)}"`]} color="#c4b5fd" anchor="start" />
          </>
        )}
        {rf.ic && (
          <>
            <LeaderLine x1={tx(rf.ic.x)} y1={ty(rf.ic.y)} x2={SVG_W - 38} y2={SVG_H - 62} color="#a78bfa" />
            <Callout cx={SVG_W - 8} cy={SVG_H - 88} lines={['IC Right', `x ${rf.ic.x.toFixed(1)}"`, `y ${rf.ic.y.toFixed(1)}"`]} color="#a78bfa" anchor="end" />
          </>
        )}

        {/* ── RC dot — on centerline with offset callout RIGHT ─────────── */}
        {mc && (
          <>
            <Dot p={mc} fill="#22c55e" r={8} stroke="#0f172a" sw={2} />
            <LeaderLine x1={tx(0) + 10} y1={ty(mc.y)} x2={tx(0) + 22} y2={ty(mc.y)} color="#22c55e" />
            <Callout cx={tx(0) + 24} cy={ty(mc.y) - 10} lines={['Roll Center', `avg ${mc.y.toFixed(1)}"`, `RC-R ${rf.rcHeight?.toFixed(1)}"`, `RC-L ${lf.rcHeight?.toFixed(1)}"`]} color="#22c55e" anchor="start" />
          </>
        )}

        {/* ── CG dot — on centerline with offset callout LEFT ──────────── */}
        <Dot p={cg} fill="#fbbf24" r={7} stroke="#0f172a" sw={2} />
        <LeaderLine x1={tx(0) - 10} y1={ty(cg.y)} x2={tx(0) - 22} y2={ty(cg.y)} color="#fbbf24" />
        <Callout cx={tx(0) - 24} cy={ty(cg.y) - 10} lines={['CG (est)', `${cgH.toFixed(1)}"`]} color="#fbbf24" anchor="end" />

        {/* ── Moment arm line (CG to RC) ────────────────────────────────── */}
        {mc && (
          <>
            <line x1={tx(0)} y1={ty(mc.y)} x2={tx(0)} y2={ty(cg.y)}
              stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,3" opacity="0.8" />
            {/* label at midpoint, offset left */}
            <text
              x={tx(0) - 10} y={(ty(mc.y) + ty(cg.y)) / 2 + 4}
              textAnchor="end" fill="#f59e0b" fontSize="10" fontFamily="monospace" fontWeight="600">
              {Math.abs(cgH - mc.y).toFixed(1)}" arm
            </text>
          </>
        )}

        {/* ── FVSA labels — top left/right corners ─────────────────────── */}
        {lf.fvsa != null && (
          <text x={10} y={20} textAnchor="start" fill="#60a5fa" fontSize="10" fontFamily="monospace">
            L FVSA {lf.fvsa.toFixed(1)}"
          </text>
        )}
        {rf.fvsa != null && (
          <text x={SVG_W - 10} y={20} textAnchor="end" fill="#f97316" fontSize="10" fontFamily="monospace">
            R FVSA {rf.fvsa.toFixed(1)}"
          </text>
        )}

        {/* ── Camber labels — above each tire ──────────────────────────── */}
        <text x={tx(-halfTrack)} y={ty(31)} textAnchor="middle"
          fill="#60a5fa" fontSize="11" fontFamily="monospace" fontWeight="600">
          LF {num(geo.camber?.LF ?? 2.75).toFixed(2)}°
        </text>
        <text x={tx(halfTrack)} y={ty(31)} textAnchor="middle"
          fill="#f97316" fontSize="11" fontFamily="monospace" fontWeight="600">
          RF {num(geo.camber?.RF ?? -2.25).toFixed(2)}°
        </text>

        {/* ── Track width ───────────────────────────────────────────────── */}
        <line x1={tx(-halfTrack)} y1={ty(-10)} x2={tx(halfTrack)} y2={ty(-10)} stroke="#475569" strokeWidth="1" />
        <line x1={tx(-halfTrack)} y1={ty(-11)} x2={tx(-halfTrack)} y2={ty(-9)} stroke="#475569" strokeWidth="1" />
        <line x1={tx(halfTrack)}  y1={ty(-11)} x2={tx(halfTrack)}  y2={ty(-9)} stroke="#475569" strokeWidth="1" />
        <text x={tx(0)} y={ty(-10) + 13} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
          Track {(halfTrack * 2).toFixed(1)}"
        </text>

        {/* ── Legend — bottom center ────────────────────────────────────── */}
        <g transform={`translate(${SVG_W / 2 - 190}, ${SVG_H - 22})`}>
          {[
            ['#f97316', 'RF arms'],
            ['#3b82f6', 'LF arms'],
            ['#a78bfa', 'IC / RC lines'],
            ['#22c55e', 'Roll center'],
            ['#fbbf24', 'CG'],
          ].map(([color, label], i) => (
            <g key={i} transform={`translate(${i * 78}, 0)`}>
              <circle cx={5} cy={-4} r={4} fill={color} />
              <text x={13} y={0} fill="#64748b" fontSize="9.5" fontFamily="monospace">{label}</text>
            </g>
          ))}
        </g>

        {/* ── Estimated warning ─────────────────────────────────────────── */}
        {(rf.upPivEstimated || lf.upPivEstimated) && (
          <text x={SVG_W / 2} y={SVG_H - 36} textAnchor="middle"
            fill="#f59e0b" fontSize="9.5" fontFamily="monospace">
            ⚠ Upper arm pivot estimated ({P71_UPPER_PIVOT_H_EST}") — enter measured value above
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── Data table ───────────────────────────────────────────────────────────────
export function GeometryTable({ geo }) {
  const rf = useMemo(() => computeGeometry(geo, 'RF'), [geo]);
  const lf = useMemo(() => computeGeometry(geo, 'LF'), [geo]);
  const rcAvg = (rf.rcHeight != null && lf.rcHeight != null)
    ? (rf.rcHeight + lf.rcHeight) / 2
    : rf.rcHeight ?? lf.rcHeight;
  const cgH = 22 + (num(geo.rideLowering) * -0.65);

  const S = {
    hd:  { padding: '5px 10px', color: '#60a5fa', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#0f172a' },
    lbl: { padding: '4px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 },
    val: { padding: '4px 10px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 },
    nte: { padding: '4px 10px', color: '#475569', fontFamily: 'monospace', fontSize: 11 },
  };

  const row = (label, val, note, hColor) => (
    <tr key={label} style={{ borderBottom: '1px solid #1e293b' }}>
      <td style={S.lbl}>{label}</td>
      <td style={{ ...S.val, color: hColor || '#e2e8f0' }}>{val}</td>
      <td style={S.nte}>{note}</td>
    </tr>
  );
  const head = (label, color) => (
    <tr key={label}><td colSpan={3} style={{ ...S.hd, color: color || '#60a5fa' }}>{label}</td></tr>
  );

  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: '#1e293b', borderRadius: 6 }}>
        <tbody>
          {head('INSTANT CENTERS', '#a78bfa')}
          {rf.ic  && row('RF IC', `(${rf.ic.x.toFixed(1)}", ${rf.ic.y.toFixed(1)}")`, 'x from CL, y above ground', '#a78bfa')}
          {lf.ic  && row('LF IC', `(${lf.ic.x.toFixed(1)}", ${lf.ic.y.toFixed(1)}")`, 'x from CL, y above ground', '#c4b5fd')}
          {rf.fvsa != null && row('RF FVSA', `${rf.fvsa.toFixed(1)}"`, 'IC → wheel center')}
          {lf.fvsa != null && row('LF FVSA', `${lf.fvsa.toFixed(1)}"`, 'IC → wheel center')}

          {head('ROLL CENTER', '#22c55e')}
          {rf.rcHeight != null && row('RF RC @ CL', `${rf.rcHeight.toFixed(2)}"`, 'contact patch → IC → CL', '#a78bfa')}
          {lf.rcHeight != null && row('LF RC @ CL', `${lf.rcHeight.toFixed(2)}"`, 'contact patch → IC → CL', '#c4b5fd')}
          {rcAvg != null      && row('Front RC (avg)', `${rcAvg.toFixed(2)}"`, 'used in physics model', '#22c55e')}
          {row('Rear RC', `${num(geo.rearRollCenter || 14.5).toFixed(2)}"`, 'Watts link pivot — measured')}

          {head('MOMENT CENTER / CG', '#fbbf24')}
          {row('CG height (est)', `${cgH.toFixed(1)}"`, 'stock 22" ± lowering')}
          {rcAvg != null && row('CG → RC arm', `${Math.abs(cgH - rcAvg).toFixed(2)}"`, 'drives elastic load transfer', '#f59e0b')}
          {rcAvg != null && row('RC / CG ratio', `${((rcAvg / cgH) * 100).toFixed(1)}%`, '100% = no elastic roll')}

          {head('ARM SLOPES', '#f97316')}
          {row('RF lower arm', rf.loBJ ? `${((rf.loBJ.y - rf.loPiv.y) / P71_LOWER_ARM_LENGTH).toFixed(3)}` : '—', 'in/in (neg = drops outboard)', '#f97316')}
          {row('LF lower arm', lf.loBJ ? `${((lf.loBJ.y - lf.loPiv.y) / P71_LOWER_ARM_LENGTH).toFixed(3)}` : '—', 'in/in', '#3b82f6')}
          {row('RF upper arm', rf.upBJ ? `${((rf.upBJ.y - rf.upPiv.y) / P71_UPPER_ARM_LENGTH).toFixed(3)}` : '—', rf.upPivEstimated ? '⚠ pivot estimated' : 'measured', '#f97316')}
          {row('LF upper arm', lf.upBJ ? `${((lf.upBJ.y - lf.upPiv.y) / P71_UPPER_ARM_LENGTH).toFixed(3)}` : '—', lf.upPivEstimated ? '⚠ pivot estimated' : 'measured', '#3b82f6')}
        </tbody>
      </table>
    </div>
  );
}
