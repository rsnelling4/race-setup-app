import { useState } from 'react';
import TireInput from './components/TireInput';
import TireResults from './components/TireResults';
import HandlingDiagnosis from './components/HandlingDiagnosis';
import CrownVicShocks from './components/CrownVicShocks';
import RaceSimulation from './components/RaceSimulation';
import SetupOptimizer from './components/SetupOptimizer';
import Figure8Simulation from './components/Figure8Simulation';
import Figure8Optimizer from './components/Figure8Optimizer';
import SimulationMath from './components/SimulationMath';
import SuggestedSetup from './components/SuggestedSetup';
import { MeasurementLog, SuspensionGeometry } from './components/MeasurementLogger';
import TrackDay from './components/TrackDay';
import { analyzeFullCar } from './utils/tireAnalysis';
import { DEFAULT_SETUP } from './utils/raceSimulation';
import './App.css';

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

const TABS = [
  { id: 'tires',      label: 'Tire Temperatures' },
  { id: 'handling',   label: 'Handling Diagnosis' },
  { id: 'shocks',     label: 'Shocks & Struts' },
  { id: 'simulation', label: 'Race Simulation' },
  { id: 'optimize',   label: 'Optimizer' },
  { id: 'figure8',    label: 'Figure 8' },
  { id: 'f8optimize', label: 'F8 Optimizer' },
  { id: 'mathref',   label: 'Simulation Math' },
  { id: 'suggested', label: 'Suggested Setup' },
  { id: 'trackday',     label: 'Track Day' },
  { id: 'measurements', label: 'Measurement Log' },
  { id: 'geometry',     label: 'Suspension Geometry' },
];

function App() {
  const [activeTab, setActiveTab] = useState('tires');
  const [menuOpen, setMenuOpen] = useState(false);

  const selectTab = (id) => { setActiveTab(id); setMenuOpen(false); };

  // Shared setup state — used by both Race Simulation and Setup Optimizer
  const [setup, setSetup] = useState(deepClone(DEFAULT_SETUP));
  const [ambient, setAmbient] = useState(65);
  const [inflationTemp, setInflationTemp] = useState(85);

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
        {/* Desktop tab list */}
        <div className="tab-list">
          {TABS.map(t => (
            <button key={t.id} className={`tab${activeTab === t.id ? ' active' : ''}`} onClick={() => selectTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile: hamburger + active tab label */}
        <button className={`hamburger-btn${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(m => !m)} aria-label="Navigation menu">
          <span /><span /><span />
        </button>
        <span className="nav-active-label">{TABS.find(t => t.id === activeTab)?.label}</span>

        {/* Mobile dropdown */}
        {menuOpen && (
          <>
            <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="mobile-menu">
              {TABS.map(t => (
                <button key={t.id} className={`mobile-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => selectTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      <main className="app-main">
        {activeTab === 'tires' && (
          <div className="tire-section">
            <div className="section-header">
              <h2>Enter Tire Temperatures</h2>
              <p className="section-description">
                Use your pyrometer to measure inside, middle, and outside temperatures for each tire. Inside will be the edge of tire closest to the motor. Outside will be the edge of tire furthest from the motor.
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
                  <h4>General Tire Wear</h4>
                  <p>The hotter the tire, the quicker it will wear.</p>
                  <p>The hottest tire on the car is the one being worked the most; the coolest is the least worked.</p>
                  <p>Focus adjustments on the most overworked or least worked corner first.</p>
                </div>
                <div className="reference-card">
                  <h4>Camber Issues</h4>
                  <p>Too much NEGATIVE camber: excessively higher temperature at the INSIDE edges.</p>
                  <p>Too much POSITIVE camber: excessively higher temperature at the OUTSIDE edges.</p>
                </div>
                <div className="reference-card">
                  <h4>Inflation Issues</h4>
                  <p>OVER inflated: higher middle temperature than inside &amp; outside edges.</p>
                  <p>UNDER inflated: lower middle temperature than inside &amp; outside edges.</p>
                </div>
                <div className="reference-card">
                  <h4>Toe Issues (Front Tires)</h4>
                  <p>Too much toe OUT: higher temperatures on both INSIDE edges.</p>
                  <p>Too much toe IN: higher temperatures on both OUTSIDE edges.</p>
                </div>
                <div className="reference-card">
                  <h4>Handling &amp; Temperature Split</h4>
                  <p>RF tire HOTTER by &gt;10°F over RR: indicates a tight condition.</p>
                  <p>RF tire COLDER by &gt;10°F over RR: indicates a loose condition.</p>
                </div>
                <div className="reference-card">
                  <h4>Overall Workload</h4>
                  <p>HIGHEST average temperature: corner of the car being most worked.</p>
                  <p>LOWEST average temperature: corner of the car being least worked.</p>
                </div>
                <div className="reference-card">
                  <h4>Ideal Inside-Outside Spread</h4>
                  <p>5-20°F with inside slightly hotter</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'handling' && (
          <HandlingDiagnosis setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'shocks' && <CrownVicShocks />}
        {activeTab === 'simulation' && (
          <RaceSimulation setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'optimize' && (
          <SetupOptimizer setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'figure8' && (
          <Figure8Simulation setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'f8optimize' && (
          <Figure8Optimizer setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'mathref' && <SimulationMath />}
        {activeTab === 'suggested' && <SuggestedSetup />}
        {activeTab === 'trackday'     && <TrackDay />}
        {activeTab === 'measurements' && <MeasurementLog />}
        {activeTab === 'geometry'     && <SuspensionGeometry />}
      </main>

      <footer className="app-footer">
        <p>Data sourced from Team NASA, Billy Hines, and Bobby.</p>
      </footer>
    </div>
  );
}

export default App;
