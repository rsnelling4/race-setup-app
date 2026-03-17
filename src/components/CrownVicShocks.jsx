function CrownVicShocks() {
  const rearShocks = [
    { manufacturer: 'Monroe', partNumber: '5993', type: 'OESpectrum (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.5, extended: 21.25, stroke: 8.75, rating: 10 },
    { manufacturer: 'Monroe', partNumber: '210108', type: 'Restore (Twin-Tube)', intendedUse: 'Economy (Mustang)', compressed: 12.21, extended: 20.04, stroke: 7.84, rating: 10 },
    { manufacturer: 'Monroe', partNumber: '210149', type: 'Restore', intendedUse: 'Base Model / LX', compressed: 12.28, extended: 20.04, stroke: 7.76, rating: 9 },
    { manufacturer: 'PRT', partNumber: '173898', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model / LX (Mustang)', compressed: 12.21, extended: 20.04, stroke: 7.84, rating: 9 },
    { manufacturer: 'Motorcraft', partNumber: 'ASH24539 06+', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Standard Duty', compressed: 12.4, extended: 20.1, stroke: 7.7, rating: 8 },
    { manufacturer: 'FCS', partNumber: '341967', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.56, extended: 20.2, stroke: 7.64, rating: 8 },
    { manufacturer: 'Duralast', partNumber: 'TS33-31962B', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Base Model', compressed: 12.56, extended: 20.16, stroke: 7.6, rating: 8 },
    { manufacturer: 'FCS', partNumber: '341587', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'GT Base / Original Ride (Mustang)', compressed: 12.2, extended: 20.08, stroke: 7.88, rating: 8 },
    { manufacturer: 'Monroe', partNumber: '5783', type: 'OESpectrum (Twin-Tube)', intendedUse: 'Original Ride Quality (Mustang)', compressed: 12.5, extended: 20.0, stroke: 7.5, rating: 8 },
    { manufacturer: 'Gabriel', partNumber: '69593', type: 'Ultra (Twin-Tube)', intendedUse: 'Convertible / Original Ride (Mustang)', compressed: 12.56, extended: 20.07, stroke: 7.51, rating: 7 },
    { manufacturer: 'Gabriel', partNumber: '69592', type: 'Ultra (Twin-Tube)', intendedUse: 'Coupe / Original Ride (Mustang)', compressed: 12.56, extended: 20.07, stroke: 7.51, rating: 7 },
    { manufacturer: 'KYB', partNumber: '349026', type: 'Excel-G (Twin-Tube)', intendedUse: 'GT Model / Original Ride (Mustang)', compressed: 12.2, extended: 20.03, stroke: 7.83, rating: 7 },
    { manufacturer: 'Gabriel', partNumber: '69575', type: 'Ultra (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 20.16, stroke: 7.76, rating: 7 },
    { manufacturer: 'KYB', partNumber: '555601', type: 'Gas-a-Just (Monotube)', intendedUse: 'Performance Upgrade', compressed: 12.92, extended: 20.09, stroke: 7.17, rating: 5 },
    { manufacturer: 'FCS', partNumber: 'DT551380', type: 'Monotube Gas Charged', intendedUse: 'Base Model', compressed: 12.99, extended: 20.0, stroke: 7.01, rating: 5 },
    { manufacturer: 'KYB', partNumber: '554355', type: 'Gas-A-Just (Monotube)', intendedUse: 'Increased Handling (Mustang)', compressed: 12.79, extended: 20.03, stroke: 7.24, rating: 4 },
    { manufacturer: 'Motorcraft', partNumber: 'ASH12277 03-05', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Heavy Duty / Handling', compressed: 12.5, extended: 20.26, stroke: 7.76, rating: 4 },
    { manufacturer: 'PRT', partNumber: '194510', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.28, extended: 20.04, stroke: 7.76, rating: 4 },
    { manufacturer: 'Duralast', partNumber: 'TS33-32752B', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.4, extended: 20.31, stroke: 7.91, rating: 3 },
    { manufacturer: 'PRT', partNumber: '194574', type: 'Shock Absorber (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.99, extended: 19.88, stroke: 6.89, rating: 3 },
    { manufacturer: 'Gabriel', partNumber: '69574', type: 'Ultra (Twin-Tube)', intendedUse: 'Police Interceptor', compressed: 12.5, extended: 20.26, stroke: 7.76, rating: 3 },
    { manufacturer: 'KYB', partNumber: '555603', type: 'Gas-a-Just (Monotube)', intendedUse: 'Police / Taxi', compressed: 12.92, extended: 20.09, stroke: 7.17, rating: 2 },
    { manufacturer: 'Monroe', partNumber: '550018', type: 'Magnum Severe Service (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.5, extended: 20.0, stroke: 7.5, rating: 1 },
  ];

  const frontStruts = [
    { manufacturer: 'FCS', partNumber: '1336343', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.01, extended: 15.59, stroke: 3.58, rating: 9 },
    { manufacturer: 'PRT', partNumber: '714075', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.09, extended: 15.55, stroke: 3.47, rating: 9 },
    { manufacturer: 'PRT', partNumber: '474462', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Economy (Mustang)', compressed: 15.32, extended: 21.58, stroke: 8.2, rating: 9 },
    { manufacturer: 'Monroe', partNumber: '171346', type: 'Quick-Strut (Twin-Tube)', intendedUse: 'Base Model / LX', compressed: 12.25, extended: 15.52, stroke: 3.27, rating: 8 },
    { manufacturer: 'Gabriel', partNumber: 'G56817', type: 'Ultra (Twin-Tube)', intendedUse: 'Original Ride Quality (Mustang)', compressed: 10.9, extended: 16.59, stroke: 5.69, rating: 7 },
    { manufacturer: 'Monroe', partNumber: '72138', type: 'OESpectrum (Twin-Tube)', intendedUse: 'Original Ride Quality (Mustang)', compressed: 16.09, extended: 21.63, stroke: 5.54, rating: 7 },
    { manufacturer: 'KYB', partNumber: '235920', type: 'Excel-G (Twin-Tube)', intendedUse: 'GT Model / Original Ride (Mustang)', compressed: 15.55, extended: 24.45, stroke: 8.9, rating: 7 },
    { manufacturer: 'KYB', partNumber: 'SR4140', type: 'Strut-Plus (Monotube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 15.51, stroke: 3.11, rating: 6 },
    { manufacturer: 'KYB', partNumber: '551600', type: 'Strut (Monotube)', intendedUse: 'Base Model / LX', compressed: 12.4, extended: 15.51, stroke: 3.11, rating: 6 },
    { manufacturer: 'FCS', partNumber: '1336349', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 11.85, extended: 15.94, stroke: 4.09, rating: 4 },
    { manufacturer: 'PRT', partNumber: '710415', type: 'Strut Assembly (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.28, extended: 15.71, stroke: 3.43, rating: 3 },
    { manufacturer: 'Monroe', partNumber: '271346', type: 'Quick-Strut (Twin-Tube)', intendedUse: 'Police / Taxi', compressed: 12.25, extended: 15.52, stroke: 3.27, rating: 2 },
    { manufacturer: 'Monroe', partNumber: '550055', type: 'Magnum Severe Service (Twin-Tube)', intendedUse: 'Police Interceptor', compressed: 12.375, extended: 20.125, stroke: 7.75, rating: 1 },
  ];

  const getRatingColor = (rating) => {
    if (rating >= 8) return 'var(--green)';
    if (rating >= 5) return 'var(--yellow)';
    return 'var(--red)';
  };

  const ShockTable = ({ data }) => (
    <div className="table-responsive">
      <table className="shock-specs-table">
        <thead>
          <tr>
            <th>Manufacturer</th>
            <th>Part Number</th>
            <th>Type</th>
            <th>Intended Use</th>
            <th>Compressed (in)</th>
            <th>Extended (in)</th>
            <th>Stroke (in)</th>
            <th>Stiffness (0 Stiff – 10 Soft)</th>
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
              <td style={{ color: getRatingColor(row.rating), fontWeight: 700 }}>{row.rating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="shocks-reference-page">
      <div className="section-header">
        <h2>2008 Ford Crown Victoria – Shocks & Struts Guide</h2>
        <p className="section-description">
          Comprehensive list of rear shocks and front struts compiled from RockAuto. Stiffness ratings are re-evaluated based on type, intended use, and brand/product line.
        </p>
      </div>

      <div className="reference-grid" style={{ marginBottom: '32px' }}>
        <div className="reference-card">
          <h4>Stiffness Rating (0–10)</h4>
          <p><strong style={{ color: 'var(--red)' }}>0</strong> = Stiffest (performance/heavy-duty) &nbsp;|&nbsp; <strong style={{ color: 'var(--green)' }}>10</strong> = Softest (comfort-oriented)</p>
        </div>
        <div className="reference-card">
          <h4>Rating Factors</h4>
          <p><strong>Type:</strong> Monotube shocks are inherently stiffer than twin-tube.</p>
          <p><strong>Intended Use:</strong> "Police," "Taxi," or "Severe Service" = much stiffer.</p>
          <p><strong>Brand/Line:</strong> Monroe "Magnum" & KYB "Gas-A-Just" are firmer than standard OEM replacements.</p>
        </div>
        <div className="reference-card">
          <h4>Compressed Length</h4>
          <p>The length of the shock when fully compressed — the minimum operational length.</p>
        </div>
        <div className="reference-card">
          <h4>Extended Length</h4>
          <p>The length of the shock when fully extended — the maximum operational length.</p>
        </div>
        <div className="reference-card">
          <h4>Stroke (Travel)</h4>
          <p>Extended minus compressed. The total distance the shock can travel.</p>
        </div>
        <div className="reference-card">
          <h4>How Stroke Affects Ride</h4>
          <p><strong>Longer stroke:</strong> Absorbs larger bumps without bottoming out — smoother, more compliant feel.</p>
          <p><strong>Shorter stroke:</strong> Limits travel, reduces body roll, better on smooth tracks — can feel harsh on bumpy surfaces.</p>
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

      <div className="handling-tips-considerations" style={{ marginTop: '32px' }}>
        <h3>Key Takeaways</h3>
        <ul>
          <li>Stiffness (damping rate) is determined by the shock's internal valving — not stroke length.</li>
          <li>Stroke length dictates the operational range and heavily influences how stiffness is felt by the driver.</li>
          <li>A longer stroke allows the suspension to absorb large bumps without hitting limits.</li>
          <li>A shorter stroke limits body roll and improves cornering feel, but can feel harsh on rough surfaces.</li>
          <li>Police/Taxi rated shocks are among the stiffest available and are a popular choice for performance applications.</li>
          <li>Monotube shocks (KYB Gas-A-Just, KYB Strut-Plus) are inherently stiffer than twin-tube equivalents.</li>
        </ul>
      </div>
    </div>
  );
}

export default CrownVicShocks;
