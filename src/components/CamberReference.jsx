import React from 'react';

function CamberReference() {
  return (
    <div className="camber-reference-page">
      <h2 className="section-header">Camber Reference</h2>

      <div className="camber-intro">
        <p>I M O Below shows the effect each adjustment will have on temps across tires with adjustment.</p>
        <p className="temp-legend">
          <span className="green-text">Green = Will Increase Temp</span>
          <span className="red-text">Red = Will Decrease Temp</span>
        </p>
        <img src="/race-setup-app/car1.jpg" alt="Car illustration with Camber" className="car-illustration" />
      </div>

      <div className="camber-grid">
        <div className="camber-side-column">
          {/* Left Front */} 
          <div className="camber-table-container">
            <h3>LEFT FRONT</h3>
            <table>
              <tbody>
                <tr>
                  <td>Pos Camber</td>
                  <td>Loosen Entry</td>
                  <td className="temp-indicators">
                    <span className="red-text">I</span>
                    <span>M</span>
                    <span className="green-text">O</span>
                  </td>
                </tr>
                <tr>
                  <td>Neg Camber</td>
                  <td>Tighten Middle-Out</td>
                  <td className="temp-indicators">
                    <span className="green-text">I</span>
                    <span>M</span>
                    <span className="red-text">O</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Left Rear */} 
          <div className="camber-table-container">
            <h3>LEFT REAR</h3>
            <table>
              <tbody>
                <tr>
                  <td>Pos Camber</td>
                  <td>Tighten Entry</td>
                  <td className="temp-indicators">
                    <span className="red-text">I</span>
                    <span>M</span>
                    <span className="green-text">O</span>
                  </td>
                </tr>
                <tr>
                  <td>Neg Camber</td>
                  <td>Loosen Entry</td>
                  <td className="temp-indicators">
                    <span className="green-text">I</span>
                    <span>M</span>
                    <span className="red-text">O</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="camber-side-column">
          {/* Right Front */} 
          <div className="camber-table-container">
            <h3>RIGHT FRONT</h3>
            <table>
              <tbody>
                <tr>
                  <td>Pos Camber</td>
                  <td>Tighten Entry</td>
                  <td className="temp-indicators">
                    <span className="green-text">I</span>
                    <span>M</span>
                    <span className="red-text">O</span>
                  </td>
                </tr>
                <tr>
                  <td>Neg Camber</td>
                  <td>Loosen Entry</td>
                  <td className="temp-indicators">
                    <span className="red-text">I</span>
                    <span>M</span>
                    <span className="green-text">O</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right Rear */} 
          <div className="camber-table-container">
            <h3>RIGHT REAR</h3>
            <table>
              <tbody>
                <tr>
                  <td>Pos Camber</td>
                  <td>Loosen Middle-Out</td>
                  <td className="temp-indicators">
                    <span className="green-text">I</span>
                    <span>M</span>
                    <span className="red-text">O</span>
                  </td>
                </tr>
                <tr>
                  <td>Neg Camber</td>
                  <td>Tighten Middle-Out</td>
                  <td className="temp-indicators">
                    <span className="red-text">I</span>
                    <span>M</span>
                    <span className="green-text">O</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="camber-tips">
        <h3>Tips</h3>
        <p>
          Inside temps should maintain up to 5-10 degrees hotter than Outside temps for maximum tire effectiveness on ovals. -
        </p>
        <p>
          Camber can have a large effect both on straight away speeds and cornering speeds as it controls how much tire contact is available. More contact with
          tire patch=better cornering while less= better straight line speeds. -
        </p>
      </div>
    </div>
  );
}

export default CamberReference;