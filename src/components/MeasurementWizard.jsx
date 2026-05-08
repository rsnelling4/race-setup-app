import { useState } from 'react';
import { computeGeometry } from './GeometryVisualizer';

// Stock P71 defaults — used to fill any skipped step
const P71 = {
  camberLF: '0', camberRF: '0',
  casterLF: '3.5', casterRF: '5.0',
  toeTotal: '0', rearToeTotal: '0.063',
  springFront: '475', springRear: '160',
  installRatioFront: '0.85', installRatioRear: '1.0',
  trackFront: '64.0', trackRear: '65.125',
  wheelCenterHeight: '13.6',
  wattsLinkHeight: '14.5', rearSpringBase: '44.0',
  lowerBallJoint: '7.50', upperBallJoint: '17.00',
  lowerArmPivot: '6.00', upperArmPivot: '13.00',
  springPickup: '11.0',
  arbDiameter: '1.161',
  droopTravel: '1.25', bumpTravel: '2.0',
};

// ─── Wizard calculators ──────────────────────────────────────────────────────
// Reuse the same physics as the GeoEditor calculators, but operate on the
// wizard's intermediate data. Shock specs default to stock P71 strut/shock
// values since the wizard doesn't capture shock selection.

const W_CORNER_F = (3700 * 0.57) / 2;        // ≈ 1054 lb
const W_CORNER_R = (3700 * (1 - 0.57)) / 2;  // ≈ 795 lb
// Stock P71 strut (FCS 1336349 Police): extended 15.94", stroke 4.09"
// Stock P71 rear shock (Motorcraft ASH12277 HD): extended 20.26", stroke 7.76"
const STOCK_FRONT_STROKE = 4.09;
const STOCK_REAR_STROKE  = 7.76;
const STOCK_FRONT_FREE   = 15.94;
const STOCK_REAR_FREE    = 20.26;

