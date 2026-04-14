import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mathContent from '../../SIMULATION_MATH.md?raw';

const SECTIONS = [
  { id: 1,  label: 'Physical Measurements' },
  { id: 2,  label: 'Vehicle Constants' },
  { id: 3,  label: 'Tire Specifications' },
  { id: 4,  label: 'Track Geometry Derivations' },
  { id: 5,  label: 'Lateral G & Corner Speeds' },
  { id: 6,  label: 'Weight Transfer & Tire Loads' },
  { id: 7,  label: 'Spring Rates' },
  { id: 8,  label: 'Shock → LLTD & Roll Stiffness' },
  { id: 9,  label: 'Tire Thermal Model' },
  { id: 10, label: 'Grip Model — All Factors' },
  { id: 11, label: 'Performance Metric → Lap Time' },
  { id: 12, label: 'Pressure Optimization' },
  { id: 13, label: 'Camber Optimization' },
  { id: 14, label: 'Calibration Data' },
  { id: 15, label: 'Figure 8 Differences' },
  { id: 16, label: 'All Setup Presets' },
  { id: 17, label: 'Optimizer Results' },
  { id: 18, label: 'Sources' },
];

// Split the MD content on h2 headings (## N. ...) to produce per-section chunks
function splitSections(content) {
  // Each section starts with a line beginning with "## "
  const lines = content.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^## (\d+)\. /);
    if (m) {
      if (current) sections.push(current);
      current = { id: parseInt(m[1], 10), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
    // lines before the first ## go into a preamble (id 0)
  }
  if (current) sections.push(current);

  const map = {};
  for (const s of sections) map[s.id] = s.lines.join('\n');
  return map;
}

const sectionMap = splitSections(mathContent);

// Extract the preamble (everything before first ## heading)
const preamble = (() => {
  const lines = mathContent.split('\n');
  const result = [];
  for (const line of lines) {
    if (/^## \d+\./.test(line)) break;
    result.push(line);
  }
  return result.join('\n');
})();

export default function SimulationMath() {
  const [activeSection, setActiveSection] = useState(null); // null = show TOC

  const content = activeSection !== null ? sectionMap[activeSection] : null;

  return (
    <div className="sim-math-page">
      {/* Back button when inside a section */}
      {activeSection !== null && (
        <button className="sim-math-back" onClick={() => setActiveSection(null)}>
          ← Table of Contents
        </button>
      )}

      {/* Table of Contents view */}
      {activeSection === null && (
        <div className="sim-math-toc">
          <div className="sim-math-header">
            <h2>Simulation Math Reference</h2>
            <p className="sim-math-subtitle">
              Every number, formula, and calibration constant in the race simulation —
              with plain-English explanations and sources.
            </p>
            <div className="sim-math-meta">
              <span>2008 Crown Victoria P71</span>
              <span className="sep">·</span>
              <span>1/4-mile Oval &amp; Figure 8</span>
              <span className="sep">·</span>
              <span>Updated 2026-04-14</span>
            </div>
          </div>
          <div className="sim-math-toc-grid">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className="sim-math-toc-card"
                onClick={() => setActiveSection(s.id)}
              >
                <span className="toc-num">{s.id}</span>
                <span className="toc-label">{s.label}</span>
                <span className="toc-arrow">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section content view */}
      {activeSection !== null && content && (
        <div className="sim-math-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Style tables
              table: ({ children }) => (
                <div className="sim-math-table-wrap">
                  <table className="sim-math-table">{children}</table>
                </div>
              ),
              // Style code blocks
              code: ({ inline, children, ...props }) =>
                inline ? (
                  <code className="sim-math-inline-code" {...props}>{children}</code>
                ) : (
                  <pre className="sim-math-code-block"><code {...props}>{children}</code></pre>
                ),
              // Style blockquotes (callout boxes)
              blockquote: ({ children }) => (
                <div className="sim-math-callout">{children}</div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
