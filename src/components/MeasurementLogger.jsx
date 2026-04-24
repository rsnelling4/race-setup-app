import { useState, useEffect } from 'react';

const STORAGE_KEY = 'race_measurement_logs';

const EMPTY_CAR = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
  // Session environment
  ambient: '',
  inflationTemp: '',
  // Alignment
  camber: { LF: '', RF: '' },
  caster: { LF: '', RF: '' },
  toe: '',
  // Hardware
  springRate: { LF: '', RF: '' },
  shockNotes: { LF: '', RF: '', LR: '', RR: '' },
  // Pressures
  coldPsi: { LF: '', RF: '', LR: '', RR: '' },
  hotPsi: { LF: '', RF: '', LR: '', RR: '' },
  // Pyrometer
  tireTemps: {
    LF: { inside: '', middle: '', outside: '' },
    RF: { inside: '', middle: '', outside: '' },
    LR: { inside: '', middle: '', outside: '' },
    RR: { inside: '', middle: '', outside: '' },
  },
  // Suspension geometry (calibration — measurement-guide.md)
  trackWidth: { front: '', rear: '' },
  rearRollCenter: '',
  lowerBallJoint: { LF: '', RF: '' },
  upperBallJoint: { LF: '', RF: '' },
  lowerArmPivot: { LF: '', RF: '' },
  wheelCenterHeight: '',
  droopCamber: { LF: '', RF: '' },
  droopTravel: { LF: '', RF: '' },
  bumpCamber: { LF: '', RF: '' },
  bumpTravel: { LF: '', RF: '' },
  steerCamber20: { LF: '', RF: '' },
  rideLowering: '',
  cgNotes: '',
};

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

function loadCars() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCars(cars) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
}

function v(val) { return val || '—'; }

