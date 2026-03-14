import { useState } from 'react';
import TireInput from './components/TireInput';
import TireResults from './components/TireResults';
import HandlingDiagnosis from './components/HandlingDiagnosis';
import { analyzeFullCar } from './utils/tireAnalysis';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('tires');
  const [tireData, setTireData] = useState({
    LF: { inside: '', middle: '', outside: '', pressure: '' },
    RF: { inside: '', middle: '', outside: '', pressure: '' },
    LR: { inside: '', middle: '', outside: '', pressure: '' },
    RR: { inside: '', middle: '', outside: '', pressure: '' },
  });
  const [analysis, setAnalysis] = useState(null);

  const handleTireChange = (position, field, value) => {
    setTireData((prev) => ({
      ...prev,
      [position]: { ...prev[position], [field]: value },
    }));
    setAnalysis(null);
  };

  const handleAnalyze = () => {
    const hasData = Object.values(tireData).every(
      (t) => t.inside && t.middle && t.outside
    );
    if (!hasData) {
      alert('Please enter inside, middle, and outside temperatures for all four tires.');
      return;
    }
    const results = analyzeFullCar(tireData);
    setAnalysis(results);
  };

  const handleClear = () => {
    setTireData({
      LF: { inside: '', middle: '', outside: '', pressure: '' },
      RF: { inside: '', middle: '', outside: '', pressure: '' },
      LR: { inside: '', middle: '', outside: '', pressure: '' },
      RR: { inside: '', middle: '', outside: '', pressure: '' },
    });
    setAnalysis(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Race Setup</h1>
          <p className="tagline">Tire Temperature Analyzer & Chassis Setup Guide</p>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab ${activeTab === 'tires' ? 'active' : ''}`}
          onClick={() => setActiveTab('tires')}
        >
          Tire Temperatures
        </button>
        <button
          className={`tab ${activeTab === 'handling' ? 'active' : ''}`}
          onClick={() => setActiveTab('handling')}
        >
          Handling Diagnosis
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'tires' && (
          <div className="tire-section">
            <div className="section-header">
              <h2>Enter Tire Temperatures</h2>
              <p className="section-description">
                Use your pyrometer to measure inside, middle, and outside temperatures for each tire.
              </p>
            </div>

            <div className="tire-grid">
              <div className="grid-label front-label">FRONT</div>
              <TireInput position="LF" label="Left Front" data={tireData.LF} onChange={handleTireChange} />
              <TireInput position="RF" label="Right Front" data={tireData.RF} onChange={handleTireChange} />
              <TireInput position="LR" label="Left Rear" data={tireData.LR} onChange={handleTireChange} />
              <TireInput position="RR" label="Right Rear" data={tireData.RR} onChange={handleTireChange} />
              <div className="grid-label rear-label">REAR</div>
            </div>

            <div className="action-buttons">
              <button className="analyze-button" onClick={handleAnalyze}>Analyze Tires</button>
              <button className="clear-button" onClick={handleClear}>Clear All</button>
            </div>

            {analysis && <TireResults analysis={analysis} />}

            <div className="reference-guide">
              <h3>Quick Reference</h3>
              <div className="reference-grid">
                <div className="reference-card">
                  <h4>Middle Hotter Than Edges</h4>
                  <p>Over-inflated — reduce pressure 1-3 PSI</p>
                </div>
                <div className="reference-card">
                  <h4>Middle Cooler Than Edges</h4>
                  <p>Under-inflated — increase pressure 1-3 PSI</p>
                </div>
                <div className="reference-card">
                  <h4>Inside Hotter Than Outside</h4>
                  <p>Too much negative camber — reduce 0.25-0.5°</p>
                </div>
                <div className="reference-card">
                  <h4>Outside Hotter Than Inside</h4>
                  <p>Not enough negative camber — add 0.25-0.5°</p>
                </div>
                <div className="reference-card">
                  <h4>Ideal Inside-Outside Spread</h4>
                  <p>5-20°F with inside slightly hotter</p>
                </div>
                <div className="reference-card">
                  <h4>R-Compound Operating Range</h4>
                  <p>180-200°F typical (street tires run cooler)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'handling' && <HandlingDiagnosis />}
      </main>

      <footer className="app-footer">
        <p>
          Data sourced from Team NASA, Billy Hines, and Bobby.
        </p>
      </footer>
    </div>
  );
}

export default App;
