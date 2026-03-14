import { useState } from 'react';
import { handlingConditions, cornerPhases, getHandlingRecommendations } from '../utils/tireAnalysis';
import PerTireRecommendations from './PerTireRecommendations';

function HandlingDiagnosis() {
  const [condition, setCondition] = useState('');
  const [phase, setPhase] = useState('');
  const [results, setResults] = useState(null);

  const handleAnalyze = () => {
    if (condition && phase) {
      const recs = getHandlingRecommendations(condition, phase);
      setResults(recs);
    }
  };

  return (
    <div className="handling-section">
      <h2>Handling Diagnosis</h2>
      <p className="section-description">
        Tell us what the car is doing and we'll recommend chassis adjustments to fix it.
      </p>

      <div className="handling-inputs">
        <div className="handling-select-group">
          <label>What is the car doing?</label>
          <div className="button-group">
            {handlingConditions.map((c) => (
              <button
                key={c.value}
                className={`select-button ${condition === c.value ? 'active' : ''}`}
                onClick={() => { setCondition(c.value); setResults(null); }}
              >
                <span className="btn-label">{c.label}</span>
                <span className="btn-desc">{c.description}</span>
              </button>
            ))}
           </div>
        </div>

        <div className="handling-select-group">
          <label>When does it happen?</label>
          <div className="button-group three-col">
            {cornerPhases.map((p) => (
              <button
                key={p.value}
                className={`select-button ${phase === p.value ? 'active' : ''}`}
                onClick={() => { setPhase(p.value); setResults(null); }}
              >
                <span className="btn-label">{p.label}</span>
                <span className="btn-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className="analyze-button"
          onClick={handleAnalyze}
          disabled={!condition || !phase}
        >
          Get Recommendations
        </button>
      </div>

      {results && (
        <div className="handling-results">
          <h3>{results.title}</h3>
          <p className="handling-desc">{results.description}</p>

          {results.perTire && <PerTireRecommendations data={results.perTire} />}

          <div className="other-recommendations">
            <h4>Other Recommendations</h4>
            <div className="changes-table">
              <div className="changes-header">
                <span>Component</span>
                <span>Adjustment</span>
                <span>Why It Helps</span>
              </div>
              {results.changes.map((change, i) => (
                <div key={i} className="changes-row">
                  <span className="change-component">{change.component}</span>
                  <span className="change-adjustment">{change.adjustment}</span>
                  <span className="change-effect">{change.effect}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="handling-tip">
            <strong>Pro Tip:</strong> Make one change at a time so you can isolate its effect. Start with the adjustments at the top of the list — they typically have the biggest impact.
          </div>
        </div>
      )}
      <div className="handling-tips-considerations">
        <h3>Things to Consider (Tire Pressure Impact)</h3>
        <ul>
          <li>Higher psi in RF will loosen the car.</li>
          <li>Lower psi in the RF will tighten the car.</li>
          <li>Higher psi in RR will loosen the car.</li>
          <li>Lower psi in the RR will tighten the car.</li>
          <li>Higher psi in the LR will tighten the car from the middle out.</li>
          <li>Lower psi in the LR will loosen the car from the middle out.</li>
          <li>Higher psi in the LF will loosen the car.</li>
          <li>Lower psi in the LF will tighten the car.</li>
          <li>The lower the psi in a tire the hotter it will run.</li>
          <li>The higher the psi in a tire the colder it will run.</li>
          <li>Excessively low front tire psi will create a push.</li>
          <li>Excessively low rear tire psi will create a loose condition.</li>
          <li>Increasing the split (more RR psi than LR) increases stagger, helping the car to turn in the middle of a corner.</li>
          <li>Increasing the split of the left & right side psi (more psi on the right) increases the pull to the left.</li>
        </ul>
      </div>
    </div>
  );
}

export default HandlingDiagnosis;
