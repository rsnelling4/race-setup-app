import { useState } from 'react';
import GeometryVisualizer, { GeometryTable } from './GeometryVisualizer';
import GeometryAnalysis from './GeometryAnalysis';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';
import { useSync } from '../utils/SyncContext';

// ─── Empty templates ────────────────────────────────────────────────────────

const EMPTY_SESSION = {
  id: null,
  title: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
  ambient: '',
  inflationTemp: '',
  camber: { LF: '', RF: '' },
  caster: { LF: '', RF: '' },
  toe: '',
  rearToe: '',
  springRate: { LF: '', RF: '', LR: '' },
  shocks: { LF: '', RF: '', LR: '', RR: '' },   // shockLabel strings
  shockAdj:  { LF: '', RF: '', LR: '', RR: '' }, // damper click/position (numeric)
  coldPsi: { LF: '', RF: '', LR: '', RR: '' },
  hotPsi:  { LF: '', RF: '', LR: '', RR: '' },
  tireTemps: {
    LF: { inside: '', middle: '', outside: '' },
    RF: { inside: '', middle: '', outside: '' },
    LR: { inside: '', middle: '', outside: '' },
    RR: { inside: '', middle: '', outside: '' },
  },
  lapTimes: '',
  bestLap:  '',
};

const EMPTY_GEO = {
  id: null,
  title: '',
  date: new Date().toISOString().slice(0, 10),
  trackType:         'oval',  // 'oval' | 'figure8'
  notes: '',
  // ── Static alignment (current settings at time of measurement) ──
  camber:            { LF: '', RF: '' },
  caster:            { LF: '', RF: '' },
  toe:               '',       // front total toe, inches (negative = toe-out)
  rearToe:           '',
  // ── Ride heights (inches from floor to rocker panel or consistent reference) ──
  rideHeight:        { LF: '', RF: '', LR: '', RR: '' },
  // ── Shock physical measurements ──
  shockFreeLength:   { LF: '', RF: '', LR: '', RR: '' },  // inches, fully extended
  shockInstalled:    { LF: '', RF: '', LR: '', RR: '' },  // inches, installed at ride height
  shockBumpGap:      { LF: '', RF: '', LR: '', RR: '' },  // inches, gap to bumpstop at ride height
  // ── Suspension hardpoints ──
  trackWidth:        { front: '', rear: '' },
  rearRollCenter:    '',
  rearSpringBase:    '',
  lowerBallJoint:    { LF: '', RF: '' },
  upperBallJoint:    { LF: '', RF: '' },
  lowerArmPivot:     { LF: '', RF: '' },
  upperArmPivot:     { LF: '', RF: '' },
  springPickup:      { LF: '', RF: '' },
  wheelCenterHeight: '',
  // ── Suspension travel measurements ──
  droopCamber:       { LF: '', RF: '' },
  droopTravel:       { LF: '', RF: '' },
  bumpCamber:        { LF: '', RF: '' },
  bumpTravel:        { LF: '', RF: '' },
  steerCamber20:     { LF: '', RF: '' },
  // ── Ride height / ARB ──
  rideLowering:      '',
  arbDiameter:       '',
  cgNotes:           '',
};

// ─── Persistence ─────────────────────────────────────────────────────────────

function dc(o) { return JSON.parse(JSON.stringify(o)); }

// ─── Format for model ─────────────────────────────────────────────────────────

function v(val) { return (val !== '' && val !== undefined && val !== null) ? val : '—'; }

function formatSession(car) {
  const lines = [
    `=== ${car.title || 'Unnamed Car'} — ${car.date} ===`,
    '',
    `Ambient Temp: ${v(car.ambient)}°F`,
    `Tires Set At (inflation temp): ${v(car.inflationTemp)}°F`,
    '',
    '--- Alignment ---',
    `Camber:    LF ${v(car.camber.LF)}°   RF ${v(car.camber.RF)}°`,
    `Caster:    LF ${v(car.caster.LF)}°   RF ${v(car.caster.RF)}°`,
    `Front Toe: ${v(car.toe)}" (negative = toe-out)`,
    `Rear Toe:  ${v(car.rearToe)}" (negative = toe-out)`,
    '',
    '--- Springs ---',
    `LF ${v(car.springRate.LF)} lbs/in   RF ${v(car.springRate.RF)} lbs/in   Rear ${v(car.springRate.LR)} lbs/in`,
    '',
    '--- Shocks / Struts ---',
    `LF: ${v(car.shocks.LF)}  adj: ${v(car.shockAdj?.LF)}`,
    `RF: ${v(car.shocks.RF)}  adj: ${v(car.shockAdj?.RF)}`,
    `LR: ${v(car.shocks.LR)}  adj: ${v(car.shockAdj?.LR)}`,
    `RR: ${v(car.shocks.RR)}  adj: ${v(car.shockAdj?.RR)}`,
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
    '',
    '--- Lap Times ---',
    `Best: ${v(car.bestLap)}s`,
    `All laps: ${v(car.lapTimes)}`,
  ];
  if (car.notes.trim()) lines.push('', '--- Notes ---', car.notes.trim());
  return lines.join('\n');
}

