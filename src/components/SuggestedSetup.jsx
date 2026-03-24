import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import suggestedContent from '../../suggested.md?raw';

const SECTIONS = [
  { id: 'summary',   label: 'Executive Summary',                   heading: 'EXECUTIVE SUMMARY' },
  { id: 's1',        label: 'Is the Model Predictive?',            heading: 'SECTION 1' },
  { id: 's2',        label: 'First-Principles Lap Time',           heading: 'SECTION 2' },
  { id: 's3',        label: 'Real-World Data Interpretation',      heading: 'SECTION 3' },
  { id: 's4',        label: 'Full Scenario Matrix',                heading: 'SECTION 4' },
  { id: 's5',        label: 'Camber Analysis — Every Setup',       heading: 'SECTION 5' },
  { id: 's6',        label: 'Pressure Optimization',               heading: 'SECTION 6' },
  { id: 's7',        label: 'Shock / Damper Analysis',             heading: 'SECTION 7' },
  { id: 's8',        label: 'Spring Rate Analysis',                heading: 'SECTION 8' },
  { id: 's9',        label: 'Scenario Sensitivity Table',          heading: 'SECTION 9' },
  { id: 's10',       label: 'Ranked Recommendations',              heading: 'SECTION 10' },
  { id: 's11',       label: 'Theoretical Performance Ceiling',     heading: 'SECTION 11' },
  { id: 's12',       label: 'What the Model Cannot Predict',       heading: 'SECTION 12' },
  { id: 's13',       label: 'Optimal Setup Specification',         heading: 'SECTION 13' },
  { id: 's14',       label: 'Methodology Notes',                   heading: 'SECTION 14' },
];

// Split content on ## headings — returns a map of { heading_prefix → content }
function splitSections(content) {
  const lines = content.split('\n');
  const map = {};
  let current = null;

  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current) map[current.key] = current.lines.join('\n');
      // Key is the uppercased start of the heading (matches our SECTIONS[].heading)
      const text = line.replace(/^## /, '').trim().toUpperCase();
      current = { key: text, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) map[current.key] = current.lines.join('\n');
  return map;
}

const sectionMap = splitSections(suggestedContent);

// Resolve content for a section by matching its heading prefix
function getContent(heading) {
  const key = Object.keys(sectionMap).find(k => k.startsWith(heading));
  return key ? sectionMap[key] : null;
}

// Preamble: everything before the first ## heading
const preamble = (() => {
  const lines = suggestedContent.split('\n');
  const out = [];
  for (const line of lines) {
    if (/^## /.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
})();

const MARKDOWN_COMPONENTS = {
  table: ({ children }) => (
    <div className="sim-math-table-wrap">
      <table className="sim-math-table">{children}</table>
    </div>
  ),
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code className="sim-math-inline-code" {...props}>{children}</code>
    ) : (
      <pre className="sim-math-code-block"><code {...props}>{children}</code></pre>
    ),
  blockquote: ({ children }) => (
    <div className="sim-math-callout">{children}</div>
  ),
};

// Tier badge colours for the recommendations section
const TIER_COLORS = {
  '1': '#22c55e',
  '2': '#3b82f6',
  '3': '#a78bfa',
};

export default function SuggestedSetup() {
  const [activeSection, setActiveSection] = useState(null);

  const content = activeSection ? getContent(activeSection.heading) : null;

  return (
    <div className="sim-math-page">
      {activeSection && (
        <button className="sim-math-back" onClick={() => setActiveSection(null)}>
          ← Table of Contents
        </button>
      )}

      {/* Table of Contents */}
      {!activeSection && (
        <div className="sim-math-toc">
          <div className="sim-math-header">
            <h2>Suggested Setup &amp; Analysis</h2>
            <p className="sim-math-subtitle">
              Physics-based scenario analysis, pyrometer cross-validation, and ranked
              recommendations for the 2008 Crown Victoria P71 on the 1/4-mile oval.
            </p>
            <div className="sim-math-meta">
              <span>2008 Crown Victoria P71</span>
              <span className="sep">·</span>
              <span>1/4-mile Oval</span>
              <span className="sep">·</span>
              <span>14 Sections</span>
              <span className="sep">·</span>
              <span>Updated 2026-03-24</span>
            </div>
          </div>

          {/* Quick-access highlight cards */}
          <div className="suggested-highlights">
            <div className="suggested-highlight-card green">
              <div className="sh-label">Biggest Free Gain</div>
              <div className="sh-value">+0.08–0.10s</div>
              <div className="sh-desc">Raise LF cold PSI: 20 → 25–26</div>
            </div>
            <div className="suggested-highlight-card blue">
              <div className="sh-label">Model Ceiling</div>
              <div className="sh-value">~17.1s</div>
              <div className="sh-desc">Current components, warm conditions</div>
            </div>
            <div className="suggested-highlight-card purple">
              <div className="sh-label">Actual Corner Speed</div>
              <div className="sh-value">~47.6 mph</div>
              <div className="sh-desc">Back-calculated from 17.4s (not 24 mph)</div>
            </div>
          </div>

          <div className="sim-math-toc-grid">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                className="sim-math-toc-card"
                onClick={() => setActiveSection(s)}
              >
                <span className="toc-num">{i + 1}</span>
                <span className="toc-label">{s.label}</span>
                <span className="toc-arrow">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section content */}
      {activeSection && content && (
        <div className="sim-math-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
