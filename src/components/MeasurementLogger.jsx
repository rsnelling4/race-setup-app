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
  springRate: { LF: '', RF: '' },
  shocks: { LF: '', RF: '', LR: '', RR: '' },   // shockLabel strings
  coldPsi: { LF: '', RF: '', LR: '', RR: '' },
  hotPsi:  { LF: '', RF: '', LR: '', RR: '' },
  tireTemps: {
    LF: { inside: '', middle: '', outside: '' },
    RF: { inside: '', middle: '', outside: '' },
    LR: { inside: '', middle: '', outside: '' },
    RR: { inside: '', middle: '', outside: '' },
  },
};

const EMPTY_GEO = {
  id: null,
  title: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
  trackWidth:      { front: '', rear: '' },
  rearRollCenter:  '',
  rearSpringBase:  '',
  lowerBallJoint:  { LF: '', RF: '' },
  upperBallJoint:  { LF: '', RF: '' },
  lowerArmPivot:   { LF: '', RF: '' },
  upperArmPivot:   { LF: '', RF: '' },
  wheelCenterHeight: '',
  droopCamber:     { LF: '', RF: '' },
  droopTravel:     { LF: '', RF: '' },
  bumpCamber:      { LF: '', RF: '' },
  bumpTravel:      { LF: '', RF: '' },
  steerCamber20:   { LF: '', RF: '' },
  rideLowering:    '',
  cgNotes:         '',
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
    `Camber:  LF ${v(car.camber.LF)}°   RF ${v(car.camber.RF)}°`,
    `Caster:  LF ${v(car.caster.LF)}°   RF ${v(car.caster.RF)}°`,
    `Toe (front): ${v(car.toe)}" (negative = toe-out)`,
    '',
    '--- Springs ---',
    `LF ${v(car.springRate.LF)} lbs/in   RF ${v(car.springRate.RF)} lbs/in`,
    '',
    '--- Shocks / Struts ---',
    `LF: ${v(car.shocks.LF)}`,
    `RF: ${v(car.shocks.RF)}`,
    `LR: ${v(car.shocks.LR)}`,
    `RR: ${v(car.shocks.RR)}`,
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
  if (car.notes.trim()) lines.push('', '--- Notes ---', car.notes.trim());
  return lines.join('\n');
}