function pf(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

function wIR(data, isFront) {
  const ir = isFront ? pf(data.installRatio?.front) : pf(data.installRatio?.rear);
  if (ir != null && ir > 0) return ir;
  return isFront ? 0.85 : 1.0;
}

function wSpringRate(pos, data) {
  const k = pf(data.springRate?.[pos]);
  if (k != null && k > 0) return k;
  return (pos === 'LF' || pos === 'RF') ? 475 : 160;
}

function wShockSag(pos, data) {
  const isFront = pos === 'LF' || pos === 'RF';
  const k = wSpringRate(pos, data);
  const ir = wIR(data, isFront);
  const w = isFront ? W_CORNER_F : W_CORNER_R;
  return w / (ir * k);
}

function estimateInstalledLengthW(pos, data) {
  const isFront = pos === 'LF' || pos === 'RF';
  const free = isFront ? STOCK_FRONT_FREE : STOCK_REAR_FREE;
  const sag = wShockSag(pos, data);
  if (sag == null) return null;
  return Math.max(0, free - sag);
}

function estimateBumpstopGapW(pos, data) {
  const isFront = pos === 'LF' || pos === 'RF';
  const stroke = isFront ? STOCK_FRONT_STROKE : STOCK_REAR_STROKE;
  const sag = wShockSag(pos, data);
  if (sag == null) return null;
  return Math.max(0, stroke - sag - 0.25);
}

function estimateBumpTravelW(pos, data) {
  const isFront = pos === 'LF' || pos === 'RF';
  if (!isFront) return null;
  const stroke = STOCK_FRONT_STROKE;
  const sag = wShockSag(pos, data);
  const ir = wIR(data, true);
  if (sag == null) return null;
  const remaining = Math.max(0, stroke - sag - 0.25);
  return remaining / ir;
}

function estimateBumpCamberW(pos, data) {
  const isFront = pos === 'LF' || pos === 'RF';
  if (!isFront) return null;
  const stat = pf(data.camber?.[pos]);
  if (stat == null) return null;
  let fvsa = null;
  try {
    const cg = computeGeometry(data, pos);
    fvsa = cg?.fvsa;
  } catch { /* wizard data may be incomplete — fall back below */ }
  if (fvsa == null || fvsa <= 0) return null;
  const gainPerInch = Math.atan(1 / fvsa) * (180 / Math.PI);
  const travel = estimateBumpTravelW(pos, data);
  if (travel == null) return null;
  return stat - gainPerInch * travel;
}

// ─── Small shared inputs ──────────────────────────────────────────────────────

function WField({ label, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wiz-field">
      <div className="wiz-field-label">
        {label}
        {hint && (
          <button className="ml-hint-btn" onClick={() => setOpen(o => !o)}>?</button>
        )}
      </div>
      {hint && open && <div className="ml-hint">{hint}</div>}
      {children}
    </div>
  );
}

function NIn({ value, onChange, placeholder, step = '0.1', min, max }) {
  return (
    <input
      type="number"
      className="ml-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? '—'}
      step={step}
      min={min}
      max={max}
    />
  );
}

function Row({ children }) {
  return <div className="ml-row" style={{ marginBottom: 12 }}>{children}</div>;
}

function Sub({ children }) {
  return <p className="ml-section-note" style={{ marginBottom: 12 }}>{children}</p>;
}

// ─── Step definitions ─────────────────────────────────────────────────────────
// Each step: { title, location, instructions (jsx), fields(data, set) }
// `location` is a short badge shown under the step title.

const STEPS = [
  // 0 ─ Identity
  {
    title: 'Car Setup',
    location: 'Before you start',
    instructions: (
      <Sub>
        Give this setup profile a name and select the racing format. Everything else can be
        adjusted later — this just identifies the profile.
      </Sub>
    ),
    fields: (data, set) => (
      <>
        <Row>
          <WField label="Car Name / Title">
            <input className="ml-input ml-input-wide" type="text"
              placeholder="e.g. Pete's Crown Vic — Oval"
              value={data.title}
              onChange={e => set('title', e.target.value)} />
          </WField>
          <WField label="Date">
            <input className="ml-input" type="date"
              value={data.date}
              onChange={e => set('date', e.target.value)} />
          </WField>
        </Row>
        <Row>
          <WField label="Racing format"
            hint="Oval uses asymmetric camber targets (RF −2°, LF +0.75°) and left-turn-only analysis. Figure-8 uses symmetric targets — both tires must handle being the outside tire.">
            <select className="ml-input ml-select"
              value={data.trackType ?? 'oval'}
              onChange={e => set('trackType', e.target.value)}>
              <option value="oval">Oval (left-turn only)</option>
              <option value="figure8">Figure-8 (left and right turns)</option>
            </select>
          </WField>
        </Row>
      </>
    ),
    // No stock fill needed for identity step
    fillDefaults: () => ({}),
  },

  // 1 ─ On ground — track width + wheel center height
  {
    title: 'Track Width & Wheel Center Height',
    location: 'Car on flat ground — front of car',
    instructions: (
      <>
        <Sub>Park on the flattest available surface (garage floor ideal). Wheels pointed straight ahead.
          Bounce the suspension a few times to settle before measuring.</Sub>
        <Sub><strong>Track width:</strong> Mark the center of each contact patch with chalk on the ground (midpoint
          of tread width, both sides). Measure between marks with a tape measure.</Sub>
        <Sub><strong>Wheel center height:</strong> Plumb a string from the center of the front hub bolt
          straight down to the floor and measure.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="Front track width (inches)"
            hint="Chalk-mark the center of the contact patch for each front tire on the ground. Measure between the two marks. Stock P71: 64.0&quot;.">
            <NIn value={data.trackWidth?.front ?? ''} onChange={v => setN('trackWidth', 'front', v)} placeholder="e.g. 64.0" step="0.125" />
          </WField>
          <WField label="Rear track width (inches)"
            hint="Same method — mark contact patch centers for both rear tires and measure. Stock P71: 65.125&quot; (slightly wider than front due to wheel offset).">
            <NIn value={data.trackWidth?.rear ?? ''} onChange={v => setN('trackWidth', 'rear', v)} placeholder="e.g. 65.125" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="Front wheel center height (inches)"
            hint="Center of front hub bolt to floor. Plumb a tape or string from the hub center straight down. Stock 235/55R17: 13.6&quot; (tire radius = 13.59&quot;).">
            <NIn value={data.wheelCenterHeight ?? ''} onChange={v => set('wheelCenterHeight', v)} placeholder="e.g. 13.6" step="0.125" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      trackWidth: { front: P71.trackFront, rear: P71.trackRear },
      wheelCenterHeight: P71.wheelCenterHeight,
    }),
  },

  // 2 ─ On ground — ride heights all four corners
  {
    title: 'Ride Heights',
    location: 'Car on flat ground — all corners',
    instructions: (
      <>
        <Sub>Driver weight (~200 lbs) in seat. Measure from the floor straight up to a consistent
          reference — the bottom of the rocker panel at a fixed point is reliable. Use the same
          spot every session.</Sub>
        <Sub>If you don't have driver weight available, note it and add an offset later.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <div className="ml-tire-grid" style={{ marginBottom: 12 }}>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <WField key={pos} label={`${pos} ride height (inches)`}
              hint={`Floor to bottom of rocker panel directly below the ${pos} door. Mark the exact spot so future readings are consistent. Right side typically sits lower on an oval setup.`}>
              <NIn value={data.rideHeight?.[pos] ?? ''} onChange={v => setN('rideHeight', pos, v)} placeholder="e.g. 5.5" step="0.125" />
            </WField>
          ))}
        </div>
        {(() => {
          const lf = parseFloat(data.rideHeight?.LF) || 0;
          const rf = parseFloat(data.rideHeight?.RF) || 0;
          const lr = parseFloat(data.rideHeight?.LR) || 0;
          const rr = parseFloat(data.rideHeight?.RR) || 0;
          if (lf + rf + lr + rr < 1) return null;
          const fAvg = lf > 0 && rf > 0 ? ((lf + rf) / 2).toFixed(2) : '—';
          const rAvg = lr > 0 && rr > 0 ? ((lr + rr) / 2).toFixed(2) : '—';
          const rake = lf > 0 && rf > 0 && lr > 0 && rr > 0 ? ((lf + rf) / 2 - (lr + rr) / 2).toFixed(2) : '—';
          const side = lf > 0 && rf > 0 ? ((lf + lr) / 2 - (rf + rr) / 2).toFixed(2) : '—';
          return (
            <div className="ml-section-note" style={{ fontFamily: 'monospace', fontSize: 12 }}>
              Front avg: {fAvg}" | Rear avg: {rAvg}" | Rake (F−R): {rake}" | L−R split: {side}"
            </div>
          );
        })()}
        <Row>
          <WField label="Ride height lowering from stock (inches)"
            hint="How many inches lower than stock? Each 1&quot; of lowering drops CG by ~0.65&quot;. Enter 0 if stock. Leave blank if unknown.">
            <NIn value={data.rideLowering ?? ''} onChange={v => set('rideLowering', v)} placeholder="0 if stock" step="0.25" />
          </WField>
          <WField label="Ballast / weight notes">
            <input className="ml-input" type="text"
              placeholder="e.g. roll cage, battery moved to trunk"
              value={data.cgNotes ?? ''}
              onChange={e => set('cgNotes', e.target.value)} />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      rideHeight: { LF: '', RF: '', LR: '', RR: '' },
      rideLowering: '',
      cgNotes: '',
    }),
  },

  // 3 ─ On ground — RIGHT side SLA hardpoints
  {
    title: 'Right Side — Front SLA Hardpoints',
    location: 'Car on ground — right side of car',
    instructions: (
      <>
        <Sub>Car at race ride height. Measure from the <strong>center of each ball joint stud or pivot
          bolt straight down to the floor</strong>. A plumb bob or level off the bolt face gives the
          most accurate result. All measurements in inches.</Sub>
        <Sub><strong>Lower ball joint:</strong> bottom-outside corner of hub, stud points down through the knuckle.<br />
          <strong>Upper ball joint:</strong> top of hub, stud points up.<br />
          <strong>Lower arm inner pivot:</strong> midpoint between front and rear bushing bolts on K-member.<br />
          <strong>Upper arm inner pivot:</strong> pivot bolt on the chassis tower above the lower arm.<br />
          <strong>Spring pickup:</strong> measure along the lower arm from the inner pivot center to the spring mount hole.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="RF lower ball joint (inches)"
            hint="Outer end of lower control arm. Stud points down through the bottom of the knuckle. Measure from stud center to floor. Stock est: 7.50&quot;.">
            <NIn value={data.lowerBallJoint?.RF ?? ''} onChange={v => setN('lowerBallJoint', 'RF', v)} placeholder="e.g. 7.50" step="0.125" />
          </WField>
          <WField label="RF upper ball joint (inches)"
            hint="Outer end of upper control arm. Stud points up through the top of the knuckle. Upper-to-lower spread should be ~9.5&quot; on a P71. Stock est: 17.00&quot;.">
            <NIn value={data.upperBallJoint?.RF ?? ''} onChange={v => setN('upperBallJoint', 'RF', v)} placeholder="e.g. 17.00" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="RF lower arm inner pivot (inches)"
            hint="Inner (chassis) end of lower control arm — midpoint between front and rear pivot bolt centers on K-member. Should be LOWER than lower BJ (arm slopes down inboard). Stock est: 6.00&quot;.">
            <NIn value={data.lowerArmPivot?.RF ?? ''} onChange={v => setN('lowerArmPivot', 'RF', v)} placeholder="e.g. 6.00" step="0.125" />
          </WField>
          <WField label="RF upper arm inner pivot (inches)"
            hint="Inner end of upper control arm — pivot bolt on chassis tower. MOST IMPORTANT measurement for RC accuracy — ±0.5&quot; moves RC by ~1.5&quot;. Stock est: 13.00&quot;.">
            <NIn value={data.upperArmPivot?.RF ?? ''} onChange={v => setN('upperArmPivot', 'RF', v)} placeholder="e.g. 13.00" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="RF spring pickup distance from inner pivot (inches)"
            hint="Along the lower arm from inner pivot center to spring mount hole. Stock P71: ~11.0&quot; (total arm ~13&quot;, giving IR ≈ 0.85).">
            <NIn value={data.springPickup?.RF ?? ''} onChange={v => setN('springPickup', 'RF', v)} placeholder="e.g. 11.0" step="0.125" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      lowerBallJoint: { RF: P71.lowerBallJoint },
      upperBallJoint: { RF: P71.upperBallJoint },
      lowerArmPivot:  { RF: P71.lowerArmPivot },
      upperArmPivot:  { RF: P71.upperArmPivot },
      springPickup:   { RF: P71.springPickup },
    }),
  },

  // 4 ─ On ground — LEFT side SLA hardpoints
  {
    title: 'Left Side — Front SLA Hardpoints',
    location: 'Car on ground — left side of car',
    instructions: (
      <>
        <Sub>Same method as the right side. Stay on the left side of the car — measure all four
          points before moving.</Sub>
        <Sub>Defaults are stock P71 estimates. On a symmetric stock car LF and RF should be within
          0.25&quot; on each measurement. If they differ more, check for spring sag or asymmetric
          perch heights.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="LF lower ball joint (inches)"
            hint="Outer end of lower control arm, stud down through bottom of knuckle. Measure from stud center to floor. Stock est: 7.50&quot;.">
            <NIn value={data.lowerBallJoint?.LF ?? ''} onChange={v => setN('lowerBallJoint', 'LF', v)} placeholder="e.g. 7.50" step="0.125" />
          </WField>
          <WField label="LF upper ball joint (inches)"
            hint="Outer end of upper control arm, stud up through top of knuckle. Upper-to-lower spread ~9.5&quot; on P71. Stock est: 17.00&quot;.">
            <NIn value={data.upperBallJoint?.LF ?? ''} onChange={v => setN('upperBallJoint', 'LF', v)} placeholder="e.g. 17.00" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="LF lower arm inner pivot (inches)"
            hint="Inner end of lower control arm — midpoint between pivot bolt centers on K-member. Should be lower than lower BJ. Stock est: 6.00&quot;.">
            <NIn value={data.lowerArmPivot?.LF ?? ''} onChange={v => setN('lowerArmPivot', 'LF', v)} placeholder="e.g. 6.00" step="0.125" />
          </WField>
          <WField label="LF upper arm inner pivot (inches)"
            hint="Pivot bolt on chassis tower, inner end of upper control arm. Most important measurement for front RC. Stock est: 13.00&quot;.">
            <NIn value={data.upperArmPivot?.LF ?? ''} onChange={v => setN('upperArmPivot', 'LF', v)} placeholder="e.g. 13.00" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="LF spring pickup distance from inner pivot (inches)"
            hint="Along lower arm from inner pivot to spring mount hole. Stock P71: ~11.0&quot;.">
            <NIn value={data.springPickup?.LF ?? ''} onChange={v => setN('springPickup', 'LF', v)} placeholder="e.g. 11.0" step="0.125" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      lowerBallJoint: { LF: P71.lowerBallJoint },
      upperBallJoint: { LF: P71.upperBallJoint },
      lowerArmPivot:  { LF: P71.lowerArmPivot },
      upperArmPivot:  { LF: P71.upperArmPivot },
      springPickup:   { LF: P71.springPickup },
    }),
  },

  // 5 ─ On ground — Rear geometry
  {
    title: 'Rear Suspension Geometry',
    location: 'Car on ground — rear of car',
    instructions: (
      <>
        <Sub><strong>Watts link center pivot:</strong> Crawl under the rear. The Watts link center pivot is the
          single large bolt mounted on a bracket centered on the rear axle housing, between the two
          horizontal balance arms. Measure from the center of that pivot bolt straight down to the floor.</Sub>
        <Sub><strong>Rear spring base:</strong> Tape measure along the top of the axle tube from the center of
          the left spring perch cup to the center of the right perch cup.</Sub>
      </>
    ),
    fields: (data, set) => (
      <>
        <Row>
          <WField label="Rear roll center height — Watts link center pivot (inches)"
            hint="Car at ride height with driver weight. Plumb bob from center of the Watts link pivot bolt to the floor. This IS the rear roll center on a Watts-link car. Stock est: ~14.5&quot; (measured — varies by bracket position).">
            <NIn value={data.rearRollCenter ?? ''} onChange={v => set('rearRollCenter', v)} placeholder="e.g. 14.5" step="0.125" />
          </WField>
        </Row>
        <Row>
          <WField label="Rear spring base — center to center (inches)"
            hint="Along the axle tube from center of LR spring perch cup to center of RR spring perch cup. Narrower than track width. Stock est: ~44&quot;. Wider base = more rear roll stiffness.">
            <NIn value={data.rearSpringBase ?? ''} onChange={v => set('rearSpringBase', v)} placeholder="e.g. 44.0" step="0.25" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      rearRollCenter: P71.wattsLinkHeight,
      rearSpringBase: P71.rearSpringBase,
    }),
  },

  // 6 ─ Static alignment
  {
    title: 'Static Alignment',
    location: 'Car on ground — alignment rack or phone inclinometer',
    instructions: (
      <>
        <Sub>Record the alignment settings currently on the car. These feed directly into the camber
          chain calculation. The model back-calculates from these plus the dynamic contributions.</Sub>
        <Sub><strong>Camber:</strong> phone inclinometer on a flat plate held flush against the wheel face, car at
          ride height with driver weight.<br />
          <strong>Caster:</strong> alignment rack — turn wheel 20° in, zero gauge, turn 20° out, read caster.<br />
          <strong>Toe:</strong> tape or toe plates at hub height. Total across both tires. Negative = toe-out.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="LF camber (°)"
            hint="Top of LF tire tilt relative to vertical. Negative = top tilts inward. Stock P71: 0° to −0.5°. Oval race: +2° to +3° (body roll subtracts ~1.4° dynamically on the inside/droop wheel).">
            <NIn value={data.camber?.LF ?? ''} onChange={v => setN('camber', 'LF', v)} placeholder="e.g. 2.75" />
          </WField>
          <WField label="RF camber (°)"
            hint="Top of RF tire tilt. Stock P71: 0° to −0.5°. Oval race: −2° to −3.5°. Negative = top tilts inward. RF is the critical outside tire in left turns.">
            <NIn value={data.camber?.RF ?? ''} onChange={v => setN('camber', 'RF', v)} placeholder="e.g. -2.25" />
          </WField>
        </Row>
        <Row>
          <WField label="LF caster (°)"
            hint="Kingpin tilt from side view. Stock P71 LF: ~3.5° (factory spec 3.0–4.0°). Oval race: 3–5° LF typical. Higher caster = more camber gain per degree of steer, but small steer angles on tight ovals limit the effect.">
            <NIn value={data.caster?.LF ?? ''} onChange={v => setN('caster', 'LF', v)} placeholder="e.g. 3.5" />
          </WField>
          <WField label="RF caster (°)"
            hint="Stock P71 RF: ~5.0° (factory spec 4.5–5.5° — Ford builds in ~1.5° more RF caster). Oval race: 5–7° RF. At this oval's ~3.77° apex steer, each degree of RF caster contributes ~0.136° of camber gain.">
            <NIn value={data.caster?.RF ?? ''} onChange={v => setN('caster', 'RF', v)} placeholder="e.g. 5.0" />
          </WField>
        </Row>
        <Row>
          <WField label="Front toe total (inches)"
            hint="Total toe across both front tires at hub height. Tape or toe plates: measure from leading edge of each rim to straight reference, then trailing edge — difference × 2 = total. Negative = toe-out. Stock P71: 0 ± 0.125&quot;.">
            <NIn value={data.toe ?? ''} onChange={v => set('toe', v)} placeholder="e.g. -0.25" step="0.0625" />
          </WField>
          <WField label="Rear toe total (inches)"
            hint="Same measurement method as front, at rear hubs. Stock P71: +0.063&quot; (slight toe-in). Rear toe-out causes oversteer.">
            <NIn value={data.rearToe ?? ''} onChange={v => set('rearToe', v)} placeholder="e.g. 0.063" step="0.0625" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      camber:  { LF: P71.camberLF,  RF: P71.camberRF  },
      caster:  { LF: P71.casterLF,  RF: P71.casterRF  },
      toe:     P71.toeTotal,
      rearToe: P71.rearToeTotal,
    }),
  },

  // 7 ─ Springs, ARB, install ratios
  {
    title: 'Springs, ARB & Installation Ratios',
    location: 'Car on ground — visual inspection + part numbers',
    instructions: (
      <>
        <Sub>Spring rate is stamped on the spring or found by part number. Do NOT confuse with wheel
          rate — wheel rate = spring rate × IR².</Sub>
        <Sub>
          <strong>Front IR — estimated from your spring pickup measurement:</strong> IR = spring pickup
          distance ÷ lower arm length. You measured the spring pickup distance in Steps 3 &amp; 4 —
          the estimate below is calculated automatically from those numbers using the P71&apos;s 13.0&quot;
          arm length. Accept it or override with a direct measurement.
        </Sub>
        <Sub>
          <strong>Front IR — direct measurement (more accurate):</strong><br />
          1. Car at ride height on flat ground.<br />
          2. Mark the current spring length on the coil with a paint pen or tape.<br />
          3. Floor jack under the lower control arm near the ball joint. Jack the wheel up
          exactly 1.0&quot; — confirm rise at the wheel centerline with a tape.<br />
          4. Measure how much the spring compressed from your mark.<br />
          5. IR = spring compression ÷ 1.0.
        </Sub>
        <Sub>
          <strong>Rear IR — P71 solid axle:</strong> Springs sit directly on the axle perches —
          1&quot; of axle travel = 1&quot; of spring compression → IR = 1.0. Only differs if springs
          are on an angled or offset bracket.
        </Sub>
        <Sub><strong>Rear spring track:</strong> tape along the top of the axle tube from the
          center of the left spring perch cup to the center of the right perch cup.</Sub>
      </>
    ),
    fields: (data, set, setN) => {
      // Geometric IR estimate from spring pickup measurements entered in Steps 3 & 4.
      // P71 lower arm length is a fixed 13.0" constant.
      const P71_ARM = 13.0;
      const lfPickup = parseFloat(data.springPickup?.LF);
      const rfPickup = parseFloat(data.springPickup?.RF);
      const validPickups = [lfPickup, rfPickup].filter(v => !isNaN(v) && v > 0);
      const avgPickup = validPickups.length > 0
        ? validPickups.reduce((a, b) => a + b, 0) / validPickups.length
        : null;
      const irEstimate = avgPickup ? (avgPickup / P71_ARM) : null;
      const irEstStr = irEstimate ? irEstimate.toFixed(3) : null;
      const currentFrontIR = data.installRatio?.front ?? '';
      const irMatchesEstimate = irEstStr && Math.abs(parseFloat(currentFrontIR) - irEstimate) < 0.001;

      return (
      <>
        <div className="ml-tire-grid" style={{ marginBottom: 12 }}>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <WField key={pos} label={`${pos} spring rate (lb/in)`}
              hint={`Spring rate at the coil. Stock P71 front (Police/Taxi strut): 475 lb/in. Stock P71 rear coil: 160 lb/in. Civilian front: 440 lb/in. Heavy duty front: 700 lb/in.`}>
              <NIn value={data.springRate?.[pos] ?? ''} onChange={v => setN('springRate', pos, v)} placeholder={pos.endsWith('F') ? '475' : '160'} step="5" />
            </WField>
          ))}
        </div>
        <Row>
          <WField label="Front IR (per side)"
            hint="IR = spring pickup ÷ arm length (geometric estimate), or measure directly: jack wheel 1&quot;, measure spring compression, divide. Plausible range 0.75–0.90. Below 0.70 or above 1.0 is almost certainly wrong.">
            <NIn value={currentFrontIR} onChange={v => setN('installRatio', 'front', v)} placeholder="e.g. 0.85" step="0.01" />
            {irEstStr && (
              <div style={{ marginTop: 5, fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  Geometric estimate: <strong style={{ color: '#e2e8f0' }}>{irEstStr}</strong>
                  {avgPickup && (
                    <span style={{ color: '#64748b' }}>
                      {' '}({validPickups.length === 2
                        ? `avg of LF ${lfPickup}&quot; + RF ${rfPickup}&quot;`
                        : `${avgPickup}&quot;`} ÷ ${P71_ARM}&quot; arm)
                    </span>
                  )}
                </span>
                {!irMatchesEstimate && (
                  <button
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 4, color: '#93c5fd', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
                    onClick={() => setN('installRatio', 'front', irEstStr)}
                  >
                    Use {irEstStr}
                  </button>
                )}
                {irMatchesEstimate && (
                  <span style={{ color: '#34d399' }}>✓ using estimate</span>
                )}
              </div>
            )}
            {!irEstStr && (
              <div style={{ marginTop: 5, fontSize: 11, color: '#64748b' }}>
                Enter spring pickup distances in Steps 3 &amp; 4 to auto-calculate an estimate.
              </div>
            )}
          </WField>
          <WField label="Rear IR"
            hint="P71 rear: springs sit directly on axle perches, no lever arm. 1&quot; of axle travel = 1&quot; of spring compression → IR = 1.0. Only change if springs are on an angled or offset bracket.">
            <NIn value={data.installRatio?.rear ?? ''} onChange={v => setN('installRatio', 'rear', v)} placeholder="e.g. 1.0" step="0.01" />
            <div style={{ marginTop: 5, fontSize: 11, color: '#94a3b8' }}>
              Solid axle direct-mount → IR = <strong style={{ color: '#e2e8f0' }}>1.0</strong>
            </div>
          </WField>
          <WField label="Rear spring track (inches)"
            hint="Center-to-center between rear spring perch cups on the axle. Wider = more rear roll stiffness. Stock est: ~44&quot;.">
            <NIn value={data.rearSpringTrack ?? ''} onChange={v => set('rearSpringTrack', v)} placeholder="e.g. 44" step="0.5" />
          </WField>
        </Row>
        <Row>
          <WField label="Front ARB diameter (inches)"
            hint="Measure the bar diameter at the straight section between bushings with calipers. Stock P71 Police: 1.161&quot; (29.5mm verified). ARB stiffness scales as d⁴ — small changes have large effects.">
            <NIn value={data.arbDiameter ?? ''} onChange={v => set('arbDiameter', v)} placeholder="e.g. 1.161" step="0.001" min="0.5" max="2.0" />
          </WField>
        </Row>
      </>
      );
    },
    fillDefaults: () => ({
      springRate:    { LF: P71.springFront, RF: P71.springFront, LR: P71.springRear, RR: P71.springRear },
      installRatio:  { front: P71.installRatioFront, rear: P71.installRatioRear },
      rearSpringTrack: P71.rearSpringBase,
      arbDiameter:   P71.arbDiameter,
    }),
  },

  // 8 ─ Car on stands — droop
  {
    title: 'Droop Camber & Travel',
    location: 'Car on jack stands — frame supported, wheels hanging free',
    instructions: (
      <>
        <Sub><strong>Setup:</strong> Support the car under the frame rails or rocker panels — NOT under
          the control arms. The front wheels must hang freely at full droop with no spring tension.</Sub>
        <Sub><strong>Camber:</strong> Hold a rigid flat plate (clipboard, piece of aluminum) flush against the
          center of the wheel face. Phone inclinometer flat on the plate. Positive = top leans outward.</Sub>
        <Sub><strong>Droop travel:</strong> At ride height mark a point at wheel center and measure its height.
          With wheel hanging free, measure again. Difference = droop travel.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="LF camber at full droop (°)"
            hint="LF wheel hanging freely. Rigid plate flush against wheel face, phone inclinometer flat on plate. Record as-read — do not subtract static camber. Positive = top leans out.">
            <NIn value={data.droopCamber?.LF ?? ''} onChange={v => setN('droopCamber', 'LF', v)} placeholder="e.g. 1.75" />
          </WField>
          <WField label="RF camber at full droop (°)"
            hint="RF wheel hanging freely. Same method as LF. RF at full droop is typically positive (top leans outward) since the wheel droops away from the car.">
            <NIn value={data.droopCamber?.RF ?? ''} onChange={v => setN('droopCamber', 'RF', v)} placeholder="e.g. -1.5" />
          </WField>
        </Row>
        <Row>
          <WField label="LF droop travel (inches)"
            hint="Wheel center height at ride height minus wheel center height at full droop. Stock P71: ~1.25&quot; from stock ride height. If lowered, droop travel increases.">
            <NIn value={data.droopTravel?.LF ?? ''} onChange={v => setN('droopTravel', 'LF', v)} placeholder="e.g. 1.25" step="0.125" />
          </WField>
          <WField label="RF droop travel (inches)"
            hint="Same method as LF. Both sides should be similar on a symmetric car.">
            <NIn value={data.droopTravel?.RF ?? ''} onChange={v => setN('droopTravel', 'RF', v)} placeholder="e.g. 1.25" step="0.125" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      droopCamber: { LF: '', RF: '' },
      droopTravel:  { LF: P71.droopTravel, RF: P71.droopTravel },
    }),
  },

  // 9 ─ Car on stands — bump (or computed from FVSA + shock stroke)
  {
    title: 'Bump Camber & Travel',
    location: 'Car on jack stands — or auto-calculate from FVSA / shock stroke',
    instructions: (
      <>
        <Sub><strong>This step is hard to measure directly.</strong> Bump camber and travel are
          derivable from data you've already entered (SLA hardpoints → FVSA, shock stroke,
          spring rate). Click <strong>"Auto-calculate"</strong> below to fill from those, or
          measure directly: car on jack stands, floor jack under lower control arm to push wheel
          up to bumpstop, phone inclinometer on flat plate against wheel face.</Sub>
        <Sub>Formula: <code>bump_travel = (shock_stroke − sag) ÷ IR</code>, where sag = corner_weight ÷ (IR × spring_rate).
          <br /><code>bump_camber = static_camber − (camber_gain_per_inch × bump_travel)</code>, where camber_gain_per_inch = arctan(1 ÷ FVSA).</Sub>
      </>
    ),
    fields: (data, set, setN) => {
      const tLF = estimateBumpTravelW('LF', data);
      const tRF = estimateBumpTravelW('RF', data);
      const cLF = estimateBumpCamberW('LF', data);
      const cRF = estimateBumpCamberW('RF', data);
      const canAuto = tLF != null || tRF != null || cLF != null || cRF != null;
      return (
      <>
        {canAuto && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                if (tLF != null) setN('bumpTravel', 'LF', tLF.toFixed(2));
                if (tRF != null) setN('bumpTravel', 'RF', tRF.toFixed(2));
                if (cLF != null) setN('bumpCamber', 'LF', cLF.toFixed(2));
                if (cRF != null) setN('bumpCamber', 'RF', cRF.toFixed(2));
              }}
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 4, color: '#93c5fd', fontSize: 12, padding: '6px 14px', cursor: 'pointer' }}
            >
              Auto-calculate from previous steps
            </button>
          </div>
        )}
        <Row>
          <WField label="LF camber at full bump (°)"
            hint="Floor jack under LF lower arm near BJ — jack slowly to bumpstop. Read inclinometer on plate against wheel face. Or click Auto-calculate above.">
            <NIn value={data.bumpCamber?.LF ?? ''} onChange={v => setN('bumpCamber', 'LF', v)} placeholder={cLF != null ? `est. ${cLF.toFixed(2)}` : 'e.g. -3.0'} />
          </WField>
          <WField label="RF camber at full bump (°)"
            hint="Floor jack under RF lower arm near BJ. RF bump camber is critical — this wheel is in jounce during left-turn cornering on an oval. Or use Auto-calculate.">
            <NIn value={data.bumpCamber?.RF ?? ''} onChange={v => setN('bumpCamber', 'RF', v)} placeholder={cRF != null ? `est. ${cRF.toFixed(2)}` : 'e.g. -4.5'} />
          </WField>
        </Row>
        <Row>
          <WField label="LF bump travel (inches)"
            hint="Wheel center height at full bump minus wheel center height at ride height. Or Auto-calculate from shock stroke − sag.">
            <NIn value={data.bumpTravel?.LF ?? ''} onChange={v => setN('bumpTravel', 'LF', v)} placeholder={tLF != null ? `est. ${tLF.toFixed(2)}` : 'e.g. 2.0'} step="0.125" />
          </WField>
          <WField label="RF bump travel (inches)"
            hint="Same as LF.">
            <NIn value={data.bumpTravel?.RF ?? ''} onChange={v => setN('bumpTravel', 'RF', v)} placeholder={tRF != null ? `est. ${tRF.toFixed(2)}` : 'e.g. 2.0'} step="0.125" />
          </WField>
        </Row>
      </>
      );
    },
    fillDefaults: () => ({
      bumpCamber: { LF: '', RF: '' },
      bumpTravel:  { LF: P71.bumpTravel, RF: P71.bumpTravel },
    }),
  },

  // 10 ─ Shocks + physical measurements (or computed from corner weight + spring rate)
  {
    title: 'Shocks / Struts & Travel Measurements',
    location: 'Car back on ground — or auto-calculate from springs',
    instructions: (
      <>
        <Sub><strong>These are hard to measure in-place.</strong> Both can be calculated from
          data you've already entered (corner weight, spring rate, IR, shock stroke).
          Click <strong>"Auto-calculate"</strong> below to fill from those, or measure
          directly with the car at race ride height.</Sub>
        <Sub>Formula: <code>installed_length = free_length − sag</code>, where <code>sag = corner_weight ÷ (IR × spring_rate)</code>.
          <br /><code>bumpstop_gap = stroke − sag − 0.25" margin</code>.</Sub>
      </>
    ),
    fields: (data, set, setN) => {
      const installEsts = {};
      const gapEsts = {};
      let canAuto = false;
      for (const pos of ['LF', 'RF', 'LR', 'RR']) {
        const i = estimateInstalledLengthW(pos, data);
        const g = estimateBumpstopGapW(pos, data);
        installEsts[pos] = i;
        gapEsts[pos] = g;
        if (i != null || g != null) canAuto = true;
      }
      return (
      <>
        {canAuto && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                for (const pos of ['LF', 'RF', 'LR', 'RR']) {
                  if (installEsts[pos] != null) setN('shockInstalled', pos, installEsts[pos].toFixed(2));
                  if (gapEsts[pos] != null) setN('shockBumpGap', pos, gapEsts[pos].toFixed(2));
                }
              }}
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 4, color: '#93c5fd', fontSize: 12, padding: '6px 14px', cursor: 'pointer' }}
            >
              Auto-calculate from corner weight, springs, IR &amp; shock stroke
            </button>
          </div>
        )}
        <p className="ml-section-note" style={{ marginBottom: 8 }}>Installed length at ride height (inches)</p>
        <div className="ml-tire-grid" style={{ marginBottom: 12 }}>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <WField key={pos} label={`${pos} installed (inches)`}
              hint={`${pos} shock mount-to-mount at ride height. Or use Auto-calculate above.`}>
              <NIn value={data.shockInstalled?.[pos] ?? ''} onChange={v => setN('shockInstalled', pos, v)} placeholder={installEsts[pos] != null ? `est. ${installEsts[pos].toFixed(2)}` : 'e.g. 12.0'} step="0.125" />
            </WField>
          ))}
        </div>
        <p className="ml-section-note" style={{ marginBottom: 8 }}>Bumpstop gap at ride height (inches)</p>
        <div className="ml-tire-grid" style={{ marginBottom: 12 }}>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <WField key={pos} label={`${pos} gap (inches)`}
              hint={`${pos} gap from bumpstop rubber to contact surface. Often hidden under the boot — use Auto-calculate. Under 0.5" = at the stop in cornering.`}>
              <NIn value={data.shockBumpGap?.[pos] ?? ''} onChange={v => setN('shockBumpGap', pos, v)} placeholder={gapEsts[pos] != null ? `est. ${gapEsts[pos].toFixed(2)}` : 'e.g. 1.25'} step="0.125" />
            </WField>
          ))}
        </div>
      </>
      );
    },
    fillDefaults: () => ({
      shockInstalled: { LF: '', RF: '', LR: '', RR: '' },
      shockBumpGap:   { LF: '', RF: '', LR: '', RR: '' },
    }),
  },

  // 11 ─ Caster camber gain
  {
    title: 'Caster Camber Gain Calibration',
    location: 'Car on ground — turn steering to 20° right',
    instructions: (
      <>
        <Sub>Caster gain is symmetric — the camber change per degree of steer is identical left or
          right. We use 20° right because it produces a clearly readable change on the inclinometer.
          The model applies the resulting coefficient at the actual oval apex steer angle (~3.77°).</Sub>
        <Sub>Turn the steering wheel right until a digital angle finder on the tire sidewall reads
          approximately 20°. Read camber with phone inclinometer on flat plate against each wheel face.</Sub>
      </>
    ),
    fields: (data, set, setN) => (
      <>
        <Row>
          <WField label="LF camber at 20° right steer (°)"
            hint="At 20° right the LF is the inside tire and typically gains positive camber. Note your straight-ahead static LF camber first — the gain = this reading minus that static value. Model divides gain by (LF caster × sin20°) to get the coefficient.">
            <NIn value={data.steerCamber20?.LF ?? ''} onChange={v => setN('steerCamber20', 'LF', v)} placeholder="e.g. 1.5" />
          </WField>
          <WField label="RF camber at 20° right steer (°)"
            hint="At 20° right the RF is the outside tire — should gain negative camber. e.g. static −2°, at 20° right reads −4° → gain is 2°. Model divides by (RF caster × sin20°) to get coefficient, then scales to actual apex steer angle.">
            <NIn value={data.steerCamber20?.RF ?? ''} onChange={v => setN('steerCamber20', 'RF', v)} placeholder="e.g. -4.0" />
          </WField>
        </Row>
      </>
    ),
    fillDefaults: () => ({
      steerCamber20: { LF: '', RF: '' },
    }),
  },

  // 12 ─ Notes & finish
  {
    title: 'Notes & Finish',
    location: 'Done',
    instructions: (
      <Sub>Add any observations about the measurement session, tools used, or things to re-check.
        Click "Save Car" to store this profile and open the full geometry analysis.</Sub>
    ),
    fields: (data, set) => (
      <>
        <WField label="Notes / Observations">
          <textarea className="ml-textarea" rows={5}
            placeholder="Tools used, anything that needs re-measurement, handling observations..."
            value={data.notes ?? ''}
            onChange={e => set('notes', e.target.value)} />
        </WField>
      </>
    ),
    fillDefaults: () => ({ notes: '' }),
  },
];

