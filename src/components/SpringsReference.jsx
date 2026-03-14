import React from 'react';

function SpringsReference() {
  return (
    <div className="springs-reference-page">
      <h2 className="section-header">Springs Reference</h2>

      <div className="spring-effects-section">
        {/* Front Spring Effects */} 
        <div className="spring-effect-card">
          <h3>FRONT SPRING EFFECTS</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Front Springs</td>
                <td>Stabilizes / Tightens Car</td>
              </tr>
              <tr>
                <td>Softer Front Springs</td>
                <td>Adds Front Grip / Loosen</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rear Spring Effects */} 
        <div className="spring-effect-card">
          <h3>REAR SPRING EFFECTS</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Rear Springs</td>
                <td>Loosen Mid-Corner / Loosen Exit</td>
              </tr>
              <tr>
                <td>Softer Rear Springs</td>
                <td>Tightens Car</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="springs-grid">
        {/* Left Front */} 
        <div className="spring-table-container">
          <h3>LEFT FRONT</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Spring</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Softer Spring</td>
                <td>Tighten Entry</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Front */} 
        <div className="spring-table-container">
          <h3>RIGHT FRONT</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Spring</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Softer Spring</td>
                <td>Tighten Exit</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Left Rear */} 
        <div className="spring-table-container">
          <h3>LEFT REAR</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Spring</td>
                <td>Tighten Exit</td>
              </tr>
              <tr>
                <td>Softer Spring</td>
                <td>Loosen Entry</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Rear */} 
        <div className="spring-table-container">
          <h3>RIGHT REAR</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer Spring</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Softer Spring</td>
                <td>Tighten Exit</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Loosen Center */} 
        <div className="spring-table-container">
          <h3>LOOSEN CENTER</h3>
          <table>
            <tbody>
              <tr>
                <td>Softer RF Spring</td>
                <td>Loosen Middle</td>
              </tr>
              <tr>
                <td>Stiffer RR Spring</td>
                <td>Loosen Middle</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tighten Center */} 
        <div className="spring-table-container">
          <h3>TIGHTEN CENTER</h3>
          <table>
            <tbody>
              <tr>
                <td>Stiffer RF Spring</td>
                <td>Tighten Middle</td>
              </tr>
              <tr>
                <td>Softer RR Spring</td>
                <td>Tighten Middle</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Spring Stagger */} 
      <div className="spring-stagger-section">
        <h3>SPRING STAGGER</h3>
        <table>
          <tbody>
            <tr>
              <td>More Front Stagger</td>
              <td>Tighten Exit / Loosen Entry</td>
            </tr>
            <tr>
              <td>Less Front Stagger</td>
              <td>Loosen Exit / Tighten Entry</td>
            </tr>
            <tr>
              <td>More Rear Stagger</td>
              <td>Loosen Exit / Tighten Entry</td>
            </tr>
            <tr>
              <td>Less Rear Stagger</td>
              <td>Tighten Exit / Loosen Entry</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SpringsReference;