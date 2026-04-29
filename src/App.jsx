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
import Settings from './components/Settings';
import { analyzeFullCar } from './utils/tireAnalysis';
import { DEFAULT_SETUP } from './utils/raceSimulation';
import { SyncProvider } from './utils/SyncContext';
import './App.css';

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

const TABS = [
  { id: 'shocks',     label: 'Shocks & Struts' },
  { id: 'optimize',   label: 'Optimizer' },
  { id: 'f8optimize', label: 'F8 Optimizer' },
  { id: 'mathref',   label: 'Simulation Math' },
  { id: 'suggested', label: 'Suggested Setup' },
  { id: 'trackday',     label: 'Track Day' },
  { id: 'measurements', label: 'Measurement Log' },
  { id: 'geometry',     label: 'Suspension Geometry' },
  { id: 'settings',     label: 'Settings' },
];

// Archived tabs — hidden from nav but code preserved:
// { id: 'tires',      label: 'Tire Temperatures' }
// { id: 'handling',   label: 'Handling Diagnosis' }
// { id: 'simulation', label: 'Race Simulation' }
// { id: 'figure8',    label: 'Figure 8' }

function App() {
  const [activeTab, setActiveTab] = useState('trackday');
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
        {activeTab === 'shocks' && <CrownVicShocks />}
        {activeTab === 'optimize' && (
          <SetupOptimizer setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'f8optimize' && (
          <Figure8Optimizer setup={setup} setSetup={setSetup} ambient={ambient} setAmbient={setAmbient} inflationTemp={inflationTemp} setInflationTemp={setInflationTemp} />
        )}
        {activeTab === 'mathref' && <SimulationMath />}
        {activeTab === 'suggested' && <SuggestedSetup />}
        {activeTab === 'trackday'     && (
          <TrackDay
            onSendToOptimizer={(simSetup, ambientVal, inflationVal) => {
              setSetup(simSetup);
              if (ambientVal != null) setAmbient(ambientVal);
              if (inflationVal != null) setInflationTemp(inflationVal);
              selectTab('optimize');
            }}
          />
        )}
        {activeTab === 'measurements' && <MeasurementLog />}
        {activeTab === 'geometry'     && <SuspensionGeometry />}
        {activeTab === 'settings'     && <Settings />}
      </main>

      <footer className="app-footer">
        <p>Data sourced from Team NASA, Billy Hines, and Bobby.</p>
      </footer>
    </div>
  );
}

export default function AppWithSync() {
  return (
    <SyncProvider>
      <App />
    </SyncProvider>
  );
}