// ─── Deep-merge helper ────────────────────────────────────────────────────────
function deepMerge(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    if (
      patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key]) &&
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = { ...base[key], ...patch[key] };
    } else {
      result[key] = patch[key];
    }
  }
  return result;
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function MeasurementWizard({ initialData, onSave, onCancel }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const total = STEPS.length;

  function set(field, value) {
    setData(d => ({ ...d, [field]: value }));
  }

  function setN(parent, key, value) {
    setData(d => ({
      ...d,
      [parent]: { ...(d[parent] || {}), [key]: value },
    }));
  }

  function applyDefaults(stepIndex) {
    const defaults = STEPS[stepIndex].fillDefaults();
    setData(d => deepMerge(d, defaults));
  }

  function handleNext() {
    if (step < total - 1) setStep(s => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep(s => s - 1);
  }

  function handleSkip() {
    applyDefaults(step);
    if (step < total - 1) setStep(s => s + 1);
  }

  function handleSave() {
    onSave(data);
  }

  const S = STEPS[step];
  const isLast = step === total - 1;
  const progressPct = Math.round(((step + 1) / total) * 100);

  return (
    <div className="wiz-shell">
      {/* Header */}
      <div className="wiz-header">
        <div className="wiz-header-left">
          <span className="wiz-step-count">Step {step + 1} of {total}</span>
          <span className="wiz-title">{S.title}</span>
          <span className="wiz-location">{S.location}</span>
        </div>
        <div className="wiz-header-right">
          <button className="ml-cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="wiz-progress-track">
        <div className="wiz-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Step dots */}
      <div className="wiz-dots">
        {STEPS.map((s, i) => (
          <button
            key={i}
            className={`wiz-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
            onClick={() => setStep(i)}
            title={s.title}
          />
        ))}
      </div>

      {/* Content */}
      <div className="wiz-body">
        {S.instructions}
        {S.fields(data, set, setN)}
      </div>

      {/* Footer nav */}
      <div className="wiz-footer">
        <div className="wiz-footer-left">
          <button className="ml-cancel-btn" onClick={handleBack} disabled={step === 0}>
            ← Back
          </button>
        </div>
        <div className="wiz-footer-center">
          {!isLast && (
            <button className="wiz-skip-btn" onClick={handleSkip}
              title="Fill this step with stock P71 estimates and continue">
              Skip (use stock estimates)
            </button>
          )}
        </div>
        <div className="wiz-footer-right">
          {isLast ? (
            <button className="ml-save-btn wiz-save-btn" onClick={handleSave}>
              Save Car →
            </button>
          ) : (
            <button className="ml-save-btn" onClick={handleNext}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
