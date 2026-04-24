import { useState, useEffect, useCallback } from 'react';
import { analyzeSetup, DEFAULT_SETUP } from '../utils/raceSimulation';
import { handlingConditions, cornerPhases } from '../utils/tireAnalysis';
import { REAR_SHOCKS, FRONT_STRUTS, shockLabel } from '../data/shockOptions';

// ─── Storage keys ────────────────────────────────────────────────────────────
const EVENTS_KEY  = 'race_track_day_events';
const APIKEY_KEY  = 'race_claude_api_key';
const GEO_KEY     = 'race_geometry_logs';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dc(o) { return JSON.parse(JSON.stringify(o)); }
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ─── Empty templates ──────────────────────────────────────────────────────────
const EMPTY_SESSION = {
  id: null,
  name: '',            // e.g. "Practice 1"
  ambient: '',
  inflationTemp: '',
  // Setup used this session
  setup: null,         // null = inherit from event car profile / default
  // Post-session data
  hotPsi:    { LF: '', RF: '', LR: '', RR: '' },
  tireTemps: {
    LF: { inside: '', middle: '', outside: '' },
    RF: { inside: '', middle: '', outside: '' },
    LR: { inside: '', middle: '', outside: '' },
    RR: { inside: '', middle: '', outside: '' },
  },
  // Driver feel
  condition: '',       // 'loose' | 'tight'
  phase:     '',       // 'entry' | 'middle' | 'exit'
  lapNotes:  '',       // free text — lap times, observations
};

const EMPTY_EVENT = {
  id: null,
  name: '',            // e.g. "Wampum 4/26"
  date: new Date().toISOString().slice(0, 10),
  track: '',
  carProfileId: null,  // ref to geometry log id, null = use model default
  sessions: [],
};

// Setup blank for a session (deep clone of DEFAULT_SETUP fields relevant to setup)
function blankSetup() {
  return dc({
    shocks:   { LF: 4, RF: 4, LR: 2, RR: 2 },
    springs:  { LF: 475, RF: 475, LR: 160, RR: 160 },
    camber:   { LF: 2.75, RF: -2.25 },
    caster:   { LF: 9.0, RF: 3.0 },
    toe:      -0.25,
    coldPsi:  { LF: 20, RF: 42, LR: 16, RR: 32 },
  });
}

// ─── Convert MeasurementLogger session shockLabel strings → numeric ratings ──
function shockLabelToRating(label, isFront) {
  const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
  const found = list.find(s => shockLabel(s) === label);
  return found ? found.rating : 4;
}

// ─── Build a raceSimulation-compatible setup object from a logged session ────
function sessionToSimSetup(session) {
  const s = session.setup ?? blankSetup();
  // If shocks are stored as label strings, convert them
  const shocks = {};
  for (const corner of ['LF', 'RF', 'LR', 'RR']) {
    const val = s.shocks[corner];
    if (typeof val === 'string' && val.includes('|')) {
      shocks[corner] = shockLabelToRating(val, corner === 'LF' || corner === 'RF');
    } else {
      shocks[corner] = Number(val) || 4;
    }
  }
  return {
    shocks,
    springs: {
      LF: Number(s.springs?.LF) || 475,
      RF: Number(s.springs?.RF) || 475,
      LR: 160,
      RR: 160,
    },
    camber:  { LF: Number(s.camber?.LF) || 0, RF: Number(s.camber?.RF) || 0 },
    caster:  { LF: Number(s.caster?.LF) || 5, RF: Number(s.caster?.RF) || 5 },
    toe:     Number(s.toe) || -0.25,
    coldPsi: {
      LF: Number(s.coldPsi?.LF) || 20,
      RF: Number(s.coldPsi?.RF) || 42,
      LR: Number(s.coldPsi?.LR) || 16,
      RR: Number(s.coldPsi?.RR) || 32,
    },
  };
}

