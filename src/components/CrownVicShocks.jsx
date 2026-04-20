import { useState } from 'react';

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
          { label: 'Outer Diameter (in)', field: 'outerDiam', placeholder: 'e.g. 4.5' },
          { label: 'Inner Diameter (in)', field: 'innerDiam', placeholder: 'e.g. 3.5' },
          { label: 'Wire Diameter (in)', field: 'wireDiam', placeholder: 'e.g. 0.5' },
          { label: 'Active Coils', field: 'activeCoils', placeholder: 'e.g. 6.5' },
        ].map(({ label, field, placeholder }) => (
          <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</label>
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

function CrownVicShocks() {
  // myRating: Claude independent analysis (10=softest, 0=stiffest)
  //   Factors: construction type (mono vs twin-tube), intended use, brand/product line, stroke length

  const rearShocks = [
    { manufacturer: 'Monroe', partNumber: '5993', type: 'OESpectrum (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.5, extended: 21.25, stroke: 8.75, myRating: 10 },
    { manufacturer: 'Monroe', partNumber: '210108', type: 'Restore (Twin-Tube)', intendedUse: 'Economy (Mustang)', compressed: 12.21, extended: 20.04, stroke: 7.84, myRating: 10 },
    { manufacturer: 'Monroe', partNumber: '210149', type: 'Restore (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.28, extended: 20.04, stroke: 7.76, myRating: 9 },
    { manufacturer: 'PRT', partNumber: '173898', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model / LX (Mustang)', compressed: 12.21, extended: 20.04, stroke: 7.84, myRating: 8 },
    { manufacturer: 'Motorcraft', partNumber: 'ASH24539 06+', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Standard Duty', compressed: 12.4, extended: 20.1, stroke: 7.7, rating: 8, myRating: 8 },
    { manufacturer: 'FCS', partNumber: '341967', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.56, extended: 20.2, stroke: 7.64, rating: 8, myRating: 8 },
    { manufacturer: 'Duralast', partNumber: 'TS33-31962B', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model', compressed: 12.56, extended: 20.16, stroke: 7.6, rating: 8, myRating: 8 },
    { manufacturer: 'FCS', partNumber: '341587', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'GT Base / Original Ride (Mustang)', compressed: 12.2, extended: 20.08, stroke: 7.88, rating: 8, myRating: 7 },
    { manufacturer: 'Monroe', partNumber: '5783', type: 'OESpectrum (Twin-Tube)', intendedUse: 'Original Ride Quality (Mustang)', compressed: 12.5, extended: 20.0, stroke: 7.5, rating: 8, myRating: 8 },
    { manufacturer: 'Gabriel', partNumber: '69593', type: 'Ultra (Twin-Tube)', intendedUse: 'Convertible / Original Ride (Mustang)', compressed: 12.56, extended: 20.07, stroke: 7.51, rating: 7, myRating: 7 },
    { manufacturer: 'Gabriel', partNumber: '69592', type: 'Ultra (Twin-Tube)', intendedUse: 'Coupe / Original Ride (Mustang)', compressed: 12.56, extended: 20.07, stroke: 7.51, rating: 7, myRating: 7 },
    { manufacturer: 'KYB', partNumber: '349026', type: 'Excel-G (Twin-Tube)', intendedUse: 'GT Model / Original Ride (Mustang)', compressed: 12.2, extended: 20.03, stroke: 7.83, rating: 7, myRating: 7 },
    { manufacturer: 'Gabriel', partNumber: '69575', type: 'Ultra (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 20.16, stroke: 7.76, rating: 7, myRating: 7 },
    { manufacturer: 'KYB', partNumber: '555601', type: 'Gas-a-Just (Monotube)', intendedUse: 'Performance Upgrade', compressed: 12.92, extended: 20.09, stroke: 7.17, rating: 5, myRating: 4 },
    { manufacturer: 'FCS', partNumber: 'DT551380', type: 'Monotube Gas Charged', intendedUse: 'Base Model', compressed: 12.99, extended: 20.0, stroke: 7.01, rating: 5, myRating: 5 },
    { manufacturer: 'Motorcraft', partNumber: 'ASH12277 03-05', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Heavy Duty / Handling', compressed: 12.5, extended: 20.26, stroke: 7.76, rating: 4, myRating: 4 },
    { manufacturer: 'KYB', partNumber: '554355', type: 'Gas-A-Just (Monotube)', intendedUse: 'Increased Handling (Mustang)', compressed: 12.79, extended: 20.03, stroke: 7.24, rating: 4, myRating: 3 },
    { manufacturer: 'PRT', partNumber: '194510', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.28, extended: 20.04, stroke: 7.76, rating: 4, myRating: 3 },
    { manufacturer: 'Duralast', partNumber: 'TS33-32752B', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.4, extended: 20.31, stroke: 7.91, rating: 3, myRating: 3 },
    { manufacturer: 'Gabriel', partNumber: '69574', type: 'Ultra (Twin-Tube)', intendedUse: 'Police Interceptor', compressed: 12.5, extended: 20.26, stroke: 7.76, rating: 3, myRating: 3 },
    { manufacturer: 'PRT', partNumber: '194574', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.99, extended: 19.88, stroke: 6.89, rating: 3, myRating: 2 },
    { manufacturer: 'KYB', partNumber: '555603', type: 'Gas-a-Just (Monotube)', intendedUse: 'Police / Taxi', compressed: 12.92, extended: 20.09, stroke: 7.17, rating: 2, myRating: 1 },
    { manufacturer: 'Monroe', partNumber: '550018', type: 'Magnum Severe Service (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.5, extended: 20.0, stroke: 7.5, rating: 1, myRating: 1 },
    { manufacturer: 'Monroe', partNumber: '550055', type: 'Magnum Severe Service (Twin-Tube)', intendedUse: 'Police Interceptor', compressed: 12.375, extended: 20.125, stroke: 7.75, myRating: 1 },
  ];

  const frontStruts = [
    { manufacturer: 'FCS', partNumber: '1336343', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.01, extended: 15.59, stroke: 3.58, myRating: 10 },
    { manufacturer: 'PRT', partNumber: '714075', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.09, extended: 15.55, stroke: 3.47, myRating: 9 },
    { manufacturer: 'Monroe', partNumber: '171346', type: 'Quick-Strut (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.25, extended: 15.52, stroke: 3.27, myRating: 8 },
    { manufacturer: 'KYB', partNumber: 'SR4140', type: 'Strut-Plus (Monotube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 15.51, stroke: 3.11, myRating: 5 },
    { manufacturer: 'KYB', partNumber: '551600', type: 'Strut (Monotube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 15.51, stroke: 3.11, myRating: 5 },
    { manufacturer: 'FCS', partNumber: '1336349', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 11.85, extended: 15.94, stroke: 4.09, myRating: 4 },
    { manufacturer: 'PRT', partNumber: '710415', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.28, extended: 15.71, stroke: 3.43, myRating: 3 },
    { manufacturer: 'Monroe', partNumber: '271346', type: 'Quick-Strut (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.25, extended: 15.52, stroke: 3.27, myRating: 2 },
  ];

  // Rating color: 10=soft(green), 0=stiff(red)
  const getMyRatingColor = (rating) => {
    if (rating >= 8) return 'var(--green)';
    if (rating >= 5) return 'var(--yellow)';
    return 'var(--red)';
  };

  const ShockTable = ({ data }) => (
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
            <th>Stiffness Rating (10 Soft – 0 Stiff)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <td>{row.manufacturer}</td>
              <td>{row.partNumber}</td>
              <td>{row.type}</td>
              <td>{row.intendedUse}</td>
              <td>{row.compressed}</td>
              <td>{row.extended}</td>
              <td>{row.stroke}</td>
              <td style={{ color: getMyRatingColor(row.myRating), fontWeight: 700 }}>{row.myRating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="shocks-reference-page">
      <div className="section-header">
        <h2>Ford Crown Victoria – Shocks &amp; Struts Guide</h2>
        <p className="section-description">
          Comprehensive list of rear shocks and front struts compiled from RockAuto. Stiffness ratings analyzed independently based on construction type, intended application, brand/product line, and stroke length. Scale: 10 = softest, 0 = stiffest.
        </p>
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

      <div className="shock-specs-container">
        <h3 className="section-sub-header">Rear Shocks</h3>
        <ShockTable data={rearShocks} />
      </div>

      <div className="shock-specs-container" style={{ marginTop: '24px' }}>
        <h3 className="section-sub-header">Front Strut &amp; Coil Spring Assemblies</h3>
        <ShockTable data={frontStruts} />
      </div>

      <SpringRateCalculator />

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
