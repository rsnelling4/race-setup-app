import { formatPosition } from '../utils/tireAnalysis';
import DeltaTable from './DeltaTable';

function TireVisual({ result }) {
  if (!result) return null;

  const getHeatColor = (temp, min, max) => {
    if (!temp) return '#2a2a3e';
    const ratio = Math.max(0, Math.min(1, (temp - min) / (max - min || 1)));
    if (ratio < 0.25) return '#3b82f6'; // cool blue
    if (ratio < 0.5) return '#22c55e';  // green
    if (ratio < 0.75) return '#eab308'; // yellow
    return '#ef4444'; // hot red
  };

  const allTemps = [result.inside, result.middle, result.outside];
  const minTemp = Math.min(...allTemps) - 20;
  const maxTemp = Math.max(...allTemps) + 20;

  return (
    <div className={`tire-result-card severity-${result.severity}`}>
      <h3>{formatPosition(result.position)}</h3>
      <div className="tire-visual">
        <div className="tire-tread">
          <div
            className="tread-section"
            style={{ backgroundColor: getHeatColor(result.inside, minTemp, maxTemp) }}
          >
            <span className="temp-label">{result.inside}°</span>
            <span className="zone-label">IN</span>
          </div>
          <div
            className="tread-section"
            style={{ backgroundColor: getHeatColor(result.middle, minTemp, maxTemp) }}
          >
            <span className="temp-label">{result.middle}°</span>
            <span className="zone-label">MID</span>
          </div>
          <div
            className="tread-section"
            style={{ backgroundColor: getHeatColor(result.outside, minTemp, maxTemp) }}
          >
            <span className="temp-label">{result.outside}°</span>
            <span className="zone-label">OUT</span>
          </div>
        </div>
      </div>
      <div className="tire-stats">
        <div className="stat">
          <span className="stat-label">Avg</span>
          <span className="stat-value">{result.avg}°F</span>
        </div>
        <div className="stat">
          <span className="stat-label">Spread</span>
          <span className="stat-value">{result.spread}°F</span>
        </div>
        {result.currentPressure && (
          <div className="stat">
            <span className="stat-label">Pressure (PSI)</span>
            <span className="stat-value">
              <span className="rec-old-pressure">{result.currentPressure}</span>
              <span className="rec-arrow">→</span>
              {result.recommendedPressure.toFixed(1)}
            </span>
          </div>
        )}
        {result.camberCalculation !== null && (
          <div className="stat">
            <span className="stat-label">Camber Calc</span>
            <span className="stat-value">{result.camberCalculation.toFixed(1)}</span>
          </div>
        )}
        {result.psiCalculation !== undefined && (
          <div className="stat">
            <span className="stat-label">PSI Calc</span>
            <span className="stat-value">{result.psiCalculation.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="tire-recommendations">
        {result.recommendations.map((rec, i) => (
          <div key={i} className={`recommendation ${rec.severity}`}>
            <span className="rec-icon">
              {rec.severity === 'good' ? '✓' : rec.severity === 'warning' ? '⚠' : '✗'}
            </span>
            <span className="rec-text">{rec.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TireResults({ analysis }) {
  if (!analysis) return null;

  const { tires, overall, deltas } = analysis;

  return (
    <div className="results-section">
      <h2>Tire Analysis Results</h2>

      <div className="tire-results-grid">
        <div className="car-outline">
          <div className="car-label">FRONT</div>
          <div className="tires-row">
            {tires.LF && <TireVisual result={tires.LF} />}
            {tires.RF && <TireVisual result={tires.RF} />}
          </div>
          <div className="tires-row">
            {tires.LR && <TireVisual result={tires.LR} />}
            {tires.RR && <TireVisual result={tires.RR} />}
          </div>
          <div className="car-label">REAR</div>
        </div>
      </div>

      {deltas && <DeltaTable deltas={deltas} />}

      {overall && overall.length > 0 && (
        <div className="overall-analysis">
          <h3>Overall Balance Analysis</h3>
          {overall.map((rec, i) => (
            <div key={i} className={`overall-recommendation ${rec.severity}`}>
              <span className="rec-icon">
                {rec.severity === 'good' ? '✓' : '⚠'}
              </span>
              <div>
                <span className="rec-text">{rec.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TireResults;