// ─── Format all event data into a Claude prompt ───────────────────────────────
function buildPrompt(event, sessions, geoProfile) {
  const lines = [
    `You are a race car setup engineer analyzing data from a track day for a 2008 Ford Crown Victoria P71 on an oval/figure-8 track.`,
    ``,
    `EVENT: ${event.name}  |  Date: ${event.date}  |  Track: ${event.track || 'not specified'}`,
    ``,
  ];

  if (geoProfile) {
    lines.push(
      `CAR GEOMETRY PROFILE: ${geoProfile.title}`,
      `  Track width: front ${geoProfile.trackWidth?.front || '—'}"  rear ${geoProfile.trackWidth?.rear || '—'}"`,
      `  Rear roll center (Watts pivot): ${geoProfile.rearRollCenter || '—'}"`,
      `  Front SLA: LF lower BJ ${geoProfile.lowerBallJoint?.LF || '—'}"  RF ${geoProfile.lowerBallJoint?.RF || '—'}"`,
      `             LF upper BJ ${geoProfile.upperBallJoint?.LF || '—'}"  RF ${geoProfile.upperBallJoint?.RF || '—'}"`,
      `             LF arm pivot ${geoProfile.lowerArmPivot?.LF || '—'}"  RF ${geoProfile.lowerArmPivot?.RF || '—'}"`,
      `             Wheel center height: ${geoProfile.wheelCenterHeight || '—'}"`,
      `  Droop camber: LF ${geoProfile.droopCamber?.LF || '—'}°  RF ${geoProfile.droopCamber?.RF || '—'}°`,
      `  Droop travel: LF ${geoProfile.droopTravel?.LF || '—'}"  RF ${geoProfile.droopTravel?.RF || '—'}"`,
      `  Bump camber:  LF ${geoProfile.bumpCamber?.LF || '—'}°  RF ${geoProfile.bumpCamber?.RF || '—'}°`,
      `  Caster camber gain (20° steer): LF ${geoProfile.steerCamber20?.LF || '—'}°  RF ${geoProfile.steerCamber20?.RF || '—'}°`,
      ``,
    );
  } else {
    lines.push(`CAR GEOMETRY: Using model defaults (no geometry profile selected)`, ``);
  }

  sessions.forEach((session, idx) => {
    const simSetup = sessionToSimSetup(session);
    const ambient = Number(session.ambient) || 65;
    const inflation = Number(session.inflationTemp) || 68;
    let physics = null;
    try { physics = analyzeSetup(simSetup, ambient, inflation); } catch (e) { /* ignore */ }

    lines.push(`── SESSION ${idx + 1}: ${session.name || `Practice ${idx + 1}`} ──────────────────`);
    lines.push(`  Ambient: ${session.ambient || '—'}°F  |  Tires set at: ${session.inflationTemp || '—'}°F`);
    lines.push(``);
    lines.push(`  SETUP:`);
    lines.push(`    Camber:  LF ${simSetup.camber.LF}°  RF ${simSetup.camber.RF}°`);
    lines.push(`    Caster:  LF ${simSetup.caster.LF}°  RF ${simSetup.caster.RF}°`);
    lines.push(`    Toe: ${simSetup.toe}" front`);
    lines.push(`    Springs: LF ${simSetup.springs.LF} lbs/in  RF ${simSetup.springs.RF} lbs/in`);
    lines.push(`    Shocks:  LF ${simSetup.shocks.LF}  RF ${simSetup.shocks.RF}  LR ${simSetup.shocks.LR}  RR ${simSetup.shocks.RR}  (0=stiffest, 10=softest)`);
    lines.push(`    Cold PSI: LF ${simSetup.coldPsi.LF}  RF ${simSetup.coldPsi.RF}  LR ${simSetup.coldPsi.LR}  RR ${simSetup.coldPsi.RR}`);
    lines.push(``);

    const hp = session.hotPsi;
    if (Object.values(hp).some(v => v !== '')) {
      lines.push(`  HOT PSI (after session):`);
      lines.push(`    LF ${hp.LF || '—'}  RF ${hp.RF || '—'}  LR ${hp.LR || '—'}  RR ${hp.RR || '—'}`);
      lines.push(``);
    }

    const tt = session.tireTemps;
    const hasTemps = Object.values(tt).some(t => t.inside || t.middle || t.outside);
    if (hasTemps) {
      lines.push(`  PYROMETER (°F — Inside / Middle / Outside):`);
      for (const pos of ['LF', 'RF', 'LR', 'RR']) {
        lines.push(`    ${pos}: ${tt[pos].inside || '—'} / ${tt[pos].middle || '—'} / ${tt[pos].outside || '—'}`);
      }
      lines.push(``);
    }

    if (session.condition || session.phase) {
      const condLabel = handlingConditions.find(c => c.value === session.condition)?.label || session.condition;
      const phaseLabel = cornerPhases.find(p => p.value === session.phase)?.label || session.phase;
      lines.push(`  DRIVER FEEL: ${condLabel || '—'}  |  When: ${phaseLabel || '—'}`);
      lines.push(``);
    }

    if (session.lapNotes?.trim()) {
      lines.push(`  NOTES: ${session.lapNotes.trim()}`);
      lines.push(``);
    }

    if (physics) {
      const c = physics.corners;
      lines.push(`  PHYSICS MODEL OUTPUT:`);
      lines.push(`    Est. lap time: ${physics.lapTime?.toFixed(3)}s`);
      lines.push(`    Front LLTD: ${(physics.ss?.frontLLTD * 100).toFixed(1)}%  (target 46%)`);
      lines.push(`    RF: grip ${c?.RF?.grip?.toFixed(1)}%  hot PSI ${c?.RF?.hp?.toFixed(1)} (opt ${c?.RF?.optHotPsi?.toFixed(1)})  ground camber ${c?.RF?.groundCamber?.toFixed(2)}°`);
      lines.push(`    LF: grip ${c?.LF?.grip?.toFixed(1)}%  hot PSI ${c?.LF?.hp?.toFixed(1)} (opt ${c?.LF?.optHotPsi?.toFixed(1)})  ground camber ${c?.LF?.groundCamber?.toFixed(2)}°`);
      lines.push(`    RR: grip ${c?.RR?.grip?.toFixed(1)}%  hot PSI ${c?.RR?.hp?.toFixed(1)} (opt ${c?.RR?.optHotPsi?.toFixed(1)})`);
      lines.push(`    LR: grip ${c?.LR?.grip?.toFixed(1)}%  hot PSI ${c?.LR?.hp?.toFixed(1)} (opt ${c?.LR?.optHotPsi?.toFixed(1)})`);
      lines.push(``);
    }
  });

  lines.push(
    `ANALYSIS REQUESTED:`,
    `1. Compare sessions — what changed between sessions and was it an improvement?`,
    `2. Identify the primary handling issue(s) based on driver feel + tire data.`,
    `3. For each session, assess tire contact patch quality (camber, pressure spread vs optimal).`,
    `4. Give ranked, specific recommendations for the NEXT session: what to change and why.`,
    `   Focus on maximum contact patch and driver feel over lap time.`,
    `   Prioritize changes that can be made at the track (PSI, toe) before shop changes (camber, caster, shocks).`,
    `5. Call out any red flags in the tire temperature data (heat gradient, wear patterns).`,
    ``,
    `Be specific and numeric. Reference actual values from the data. Keep it concise — the crew chief is reading this at the track.`,
  );

  return lines.join('\n');
}

