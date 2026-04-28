import { useState, useRef, useEffect } from 'react';
import { REAR_SHOCKS, FRONT_STRUTS } from '../data/shockOptions';

function Tooltip({ text }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setVisible(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '5px' }}>
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          background: 'var(--accent)',
          border: 'none',
          borderRadius: '50%',
          width: '16px',
          height: '16px',
          fontSize: '10px',
          fontWeight: 700,
          color: 'white',
          cursor: 'pointer',
          lineHeight: '16px',
          padding: 0,
          flexShrink: 0,
        }}
        aria-label="Help"
      >?</button>
      {visible && (
        <span style={{
          position: 'absolute',
          bottom: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--accent)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '0.78rem',
          color: 'var(--text-primary)',
          width: '220px',
          zIndex: 100,
          lineHeight: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          whiteSpace: 'normal',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function SpringRateCalculator() {
  const [inputs, setInputs] = useState({ outerDiam: '', innerDiam: '', wireDiam: '', activeCoils: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (field, val) => setInputs(prev => ({ ...prev, [field]: val }));

  const calculate = () => {
    const od = parseFloat(inputs.outerDiam);
    const id = parseFloat(inputs.innerDiam);
    const wd = parseFloat(inputs.wireDiam);
    const ac = parseFloat(inputs.activeCoils);

    if ([od, id, wd, ac].some(isNaN) || od <= 0 || id <= 0 || wd <= 0 || ac <= 0) {
      setError('All fields must be positive numbers.');
      setResult(null);
      return;
    }
    if (wd >= od / 2 || wd >= id / 2) {
      setError('Wire diameter must be smaller than the coil radii.');
      setResult(null);
      return;
    }

    // Mean coil diameter = (OD + ID) / 2
    const meanDiam = (od + id) / 2;
    const k = (11250000 * Math.pow(wd, 4)) / (8 * Math.pow(meanDiam, 3) * ac);

    setError('');
    setResult({ k: k.toFixed(1), meanDiam: meanDiam.toFixed(3) });
  };

  const reset = () => { setInputs({ outerDiam: '', innerDiam: '', wireDiam: '', activeCoils: '' }); setResult(null); setError(''); };

  return (
    <div className="shock-info-card" style={{ marginTop: '32px' }}>
      <h3 style={{ marginBottom: '12px' }}>Spring Rate Calculator</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
        Calculates coil spring rate using the standard steel spring formula. All measurements in inches.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Outer Diameter (in)', field: 'outerDiam', placeholder: 'e.g. 4.5', tip: 'Measure across the outside of the coil from one side to the other (not the wire itself). Use calipers or a ruler on the widest point of the spring.' },
          { label: 'Inner Diameter (in)', field: 'innerDiam', placeholder: 'e.g. 3.5', tip: 'Measure across the inside opening of the coil. If you only have OD and wire diameter, Inner Diameter = OD − (2 × wire diameter).' },
          { label: 'Wire Diameter (in)', field: 'wireDiam', placeholder: 'e.g. 0.5', tip: 'Measure the thickness of the spring wire itself using calipers. Measure on a straight section, not at a bend.' },
          { label: 'Active Coils', field: 'activeCoils', placeholder: 'e.g. 6.5', tip: 'Count the coils that are NOT touching or ground flat at the ends. Typically total coils minus 1.5–2. Partial coils count as fractions (e.g. 6.5).' },
        ].map(({ label, field, placeholder, tip }) => (
          <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{label}<Tooltip text={tip} /></label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={placeholder}
              value={inputs[field]}
              onChange={e => set(field, e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '8px 10px',
                fontSize: '0.95rem',
                width: '100%',
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={calculate} className="calc-btn-primary">Calculate</button>
        <button onClick={reset} className="calc-btn-secondary">Reset</button>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.9rem', marginBottom: '8px' }}>{error}</p>}

      {result && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Spring Rate</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--green)' }}>{result.k} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>lbs/in</span></div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Mean Coil Diameter</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{result.meanDiam} in</div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: 0 }}>
            Formula: k = (11,250,000 × d⁴) / (8 × D³ × N) — where D = mean coil diameter = (OD + ID) / 2
          </p>
        </div>
      )}
    </div>
  );
}

function SpringLoadCalculator() {
  const [inputs, setInputs] = useState({ springRate: '', freeLength: '', installedHeight: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (field, val) => setInputs(prev => ({ ...prev, [field]: val }));

  const calculate = () => {
    const k = parseFloat(inputs.springRate);
    const fl = parseFloat(inputs.freeLength);
    const ih = parseFloat(inputs.installedHeight);

    if ([k, fl, ih].some(isNaN) || k <= 0 || fl <= 0 || ih <= 0) {
      setError('All fields must be positive numbers.');
      setResult(null);
      return;
    }
    if (ih >= fl) {
      setError('Installed height must be less than free length (spring must be compressed).');
      setResult(null);
      return;
    }

    const deflection = fl - ih;
    const load = k * deflection;

    setError('');
    setResult({ load: load.toFixed(1), deflection: deflection.toFixed(3) });
  };

  const reset = () => { setInputs({ springRate: '', freeLength: '', installedHeight: '' }); setResult(null); setError(''); };

  return (
    <div className="shock-info-card" style={{ marginTop: '16px' }}>
      <h3 style={{ marginBottom: '12px' }}>Spring Load Calculator</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
        Calculates how much weight the spring is supporting at ride height. Enter spring rate in lbs/in and heights in inches.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Spring Rate (lbs/in)', field: 'springRate', placeholder: 'e.g. 350', tip: 'The spring rate from the manufacturer spec sheet or calculated using the Spring Rate Calculator above. Units must be lbs per inch.' },
          { label: 'Free Length (in)', field: 'freeLength', placeholder: 'e.g. 12.0', tip: 'The uncompressed length of the spring with no load on it. Measure with the spring off the car, standing upright on a flat surface.' },
          { label: 'Installed Height (in)', field: 'installedHeight', placeholder: 'e.g. 9.5', tip: 'Measure from the lower spring perch to the upper spring perch with the car at normal ride height. On a Crown Vic front, this is typically around 8.0–9.5".' },
        ].map(({ label, field, placeholder, tip }) => (
          <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{label}<Tooltip text={tip} /></label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={placeholder}
              value={inputs[field]}
              onChange={e => set(field, e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '8px 10px',
                fontSize: '0.95rem',
                width: '100%',
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={calculate} className="calc-btn-primary">Calculate</button>
        <button onClick={reset} className="calc-btn-secondary">Reset</button>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.9rem', marginBottom: '8px' }}>{error}</p>}

      {result && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Installed Load</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--green)' }}>{result.load} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>lbs</span></div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Deflection</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{result.deflection} in</div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: 0 }}>
            Formula: Load = k × (Free Length − Installed Height) = {inputs.springRate} × {result.deflection} = {result.load} lbs
          </p>
        </div>
      )}
    </div>
  );
}

function InstalledHeightCalculator() {
  const [inputs, setInputs] = useState({ springRate: '', freeLength: '', targetLoad: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (field, val) => setInputs(prev => ({ ...prev, [field]: val }));

  const calculate = () => {
    const k = parseFloat(inputs.springRate);
    const fl = parseFloat(inputs.freeLength);
    const tl = parseFloat(inputs.targetLoad);

    if ([k, fl, tl].some(isNaN) || k <= 0 || fl <= 0 || tl <= 0) {
      setError('All fields must be positive numbers.');
      setResult(null);
      return;
    }
    const deflection = tl / k;
    const installedHeight = fl - deflection;
    if (installedHeight <= 0) {
      setError('Target load requires more deflection than the free length allows. Reduce target load or use a higher spring rate.');
      setResult(null);
      return;
    }

    setError('');
    setResult({ installedHeight: installedHeight.toFixed(3), deflection: deflection.toFixed(3) });
  };

  const reset = () => { setInputs({ springRate: '', freeLength: '', targetLoad: '' }); setResult(null); setError(''); };

  return (
    <div className="shock-info-card" style={{ marginTop: '16px' }}>
      <h3 style={{ marginBottom: '12px' }}>Installed Height for Target Load</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
        Given a desired spring load at ride height, calculates the installed height you need to achieve it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Spring Rate (lbs/in)', field: 'springRate', placeholder: 'e.g. 417.5', tip: 'The spring rate from spec sheet or calculated with the Spring Rate Calculator above. Units must be lbs per inch.' },
          { label: 'Free Length (in)', field: 'freeLength', placeholder: 'e.g. 11.0', tip: 'The uncompressed length of the spring with no load on it. Measure with the spring off the car, standing upright on a flat surface.' },
          { label: 'Target Load (lbs)', field: 'targetLoad', placeholder: 'e.g. 1050', tip: 'The spring load you want to achieve at ride height. For a P71 Crown Vic front, a typical target is 900–1,200 lbs per corner.' },
        ].map(({ label, field, placeholder, tip }) => (
          <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{label}<Tooltip text={tip} /></label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={placeholder}
              value={inputs[field]}
              onChange={e => set(field, e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '8px 10px',
                fontSize: '0.95rem',
                width: '100%',
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button onClick={calculate} className="calc-btn-primary">Calculate</button>
        <button onClick={reset} className="calc-btn-secondary">Reset</button>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: '0.9rem', marginBottom: '8px' }}>{error}</p>}

      {result && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Required Installed Height</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--green)' }}>{result.installedHeight} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>in</span></div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Required Deflection</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{result.deflection} in</div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: 0 }}>
            Formula: Installed Height = Free Length − (Target Load ÷ k) = {inputs.freeLength} − ({inputs.targetLoad} ÷ {inputs.springRate}) = {result.installedHeight} in
          </p>
        </div>
      )}
    </div>
  );
}

function SpringReferenceTable() {
  const rows = [
    { freeLength: 12.0, installedHeight: 8.0, deflection: 4.0, load: (417.5 * 4.0).toFixed(0), notes: 'Very high preload' },
    { freeLength: 11.0, installedHeight: 8.0, deflection: 3.0, load: (417.5 * 3.0).toFixed(0), notes: 'Typical range' },
    { freeLength: 10.5, installedHeight: 8.0, deflection: 2.5, load: (417.5 * 2.5).toFixed(0), notes: 'Moderate' },
  ];

  return (
    <div className="shock-info-card" style={{ marginTop: '16px' }}>
      <h3 style={{ marginBottom: '4px' }}>Crown Vic Front Spring — Reference Table</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
        Example calculations at a common installed height of 8.0" using a 417.5 lbs/in spring rate. Replace free length with your measured value.
      </p>
      <div className="table-responsive">
        <table className="shock-specs-table">
          <thead>
            <tr>
              <th>Free Length</th>
              <th>Installed Height</th>
              <th>Deflection</th>
              <th>Approx. Load (lbs)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.freeLength.toFixed(1)}"</td>
                <td>{r.installedHeight.toFixed(1)}"</td>
                <td>{r.deflection.toFixed(1)}"</td>
                <td style={{ fontWeight: 700, color: 'var(--green)' }}>{r.load} lbs</td>
                <td style={{ color: 'var(--text-secondary)' }}>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h4 style={{ marginBottom: '10px', fontSize: '0.95rem' }}>Measurement Tips</h4>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Free Length', desc: 'Measure with the spring completely off the car, standing upright on a flat surface with zero load applied.' },
            { label: 'Installed Height', desc: 'Measure from the lower spring perch to the upper spring perch with the car at normal ride height.' },
            { label: 'P71 Typical Range', desc: 'Front spring load on a P71 Crown Vic is roughly 900–1,200 lbs per spring at ride height.' },
          ].map(({ label, desc }) => (
            <li key={label} style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap', minWidth: '120px' }}>{label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ShockTable({ data }) {
  const [expanded, setExpanded] = useState(null);
  const getRatingColor = (r) => r >= 7 ? 'var(--green)' : r >= 4 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div className="table-responsive">
      <table className="shock-specs-table">
        <thead>
          <tr>
            <th>Mfg.</th>
            <th>Part #</th>
            <th>Type</th>
            <th>Usage</th>
            <th>Comp. (in)</th>
            <th>Ext. (in)</th>
            <th>Stroke (in)</th>
            <th>Rating</th>
            <th>R/C Split</th>
            <th>Roles</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const isOpen = expanded === i;
            return (
              <>
                <tr key={i} style={{ cursor: row.ovalRole ? 'pointer' : 'default' }}
                  onClick={() => setExpanded(isOpen ? null : i)}>
                  <td>{row.manufacturer}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{row.part}</td>
                  <td>{row.type}</td>
                  <td>{row.use}</td>
                  <td>{row.compressed}</td>
                  <td>{row.extended}</td>
                  <td>{row.stroke}</td>
                  <td style={{ color: getRatingColor(row.rating), fontWeight: 700, textAlign: 'center' }}>{row.rating}</td>
                  <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{row.dampingBias}</td>
                  <td style={{ textAlign: 'center' }}>
                    {row.ovalRole && (
                      <button
                        onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : i); }}
                        style={{
                          background: isOpen ? 'var(--accent)' : 'rgba(59,130,246,0.15)',
                          border: 'none', borderRadius: '4px', color: isOpen ? 'white' : 'var(--accent)',
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', cursor: 'pointer',
                        }}
                      >{isOpen ? '▲ hide' : '▼ show'}</button>
                    )}
                  </td>
                </tr>
                {isOpen && row.ovalRole && (
                  <tr key={`${i}-detail`} style={{ background: 'rgba(59,130,246,0.04)' }}>
                    <td colSpan={10} style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '4px' }}>
                            Oval Role
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{row.ovalRole}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a78bfa', marginBottom: '4px' }}>
                            Figure 8 Role
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{row.f8Role}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CrownVicShocks() {
  return (
    <div className="shocks-reference-page">
      <div className="section-header">
        <h2>Ford Crown Victoria – Shocks &amp; Struts Guide</h2>
        <p className="section-description">
          Comprehensive list of rear shocks and front struts compiled from RockAuto. Stiffness ratings analyzed independently based on construction type, intended application, brand/product line, and stroke length. Scale: 10 = softest, 0 = stiffest.
        </p>
      </div>

      {/* Recommended setups */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '32px' }}>

        <div className="shock-info-card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h4 style={{ color: 'var(--accent)', marginBottom: '12px' }}>Recommended — Oval Setup</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            {[
              { pos: 'LF', part: 'FCS 1336349', rating: 4, type: 'Police/Taxi Twin-Tube', spring: '475 lbs/in', role: 'Firm front — raises LLTD, controls body roll on entry' },
              { pos: 'RF', part: 'FCS 1336349', rating: 4, type: 'Police/Taxi Twin-Tube', spring: '475 lbs/in', role: 'Firm front — keeps RF planted, steering authority on exit' },
              { pos: 'LR', part: 'Monroe 550018', rating: 1, type: 'Magnum Severe Service', spring: '160 lbs/in (stock coil)', role: 'Stiffest twin-tube rear — resists rear roll return, reduces rotation' },
              { pos: 'RR', part: 'Monroe 550018', rating: 1, type: 'Magnum Severe Service', spring: '160 lbs/in (stock coil)', role: 'Stiffest twin-tube rear — plants RR, tight/push balance' },
            ].map(({ pos, part, rating, type, spring, role }) => (
              <div key={pos} style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{pos}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', borderRadius: '4px', padding: '1px 6px' }}>Rating {rating}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{part}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{type} · {spring}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{role}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Why:</strong> Firm fronts (rating 4) hit the 46% front LLTD target — keeps weight on the RF long enough to maintain steering authority through the corner. Stiffest rear (rating 1) plants both rear tires and reduces rear rotation tendency, balancing the tight fronts. Pair with RF camber −3.25° and RF caster 5.5° for maximum RF contact patch.
          </div>
        </div>

        <div className="shock-info-card" style={{ borderLeft: '3px solid #a78bfa' }}>
          <h4 style={{ color: '#a78bfa', marginBottom: '12px' }}>Recommended — Figure 8 Setup</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            {[
              { pos: 'LF', part: 'FCS 1336349', rating: 4, type: 'Police/Taxi Twin-Tube', spring: '475 lbs/in', role: 'Firm — controls crossover speed; symmetric with RF essential on F8' },
              { pos: 'RF', part: 'FCS 1336349', rating: 4, type: 'Police/Taxi Twin-Tube', spring: '475 lbs/in', role: 'Firm — symmetric with LF; both fronts matched for equal L/R behavior' },
              { pos: 'LR', part: 'KYB 555603', rating: 0, type: 'Gas-a-Just Monotube — Police', spring: '160 lbs/in (stock coil)', role: 'Stiffest rear — maximum crossover stability; plants rear for rotation availability' },
              { pos: 'RR', part: 'KYB 555603', rating: 0, type: 'Gas-a-Just Monotube — Police', spring: '160 lbs/in (stock coil)', role: 'Stiffest rear — symmetric with LR; consistent feel in both turn directions' },
            ].map(({ pos, part, rating, type, spring, role }) => (
              <div key={pos} style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{pos}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: '4px', padding: '1px 6px' }}>Rating {rating}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{part}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{type} · {spring}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{role}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Why:</strong> Symmetric firm fronts (rating 4, FCS 1336349) control crossover speed equally in both turn directions — asymmetric fronts create an imbalance between left and right loops. Stiffest monotube rear (KYB 555603, rating 0) keeps the rear planted through the direction change at the crossover, giving the driver a stable platform to initiate rotation. The stiff rear / firm front combination prevents the rear from stepping out unpredictably mid-transition.
          </div>
        </div>

      </div>

      <div className="shock-cards-grid" style={{ marginBottom: '32px' }}>

        <div className="shock-info-card">
          <h4>Stiffness Rating Scale</h4>
          <div className="shock-rating-scale">
            <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '1.1rem' }}>10</span>
            <div className="shock-scale-bar" />
            <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '1.1rem' }}>0</span>
          </div>
          <div className="shock-scale-labels">
            <span style={{ color: 'var(--green)' }}>Softest</span>
            <span style={{ color: 'var(--red)' }}>Stiffest</span>
          </div>
        </div>

        <div className="shock-info-card">
          <h4>Rating Methodology</h4>
          <ol className="shock-method-list">
            <li>
              <span className="method-label">Construction Type</span>
              <span className="method-weight">Highest weight</span>
              <span className="method-desc">Monotube = −4 to −5 pts vs twin-tube (~360 psi vs ~150 psi operating pressure)</span>
            </li>
            <li>
              <span className="method-label">Intended Application</span>
              <span className="method-weight">High weight</span>
              <span className="method-desc">Police/Severe Service = −5 to −6 · Heavy Duty = −3 to −4 · Base/Economy = baseline</span>
            </li>
            <li>
              <span className="method-label">Brand / Product Line</span>
              <span className="method-weight">Medium weight</span>
              <span className="method-desc">Restore → OESpectrum → Gabriel Ultra / Excel-G → Gas-A-Just / Magnum (stiffest)</span>
            </li>
            <li>
              <span className="method-label">Stroke Length</span>
              <span className="method-weight">Tiebreaker</span>
              <span className="method-desc">Shorter stroke = harsher feel within same category, nudges rating −1</span>
            </li>
          </ol>
        </div>

        <div className="shock-info-card">
          <h4>Construction Type</h4>
          <div className="shock-type-block">
            <div className="shock-type-label">Monotube</div>
            <ul className="shock-bullet-list">
              <li>Single working chamber</li>
              <li>Floating piston separates N₂ gas (~360 psi) from oil</li>
              <li>More precise valving, runs cooler</li>
              <li>Inherently stiffer than twin-tube</li>
            </ul>
          </div>
          <div className="shock-type-block" style={{ marginTop: '12px' }}>
            <div className="shock-type-label">Twin-Tube</div>
            <ul className="shock-bullet-list">
              <li>Inner working tube + outer reserve tube</li>
              <li>Lower gas pressure (~150 psi)</li>
              <li>More compliant valving</li>
              <li>Standard OE design for comfort vehicles</li>
            </ul>
          </div>
        </div>

        <div className="shock-info-card">
          <h4>Intended Use Impact</h4>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--green)' }}>Economy / Base / LX</span>
              <span className="use-desc">Softest valving — comfort-first, minimum spec</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--green)' }}>Original Ride Quality</span>
              <span className="use-desc">OE-spec match — moderate comfort</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--yellow)' }}>Heavy Duty / Handling</span>
              <span className="use-desc">Notably firmer than base OE — improved body control</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--red)' }}>Police / Taxi / Severe</span>
              <span className="use-desc">Significantly stiffer — high-speed stability, heavy load, sustained hard use</span>
            </div>
          </div>
        </div>

        <div className="shock-info-card">
          <h4>Brand / Product Line</h4>
          <div className="shock-brand-tier">
            <div className="tier-header" style={{ color: 'var(--green)' }}>Softest</div>
            <ul className="shock-bullet-list">
              <li>Monroe Restore — budget economy</li>
              <li>Monroe OESpectrum / Quick-Strut — quality OE match</li>
              <li>FCS / PRT / Duralast — generic OE replacement</li>
            </ul>
          </div>
          <div className="shock-brand-tier">
            <div className="tier-header" style={{ color: 'var(--yellow)' }}>Mild Step-Up</div>
            <ul className="shock-bullet-list">
              <li>Gabriel Ultra — slightly sportier than base OE</li>
              <li>KYB Excel-G — OE-spec with slightly firmer valving</li>
            </ul>
          </div>
          <div className="shock-brand-tier">
            <div className="tier-header" style={{ color: 'var(--red)' }}>Firmest</div>
            <ul className="shock-bullet-list">
              <li>KYB Gas-A-Just — high-pressure monotube</li>
              <li>KYB Strut-Plus — monotube strut</li>
              <li>Monroe Magnum Severe Service — stiffest twin-tube Monroe makes</li>
            </ul>
          </div>
        </div>

        <div className="shock-info-card">
          <h4>Stroke &amp; Perceived Stiffness</h4>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--green)' }}>Longer Stroke</span>
              <span className="use-desc">More travel before limits are hit — smoother, more compliant feel over large bumps</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--red)' }}>Shorter Stroke</span>
              <span className="use-desc">Hits limits sooner — harsher feel on rough surfaces regardless of valving</span>
            </div>
          </div>
          <p className="shock-note">Stroke length does not set damping rate — stiffness is determined entirely by internal valving.</p>
        </div>

      </div>

      {/* Damping explanation */}
      <div className="shock-cards-grid" style={{ marginBottom: '32px' }}>

        <div className="shock-info-card">
          <h4>Rebound vs. Compression</h4>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--accent)' }}>Rebound</span>
              <span className="use-desc">Resists the shock <strong>extending</strong> — wheel dropping after a bump or body roll recovery. Controls how long a corner stays loaded after weight transfer and how fast the car returns to ride height.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--yellow)' }}>Compression</span>
              <span className="use-desc">Resists the shock <strong>compressing</strong> — wheel rising on a bump or during initial cornering load transfer. Controls how fast weight moves to a corner at turn-in.</span>
            </div>
          </div>
          <p className="shock-note">Damping rates are set by internal valving (orifice size, shim stacks, gas charge). You cannot calculate them from shock lengths — stroke is travel range only.</p>
        </div>

        <div className="shock-info-card">
          <h4>Rebound/Compression Split by Type</h4>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--green)' }}>Base Twin-Tube</span>
              <span className="use-desc">~58% rebound / 42% compression — comfort-biased, slow return to ride height</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--yellow)' }}>Police Twin-Tube</span>
              <span className="use-desc">~62% rebound / 38% compression — moderate rebound, resists body roll recovery</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--red)' }}>Monotube</span>
              <span className="use-desc">~65% rebound / 35% compression — highest rebound bias; gas charge handles compression, valving emphasizes rebound control</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--red)' }}>Monroe Magnum</span>
              <span className="use-desc">~63% rebound / 37% compression — police-rated twin-tube, firm overall</span>
            </div>
          </div>
          <p className="shock-note">"Add rebound" on a non-adjustable shock = select a stiffer shock (lower rating) at that corner. Stiffer = more total damping = more rebound effect since rebound is always the larger share.</p>
        </div>

        <div className="shock-info-card">
          <h4>Oval — Corner Roles</h4>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--accent)' }}>RF (outside front)</span>
              <span className="use-desc">More rebound = RF stays planted longer under throttle = steering authority on exit. Too much = tight exit. Too little = loose entry.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--accent)' }}>LF (inside front)</span>
              <span className="use-desc">More rebound = slows body roll → raises front LLTD → tightens entry. Less = lower LLTD → loosens entry.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--accent)' }}>RR (outside rear)</span>
              <span className="use-desc">More rebound = rear stays planted = resists rotation = tighter. Less = rear rotates more freely = looser.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: 'var(--accent)' }}>LR (inside rear)</span>
              <span className="use-desc">More rebound = slows roll return → raises rear LLTD → loosens. Less = inside rear extends freely → lowers rear LLTD → tightens.</span>
            </div>
          </div>
        </div>

        <div className="shock-info-card">
          <h4>Figure 8 — Setup Roles</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
            On a figure 8, each front strut alternates inside/outside every half-lap. Corner-specific loading language doesn't apply — use symmetric fronts and focus on transition rate.
          </p>
          <div className="shock-use-table">
            <div className="shock-use-row">
              <span className="use-label" style={{ color: '#a78bfa' }}>Front rebound</span>
              <span className="use-desc">Controls direction change speed. More rebound = slower weight transfer return = car takes longer to load up = push through crossover. Less = faster, sharper direction change.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: '#a78bfa' }}>Rear rebound</span>
              <span className="use-desc">Controls crossover stability. More rebound = rear stays planted = more rotation available but must not be overdone. Too much = rear slow to settle = loose mid-transition.</span>
            </div>
            <div className="shock-use-row">
              <span className="use-label" style={{ color: '#a78bfa' }}>Front compression</span>
              <span className="use-desc">Controls initial load transfer at crossover. Too stiff = abrupt weight shift = unsettled. Too soft = sluggish turn-in bite.</span>
            </div>
          </div>
        </div>

      </div>

      <div className="shock-specs-container">
        <h3 className="section-sub-header">Rear Shocks</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Click "show" on any row to see Oval and Figure 8 setup roles for that shock.</p>
        <ShockTable data={REAR_SHOCKS} />
      </div>

      <div className="shock-specs-container" style={{ marginTop: '24px' }}>
        <h3 className="section-sub-header">Front Strut &amp; Coil Spring Assemblies</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Click "show" on any row to see Oval and Figure 8 setup roles for that strut.</p>
        <ShockTable data={FRONT_STRUTS} />
      </div>

      <SpringRateCalculator />
      <SpringLoadCalculator />
      <InstalledHeightCalculator />
      <SpringReferenceTable />

      <div className="handling-tips-considerations" style={{ marginTop: '32px' }}>
        <h3>Key Takeaways</h3>
        <ul>
          <li>Damping rate (stiffness) is determined entirely by internal valving — stroke length does not set how stiff a shock feels, only how much travel is available.</li>
          <li>Monotube shocks operate at roughly 2–2.5× the gas pressure of twin-tube units (~360 psi vs ~150 psi). This, combined with a single working chamber, makes them inherently firmer and more responsive than twin-tube equivalents.</li>
          <li>Police/Taxi rated shocks use significantly firmer valving designed for high-speed stability under sustained heavy load — commonly used in performance and track applications for the same reason.</li>
          <li>Monroe "Magnum Severe Service" (550018 and 550055, twin-tube) and KYB "Gas-A-Just" (monotube) in Police/Taxi spec are the stiffest rear options in this list, all rated 1.</li>
          <li>Monroe "Restore" is a budget economy line targeting minimum-spec replacement — not a performance product and not tuned to match OE damping precisely.</li>
          <li>Monroe "OESpectrum" and "Quick-Strut" are quality OE-match products, a meaningful step above Restore in consistency and durability even though both are comfort-oriented.</li>
          <li>Stroke length affects how stiffness is perceived: a short-stroke shock will bottom out sooner on rough surfaces and feel harsher, even if its valving is not particularly stiff.</li>
          <li>The PRT 194574 (rear, Police/Taxi) has the shortest stroke of all rear shocks at 6.89" — the combination of Police-spec valving and minimal travel makes it the harshest-riding option in the rear group.</li>
        </ul>
      </div>
    </div>
  );
}

export default CrownVicShocks;