function formatGeo(car) {
  const lines = [
    `=== ${car.title || 'Unnamed Car'} — Suspension Geometry — ${car.date} ===`,
    `Track type: ${car.trackType === 'figure8' ? 'Figure-8' : 'Oval'}`,
    '',
    '--- Static Alignment ---',
    `Camber:    LF ${v(car.camber?.LF)}°   RF ${v(car.camber?.RF)}°`,
    `Caster:    LF ${v(car.caster?.LF)}°   RF ${v(car.caster?.RF)}°`,
    `Front toe: ${v(car.toe)}"   Rear toe: ${v(car.rearToe)}"`,
    '',
    '--- Ride Heights (floor to rocker panel, inches) ---',
    `  LF ${v(car.rideHeight?.LF)}"   RF ${v(car.rideHeight?.RF)}"`,
    `  LR ${v(car.rideHeight?.LR)}"   RR ${v(car.rideHeight?.RR)}"`,
    '',
    '--- Shock Physical Measurements ---',
    `  Free length (extended):   LF ${v(car.shockFreeLength?.LF)}"  RF ${v(car.shockFreeLength?.RF)}"  LR ${v(car.shockFreeLength?.LR)}"  RR ${v(car.shockFreeLength?.RR)}"`,
    `  Installed length:         LF ${v(car.shockInstalled?.LF)}"  RF ${v(car.shockInstalled?.RF)}"  LR ${v(car.shockInstalled?.LR)}"  RR ${v(car.shockInstalled?.RR)}"`,
    `  Bumpstop gap at ride ht:  LF ${v(car.shockBumpGap?.LF)}"  RF ${v(car.shockBumpGap?.RF)}"  LR ${v(car.shockBumpGap?.LR)}"  RR ${v(car.shockBumpGap?.RR)}"`,
    '',
    `Track width (front): ${v(car.trackWidth.front)}"   rear: ${v(car.trackWidth.rear)}"`,
    `Rear roll center height (Watts pivot): ${v(car.rearRollCenter)}"`,
    `Rear spring base width: ${v(car.rearSpringBase)}"`,
    '',
    'Front SLA ball joint heights from floor:',
    `  LF lower BJ: ${v(car.lowerBallJoint.LF)}"   RF lower BJ: ${v(car.lowerBallJoint.RF)}"`,
    `  LF upper BJ: ${v(car.upperBallJoint.LF)}"   RF upper BJ: ${v(car.upperBallJoint.RF)}"`,
    `  LF lower arm inner pivot: ${v(car.lowerArmPivot.LF)}"   RF lower arm inner pivot: ${v(car.lowerArmPivot.RF)}"`,
    `  LF upper arm inner pivot: ${v(car.upperArmPivot?.LF)}"   RF upper arm inner pivot: ${v(car.upperArmPivot?.RF)}"`,
    `  LF spring pickup from pivot: ${v(car.springPickup?.LF)}"   RF spring pickup from pivot: ${v(car.springPickup?.RF)}"`,
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
    `Front ARB diameter: ${v(car.arbDiameter)}"`,
  ];
  if (car.cgNotes?.trim()) lines.push(`Notes: ${car.cgNotes.trim()}`);
  if (car.notes?.trim())   lines.push('', '--- Notes ---', car.notes.trim());
  return lines.join('\n');
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-field">
      <div className="ml-field-label">
        {label}
        {hint && <button className="ml-hint-btn" onClick={() => setOpen(o => !o)}>?</button>}
      </div>
      {hint && open && <div className="ml-hint">{hint}</div>}
      {children}
    </div>
  );
}

function NumIn({ value, onChange, placeholder, step = '0.1', min, max }) {
  return (
    <input type="number" className="ml-input"
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '—'} step={step} min={min} max={max} />
  );
}

// ─── Generic list editor (shared by both session and geo lists) ───────────────