// ─── Claude API call ──────────────────────────────────────────────────────────
async function callClaude(apiKey, prompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text ?? '';
}

// ─── JS-only physics analysis (no API) ───────────────────────────────────────
function runPhysicsAnalysis(sessions) {
  return sessions.map(session => {
    const simSetup = sessionToSimSetup(session);
    const ambient = Number(session.ambient) || 65;
    const inflation = Number(session.inflationTemp) || 68;
    try {
      return { sessionId: session.id, ...analyzeSetup(simSetup, ambient, inflation) };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

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

function NumIn({ value, onChange, placeholder, step = '1', min, max }) {
  return (
    <input type="number" className="ml-input"
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '—'} step={step} min={min} max={max} />
  );
}

// ─── Setup editor (shocks + springs + alignment + cold PSI) ──────────────────
const FRONT_SPRING_OPTIONS = [
  { value: 700, label: '700 lbs/in — Heavy Duty' },
  { value: 475, label: '475 lbs/in — Police/Taxi' },
  { value: 440, label: '440 lbs/in — Base/LX' },
];

function SetupEditor({ setup, onChange }) {
  function set(path, val) {
    const s = dc(setup);
    const keys = path.split('.');
    let obj = s;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = val;
    onChange(s);
  }

  function updateShock(corner, label) {
    const isFront = corner === 'LF' || corner === 'RF';
    const list = isFront ? FRONT_STRUTS : REAR_SHOCKS;
    const found = list.find(s => shockLabel(s) === label);
    if (!found) return;
    const s = dc(setup);
    s.shocks[corner] = found.rating;
    if (isFront && found.springRate) s.springs[corner] = found.springRate;
    onChange(s);
  }

  function selectedLabel(corner) {
    const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
    const match = list.find(s => s.rating === setup.shocks[corner]);
    return match ? shockLabel(match) : '';
  }

  return (
    <div className="td-setup-editor">
      <div className="td-setup-col">
        <div className="td-setup-group-label">Shocks / Struts</div>
        {['LF', 'RF', 'LR', 'RR'].map(corner => {
          const list = (corner === 'LF' || corner === 'RF') ? FRONT_STRUTS : REAR_SHOCKS;
          return (
            <div key={corner} className="td-setup-row">
              <span className="td-setup-corner">{corner}</span>
              <select className="ml-input ml-select td-select"
                value={selectedLabel(corner)}
                onChange={e => updateShock(corner, e.target.value)}>
                {list.map(s => (
                  <option key={s.part} value={shockLabel(s)}>{shockLabel(s)} — {s.use}</option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>Front Springs</div>
        {['LF', 'RF'].map(corner => (
          <div key={corner} className="td-setup-row">
            <span className="td-setup-corner">{corner}</span>
            <select className="ml-input ml-select td-select"
              value={setup.springs[corner] ?? 475}
              onChange={e => set(`springs.${corner}`, parseInt(e.target.value))}>
              {FRONT_SPRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="td-setup-col">
        <div className="td-setup-group-label">Camber (°)</div>
        {['LF', 'RF'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="0.25" className="ml-input td-num"
              value={setup.camber[c]} onChange={e => set(`camber.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>Caster (°)</div>
        {['LF', 'RF'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="0.25" min="0" max="12" className="ml-input td-num"
              value={setup.caster[c]} onChange={e => set(`caster.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
        <div className="td-setup-group-label" style={{ marginTop: 12 }}>Toe (in) <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>− = out</span></div>
        <div className="td-setup-row">
          <span className="td-setup-corner">F</span>
          <input type="number" step="0.0625" className="ml-input td-num"
            value={setup.toe} onChange={e => set('toe', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="td-setup-col">
        <div className="td-setup-group-label">Cold PSI</div>
        {['LF', 'RF', 'LR', 'RR'].map(c => (
          <div key={c} className="td-setup-row">
            <span className="td-setup-corner">{c}</span>
            <input type="number" step="1" min="5" max="60" className="ml-input td-num"
              value={setup.coldPsi[c]} onChange={e => set(`coldPsi.${c}`, parseFloat(e.target.value) || 0)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Physics results card (per session) ──────────────────────────────────────
function PhysicsCard({ analysis, session }) {
  if (!analysis) return null;
  const c = analysis.corners;
  const lltd = analysis.ss?.frontLLTD ?? 0;
  const lltdOk = Math.abs(lltd - 0.46) < 0.03;

  return (
    <div className="td-physics-card">
      <div className="td-physics-title">Physics Model — {session.name || 'Session'}</div>
      <div className="td-physics-grid">
        <div className="td-phys-item">
          <span className="td-phys-label">Est. Lap</span>
          <span className="td-phys-val">{analysis.lapTime?.toFixed(3)}s</span>
        </div>
        <div className="td-phys-item">
          <span className="td-phys-label">Front LLTD</span>
          <span className="td-phys-val" style={{ color: lltdOk ? 'var(--green)' : 'var(--yellow)' }}>
            {(lltd * 100).toFixed(1)}%
          </span>
        </div>
        {['RF', 'LF', 'RR', 'LR'].map(pos => (
          <div key={pos} className="td-phys-item">
            <span className="td-phys-label">{pos}</span>
            <span className="td-phys-val">
              {c?.[pos]?.grip?.toFixed(0)}%
              <span className="td-phys-sub"> {c?.[pos]?.hp?.toFixed(1)} hot / {c?.[pos]?.optHotPsi?.toFixed(1)} opt</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Session editor ───────────────────────────────────────────────────────────
function SessionEditor({ session, index, onChange }) {
  const setup = session.setup ?? blankSetup();

  function set(field, val) { onChange({ ...session, [field]: val }); }
  function setN(parent, key, val) { onChange({ ...session, [parent]: { ...session[parent], [key]: val } }); }
  function setTemp(pos, zone, val) {
    onChange({ ...session, tireTemps: { ...session.tireTemps, [pos]: { ...session.tireTemps[pos], [zone]: val } } });
  }

  return (
    <div className="td-session-editor">
      <div className="td-session-header">
        <input className="td-session-name-input" type="text"
          placeholder={`Practice ${index + 1}`}
          value={session.name}
          onChange={e => set('name', e.target.value)} />
      </div>

      {/* Environment */}
      <div className="td-session-section">
        <div className="td-ss-label">Environment</div>
        <div className="ml-row">
          <Field label="Ambient (°F)">
            <NumIn value={session.ambient} onChange={v => set('ambient', v)} placeholder="e.g. 75" />
          </Field>
          <Field label="Tires set at (°F)" hint="Shop/garage temperature when cold pressures were set.">
            <NumIn value={session.inflationTemp} onChange={v => set('inflationTemp', v)} placeholder="e.g. 68" />
          </Field>
        </div>
      </div>

      {/* Setup */}
      <div className="td-session-section">
        <div className="td-ss-label">Setup This Session</div>
        <SetupEditor setup={setup} onChange={s => set('setup', s)} />
      </div>

      {/* Hot PSI */}
      <div className="td-session-section">
        <div className="td-ss-label">Hot Pressures (PSI) — after session</div>
        <div className="ml-tire-grid">
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <Field key={pos} label={pos} hint="Check within 2 minutes of getting off track.">
              <NumIn value={session.hotPsi[pos]} onChange={v => setN('hotPsi', pos, v)} placeholder="PSI" min="5" max="80" />
            </Field>
          ))}
        </div>
      </div>

      {/* Pyrometer */}
      <div className="td-session-section">
        <div className="td-ss-label">Pyrometer (°F) — Inside / Middle / Outside</div>
        <div className="ml-pyro-grid">
          <div className="ml-pyro-header">
            <span></span><span>Inside</span><span>Middle</span><span>Outside</span>
          </div>
          {['LF', 'RF', 'LR', 'RR'].map(pos => (
            <div key={pos} className="ml-pyro-row">
              <span className="ml-pyro-pos">{pos}</span>
              {['inside', 'middle', 'outside'].map(zone => (
                <NumIn key={zone} value={session.tireTemps[pos][zone]}
                  onChange={v => setTemp(pos, zone, v)} placeholder="°F" min="60" max="300" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Driver feel */}
      <div className="td-session-section">
        <div className="td-ss-label">Driver Feel</div>
        <div className="td-feel-row">
          <div className="td-feel-group">
            <div className="td-feel-group-label">What is the car doing?</div>
            <div className="td-feel-buttons">
              {handlingConditions.map(c => (
                <button key={c.value}
                  className={`td-feel-btn${session.condition === c.value ? ' active' : ''}`}
                  onClick={() => set('condition', session.condition === c.value ? '' : c.value)}>
                  <span className="td-feel-btn-label">{c.label}</span>
                  <span className="td-feel-btn-desc">{c.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="td-feel-group">
            <div className="td-feel-group-label">When does it happen?</div>
            <div className="td-feel-buttons three">
              {cornerPhases.map(p => (
                <button key={p.value}
                  className={`td-feel-btn${session.phase === p.value ? ' active' : ''}`}
                  onClick={() => set('phase', session.phase === p.value ? '' : p.value)}>
                  <span className="td-feel-btn-label">{p.label}</span>
                  <span className="td-feel-btn-desc">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="td-session-section">
        <div className="td-ss-label">Lap Notes / Observations</div>
        <textarea className="ml-textarea" rows={3}
          placeholder="Lap times, what changed from last session, anything the driver noticed..."
          value={session.lapNotes}
          onChange={e => set('lapNotes', e.target.value)} />
      </div>
    </div>
  );
}

// ─── API Key settings panel ───────────────────────────────────────────────────
function ApiKeyPanel({ apiKey, setApiKey }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function save() {
    setApiKey(draft.trim());
    localStorage.setItem(APIKEY_KEY, draft.trim());
    setEditing(false);
  }

  function clear() {
    setApiKey('');
    localStorage.removeItem(APIKEY_KEY);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="td-apikey-bar">
        <span className="td-apikey-status">
          {apiKey
            ? <><span className="td-apikey-dot active" />Claude AI analysis enabled</>
            : <><span className="td-apikey-dot" />Claude API key not set — using physics model only</>}
        </span>
        <button className="td-apikey-btn" onClick={() => { setDraft(apiKey); setEditing(true); }}>
          {apiKey ? 'Change Key' : 'Add API Key'}
        </button>
      </div>
    );
  }

  return (
    <div className="td-apikey-bar td-apikey-edit">
      <input className="ml-input td-apikey-input" type="password"
        placeholder="sk-ant-..."
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()} />
      <button className="ml-save-btn" onClick={save}>Save</button>
      {apiKey && <button className="ml-delete-btn" onClick={clear}>Remove</button>}
      <button className="ml-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
      <span className="td-apikey-note">Stored in your browser only. Never sent anywhere except api.anthropic.com.</span>
    </div>
  );
}

// ─── Analysis results panel ───────────────────────────────────────────────────
function AnalysisPanel({ event, sessions, geoProfile, apiKey }) {
  const [status, setStatus]   = useState('idle'); // idle | running | done | error
  const [aiText, setAiText]   = useState('');
  const [errMsg, setErrMsg]   = useState('');
  const [physicsResults, setPhysicsResults] = useState(null);

  const analyze = useCallback(async () => {
    setStatus('running');
    setAiText('');
    setErrMsg('');

    // Always run physics
    const phys = runPhysicsAnalysis(sessions);
    setPhysicsResults(phys);

    // Try Claude if key present
    if (apiKey) {
      try {
        const prompt = buildPrompt(event, sessions, geoProfile);
        const text = await callClaude(apiKey, prompt);
        setAiText(text);
        setStatus('done');
      } catch (e) {
        setErrMsg(e.message);
        setStatus('error');
      }
    } else {
      setStatus('done');
    }
  }, [event, sessions, geoProfile, apiKey]);

  const canAnalyze = sessions.length > 0;

  return (
    <div className="td-analysis-panel">
      <button
        className={`td-analyze-btn${status === 'running' ? ' running' : ''}`}
        onClick={analyze}
        disabled={!canAnalyze || status === 'running'}>
        {status === 'running' ? 'Analyzing…' : 'Analyze Sessions'}
      </button>
      {!canAnalyze && <p className="td-analysis-note">Add at least one session to analyze.</p>}

      {status === 'error' && (
        <div className="td-analysis-error">
          <strong>Claude API error:</strong> {errMsg}
          <br />Physics model results are shown below.
        </div>
      )}

      {physicsResults && physicsResults.length > 0 && (
        <div className="td-physics-results">
          <div className="td-results-heading">Physics Model Results</div>
          {physicsResults.map((res, i) => (
            <PhysicsCard key={res.sessionId} analysis={res} session={sessions[i]} />
          ))}
        </div>
      )}

      {aiText && (
        <div className="td-ai-results">
          <div className="td-results-heading">
            Claude Analysis
            <span className="td-results-model">claude-sonnet-4-6</span>
          </div>
          <div className="td-ai-text">{aiText}</div>
        </div>
      )}
    </div>
  );
}

// ─── Event editor ─────────────────────────────────────────────────────────────
function EventEditor({ event, onChange, geoProfiles }) {
  function set(field, val) { onChange({ ...event, [field]: val }); }

  function addSession() {
    const newSession = {
      ...dc(EMPTY_SESSION),
      id: Date.now(),
      name: `Practice ${event.sessions.length + 1}`,
      setup: blankSetup(),
    };
    onChange({ ...event, sessions: [...event.sessions, newSession] });
  }

  function updateSession(idx, updated) {
    const sessions = [...event.sessions];
    sessions[idx] = updated;
    onChange({ ...event, sessions });
  }

  function removeSession(idx) {
    onChange({ ...event, sessions: event.sessions.filter((_, i) => i !== idx) });
  }

  const selectedGeo = event.carProfileId
    ? geoProfiles.find(g => g.id === event.carProfileId) || null
    : null;

  return (
    <div className="td-event-editor">
      {/* Event header */}
      <div className="td-event-meta">
        <div className="ml-row">
          <Field label="Event Name">
            <input className="ml-input ml-input-wide" type="text"
              placeholder="e.g. Wampum 4/26"
              value={event.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="ml-input" type="date"
              value={event.date} onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Track">
            <input className="ml-input" type="text"
              placeholder="e.g. Wampum Speedway"
              value={event.track} onChange={e => set('track', e.target.value)} />
          </Field>
        </div>
        <div className="ml-row" style={{ marginTop: 12 }}>
          <Field label="Car Profile (Suspension Geometry)"
            hint="Select a car from your Suspension Geometry profiles. If none selected, the model default P71 geometry is used.">
            <select className="ml-input ml-select"
              value={event.carProfileId ?? ''}
              onChange={e => set('carProfileId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Model default (P71)</option>
              {geoProfiles.map(g => (
                <option key={g.id} value={g.id}>{g.title || 'Unnamed'} — {g.date}</option>
              ))}
            </select>
          </Field>
        </div>
        {selectedGeo && (
          <div className="td-geo-badge">
            Using geometry profile: <strong>{selectedGeo.title}</strong>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="td-sessions-area">
        <div className="td-sessions-header">
          <span className="td-sessions-title">Practice Sessions</span>
          <button className="ml-new-btn" onClick={addSession}>+ Add Session</button>
        </div>

        {event.sessions.length === 0 && (
          <div className="ml-empty" style={{ padding: '24px' }}>
            No sessions yet — tap "+ Add Session" to log your first practice.
          </div>
        )}

        {event.sessions.map((session, idx) => (
          <div key={session.id} className="td-session-card">
            <div className="td-session-card-header">
              <span className="td-session-card-title">
                {session.name || `Practice ${idx + 1}`}
              </span>
              <button className="ml-delete-btn td-remove-session"
                onClick={() => removeSession(idx)}>Remove</button>
            </div>
            <SessionEditor session={session} index={idx} onChange={u => updateSession(idx, u)} />
          </div>
        ))}

        {event.sessions.length > 0 && (
          <button className="ml-new-btn td-add-session-bottom" onClick={addSession}>
            + Add Session
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function TrackDay() {
  const [events, setEvents]   = useState(() => load(EVENTS_KEY, []));
  const [apiKey, setApiKey]   = useState(() => localStorage.getItem(APIKEY_KEY) || '');
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editing, setEditing] = useState(null);
  const [tab, setTab]         = useState('edit'); // 'edit' | 'analyze'
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const geoProfiles = load(GEO_KEY, []);

  useEffect(() => { save(EVENTS_KEY, events); }, [events]);

  function newEvent() {
    setEditing({ ...dc(EMPTY_EVENT), id: Date.now(), date: new Date().toISOString().slice(0, 10) });
    setSelectedIdx(null);
    setTab('edit');
  }

  function editEvent(idx) {
    setEditing(dc(events[idx]));
    setSelectedIdx(idx);
    setTab('edit');
  }

  function saveEvent() {
    if (!editing) return;
    const updated = [...events];
    if (selectedIdx !== null) {
      updated[selectedIdx] = editing;
    } else {
      updated.push(editing);
      setSelectedIdx(updated.length - 1);
    }
    setEvents(updated);
    setEditing(null);
  }

  function deleteEvent(idx) {
    setEvents(events.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setDeleteConfirm(null);
    setEditing(null);
  }

  const activeEvent = editing ?? (selectedIdx !== null ? events[selectedIdx] : null);
  const geoForActive = activeEvent?.carProfileId
    ? geoProfiles.find(g => g.id === activeEvent.carProfileId) || null
    : null;

  return (
    <div className="td-page">
      {/* Sidebar */}
      <div className="ml-sidebar">
        <div className="ml-sidebar-header">
          <span className="ml-sidebar-title">Events</span>
          <button className="ml-new-btn" onClick={newEvent}>+ New</button>
        </div>
        {events.length === 0 && (
          <div className="ml-empty">No events yet.<br />Tap "+ New" to log a track day.</div>
        )}
        {events.map((ev, idx) => (
          <button key={ev.id}
            className={`ml-car-item${selectedIdx === idx ? ' active' : ''}`}
            onClick={() => editEvent(idx)}>
            <span className="ml-car-name">{ev.name || 'Unnamed Event'}</span>
            <span className="ml-car-date">{ev.date}{ev.sessions.length > 0 ? ` · ${ev.sessions.length} session${ev.sessions.length > 1 ? 's' : ''}` : ''}</span>
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="ml-content">
        {!activeEvent && (
          <div className="ml-splash"><p>Select an event or tap "+ New" to log a track day.</p></div>
        )}

        {activeEvent && (
          <>
            {/* Top bar */}
            <div className="td-topbar">
              <div className="td-topbar-left">
                <span className="td-topbar-title">{activeEvent.name || 'New Event'}</span>
                {activeEvent.date && <span className="td-topbar-date">{activeEvent.date}</span>}
              </div>
              <div className="td-topbar-actions">
                {editing ? (
                  <>
                    <button className="ml-save-btn" onClick={saveEvent}>Save</button>
                    <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                    {selectedIdx !== null && (
                      deleteConfirm === selectedIdx
                        ? <>
                            <span className="ml-delete-confirm-text">Delete?</span>
                            <button className="ml-delete-confirm-btn" onClick={() => deleteEvent(selectedIdx)}>Yes</button>
                            <button className="ml-cancel-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                          </>
                        : <button className="ml-delete-btn" onClick={() => setDeleteConfirm(selectedIdx)}>Delete</button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="ml-edit-btn" onClick={() => editEvent(selectedIdx)}>Edit</button>
                  </>
                )}
              </div>
            </div>

            {/* API key bar */}
            <ApiKeyPanel apiKey={apiKey} setApiKey={setApiKey} />

            {/* Tab switcher */}
            <div className="td-tab-row">
              <button className={`td-inner-tab${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>
                {editing ? 'Edit Sessions' : 'Sessions'}
              </button>
              <button className={`td-inner-tab${tab === 'analyze' ? ' active' : ''}`} onClick={() => setTab('analyze')}>
                Analyze
              </button>
            </div>

            {tab === 'edit' && editing && (
              <div className="td-scroll-area">
                <EventEditor event={editing} onChange={setEditing} geoProfiles={geoProfiles} />
                <div className="ml-editor-footer">
                  <button className="ml-save-btn ml-save-btn-lg" onClick={saveEvent}>Save Event</button>
                  <button className="ml-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}

            {tab === 'edit' && !editing && (
              <div className="td-scroll-area td-view-sessions">
                {activeEvent.sessions.length === 0 ? (
                  <div className="ml-empty" style={{ padding: '32px' }}>No sessions logged. Click Edit to add sessions.</div>
                ) : (
                  activeEvent.sessions.map((s, i) => (
                    <div key={s.id} className="td-view-session-card">
                      <div className="td-view-session-title">{s.name || `Practice ${i + 1}`}</div>
                      <div className="td-view-session-body">
                        {s.condition && <span className="td-view-badge condition">{handlingConditions.find(c => c.value === s.condition)?.label}</span>}
                        {s.phase && <span className="td-view-badge phase">{cornerPhases.find(p => p.value === s.phase)?.label}</span>}
                        {s.ambient && <span className="td-view-badge">🌡 {s.ambient}°F</span>}
                        <div className="td-view-psi">
                          <span className="td-view-psi-label">Cold PSI</span>
                          {['LF', 'RF', 'LR', 'RR'].map(pos => (
                            <span key={pos} className="td-view-psi-item">{pos} {s.setup?.coldPsi?.[pos] ?? '—'}</span>
                          ))}
                        </div>
                        <div className="td-view-psi">
                          <span className="td-view-psi-label">Hot PSI</span>
                          {['LF', 'RF', 'LR', 'RR'].map(pos => (
                            <span key={pos} className="td-view-psi-item">{pos} {s.hotPsi?.[pos] || '—'}</span>
                          ))}
                        </div>
                        {s.lapNotes && <p className="td-view-notes">{s.lapNotes}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'analyze' && (
              <div className="td-scroll-area">
                <AnalysisPanel
                  event={activeEvent}
                  sessions={editing ? editing.sessions : activeEvent.sessions}
                  geoProfile={geoForActive}
                  apiKey={apiKey}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
