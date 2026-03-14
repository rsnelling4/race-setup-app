import React from 'react';

function PerTireRecommendations({ data }) {
  if (!data) {
    return null;
  }

  const components = Object.keys(data);

  return (
    <div className="per-tire-recommendations">
      <h4>Per-Tire Recommendations</h4>
      <div className="changes-table per-tire-table">
        <div className="changes-header">
          <span>Component</span>
          <span>LF</span>
          <span>RF</span>
          <span>LR</span>
          <span>RR</span>
        </div>
        {components.map((component) => {
          const recommendations = data[component];
          const isShock = component === 'Shock';

          if (isShock) {
            return (
              <React.Fragment key={component}>
                <div className="changes-row">
                  <span className="change-component">Shock (Compression)</span>
                  <span data-label="LF">{recommendations.LF}</span>
                  <span data-label="RF">{recommendations.RF}</span>
                  <span data-label="LR">{recommendations.LR}</span>
                  <span data-label="RR">{recommendations.RR}</span>
                </div>
                <div className="changes-row">
                  <span className="change-component">Shock (Rebound)</span>
                  <span data-label="LF">{recommendations['LF-Rebound']}</span>
                  <span data-label="RF">{recommendations['RF-Rebound']}</span>
                  <span data-label="LR">{recommendations['LR-Rebound']}</span>
                  <span data-label="RR">{recommendations['RR-Rebound']}</span>
                </div>
              </React.Fragment>
            );
          }

          return (
            <div key={component} className="changes-row">
              <span className="change-component">{component}</span>
              <span data-label="LF">{recommendations.LF || '-'}</span>
              <span data-label="RF">{recommendations.RF || '-'}</span>
              <span data-label="LR">{recommendations.LR || '-'}</span>
              <span data-label="RR">{recommendations.RR || '-'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PerTireRecommendations;
