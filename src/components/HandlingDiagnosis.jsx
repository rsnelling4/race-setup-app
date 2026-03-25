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
        <h3>Tire Pressure &amp; Handling — Quick Reference</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          These effects assume pressures are near the load-optimal target for each corner.
          RF and LF typically run slightly below optimal; RR typically runs near or slightly above.
          Small changes (0.5–2 PSI) have the most predictable effects — always adjust one tire at a time.
        </p>
        <ul>
          <li><strong>RF higher PSI</strong> — moves RF toward optimal hot pressure → more front grip → <em>loosens</em> the car</li>
          <li><strong>RF lower PSI</strong> — moves RF away from optimal → less front grip → <em>tightens</em> the car</li>
          <li><strong>RR higher PSI</strong> — moves RR past its optimal → less rear contact → rear reaches grip limit sooner → <em>loosens</em> the car</li>
          <li><strong>RR lower PSI</strong> — moves RR back toward optimal → more rear contact → rear plants → <em>tightens</em> the car</li>
          <li><strong>LR higher PSI</strong> — moves LR toward optimal → more inside rear grip → <em>tightens</em> from the middle out</li>
          <li><strong>LR lower PSI</strong> — moves LR away from optimal → less inside rear grip → <em>loosens</em> from the middle out</li>
          <li><strong>LF higher PSI</strong> — moves LF toward optimal → more inside front grip → <em>loosens</em> the car slightly</li>
          <li><strong>LF lower PSI</strong> — less inside front grip → <em>tightens</em> the car slightly</li>
          <li>Lower PSI = larger contact patch = more heat generated. Higher PSI = smaller patch = runs cooler but can crown and lose grip.</li>
          <li>Excessively low front PSI (far below optimal) will create a push — tire deforms too much, loses cornering stiffness.</li>
          <li>Excessively low rear PSI will create a loose condition — rear loses cornering grip.</li>
          <li><strong>RR/LR stagger split</strong> — more RR PSI than LR increases effective stagger and helps the car turn in the middle of a corner.</li>
          <li><strong>Right-side vs left-side split</strong> — more PSI on the right side increases pull to the left and helps cornering in left-turn ovals.</li>
        </ul>
      </div>
    </div>
  );
}

export default HandlingDiagnosis;
