import { useState } from 'react';

function TireInput({ position, label, data, onChange }) {
  const positionClasses = {
    LF: 'tire-lf',
    RF: 'tire-rf',
    LR: 'tire-lr',
    RR: 'tire-rr',
  };

  return (
    <div className={`tire-input-card ${positionClasses[position]}`}>
      <h3>{label}</h3>
      <div className="tire-temp-inputs">
        {(position === 'LF' || position === 'LR') ? (
          <>
            <div className="temp-field">
              <label>Outside °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.outside}
                onChange={(e) => onChange(position, 'outside', e.target.value)}
              />
            </div>
            <div className="temp-field">
              <label>Middle °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.middle}
                onChange={(e) => onChange(position, 'middle', e.target.value)}
              />
            </div>
            <div className="temp-field">
              <label>Inside °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.inside}
                onChange={(e) => onChange(position, 'inside', e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="temp-field">
              <label>Inside °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.inside}
                onChange={(e) => onChange(position, 'inside', e.target.value)}
              />
            </div>
            <div className="temp-field">
              <label>Middle °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.middle}
                onChange={(e) => onChange(position, 'middle', e.target.value)}
              />
            </div>
            <div className="temp-field">
              <label>Outside °F</label>
              <input
                type="number"
                placeholder="---"
                value={data.outside}
                onChange={(e) => onChange(position, 'outside', e.target.value)}
              />
            </div>
          </>
        )}
      </div>
      <div className="pressure-field">
        <label>Current PSI (optional)</label>
        <input
          type="number"
          step="0.5"
          placeholder="e.g. 28"
          value={data.pressure}
          onChange={(e) => onChange(position, 'pressure', e.target.value)}
        />
      </div>
    </div>
  );
}

export default TireInput;
