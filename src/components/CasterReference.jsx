import React from 'react';

function CasterReference() {
  return (
    <div className="caster-reference-page">
      <h2 className="section-header">Caster Reference</h2>

      <div className="caster-content">
        <div className="caster-diagram">
          <img src="/race-setup-app/caster.jpg" alt="Caster Diagram" className="caster-illustration" />
        </div>
        <div className="caster-text">
          <p>Less caster in the LF will help the car turn from entry of the corner through the center. -</p>
          <p>Increasing caster split will loosen the car -</p>
          <p>A set once adjustment that should be driver preference and track type particular. -</p>
        </div>
      </div>

      <div className="caster-tips">
        <h3>Tips</h3>
        <p>Less Caster required on smaller track and more caster on longer wider tracks. -</p>
        <p>Higher banking calls for higher caster split. -</p>
      </div>
    </div>
  );
}

export default CasterReference;