function formatForModel(car) {
  const lines = [
    `=== ${car.title || 'Unnamed Car'} — ${car.date} ===`,
    '',
    `Ambient Temp: ${v(car.ambient)}°F`,
    `Tires Set At (inflation temp): ${v(car.inflationTemp)}°F`,
    '',
    '--- Alignment ---',
    `Camber:  LF ${v(car.camber.LF)}°   RF ${v(car.camber.RF)}°`,
    `Caster:  LF ${v(car.caster.LF)}°   RF ${v(car.caster.RF)}°`,
    `Toe (front): ${v(car.toe)}" (negative = toe-out)`,
    '',
    '--- Springs ---',
    `Front Spring Rate: LF ${v(car.springRate.LF)} lbs/in   RF ${v(car.springRate.RF)} lbs/in`,
    '',
    '--- Shocks / Struts ---',
    `LF: ${v(car.shockNotes.LF)}`,
    `RF: ${v(car.shockNotes.RF)}`,
    `LR: ${v(car.shockNotes.LR)}`,
    `RR: ${v(car.shockNotes.RR)}`,
    '',
    '--- Cold Tire Pressures (PSI) ---',
    `LF ${v(car.coldPsi.LF)}   RF ${v(car.coldPsi.RF)}`,
    `LR ${v(car.coldPsi.LR)}   RR ${v(car.coldPsi.RR)}`,
    '',
    '--- Hot Tire Pressures (PSI, after session) ---',
    `LF ${v(car.hotPsi.LF)}   RF ${v(car.hotPsi.RF)}`,
    `LR ${v(car.hotPsi.LR)}   RR ${v(car.hotPsi.RR)}`,
    '',
    '--- Pyrometer Readings (°F: Inside / Middle / Outside) ---',
    `LF: ${v(car.tireTemps.LF.inside)} / ${v(car.tireTemps.LF.middle)} / ${v(car.tireTemps.LF.outside)}`,
    `RF: ${v(car.tireTemps.RF.inside)} / ${v(car.tireTemps.RF.middle)} / ${v(car.tireTemps.RF.outside)}`,
    `LR: ${v(car.tireTemps.LR.inside)} / ${v(car.tireTemps.LR.middle)} / ${v(car.tireTemps.LR.outside)}`,
    `RR: ${v(car.tireTemps.RR.inside)} / ${v(car.tireTemps.RR.middle)} / ${v(car.tireTemps.RR.outside)}`,
  ];

  // Only include geometry section if any value is filled
  const geo = car;
  const hasGeo = [
    geo.trackWidth?.front, geo.trackWidth?.rear, geo.rearRollCenter,
    geo.lowerBallJoint?.LF, geo.upperBallJoint?.LF, geo.lowerArmPivot?.LF,
    geo.wheelCenterHeight, geo.droopCamber?.LF, geo.bumpCamber?.LF,
    geo.steerCamber20?.LF, geo.rideLowering,
  ].some(x => x !== '' && x !== undefined);

  if (hasGeo) {
    lines.push(
      '',
      '--- Suspension Geometry (Calibration) ---',
      `Track width (front): ${v(car.trackWidth.front)}" rear: ${v(car.trackWidth.rear)}"`,
      `Rear roll center height (Watts pivot): ${v(car.rearRollCenter)}"`,
      '',
      'Front SLA ball joint heights from floor:',
      `  LF lower BJ: ${v(car.lowerBallJoint.LF)}"   RF lower BJ: ${v(car.lowerBallJoint.RF)}"`,
      `  LF upper BJ: ${v(car.upperBallJoint.LF)}"   RF upper BJ: ${v(car.upperBallJoint.RF)}"`,
      `  LF lower arm pivot: ${v(car.lowerArmPivot.LF)}"   RF lower arm pivot: ${v(car.lowerArmPivot.RF)}"`,
      `  Front wheel center height: ${v(car.wheelCenterHeight)}"`,
      '',
      'Droop camber (wheels hanging freely at full droop):',
      `  LF: ${v(car.droopCamber.LF)}°   RF: ${v(car.droopCamber.RF)}°`,
      `  LF droop travel: ${v(car.droopTravel.LF)}"   RF droop travel: ${v(car.droopTravel.RF)}"`,
      '',
      'Bump camber (wheel pushed to full bump):',
      `  LF: ${v(car.bumpCamber.LF)}°   RF: ${v(car.bumpCamber.RF)}°`,
      `  LF bump travel: ${v(car.bumpTravel.LF)}"   RF bump travel: ${v(car.bumpTravel.RF)}"`,
      '',
      'Caster camber gain (at 20° right steer):',
      `  LF camber: ${v(car.steerCamber20.LF)}°   RF camber: ${v(car.steerCamber20.RF)}°`,
      '',
      `Ride height lowering from stock: ${v(car.rideLowering)}"`,
    );
    if (car.cgNotes.trim()) lines.push(`CG / ballast notes: ${car.cgNotes.trim()}`);
  }

  if (car.notes.trim()) {
    lines.push('', '--- Notes ---', car.notes.trim());
  }
  return lines.join('\n');
}

function Field({ label, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-field">
      <div className="ml-field-label">
        {label}
        {hint && (
          <button className="ml-hint-btn" onClick={() => setOpen(o => !o)} title="How to measure">?</button>
        )}
      </div>
      {hint && open && <div className="ml-hint">{hint}</div>}
      {children}
    </div>
  );
}

function NumberIn({ value, onChange, placeholder, step = '0.1', min, max }) {
  return (
    <input
      type="number"
      className="ml-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '—'}
      step={step}
      min={min}
      max={max}
    />
  );
}