function ListEditor({ items, setItems, emptyTemplate, renderEditor, renderView, formatFn, label }) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editing, setEditing]         = useState(null);
  const [copied, setCopied]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  function newItem() {
    setEditing({ ...dc(emptyTemplate), id: Date.now(), date: new Date().toISOString().slice(0, 10) });
    setSelectedIdx(null);
  }

  function editItem(idx) {
    const merged = { ...dc(emptyTemplate), ...dc(items[idx]) };
    // deep-merge nested objects
    for (const key of Object.keys(emptyTemplate)) {
      if (emptyTemplate[key] && typeof emptyTemplate[key] === 'object' && !Array.isArray(emptyTemplate[key])) {
        merged[key] = { ...emptyTemplate[key], ...(items[idx][key] || {}) };
      }
    }
    if (emptyTemplate.tireTemps) {
      for (const pos of ['LF', 'RF', 'LR', 'RR']) {
        merged.tireTemps[pos] = { ...emptyTemplate.tireTemps[pos], ...(items[idx].tireTemps?.[pos] || {}) };
      }
    }
    setEditing(merged);
    setSelectedIdx(idx);
  }

  function saveItem() {
    if (!editing) return;
    const updated = [...items];
    if (selectedIdx !== null) {
      updated[selectedIdx] = editing;
      setSelectedIdx(selectedIdx);
    } else {
      updated.push(editing);
      setSelectedIdx(updated.length - 1);
    }
    setItems(updated);
    setEditing(null);
  }

  function deleteItem(idx) {
    setItems(items.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setDeleteConfirm(null);
    setEditing(null);
  }

  function copyToClipboard(item) {
    navigator.clipboard.writeText(formatFn(item)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const viewItem = selectedIdx !== null && !editing ? items[selectedIdx] : null;

  return (
    <div className="ml-page">
      {/* Sidebar */}
      <div className="ml-sidebar">
        <div className="ml-sidebar-header">
          <span className="ml-sidebar-title">{label}</span>
          <button className="ml-new-btn" onClick={newItem}>+ New</button>
        </div>
        {items.length === 0 && (
          <div className="ml-empty">Nothing saved yet.<br />Tap "+ New" to start.</div>
        )}
        {items.map((item, idx) => (
          <button key={item.id} className={`ml-car-item${selectedIdx === idx ? ' active' : ''}`}
            onClick={() => editItem(idx)}>
            <span className="ml-car-name">{item.title || 'Unnamed'}</span>
            <span className="ml-car-date">{item.date}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ml-content">
        {!editing && !viewItem && (
          <div className="ml-splash"><p>Select an entry or tap "+ New".</p></div>
        )}

        {editing && (
          <div className="ml-editor">
            <div className="ml-editor-header">
              <div className="ml-section-title">{selectedIdx !== null ? 'Edit' : 'New'}</div>
              <div className="ml-editor-actions">
                <button className="ml-save-btn" onClick={saveItem}>Save</button>
                <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                {selectedIdx !== null && (
                  deleteConfirm === selectedIdx
                    ? <>
                        <span className="ml-delete-confirm-text">Delete?</span>
                        <button className="ml-delete-confirm-btn" onClick={() => deleteItem(selectedIdx)}>Yes</button>
                        <button className="ml-cancel-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                      </>
                    : <button className="ml-delete-btn" onClick={() => setDeleteConfirm(selectedIdx)}>Delete</button>
                )}
              </div>
            </div>
            {renderEditor(editing, setEditing, saveItem)}
            <div className="ml-editor-footer">
              <button className="ml-save-btn ml-save-btn-lg" onClick={saveItem}>Save</button>
              <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {viewItem && !editing && (
          <div className="ml-view">
            <div className="ml-view-header">
              <div>
                <h2 className="ml-view-title">{viewItem.title || 'Unnamed'}</h2>
                <span className="ml-view-date">{viewItem.date}</span>
              </div>
              <div className="ml-view-actions">
                <button className="ml-edit-btn" onClick={() => editItem(selectedIdx)}>Edit</button>
                <button className={`ml-copy-btn${copied ? ' copied' : ''}`} onClick={() => copyToClipboard(viewItem)}>
                  {copied ? 'Copied!' : 'Copy for Model'}
                </button>
              </div>
            </div>
            {renderView ? renderView(viewItem) : <pre className="ml-preview">{formatFn(viewItem)}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session editor ───────────────────────────────────────────────────────────

function SessionEditor({ editing, setEditing }) {
  function set(field, value)              { setEditing(e => ({ ...e, [field]: value })); }
  function setN(parent, key, value)       { setEditing(e => ({ ...e, [parent]: { ...e[parent], [key]: value } })); }
  function setTemp(pos, zone, value)      { setEditing(e => ({ ...e, tireTemps: { ...e.tireTemps, [pos]: { ...e.tireTemps[pos], [zone]: value } } })); }

  const shockOptions = (corner) => {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    return list;
  };

  return (
    <>
      {/* Identity */}
      <div className="ml-section">
        <div className="ml-row">
          <Field label="Car Name / Title">
            <input className="ml-input ml-input-wide" type="text" placeholder="e.g. Pete's Car"
              value={editing.title} onChange={e => set('title', e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="ml-input" type="date" value={editing.date} onChange={e => set('date', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Environment */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Environment</h3>
        <div className="ml-row">
          <Field label="Ambient Temp (°F)" hint="Outside air temperature at time of session. Phone weather app works.">
            <NumIn value={editing.ambient} onChange={v => set('ambient', v)} placeholder="e.g. 75" step="1" />
          </Field>
          <Field label="Tires Set At (°F)" hint="Temperature where you set cold pressures (usually the shop). Model uses this to back-calculate ideal cold PSI.">
            <NumIn value={editing.inflationTemp} onChange={v => set('inflationTemp', v)} placeholder="e.g. 68" step="1" />
          </Field>
        </div>
      </div>

      {/* Alignment */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Alignment</h3>
        <div className="ml-row">
          <Field label="Camber LF (°)" hint="Tilt of tire top relative to vertical. Negative = top tilts inward. Measured by alignment machine or phone inclinometer on a flat plate held flush against the wheel face.">
            <NumIn value={editing.camber.LF} onChange={v => setN('camber', 'LF', v)} placeholder="e.g. 2.75" />
          </Field>
          <Field label="Camber RF (°)" hint="Same as LF. RF typically more negative on oval — it is the outside tire in left turns.">
            <NumIn value={editing.camber.RF} onChange={v => setN('camber', 'RF', v)} placeholder="e.g. -2.25" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="Caster LF (°)" hint="Kingpin tilt from side view. Alignment machine: turn wheel 20° in, zero gauge, turn 20° out, read caster. Higher = more camber gain in turns. Typical P71 range 3–9°.">
            <NumIn value={editing.caster.LF} onChange={v => setN('caster', 'LF', v)} placeholder="e.g. 9.0" />
          </Field>
          <Field label="Caster RF (°)" hint="RF caster controls how much the outside front gains negative camber turning left — the critical oval tire. Higher RF caster = more dynamic camber on that wheel.">
            <NumIn value={editing.caster.RF} onChange={v => setN('caster', 'RF', v)} placeholder="e.g. 3.0" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="Front Toe (inches)" hint="Total toe across both front tires measured at hub height. Use a tape or toe plates: measure from the leading edge of each rim to a straight reference, then from the trailing edge — the difference is toe per side, double it for total. Negative = toe-out (fronts spread apart at front). e.g. -0.25 = quarter inch total toe-out.">
            <NumIn value={editing.toe} onChange={v => set('toe', v)} placeholder="e.g. -0.25" step="0.0625" />
          </Field>
          <Field label="Rear Toe (inches)" hint="Total toe across both rear tires. Same measurement method as front — tape or toe plates at hub height on the rear wheels. Negative = toe-out. Stock P71 rear is typically 0 to +0.125 in (slight toe-in). Rear toe-out causes oversteer.">
            <NumIn value={editing.rearToe ?? ''} onChange={v => set('rearToe', v)} placeholder="e.g. 0.0" step="0.0625" />
          </Field>
        </div>
      </div>

      {/* Shocks / Springs */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Shocks / Struts</h3>
        <p className="ml-section-note">Front selections auto-fill spring rate when the strut includes a spring.</p>
        {['LF', 'RF', 'LR', 'RR'].map(corner => {
          const list = shockOptions(corner);
          const isFront = corner === 'LF' || corner === 'RF';
          return (
            <div key={corner} className="ml-field">
              <div className="ml-field-label">{corner} {isFront ? 'Strut' : 'Shock'}</div>
              <select className="ml-input ml-select"
                value={editing.shocks[corner]}
                onChange={e => {
                  const label = e.target.value;
                  setEditing(prev => {
                    const updated = { ...prev, shocks: { ...prev.shocks, [corner]: label } };
                    if (isFront) {
                      const found = FRONT_STRUTS.find(s => shockLabel(s) === label);
                      if (found?.springRate) {
                        updated.springRate = { ...prev.springRate, [corner]: String(found.springRate) };
                      }
                    }
                    return updated;
                  });
                }}>
                <option value="">— Select —</option>
                {list.map(s => (
                  <option key={s.part} value={shockLabel(s)}>
                    {shockLabel(s)} — {s.use}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Shock adjustment */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Damper Adjustment (click / position)</h3>
        <p className="ml-section-note">
          Record the actual click or position number set at the track. Lower number = stiffer on most adjustable shocks. Leave blank if non-adjustable.
        </p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(corner => (
            <Field key={corner} label={corner}
              hint={`Record the adjuster position for ${corner}. On most adjustable shocks: turn fully clockwise (stiff), then count clicks out counterclockwise. Write down that number. Some shocks label the knob 1–10. Capture whatever the unit uses so you can reproduce it.`}>
              <NumIn value={editing.shockAdj?.[corner] ?? ''} onChange={v => setN('shockAdj', corner, v)} placeholder="e.g. 4" step="1" min="0" max="20" />
            </Field>
          ))}
        </div>
      </div>

      {/* Spring rates */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Spring Rates</h3>
        <p className="ml-section-note">Front auto-filled from strut selection above if applicable. Override if needed. Rear rate is critical for roll stiffness and LLTD calculations.</p>
        <div className="ml-row">
          <Field label="LF (lbs/in)" hint="Front left spring rate. On a P71 strut assembly the spring is integrated — rate depends on which strut is installed (475 = Police/Taxi, 440 = Base, 700 = Heavy Duty). Confirm with strut part number.">
            <select className="ml-input ml-select"
              value={editing.springRate.LF}
              onChange={e => setN('springRate', 'LF', e.target.value)}>
              <option value="">— Select —</option>
              <option value="700">700 lbs/in — Heavy Duty</option>
              <option value="475">475 lbs/in — Police/Taxi</option>
              <option value="440">440 lbs/in — Base/LX</option>
            </select>
          </Field>
          <Field label="RF (lbs/in)" hint="Front right spring rate. Same options as LF — match the installed strut assembly.">
            <select className="ml-input ml-select"
              value={editing.springRate.RF}
              onChange={e => setN('springRate', 'RF', e.target.value)}>
              <option value="">— Select —</option>
              <option value="700">700 lbs/in — Heavy Duty</option>
              <option value="475">475 lbs/in — Police/Taxi</option>
              <option value="440">440 lbs/in — Base/LX</option>
            </select>
          </Field>
          <Field label="Rear (lbs/in)"
            hint="Rear coil spring rate. P71 stock rear = 160 lbs/in. This feeds directly into rear roll stiffness and front/rear elastic load transfer split (LLTD). To measure: remove spring, compress it a known distance with a known weight (e.g. hang a 160 lb weight, measure deflection — rate = load ÷ deflection). Or use published part number data.">
            <select className="ml-input ml-select"
              value={editing.springRate.LR ?? ''}
              onChange={e => setN('springRate', 'LR', e.target.value)}>
              <option value="">— Select —</option>
              <option value="200">200 lbs/in — Heavy Duty / Police</option>
              <option value="160">160 lbs/in — Stock P71</option>
              <option value="140">140 lbs/in — Soft / Base</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Cold PSI */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Cold Tire Pressures (PSI)</h3>
        <p className="ml-section-note">Measured cold before session, at the inflation temperature above.</p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos} hint="Quality gauge, car sitting still, tires cold (not driven in 2+ hours).">
              <NumIn value={editing.coldPsi[pos]} onChange={v => setN('coldPsi', pos, v)} placeholder="PSI" step="1" min="5" max="60" />
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
            <Field key={pos} label={pos} hint="Pull straight to paddock. Check within 1–2 min of getting off track.">
              <NumIn value={editing.hotPsi[pos]} onChange={v => setN('hotPsi', pos, v)} placeholder="PSI" step="1" min="5" max="80" />
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
                <NumIn key={zone} value={editing.tireTemps[pos][zone]}
                  onChange={v => setTemp(pos, zone, v)} placeholder="°F" step="1" min="60" max="300" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Lap Times */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Lap Times</h3>
        <p className="ml-section-note">Used to validate model accuracy and track progress across sessions.</p>
        <div className="ml-row">
          <Field label="Best lap (seconds)"
            hint="Your single fastest lap of the session. e.g. 17.42. Record from transponder readout, timing app, or stopwatch. This is the primary model calibration reference — the model targets this number.">
            <NumIn value={editing.bestLap ?? ''} onChange={v => set('bestLap', v)} placeholder="e.g. 17.4" step="0.01" min="10" max="120" />
          </Field>
        </div>
        <Field label="All lap times (comma-separated)"
          hint="Paste all lap times from the session. e.g. 17.8, 17.4, 17.6, 17.5. Used to see consistency and tire fade trends across the session.">
          <textarea className="ml-textarea" rows={2}
            placeholder="e.g. 17.8, 17.4, 17.6, 17.5, 17.7"
            value={editing.lapTimes ?? ''} onChange={e => set('lapTimes', e.target.value)} />
        </Field>
      </div>

      {/* Notes */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Session Notes</h3>
        <Field label="Notes / Observations">
          <textarea className="ml-textarea" rows={4}
            placeholder="Handling notes, tight/loose feel, changes made during session, track conditions..."
            value={editing.notes} onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </>
  );
}

// ─── Geometry editor ──────────────────────────────────────────────────────────

function GeoEditor({ editing, setEditing }) {
  function set(field, value)        { setEditing(e => ({ ...e, [field]: value })); }
  function setN(parent, key, value) { setEditing(e => ({ ...e, [parent]: { ...e[parent], [key]: value } })); }

  return (
    <>
      {/* Identity */}
      <div className="ml-section">
        <div className="ml-row">
          <Field label="Car Name / Title">
            <input className="ml-input ml-input-wide" type="text" placeholder="e.g. Pete's Car"
              value={editing.title} onChange={e => set('title', e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="ml-input" type="date" value={editing.date} onChange={e => set('date', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Track Type */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Track Type</h3>
        <Field label="Racing format"
          hint="Select the track type this geometry profile is tuned for. Oval analysis uses asymmetric camber targets (RF −2°, LF +0.75°) and left-turn-only caster/LLTD targets. Figure-8 analysis uses symmetric targets for both left and right turns — RF and LF both need similar negative camber.">
          <select className="ml-input ml-select"
            value={editing.trackType ?? 'oval'}
            onChange={e => set('trackType', e.target.value)}>
            <option value="oval">Oval (left-turn only)</option>
            <option value="figure8">Figure-8 (left and right turns)</option>
          </select>
        </Field>
      </div>

      {/* Static Alignment */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Static Alignment (Current Settings)</h3>
        <p className="ml-section-note">
          Record the current alignment settings at the time of measurement. These feed directly into the camber chain analysis — without them the model uses default estimates.
        </p>
        <div className="ml-row">
          <Field label="LF camber (°)"
            hint="Tilt of the LF tire top relative to vertical. Negative = top tilts inward. Measured at the alignment rack or with a phone inclinometer on a flat plate held flush against the wheel face, car at ride height with driver weight in seat. Oval typical: +2° to +3° static (body roll droop subtracts ~1.4° dynamically). Figure-8: −1° to −2°.">
            <NumIn value={editing.camber?.LF ?? ''} onChange={v => setN('camber', 'LF', v)} placeholder="e.g. 2.75" />
          </Field>
          <Field label="RF camber (°)"
            hint="Tilt of the RF tire top. For oval: RF needs negative static camber, typically −2° to −3.5° with camber bolt installed. For figure-8: −1.5° to −2.5°. Negative = top leans inward. The model back-calculates the ideal value from your geometry — enter what the car is currently set to.">
            <NumIn value={editing.camber?.RF ?? ''} onChange={v => setN('camber', 'RF', v)} placeholder="e.g. -2.25" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF caster (°)"
            hint="Kingpin tilt from side view. Measured at alignment rack: turn wheel 20° in, zero gauge, turn 20° out, read caster. On a P71, LF caster is typically set lower than RF for oval (3–5°). Higher caster increases camber gain per degree of steer, but on a tight oval the steer angle is small so the effect is limited.">
            <NumIn value={editing.caster?.LF ?? ''} onChange={v => setN('caster', 'LF', v)} placeholder="e.g. 3.5" />
          </Field>
          <Field label="RF caster (°)"
            hint="RF caster controls mechanical trail (steering feel/return) and small amount of camber gain. Typical oval: 5–7° RF. Higher RF caster (7–9°) on road courses where steer angles are larger. For this oval's ~3.77° apex steer, each degree of RF caster contributes only 0.136° of camber gain — enter current setting so the model can calculate actual contribution.">
            <NumIn value={editing.caster?.RF ?? ''} onChange={v => setN('caster', 'RF', v)} placeholder="e.g. 5.0" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="Front toe (inches, total)"
            hint="Total front toe across both tires measured at hub height. Use toe plates or a tape: measure from leading edge of each rim to a straight reference, then trailing edge — difference per side × 2 = total. Negative = toe-out (fronts spread apart at front of car). Oval typical: −0.125 to −0.25 inch toe-out. Zero at center.">
            <NumIn value={editing.toe ?? ''} onChange={v => set('toe', v)} placeholder="e.g. -0.25" step="0.0625" />
          </Field>
          <Field label="Rear toe (inches, total)"
            hint="Total rear toe. Same measurement method. Rear toe-in is stable (stock P71 ≈ 0 to +0.125 inch). Rear toe-out causes oversteer — avoid unless intentional. Measured the same way as front.">
            <NumIn value={editing.rearToe ?? ''} onChange={v => set('rearToe', v)} placeholder="e.g. 0.0" step="0.0625" />
          </Field>
        </div>
      </div>

      {/* Ride Heights */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Ride Heights (Floor to Reference Point)</h3>
        <p className="ml-section-note">
          Car at race ride height on flat ground, driver weight (~200 lbs) on seat. Measure from the floor straight up to a consistent reference point — the bottom of the rocker panel at a fixed location works well. Take all four corners with the car stationary. Used to compute suspension travel remaining, spring compression, rake angle, and CG height offset.
        </p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={`${pos} ride height (inches)`}
              hint={`Measure at the same reference point every time — bottom of rocker panel directly below the ${pos} door hinge is a reliable spot. Write the exact reference location in Notes so future measurements are consistent. ${pos === 'RF' || pos === 'RR' ? 'Right side typically sits lower than left on an oval setup.' : ''}`}>
              <NumIn value={editing.rideHeight?.[pos] ?? ''} onChange={v => setN('rideHeight', pos, v)} placeholder="e.g. 5.5" step="0.125" />
            </Field>
          ))}
        </div>
        {(() => {
          const lf = parseFloat(editing.rideHeight?.LF) || 0;
          const rf = parseFloat(editing.rideHeight?.RF) || 0;
          const lr = parseFloat(editing.rideHeight?.LR) || 0;
          const rr = parseFloat(editing.rideHeight?.RR) || 0;
          if (lf + rf + lr + rr < 1) return null;
          const frontRake = lf > 0 && rf > 0 ? ((lf + rf) / 2 - (lr + rr) / 2).toFixed(2) : '—';
          const sideSplit = lf > 0 && rf > 0 ? ((lf + lr) / 2 - (rf + rr) / 2).toFixed(2) : '—';
          return (
            <div className="ml-section-note" style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
              Front avg: {lf > 0 && rf > 0 ? ((lf + rf) / 2).toFixed(2) : '—'}"  |  Rear avg: {lr > 0 && rr > 0 ? ((lr + rr) / 2).toFixed(2) : '—'}"  |  Rake (F−R): {frontRake}"  |  L−R split: {sideSplit}"
            </div>
          );
        })()}
      </div>

      {/* Shock Physical Measurements */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Shock / Strut Physical Measurements</h3>
        <p className="ml-section-note">
          These measurements allow the model to determine how much suspension travel remains before hitting the bumpstop, whether the shock is in its usable stroke range at ride height, and whether spring rate changes will run the shock out of travel. Measure with the car at race ride height.
        </p>

        <h4 style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, margin: '12px 0 6px' }}>Free Length — Fully Extended (inches)</h4>
        <p className="ml-section-note">Remove shock from car, extend fully, measure eye-to-eye (or mounting face to mounting face). This is the maximum stroke reference.</p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos}
              hint={`Detach the ${pos} shock/strut from both mounts. Extend it fully (pull apart until it stops). Measure from the center of the upper mount hole to the center of the lower mount hole (eye-to-eye), or mounting face to mounting face if stud-mounted. This gives you the extended length. Compressed length = extended minus stroke. The difference between extended and installed length is the current shaft compression.`}>
              <NumIn value={editing.shockFreeLength?.[pos] ?? ''} onChange={v => setN('shockFreeLength', pos, v)} placeholder="e.g. 14.5" step="0.125" />
            </Field>
          ))}
        </div>

        <h4 style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, margin: '12px 0 6px' }}>Installed Length at Ride Height (inches)</h4>
        <p className="ml-section-note">Car at race ride height. Measure the shock eye-to-eye (or mount-to-mount) while installed. Shaft compression = free length minus installed length.</p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos}
              hint={`Car at race ride height, driver weight in seat. Measure the ${pos} shock from upper mount center to lower mount center while installed in the car. Use a tape measure or caliper. This tells you how much of the stroke the shock has already used at ride height — the remaining droop travel is: installed minus compressed (minimum) length.`}>
              <NumIn value={editing.shockInstalled?.[pos] ?? ''} onChange={v => setN('shockInstalled', pos, v)} placeholder="e.g. 12.0" step="0.125" />
            </Field>
          ))}
        </div>

        <h4 style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, margin: '12px 0 6px' }}>Bumpstop Gap at Ride Height (inches)</h4>
        <p className="ml-section-note">Distance from the shock piston or bump rubber to contact at ride height. This is how much jounce travel is available before hitting the stop. Critical for spring rate selection.</p>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos}
              hint={`With the car at race ride height, measure the gap between the bumpstop rubber (on the shock shaft or chassis) and the contact surface it would hit when fully compressed. On the P71 front strut: the bump rubber is on the strut shaft above the top mount — measure from the top of the bump rubber to the lower surface of the strut mount bearing. On rear shocks: the bump rubber is typically on the axle or frame — measure from rubber face to contact point. A gap of 1.0–1.5" is typical; less than 0.5" means you are near the stop at race height.`}>
              <NumIn value={editing.shockBumpGap?.[pos] ?? ''} onChange={v => setN('shockBumpGap', pos, v)} placeholder="e.g. 1.25" step="0.125" />
            </Field>
          ))}
        </div>

        {(() => {
          const corners = ['LF', 'RF', 'LR', 'RR'];
          const rows = corners.map(pos => {
            const free = parseFloat(editing.shockFreeLength?.[pos]);
            const inst = parseFloat(editing.shockInstalled?.[pos]);
            const gap  = parseFloat(editing.shockBumpGap?.[pos]);
            if (!free || !inst) return null;
            const compression = (free - inst).toFixed(2);
            const jounceLeft = gap ? parseFloat(gap).toFixed(2) : '—';
            return { pos, compression, jounceLeft };
          }).filter(Boolean);
          if (rows.length === 0) return null;
          return (
            <div className="ml-section-note" style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 11 }}>
              {rows.map(r => (
                <div key={r.pos}>{r.pos}: shaft compressed {r.compression}" from free length — {r.jounceLeft}" jounce to bumpstop</div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Track Width */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Track Width</h3>
        <div className="ml-row">
          <Field label="Front track width (inches)"
            hint="Park on flat ground, wheels straight ahead. Lay a straightedge or tape on the ground beside each front tire. Mark the center of the contact patch (midpoint of tread width) with chalk or tape on both sides. Measure between the two centerline marks. P71 stock ≈ 64″.">
            <NumIn value={editing.trackWidth.front} onChange={v => setN('trackWidth', 'front', v)} placeholder="e.g. 64" step="0.125" />
          </Field>
          <Field label="Rear track width (inches)"
            hint="Same method as front — mark the center of each rear contact patch and measure between the marks. P71 rear is slightly wider than front due to wheel offset. Stock ≈ 65.125″.">
            <NumIn value={editing.trackWidth.rear} onChange={v => setN('trackWidth', 'rear', v)} placeholder="e.g. 65.125" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Rear Roll Center */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Rear Roll Center &amp; Spring Base</h3>
        <Field label="Watts link center pivot height from floor (inches)"
          hint="Car at ride height with driver weight (~200 lbs on seat). Crawl under the rear of the car and locate the Watts link center pivot bolt — it's on a bracket mounted on the axle housing, centered left-to-right, connecting the two horizontal balance arms. Measure from the center of that bolt straight down to the floor. P71 stock ≈ 14.5″. This directly sets the rear roll center height in the model — wrong value = wrong rear LLTD.">
          <NumIn value={editing.rearRollCenter} onChange={v => set('rearRollCenter', v)} placeholder="e.g. 14.5" step="0.125" />
        </Field>
        <Field label="Rear spring base width (inches)"
          hint="Distance between the centers of the two rear coil spring perches on the axle tube. Measure along the axle from the center of the left spring perch cup to the center of the right spring perch cup. This is narrower than the track width. Wider base = more rear roll stiffness, which shifts LLTD toward the rear (more oversteer tendency). Used directly in the roll stiffness model.">
          <NumIn value={editing.rearSpringBase} onChange={v => set('rearSpringBase', v)} placeholder="e.g. 42" step="0.25" />
        </Field>
      </div>

      {/* Front SLA */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Front SLA Hardpoint Heights</h3>
        <p className="ml-section-note">
          Car at ride height on flat ground with driver weight (~200 lbs) on seat. All measurements are from the center of the joint/pivot bolt straight down to the floor. These four hardpoints define the instant center and roll center height — the most accuracy-critical geometry measurements in the model.
        </p>
        <div className="ml-row">
          <Field label="LF lower ball joint (inches)"
            hint="The lower ball joint is at the outer end of the lower control arm where it connects to the steering knuckle/spindle. On the P71, look at the bottom-outside corner of the front hub assembly. The ball joint stud points downward through the knuckle. Measure from the center of that stud (top of the stud nut, minus half the stud exposed length) down to the floor. Typical P71 ≈ 7–8″.">
            <NumIn value={editing.lowerBallJoint.LF} onChange={v => setN('lowerBallJoint', 'LF', v)} placeholder="e.g. 7.75" step="0.125" />
          </Field>
          <Field label="RF lower ball joint (inches)"
            hint="Same as LF lower ball joint — right side. The RF may sit slightly lower than LF due to asymmetric caster settings. Measure stud center to floor.">
            <NumIn value={editing.lowerBallJoint.RF} onChange={v => setN('lowerBallJoint', 'RF', v)} placeholder="e.g. 6.75" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF upper ball joint (inches)"
            hint="The upper ball joint is at the outer end of the upper control arm, connecting to the top of the steering knuckle. On the P71 SLA, look directly above the lower ball joint at the top of the hub assembly. The stud points upward. Measure from stud center to floor. Typical P71 ≈ 17–19″.">
            <NumIn value={editing.upperBallJoint.LF} onChange={v => setN('upperBallJoint', 'LF', v)} placeholder="e.g. 18.5" step="0.125" />
          </Field>
          <Field label="RF upper ball joint (inches)"
            hint="Same as LF upper ball joint — right side. Stud center to floor.">
            <NumIn value={editing.upperBallJoint.RF} onChange={v => setN('upperBallJoint', 'RF', v)} placeholder="e.g. 17.625" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF lower arm inner pivot (inches)"
            hint="The inner end of the lower control arm where it bolts to the K-member/subframe. The P71 lower arm uses two bolt pivot — measure the height of the midpoint between the two bolts. Use a straightedge or plumb bob from the bolt center to the floor. Typical P71 ≈ 9–11″.">
            <NumIn value={editing.lowerArmPivot.LF} onChange={v => setN('lowerArmPivot', 'LF', v)} placeholder="e.g. 10.0" step="0.125" />
          </Field>
          <Field label="RF lower arm inner pivot (inches)"
            hint="Same as LF lower arm inner pivot — right side. Measure midpoint of the two pivot bolt centers to floor.">
            <NumIn value={editing.lowerArmPivot.RF} onChange={v => setN('lowerArmPivot', 'RF', v)} placeholder="e.g. 9.375" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF upper arm inner pivot (inches)"
            hint="The inner end of the upper control arm where it bolts to the tower/subframe above the lower arm. On the P71, this is a single bolt (or bushing) high up on the inner fender structure. This is the hardest point to measure accurately and the one most likely to be estimated — it directly determines the instant center position and roll center height. Plumb bob from the bolt centerline to the floor. Estimated ≈ 13.5″ from published Ford geometry — measure if at all possible.">
            <NumIn value={editing.upperArmPivot?.LF ?? ''} onChange={v => setN('upperArmPivot', 'LF', v)} placeholder="e.g. 13.5 (est)" step="0.125" />
          </Field>
          <Field label="RF upper arm inner pivot (inches)"
            hint="Same as LF upper arm inner pivot — right side. Measure or estimate the bolt center height from the floor.">
            <NumIn value={editing.upperArmPivot?.RF ?? ''} onChange={v => setN('upperArmPivot', 'RF', v)} placeholder="e.g. 13.5 (est)" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF spring pickup distance from inner pivot (inches)"
            hint="On the P71 SLA, the strut/spring assembly mounts to the lower control arm at a point between the inner pivot and the ball joint. Measure from the center of the lower arm inner pivot bolt to the center of the spring mount hole on the arm (along the arm). This distance divided by the total arm length (pivot to ball joint) is the motion ratio — it directly scales front roll stiffness. Typical P71 lower arm: total length ≈ 13″, spring mount ≈ 9–11″ from pivot (MR ≈ 0.7–0.87).">
            <NumIn value={editing.springPickup?.LF ?? ''} onChange={v => setN('springPickup', 'LF', v)} placeholder="e.g. 11.0" step="0.125" />
          </Field>
          <Field label="RF spring pickup distance from inner pivot (inches)"
            hint="Same as LF — measure from the RF lower arm inner pivot center to the spring mount hole along the arm. Both sides should be the same unless the arms are different parts.">
            <NumIn value={editing.springPickup?.RF ?? ''} onChange={v => setN('springPickup', 'RF', v)} placeholder="e.g. 11.0" step="0.125" />
          </Field>
        </div>
        <Field label="Front wheel center height (inches)"
          hint="Measure from the center of the front hub/axle to the floor. Plumb a string or straight-edge from the hub center to the ground. For 235/55R17 tires, this should be close to 13.5–13.6″. Used to establish the suspension geometry reference plane.">
          <NumIn value={editing.wheelCenterHeight} onChange={v => set('wheelCenterHeight', v)} placeholder="e.g. 13.0" step="0.125" />
        </Field>
      </div>

      {/* Droop */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Droop Camber</h3>
        <p className="ml-section-note">
          Support the car under the frame rails or rocker panels on jack stands — NOT under the control arms. The front wheels must hang freely at full droop (no spring tension). Hold a flat plate flush against the wheel face and read camber with a phone inclinometer app.
        </p>
        <div className="ml-row">
          <Field label="LF camber at full droop (°)"
            hint="With LF wheel hanging freely: hold a rigid flat plate (piece of aluminum, clipboard) flush against the center of the wheel face. Place your phone flat on the plate and read the inclinometer. Positive = top leans outward. Negative = top leans inward. Record the value you see — do not subtract static camber here.">
            <NumIn value={editing.droopCamber.LF} onChange={v => setN('droopCamber', 'LF', v)} placeholder="e.g. 1.75" />
          </Field>
          <Field label="RF camber at full droop (°)"
            hint="Same as LF — RF wheel hanging freely, read camber with phone inclinometer on flat plate against wheel face.">
            <NumIn value={editing.droopCamber.RF} onChange={v => setN('droopCamber', 'RF', v)} placeholder="e.g. -1.5" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF droop travel (inches)"
            hint="Total wheel travel from ride height to full droop. Method: (1) At ride height, mark a point on the wheel center with a scribe or tape, and measure its height from the floor. (2) With car on jack stands and wheel hanging free, measure the same wheel center height from the floor. (3) The difference (ride height measurement minus droop measurement) is droop travel. Typical P71 front droop ≈ 0.5–1.5″.">
            <NumIn value={editing.droopTravel.LF} onChange={v => setN('droopTravel', 'LF', v)} placeholder="e.g. 0.75" step="0.125" />
          </Field>
          <Field label="RF droop travel (inches)"
            hint="Same as LF droop travel — measure RF wheel center height at ride height then at full droop. Subtract to get travel.">
            <NumIn value={editing.droopTravel.RF} onChange={v => setN('droopTravel', 'RF', v)} placeholder="e.g. 0.875" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Bump */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Bump Camber</h3>
        <p className="ml-section-note">
          Car on jack stands (same setup as droop — frame supported, wheels free). Use a floor jack under the lower control arm outboard end to push the wheel upward into bump until the bumpstop contacts or the strut bottoms.
        </p>
        <div className="ml-row">
          <Field label="LF camber at full bump (°)"
            hint="Place floor jack under the LF lower control arm near the ball joint. Jack slowly until bumpstop compresses or movement stops. Read camber with phone inclinometer on flat plate against wheel face. For SLA suspension, more bump = more negative camber (good). Record the final camber reading at full bump.">
            <NumIn value={editing.bumpCamber.LF} onChange={v => setN('bumpCamber', 'LF', v)} placeholder="e.g. -3.0" />
          </Field>
          <Field label="RF camber at full bump (°)"
            hint="Same as LF — jack under RF lower control arm until bumpstop, read camber with inclinometer. RF bump camber is critical — this wheel is in jounce during left-turn cornering.">
            <NumIn value={editing.bumpCamber.RF} onChange={v => setN('bumpCamber', 'RF', v)} placeholder="e.g. -4.5" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF bump travel (inches)"
            hint="Total wheel travel from ride height to full bump. Method: (1) At ride height, mark the wheel center and measure its height from the floor. (2) Jack to full bump and re-measure wheel center height. (3) Bump travel = full-bump measurement minus ride-height measurement. Typical P71 front bump ≈ 1.5–2.5″.">
            <NumIn value={editing.bumpTravel.LF} onChange={v => setN('bumpTravel', 'LF', v)} placeholder="e.g. 2.0" step="0.125" />
          </Field>
          <Field label="RF bump travel (inches)"
            hint="Same as LF bump travel — measure RF wheel center at ride height then at full bump. Subtract.">
            <NumIn value={editing.bumpTravel.RF} onChange={v => setN('bumpTravel', 'RF', v)} placeholder="e.g. 2.0" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Caster camber gain */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Caster Camber Gain Calibration</h3>
        <p className="ml-section-note">
          Why right steer on a left-turn oval: caster gain is symmetric — the camber change per degree of steer is identical left or right. We use 20° right because it is a large angle that produces a clearly readable camber change on the inclinometer. The model applies the resulting coefficient at the actual oval apex steer angle (3.77° left), where the change is too small to measure directly (~0.5°). Direction of steer does not affect the calibration result.
        </p>
        <p className="ml-section-note">
          Car at ride height on flat ground. Turn steering right to approximately 20° — confirm with an angle finder or protractor on the tire sidewall, not the steering wheel.
        </p>
        <div className="ml-row">
          <Field label="LF camber at 20° right steer (°)"
            hint="Note the straight-ahead static camber first. Then turn 20° right and read LF camber — phone inclinometer on flat plate against wheel face. At 20° right the LF is the inside (unloaded) tire and typically gains positive camber. The gain = (this reading) minus (static LF camber). Model uses the gain divided by LF caster degrees to get a coefficient in deg/deg.">
            <NumIn value={editing.steerCamber20.LF} onChange={v => setN('steerCamber20', 'LF', v)} placeholder="e.g. 1.5" />
          </Field>
          <Field label="RF camber at 20° right steer (°)"
            hint="At 20° right the RF is the outside (loaded) tire — it should gain negative camber due to caster geometry. e.g. if static RF is −2° and at 20° right steer it reads −4°, the gain is 2°. Divide by RF caster degrees and by sin(20°) to get the per-degree coefficient. The model applies that coefficient at sin(3.77°) for the actual oval apex — where the gain is only ~0.5° and unmeasurable directly.">
            <NumIn value={editing.steerCamber20.RF} onChange={v => setN('steerCamber20', 'RF', v)} placeholder="e.g. -4.0" />
          </Field>
        </div>
      </div>

      {/* CG / Ride Height */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Ride Height</h3>
        <p className="ml-section-note">
          If running cut or lowered springs, enter how many inches lower than stock the car sits at ride height. Each inch of lowering drops the CG approximately 0.6–0.7 inches. The model uses this to adjust its CG height estimate from the stock P71 baseline.
        </p>
        <div className="ml-row">
          <Field label="Ride height lowering from stock (inches)"
            hint="Measure: (1) Find a stock P71 ride height reference (factory spec or photo). (2) Measure your car's ride height at the rocker panel or a consistent body reference point. (3) Enter the difference. 0 if running stock springs. Leave blank if unknown — the model uses the stock CG height baseline.">
            <NumIn value={editing.rideLowering} onChange={v => set('rideLowering', v)} placeholder="0 if stock" step="0.25" />
          </Field>
        </div>
        <Field label="Ballast / weight notes">
          <input className="ml-input ml-input-wide" type="text"
            placeholder="e.g. Roll cage installed, battery moved to trunk, sandbag ballast behind seats"
            value={editing.cgNotes} onChange={e => set('cgNotes', e.target.value)} />
        </Field>
      </div>

      {/* ARB */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Front Anti-Roll Bar</h3>
        <p className="ml-section-note">
          The P71 front ARB wheel rate is hardcoded to 475 lbs/in (29.5mm solid bar). If you have a different bar, measure its diameter so the model can use the correct roll stiffness.
        </p>
        <Field label="Front ARB bar diameter (inches)"
          hint="Measure the solid steel bar diameter at the straight section (not at the bends or end links). Use calipers. P71 stock: 29.5mm = 1.161 in. ARB roll stiffness scales as diameter^4, so even small changes matter — a 1 in bar has about 55% of the stiffness of the stock 1.161 in bar. Leave blank to use the stock P71 value (29.5mm).">
          <NumIn value={editing.arbDiameter ?? ''} onChange={v => set('arbDiameter', v)} placeholder="e.g. 1.161 (stock 29.5mm)" step="0.001" min="0.5" max="2.0" />
        </Field>
      </div>

      {/* Notes */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Notes</h3>
        <Field label="Additional notes">
          <textarea className="ml-textarea" rows={3}
            placeholder="Any observations about the measurements, conditions, tools used..."
            value={editing.notes} onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </>
  );
}

// ─── Top-level tabs ───────────────────────────────────────────────────────────

export function MeasurementLog() {
  const { sessions, setSessions } = useSync();

  return (
    <ListEditor
      items={sessions}
      setItems={setSessions}
      emptyTemplate={EMPTY_SESSION}
      formatFn={formatSession}
      label="Sessions"
      renderEditor={(editing, setEditing) => (
        <SessionEditor editing={editing} setEditing={setEditing} />
      )}
    />
  );
}

export function SuspensionGeometry() {
  const { geometry: geoList, setGeometry: setGeoList } = useSync();

  return (
    <ListEditor
      items={geoList}
      setItems={setGeoList}
      emptyTemplate={EMPTY_GEO}
      formatFn={formatGeo}
      label="Cars"
      renderEditor={(editing, setEditing) => (
        <>
          <GeoEditor editing={editing} setEditing={setEditing} />
          <div style={{ padding: '16px 0 0' }}>
            <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
              LIVE GEOMETRY PREVIEW (updates as you edit)
            </div>
            <GeometryVisualizer geo={editing} />
            <GeometryTable geo={editing} />
            <GeometryAnalysis geo={editing} />
          </div>
        </>
      )}
      renderView={(item) => (
        <>
          <GeometryVisualizer geo={item} />
          <GeometryTable geo={item} />
          <GeometryAnalysis geo={item} />
          <pre className="ml-preview" style={{ marginTop: 16 }}>{formatGeo(item)}</pre>
        </>
      )}
    />
  );
}