function formatGeo(car) {
  const lines = [
    `=== ${car.title || 'Unnamed Car'} — Suspension Geometry — ${car.date} ===`,
    '',
    `Track width (front): ${v(car.trackWidth.front)}"   rear: ${v(car.trackWidth.rear)}"`,
    `Rear roll center height (Watts pivot): ${v(car.rearRollCenter)}"`,
    `Rear spring base width: ${v(car.rearSpringBase)}"`,
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
  ];
  if (car.cgNotes.trim())  lines.push(`CG / ballast notes: ${car.cgNotes.trim()}`);
  if (car.notes.trim())    lines.push('', '--- Notes ---', car.notes.trim());
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
          <Field label="Front Toe (inches)" hint="Total toe across both fronts at hub height. Rear gap minus front gap. Negative = toe-out. e.g. -0.25 = quarter inch toe-out.">
            <NumIn value={editing.toe} onChange={v => set('toe', v)} placeholder="e.g. -0.25" step="0.0625" />
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

      {/* Spring rates */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Front Spring Rates</h3>
        <p className="ml-section-note">Auto-filled from strut selection above if applicable. Override if needed.</p>
        <div className="ml-row">
          <Field label="LF (lbs/in)">
            <select className="ml-input ml-select"
              value={editing.springRate.LF}
              onChange={e => setN('springRate', 'LF', e.target.value)}>
              <option value="">— Select —</option>
              <option value="700">700 lbs/in — Heavy Duty</option>
              <option value="475">475 lbs/in — Police/Taxi</option>
              <option value="440">440 lbs/in — Base/LX</option>
            </select>
          </Field>
          <Field label="RF (lbs/in)">
            <select className="ml-input ml-select"
              value={editing.springRate.RF}
              onChange={e => setN('springRate', 'RF', e.target.value)}>
              <option value="">— Select —</option>
              <option value="700">700 lbs/in — Heavy Duty</option>
              <option value="475">475 lbs/in — Police/Taxi</option>
              <option value="440">440 lbs/in — Base/LX</option>
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

      {/* Notes */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Session Notes</h3>
        <Field label="Notes / Observations">
          <textarea className="ml-textarea" rows={4}
            placeholder="Handling notes, tight/loose feel, changes made, lap times, track conditions..."
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

      {/* Track Width */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Track Width</h3>
        <div className="ml-row">
          <Field label="Front track width (inches)"
            hint="Park on flat ground, wheels straight ahead. Mark the center of the tread contact patch on the ground (chalk or tape) for each front tire. Measure between the two marks.">
            <NumIn value={editing.trackWidth.front} onChange={v => setN('trackWidth', 'front', v)} placeholder="e.g. 64" step="0.125" />
          </Field>
          <Field label="Rear track width (inches)"
            hint="Same method as front — mark center of rear contact patches and measure between marks.">
            <NumIn value={editing.trackWidth.rear} onChange={v => setN('trackWidth', 'rear', v)} placeholder="e.g. 65.125" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Rear Roll Center */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Rear Roll Center</h3>
        <Field label="Watts link center pivot height from floor (inches)"
          hint="Car at ride height with driver weight (~200 lbs on seat). Find the large center pivot bolt on the Watts link — it sits on a bracket centered on top of the rear axle housing, connecting the two horizontal arms. Measure from the bolt centerline straight down to the floor.">
          <NumIn value={editing.rearRollCenter} onChange={v => set('rearRollCenter', v)} placeholder="e.g. 14.5" step="0.125" />
        </Field>
        <Field label="Rear spring base width (inches)"
          hint="Distance between the centers of the two rear coil spring perches on the axle housing. On a P71 solid axle, measure along the axle tube from the center of the left spring perch to the center of the right spring perch. Wider spring base = more rear roll resistance independent of spring rate.">
          <NumIn value={editing.rearSpringBase} onChange={v => set('rearSpringBase', v)} placeholder="e.g. 42" step="0.25" />
        </Field>
      </div>

      {/* Front SLA */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Front SLA Ball Joint Heights</h3>
        <p className="ml-section-note">Car at ride height on flat ground. Measure to the center of each ball joint stud.</p>
        <div className="ml-row">
          <Field label="LF lower ball joint (inches)"
            hint="Lower control arm outer end — where the spindle attaches. Measure from the ball joint stud center to the floor.">
            <NumIn value={editing.lowerBallJoint.LF} onChange={v => setN('lowerBallJoint', 'LF', v)} placeholder="e.g. 7.75" step="0.125" />
          </Field>
          <Field label="RF lower ball joint (inches)" hint="Same as LF — right front lower control arm outer pivot.">
            <NumIn value={editing.lowerBallJoint.RF} onChange={v => setN('lowerBallJoint', 'RF', v)} placeholder="e.g. 6.75" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF upper ball joint (inches)" hint="Upper control arm outer end. Measure ball joint stud center to floor.">
            <NumIn value={editing.upperBallJoint.LF} onChange={v => setN('upperBallJoint', 'LF', v)} placeholder="e.g. 18.5" step="0.125" />
          </Field>
          <Field label="RF upper ball joint (inches)" hint="Right front upper control arm outer pivot — stud center to floor.">
            <NumIn value={editing.upperBallJoint.RF} onChange={v => setN('upperBallJoint', 'RF', v)} placeholder="e.g. 17.625" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF lower arm inner pivot (inches)"
            hint="Inner end of the lower control arm where it bolts to the subframe. If two bolts, average their heights. Measure pivot center to floor.">
            <NumIn value={editing.lowerArmPivot.LF} onChange={v => setN('lowerArmPivot', 'LF', v)} placeholder="e.g. 10.0" step="0.125" />
          </Field>
          <Field label="RF lower arm inner pivot (inches)" hint="Same as LF — right front lower arm subframe bolt center to floor.">
            <NumIn value={editing.lowerArmPivot.RF} onChange={v => setN('lowerArmPivot', 'RF', v)} placeholder="e.g. 9.375" step="0.125" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF upper arm inner pivot (inches)"
            hint="Inner end of the upper control arm where it bolts to the subframe/tower. Measure pivot bolt center to floor. This is the critical measurement for computing the instant center.">
            <NumIn value={editing.upperArmPivot?.LF ?? ''} onChange={v => setN('upperArmPivot', 'LF', v)} placeholder="e.g. 13.5 (est)" step="0.125" />
          </Field>
          <Field label="RF upper arm inner pivot (inches)" hint="Same as LF — right front upper arm subframe bolt center to floor.">
            <NumIn value={editing.upperArmPivot?.RF ?? ''} onChange={v => setN('upperArmPivot', 'RF', v)} placeholder="e.g. 13.5 (est)" step="0.125" />
          </Field>
        </div>
        <Field label="Front wheel center height (inches)"
          hint="Measure from the center of the front hub/axle straight down to the floor. Should be approximately the tire radius (~13.5&quot; for 235/55R17).">
          <NumIn value={editing.wheelCenterHeight} onChange={v => set('wheelCenterHeight', v)} placeholder="e.g. 13.0" step="0.125" />
        </Field>
      </div>

      {/* Droop */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Droop Camber</h3>
        <p className="ml-section-note">
          Support car under frame rails on jack stands — NOT under control arms. Front wheels must hang freely at full droop.
          Hold a flat plate flush against the wheel face and read camber with a phone inclinometer.
        </p>
        <div className="ml-row">
          <Field label="LF camber at full droop (°)" hint="LF wheel hanging freely — read camber via phone on flat plate against wheel face. Negative = top tilts inward.">
            <NumIn value={editing.droopCamber.LF} onChange={v => setN('droopCamber', 'LF', v)} placeholder="e.g. 1.75" />
          </Field>
          <Field label="RF camber at full droop (°)" hint="Same method — RF wheel hanging freely.">
            <NumIn value={editing.droopCamber.RF} onChange={v => setN('droopCamber', 'RF', v)} placeholder="e.g. -1.5" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF droop travel (inches)"
            hint="Measure wheel center to a fixed chassis reference (fender lip) while on jack stands. Then lower to ride height and re-measure. The difference is droop travel.">
            <NumIn value={editing.droopTravel.LF} onChange={v => setN('droopTravel', 'LF', v)} placeholder="e.g. 0.5" step="0.125" />
          </Field>
          <Field label="RF droop travel (inches)" hint="Same method for right front.">
            <NumIn value={editing.droopTravel.RF} onChange={v => setN('droopTravel', 'RF', v)} placeholder="e.g. 0.875" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Bump */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Bump Camber</h3>
        <p className="ml-section-note">
          Car on jack stands. Use a floor jack under the lower control arm to push the wheel into full bump until the bumpstop contacts or motion stops.
        </p>
        <div className="ml-row">
          <Field label="LF camber at full bump (°)" hint="Jack under lower control arm until bumpstop compresses. Measure camber with phone on flat plate against wheel face.">
            <NumIn value={editing.bumpCamber.LF} onChange={v => setN('bumpCamber', 'LF', v)} placeholder="e.g. -3.0" />
          </Field>
          <Field label="RF camber at full bump (°)" hint="Same method — right front wheel pushed to full bump.">
            <NumIn value={editing.bumpCamber.RF} onChange={v => setN('bumpCamber', 'RF', v)} placeholder="e.g. -4.5" />
          </Field>
        </div>
        <div className="ml-row">
          <Field label="LF bump travel (inches)" hint="Using same chassis reference as droop — measure at ride height then at full bump. Difference is bump travel.">
            <NumIn value={editing.bumpTravel.LF} onChange={v => setN('bumpTravel', 'LF', v)} placeholder="e.g. 2.0" step="0.125" />
          </Field>
          <Field label="RF bump travel (inches)" hint="Same method for right front.">
            <NumIn value={editing.bumpTravel.RF} onChange={v => setN('bumpTravel', 'RF', v)} placeholder="e.g. 2.0" step="0.125" />
          </Field>
        </div>
      </div>

      {/* Caster camber gain */}
      <div className="ml-section">
        <h3 className="ml-section-heading">Caster Camber Gain</h3>
        <p className="ml-section-note">
          Car at ride height on flat ground. Turn steering wheel right until front tires are at ~20° steer — use an angle finder on the tire sidewall to confirm. Then measure camber on each front wheel.
        </p>
        <div className="ml-row">
          <Field label="LF camber at 20° right steer (°)"
            hint="Confirm straight-ahead static camber first. Then turn 20° right and read LF camber — phone on flat plate against wheel face.">
            <NumIn value={editing.steerCamber20.LF} onChange={v => setN('steerCamber20', 'LF', v)} placeholder="e.g. 1.5" />
          </Field>
          <Field label="RF camber at 20° right steer (°)"
            hint="Same turn — RF is the outside tire turning right; it should gain negative camber.">
            <NumIn value={editing.steerCamber20.RF} onChange={v => setN('steerCamber20', 'RF', v)} placeholder="e.g. -4.0" />
          </Field>
        </div>
      </div>

      {/* CG */}
      <div className="ml-section">
        <h3 className="ml-section-heading">CG Height / Ballast</h3>
        <div className="ml-row">
          <Field label="Ride height lowering from stock (inches)"
            hint="If lowered with cut or aftermarket springs — estimate inches lower than stock. Zero if stock. Each inch lowered drops CG ~0.65 inches.">
            <NumIn value={editing.rideLowering} onChange={v => set('rideLowering', v)} placeholder="0 if stock" step="0.25" />
          </Field>
        </div>
        <Field label="CG / ballast notes">
          <input className="ml-input ml-input-wide" type="text"
            placeholder="e.g. Roll cage installed, battery moved to trunk"
            value={editing.cgNotes} onChange={e => set('cgNotes', e.target.value)} />
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
