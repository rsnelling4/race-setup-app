function DeltaValue({ value, positiveLabel, negativeLabel }) {
  const color = value > 0 ? 'var(--yellow)' : value < 0 ? 'var(--red)' : 'var(--green)';
  const label = value > 0 ? positiveLabel : value < 0 ? negativeLabel : 'Balanced';
  const sign = value > 0 ? '+' : '';

  return (
    <div className="delta-value-cell">
      <span className="delta-number" style={{ color }}>{sign}{value}°F</span>
      <span className="delta-meaning" style={{ color }}>{label}</span>
    </div>
  );
}



function DeltaTable({ deltas }) {
  if (!deltas) return null;

  return (
    <div className="delta-section">
      <h3>Temperature Deltas</h3>

      <div className="delta-grid">
        {/* Temperature Balance Deltas */}
        <div className="delta-group">
          <h4>Balance Deltas</h4>
          <div className="delta-table">
            <div className="delta-row header-row">
              <span className="delta-label">Delta</span>
              <span className="delta-header-val">Value</span>
              <span className="delta-header-val">Reading</span>
            </div>
            <div className="delta-row">
              <span className="delta-label">Front vs Rear</span>
              <DeltaValue
                value={deltas.frontRear}
                positiveLabel="Front hotter — understeer"
                negativeLabel="Rear hotter — oversteer"
              />
            </div>
            <div className="delta-row">
              <span className="delta-label">Left vs Right</span>
              <DeltaValue
                value={deltas.leftRight}
                positiveLabel="Left hotter"
                negativeLabel="Right hotter"
              />
            </div>
            <div className="delta-row">
              <span className="delta-label">Diagonal (LF+RR vs RF+LR)</span>
              <DeltaValue
                value={deltas.diagonal}
                positiveLabel="LF/RR hotter"
                negativeLabel="RF/LR hotter"
              />
            </div>
          </div>
          <div className="delta-averages">
            <div className="avg-pair">
              <span className="avg-label">Front Avg</span>
              <span className="avg-value">{deltas.frontAvg}°F</span>
            </div>
            <div className="avg-pair">
              <span className="avg-label">Rear Avg</span>
              <span className="avg-value">{deltas.rearAvg}°F</span>
            </div>
            <div className="avg-pair">
              <span className="avg-label">Left Avg</span>
              <span className="avg-value">{deltas.leftAvg}°F</span>
            </div>
            <div className="avg-pair">
              <span className="avg-label">Right Avg</span>
              <span className="avg-value">{deltas.rightAvg}°F</span>
            </div>
          </div>
        </div>

        <div className="delta-legend">
          <h4>How to Read Deltas</h4>
          <div className="legend-columns">
            <div className="legend-column">
              <div className="legend-item">
                <span className="legend-category">Front vs Rear:</span>
                <span>+ front hotter (understeer) / − rear hotter (oversteer)</span>
              </div>
              <div className="legend-item">
                <span className="legend-category">Left vs Right:</span>
                <span>+ left hotter / − right hotter</span>
              </div>
            </div>
            <div className="legend-column">
              <div className="legend-item">
                <span className="legend-category">Diagonal:</span>
                <span>+ LF/RR hotter / − RF/LR hotter</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeltaTable;