export default function MeasurementLogger() {
  const [cars, setCars] = useState(loadCars);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editing, setEditing] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { saveCars(cars); }, [cars]);

  function newCar() {
    const fresh = { ...deepCopy(EMPTY_CAR), id: Date.now(), date: new Date().toISOString().slice(0, 10) };
    setEditing(fresh);
    setSelectedIdx(null);
  }

  function editCar(idx) {
    // Merge saved car with EMPTY_CAR to fill in any missing fields added later
    const merged = { ...deepCopy(EMPTY_CAR), ...deepCopy(cars[idx]) };
    // Deep-merge nested objects
    for (const key of Object.keys(EMPTY_CAR)) {
      if (typeof EMPTY_CAR[key] === 'object' && EMPTY_CAR[key] !== null && !Array.isArray(EMPTY_CAR[key])) {
        merged[key] = { ...EMPTY_CAR[key], ...(cars[idx][key] || {}) };
        if (key === 'tireTemps') {
          for (const pos of ['LF', 'RF', 'LR', 'RR']) {
            merged.tireTemps[pos] = { ...EMPTY_CAR.tireTemps[pos], ...(cars[idx].tireTemps?.[pos] || {}) };
          }
        }
      }
    }
    setEditing(merged);
    setSelectedIdx(idx);
  }

  function saveCar() {
    if (!editing) return;
    const updated = [...cars];
    if (selectedIdx !== null) {
      updated[selectedIdx] = editing;
    } else {
      updated.push(editing);
      setSelectedIdx(updated.length - 1);
    }
    setCars(updated);
    setEditing(null);
  }

  function cancelEdit() { setEditing(null); }

  function deleteCar(idx) {
    setCars(cars.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setDeleteConfirm(null);
    setEditing(null);
  }

  function copyToClipboard(car) {
    navigator.clipboard.writeText(formatForModel(car)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function set(field, value) {
    setEditing(e => ({ ...e, [field]: value }));
  }

  function setNested(parent, key, value) {
    setEditing(e => ({ ...e, [parent]: { ...e[parent], [key]: value } }));
  }

  function setTireTemp(pos, zone, value) {
    setEditing(e => ({
      ...e,
      tireTemps: { ...e.tireTemps, [pos]: { ...e.tireTemps[pos], [zone]: value } },
    }));
  }

  const viewCar = selectedIdx !== null && !editing ? cars[selectedIdx] : null;

  return (
    <div className="ml-page">
      {/* Sidebar */}
      <div className="ml-sidebar">
        <div className="ml-sidebar-header">
          <span className="ml-sidebar-title">Cars</span>
          <button className="ml-new-btn" onClick={newCar}>+ New</button>
        </div>
        {cars.length === 0 && (
          <div className="ml-empty">No cars saved yet.<br />Tap "+ New" to start.</div>
        )}
        {cars.map((car, idx) => (
          <button
            key={car.id}
            className={`ml-car-item${selectedIdx === idx ? ' active' : ''}`}
            onClick={() => editCar(idx)}
          >
            <span className="ml-car-name">{car.title || 'Unnamed Car'}</span>
            <span className="ml-car-date">{car.date}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="ml-content">
        {!editing && !viewCar && (
          <div className="ml-splash">
            <p>Select a car to edit, or tap "+ New" to log measurements for a new car.</p>
          </div>
        )}

        {/* ---- EDITOR ---- */}
        {editing && (
          <div className="ml-editor">
            <div className="ml-editor-header">
              <div className="ml-section-title">{selectedIdx !== null ? 'Edit' : 'New'} Car</div>
              <div className="ml-editor-actions">
                <button className="ml-save-btn" onClick={saveCar}>Save</button>
                <button className="ml-cancel-btn" onClick={cancelEdit}>Cancel</button>
                {selectedIdx !== null && (
                  deleteConfirm === selectedIdx
                    ? <>
                        <span className="ml-delete-confirm-text">Delete?</span>
                        <button className="ml-delete-confirm-btn" onClick={() => deleteCar(selectedIdx)}>Yes</button>
                        <button className="ml-cancel-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                      </>
                    : <button className="ml-delete-btn" onClick={() => setDeleteConfirm(selectedIdx)}>Delete</button>
                )}
              </div>
            </div>

            {/* Identity */}
            <div className="ml-section">
              <div className="ml-row">
                <Field label="Car Name / Title">
                  <input className="ml-input ml-input-wide" type="text"
                    placeholder="e.g. Pete's Car"
                    value={editing.title} onChange={e => set('title', e.target.value)} />
                </Field>
                <Field label="Date">
                  <input className="ml-input" type="date"
                    value={editing.date} onChange={e => set('date', e.target.value)} />
                </Field>
              </div>
            </div>

            {/* Environment */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Environment</h3>
              <div className="ml-row">
                <Field label="Ambient Temp (°F)"
                  hint="Outside air temperature at the time of session. Use a thermometer or phone weather app.">
                  <NumberIn value={editing.ambient} onChange={v => set('ambient', v)} placeholder="e.g. 75" step="1" />
                </Field>
                <Field label="Tires Set At (°F)"
                  hint="Temperature where cold pressures were set (usually the shop). The model uses this to back-calculate ideal cold PSI from optimal hot PSI.">
                  <NumberIn value={editing.inflationTemp} onChange={v => set('inflationTemp', v)} placeholder="e.g. 68" step="1" />
                </Field>
              </div>
            </div>

            {/* Alignment */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Alignment</h3>
              <div className="ml-row">
                <Field label="Camber LF (°)"
                  hint="Tilt of tire top relative to vertical. Measured by alignment machine or phone inclinometer against a flat plate held flush on the wheel face. Negative = top tilts inward. Positive = top tilts outward.">
                  <NumberIn value={editing.camber.LF} onChange={v => setNested('camber', 'LF', v)} placeholder="e.g. 2.75" />
                </Field>
                <Field label="Camber RF (°)"
                  hint="Same as LF. RF typically more negative on oval — it's the outside tire in left turns.">
                  <NumberIn value={editing.camber.RF} onChange={v => setNested('camber', 'RF', v)} placeholder="e.g. -2.25" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="Caster LF (°)"
                  hint="Kingpin tilt from side view. Alignment machine: turn wheel 20° in, zero gauge, turn 20° out, read caster. Higher = more camber gain in turns + heavier steering. Typical P71 range 3–9°.">
                  <NumberIn value={editing.caster.LF} onChange={v => setNested('caster', 'LF', v)} placeholder="e.g. 9.0" />
                </Field>
                <Field label="Caster RF (°)"
                  hint="Same procedure as LF. RF caster controls how much the right front gains negative camber when turning left — the key outside tire for oval.">
                  <NumberIn value={editing.caster.RF} onChange={v => setNested('caster', 'RF', v)} placeholder="e.g. 3.0" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="Front Toe (inches)"
                  hint="Total toe across both fronts. Measure at hub height front-of-tire and rear-of-tire. Toe = rear gap minus front gap. Negative = toe-out (fronts point slightly apart). e.g. -0.25 = quarter inch toe-out.">
                  <NumberIn value={editing.toe} onChange={v => set('toe', v)} placeholder="e.g. -0.25" step="0.0625" />
                </Field>
              </div>
            </div>

            {/* Springs */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Spring Rates</h3>
              <div className="ml-row">
                <Field label="LF Spring Rate (lbs/in)"
                  hint="Check the strut box or part number. FCS 1336349 (P71 Police/Taxi) = 475 lbs/in. Aftermarket heavy-duty = 700 lbs/in. Rear P71 coil is fixed at 160 lbs/in.">
                  <NumberIn value={editing.springRate.LF} onChange={v => setNested('springRate', 'LF', v)} placeholder="e.g. 475" step="1" />
                </Field>
                <Field label="RF Spring Rate (lbs/in)"
                  hint="Same as LF — list separately in case they differ.">
                  <NumberIn value={editing.springRate.RF} onChange={v => setNested('springRate', 'RF', v)} placeholder="e.g. 475" step="1" />
                </Field>
              </div>
            </div>

            {/* Shocks */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Shocks / Struts</h3>
              <p className="ml-section-note">Enter part number or name. e.g. "FCS 1336349" or "KYB SR4140 (rating 6)"</p>
              {['LF', 'RF', 'LR', 'RR'].map(pos => (
                <Field key={pos} label={`${pos} Shock`}>
                  <input className="ml-input ml-input-wide" type="text"
                    placeholder="e.g. FCS 1336349"
                    value={editing.shockNotes[pos]}
                    onChange={e => setNested('shockNotes', pos, e.target.value)} />
                </Field>
              ))}
            </div>

            {/* Cold PSI */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Cold Tire Pressures (PSI)</h3>
              <p className="ml-section-note">Measured cold before session, at the inflation temperature above.</p>
              <div className="ml-tire-grid">
                {['LF', 'RF', 'LR', 'RR'].map(pos => (
                  <Field key={pos} label={pos}
                    hint="Use a quality gauge with car sitting still and tires cold (not driven in 2+ hours).">
                    <NumberIn value={editing.coldPsi[pos]} onChange={v => setNested('coldPsi', pos, v)}
                      placeholder="PSI" step="1" min="5" max="60" />
                  </Field>
                ))}
              </div>
            </div>

            {/* Hot PSI */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Hot Tire Pressures (PSI)</h3>
              <p className="ml-section-note">Measured immediately after coming off track — get the gauge on within 2 minutes.</p>
              <div className="ml-tire-grid">
                {['LF', 'RF', 'LR', 'RR'].map(pos => (
                  <Field key={pos} label={pos}
                    hint="Pull straight to the paddock. Check within 1–2 min of getting off track. Let air out if over target — don't add to a hot tire.">
                    <NumberIn value={editing.hotPsi[pos]} onChange={v => setNested('hotPsi', pos, v)}
                      placeholder="PSI" step="1" min="5" max="80" />
                  </Field>
                ))}
              </div>
            </div>

            {/* Pyrometer */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Pyrometer Readings (°F)</h3>
              <p className="ml-section-note">
                Take immediately after session — same stop as hot pressures. Probe the tread surface, not sidewall.
                Inside = edge closest to engine. Outside = edge furthest from engine.
              </p>
              <div className="ml-pyro-grid">
                <div className="ml-pyro-header">
                  <span></span><span>Inside</span><span>Middle</span><span>Outside</span>
                </div>
                {['LF', 'RF', 'LR', 'RR'].map(pos => (
                  <div className="ml-pyro-row" key={pos}>
                    <span className="ml-pyro-pos">{pos}</span>
                    {['inside', 'middle', 'outside'].map(zone => (
                      <NumberIn key={zone}
                        value={editing.tireTemps[pos][zone]}
                        onChange={v => setTireTemp(pos, zone, v)}
                        placeholder="°F" step="1" min="60" max="300" />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* ---- SUSPENSION GEOMETRY ---- */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Suspension Geometry — Model Calibration</h3>
              <p className="ml-section-note">
                One-time measurements per car. Used to calibrate track width, roll center heights, and camber gain coefficients in the physics model.
                Leave blank if not yet measured — fill in at the shop and copy to model later.
              </p>

              {/* Track width */}
              <h4 className="ml-sub-heading">Track Width</h4>
              <div className="ml-row">
                <Field label="Front track width (inches)"
                  hint="Park on flat ground, wheels straight. Mark the center of the tread contact patch on the ground for each front tire (chalk or masking tape). Measure between the two marks. Repeat for rear.">
                  <NumberIn value={editing.trackWidth.front} onChange={v => setNested('trackWidth', 'front', v)} placeholder="e.g. 64" step="0.125" />
                </Field>
                <Field label="Rear track width (inches)"
                  hint="Same method as front. Mark center of rear tread contact patches, measure between marks.">
                  <NumberIn value={editing.trackWidth.rear} onChange={v => setNested('trackWidth', 'rear', v)} placeholder="e.g. 65.125" step="0.125" />
                </Field>
              </div>

              {/* Rear roll center */}
              <h4 className="ml-sub-heading">Rear Roll Center</h4>
              <Field label="Watts link center pivot height from floor (inches)"
                hint="Car at ride height with driver weight (or ~200 lbs on seat). Find the large center pivot bolt on the Watts link — it sits on a bracket on top of the rear axle housing, connecting the two horizontal arms. Measure from the center of that pivot bolt straight down to the floor.">
                <NumberIn value={editing.rearRollCenter} onChange={v => set('rearRollCenter', v)} placeholder="e.g. 14.5" step="0.125" />
              </Field>

              {/* Front SLA heights */}
              <h4 className="ml-sub-heading">Front SLA Ball Joint Heights from Floor</h4>
              <p className="ml-section-note">Car at ride height on flat ground. Measure to the center of each ball joint bolt.</p>
              <div className="ml-row">
                <Field label="LF lower ball joint (inches)"
                  hint="Lower control arm outer end — where the spindle attaches. Measure from center of ball joint stud to floor.">
                  <NumberIn value={editing.lowerBallJoint.LF} onChange={v => setNested('lowerBallJoint', 'LF', v)} placeholder="e.g. 7.75" step="0.125" />
                </Field>
                <Field label="RF lower ball joint (inches)"
                  hint="Same as LF — right front lower control arm outer pivot.">
                  <NumberIn value={editing.lowerBallJoint.RF} onChange={v => setNested('lowerBallJoint', 'RF', v)} placeholder="e.g. 6.75" step="0.125" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="LF upper ball joint (inches)"
                  hint="Upper control arm outer end. Same method — measure center of ball joint stud to floor.">
                  <NumberIn value={editing.upperBallJoint.LF} onChange={v => setNested('upperBallJoint', 'LF', v)} placeholder="e.g. 18.5" step="0.125" />
                </Field>
                <Field label="RF upper ball joint (inches)"
                  hint="Right front upper control arm outer pivot — center of stud to floor.">
                  <NumberIn value={editing.upperBallJoint.RF} onChange={v => setNested('upperBallJoint', 'RF', v)} placeholder="e.g. 17.625" step="0.125" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="LF lower arm inner pivot (inches)"
                  hint="The inner end of the lower control arm — where it bolts to the subframe. If there are two bolts, average their heights. Measure pivot center to floor.">
                  <NumberIn value={editing.lowerArmPivot.LF} onChange={v => setNested('lowerArmPivot', 'LF', v)} placeholder="e.g. 10.0" step="0.125" />
                </Field>
                <Field label="RF lower arm inner pivot (inches)"
                  hint="Same as LF — right front lower arm subframe bolt center to floor.">
                  <NumberIn value={editing.lowerArmPivot.RF} onChange={v => setNested('lowerArmPivot', 'RF', v)} placeholder="e.g. 9.375" step="0.125" />
                </Field>
              </div>
              <Field label="Front wheel center height (inches)"
                hint="Measure from the center of the front hub/axle straight down to the floor. Should be approximately equal to tire radius (~13.5–14&quot; for 235/55R17).">
                <NumberIn value={editing.wheelCenterHeight} onChange={v => set('wheelCenterHeight', v)} placeholder="e.g. 13.0" step="0.125" />
              </Field>

              {/* Droop camber */}
              <h4 className="ml-sub-heading">Droop Camber (Wheels Hanging at Full Droop)</h4>
              <p className="ml-section-note">
                Support car under frame rails on jack stands — NOT under control arms. Front wheels must hang freely.
                Hold a flat plate (cardboard or aluminum) flush against the wheel face, hold phone inclinometer flat against the plate.
              </p>
              <div className="ml-row">
                <Field label="LF camber at full droop (°)"
                  hint="With LF wheel hanging freely at full droop, read camber via phone inclinometer pressed against a flat plate on the wheel face. Negative = top tilts inward.">
                  <NumberIn value={editing.droopCamber.LF} onChange={v => setNested('droopCamber', 'LF', v)} placeholder="e.g. 1.75" />
                </Field>
                <Field label="RF camber at full droop (°)"
                  hint="Same method — RF wheel hanging freely.">
                  <NumberIn value={editing.droopCamber.RF} onChange={v => setNested('droopCamber', 'RF', v)} placeholder="e.g. -1.5" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="LF droop travel (inches)"
                  hint="While on jack stands, measure from wheel center to a fixed chassis reference (fender lip works). Then lower to ride height and measure same distance. The difference is droop travel.">
                  <NumberIn value={editing.droopTravel.LF} onChange={v => setNested('droopTravel', 'LF', v)} placeholder="e.g. 0.5" step="0.125" />
                </Field>
                <Field label="RF droop travel (inches)"
                  hint="Same method — ride height measurement minus full droop measurement.">
                  <NumberIn value={editing.droopTravel.RF} onChange={v => setNested('droopTravel', 'RF', v)} placeholder="e.g. 0.875" step="0.125" />
                </Field>
              </div>

              {/* Bump camber */}
              <h4 className="ml-sub-heading">Bump Camber (Wheel Pushed to Full Bump)</h4>
              <p className="ml-section-note">
                Car on jack stands. Use floor jack under the lower control arm to push wheel into full bump until bumpstop contacts or motion stops.
              </p>
              <div className="ml-row">
                <Field label="LF camber at full bump (°)"
                  hint="Jack under lower control arm until bumpstop is compressed. Measure camber with phone on flat plate against wheel face.">
                  <NumberIn value={editing.bumpCamber.LF} onChange={v => setNested('bumpCamber', 'LF', v)} placeholder="e.g. -3.0" />
                </Field>
                <Field label="RF camber at full bump (°)"
                  hint="Same method — right front wheel pushed to full bump.">
                  <NumberIn value={editing.bumpCamber.RF} onChange={v => setNested('bumpCamber', 'RF', v)} placeholder="e.g. -4.5" />
                </Field>
              </div>
              <div className="ml-row">
                <Field label="LF bump travel (inches)"
                  hint="Using same chassis reference point as droop — measure at ride height then at full bump. The difference is bump travel.">
                  <NumberIn value={editing.bumpTravel.LF} onChange={v => setNested('bumpTravel', 'LF', v)} placeholder="e.g. 2.0" step="0.125" />
                </Field>
                <Field label="RF bump travel (inches)"
                  hint="Same method for right front.">
                  <NumberIn value={editing.bumpTravel.RF} onChange={v => setNested('bumpTravel', 'RF', v)} placeholder="e.g. 2.0" step="0.125" />
                </Field>
              </div>

              {/* Caster camber gain */}
              <h4 className="ml-sub-heading">Caster Camber Gain (at 20° Right Steer)</h4>
              <p className="ml-section-note">
                Car at ride height on flat ground. Turn steering wheel right until front tires are at ~20° steer — use an angle finder on the tire sidewall to confirm. Then measure camber on each front wheel.
              </p>
              <div className="ml-row">
                <Field label="LF camber at 20° right steer (°)"
                  hint="Confirm straight-ahead static camber first (should match your alignment spec). Then turn 20° right and read LF camber the same way — phone on flat plate against wheel face.">
                  <NumberIn value={editing.steerCamber20.LF} onChange={v => setNested('steerCamber20', 'LF', v)} placeholder="e.g. 1.5" />
                </Field>
                <Field label="RF camber at 20° right steer (°)"
                  hint="Same turn — 20° right steer — measure RF camber. RF is the outside tire turning right; it should gain negative camber.">
                  <NumberIn value={editing.steerCamber20.RF} onChange={v => setNested('steerCamber20', 'RF', v)} placeholder="e.g. -4.0" />
                </Field>
              </div>

              {/* CG */}
              <h4 className="ml-sub-heading">CG Height / Ballast</h4>
              <div className="ml-row">
                <Field label="Ride height lowering from stock (inches)"
                  hint="If the car is lowered with cut springs, aftermarket springs, etc. — estimate how many inches lower than stock. Zero if stock height. For every 1 inch lowered, CG drops ~0.65 inches.">
                  <NumberIn value={editing.rideLowering} onChange={v => set('rideLowering', v)} placeholder="0 if stock" step="0.25" />
                </Field>
              </div>
              <Field label="CG / ballast notes">
                <input className="ml-input ml-input-wide" type="text"
                  placeholder="e.g. Roll cage installed, battery moved to trunk"
                  value={editing.cgNotes}
                  onChange={e => set('cgNotes', e.target.value)} />
              </Field>
            </div>

            {/* Notes */}
            <div className="ml-section">
              <h3 className="ml-section-heading">Session Notes</h3>
              <Field label="Notes / Observations">
                <textarea className="ml-textarea"
                  placeholder="Handling notes, what felt tight/loose, changes made during session, lap times, track conditions..."
                  value={editing.notes} onChange={e => set('notes', e.target.value)} rows={4} />
              </Field>
            </div>

            <div className="ml-editor-footer">
              <button className="ml-save-btn ml-save-btn-lg" onClick={saveCar}>Save Car</button>
              <button className="ml-cancel-btn" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}

        {/* ---- VIEW ---- */}
        {viewCar && !editing && (
          <div className="ml-view">
            <div className="ml-view-header">
              <div>
                <h2 className="ml-view-title">{viewCar.title || 'Unnamed Car'}</h2>
                <span className="ml-view-date">{viewCar.date}</span>
              </div>
              <div className="ml-view-actions">
                <button className="ml-edit-btn" onClick={() => editCar(selectedIdx)}>Edit</button>
                <button className={`ml-copy-btn${copied ? ' copied' : ''}`} onClick={() => copyToClipboard(viewCar)}>
                  {copied ? 'Copied!' : 'Copy for Model'}
                </button>
              </div>
            </div>
            <pre className="ml-preview">{formatForModel(viewCar)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
