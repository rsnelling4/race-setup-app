import React from 'react';

function ShocksReference() {
  return (
    <div className="shocks-reference-page">
      <h2 className="section-header">Shocks Reference</h2>

      <div className="shocks-grid">
        {/* Left Front Shock */} 
        <div className="shock-table-container">
          <h3>LEFT FRONT</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Tighten Entry</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Tighten Exit</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Front Shock */} 
        <div className="shock-table-container">
          <h3>FRONT</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Tighten Entry</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Tighten Exit</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Loosen Exit</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Front Shock */} 
        <div className="shock-table-container">
          <h3>RIGHT FRONT</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Tighten Entry</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Tighten Exit</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Left Rear Shock */} 
        <div className="shock-table-container">
          <h3>LEFT REAR</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Tighten Exit</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Tighten Entry</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rear Shock */} 
        <div className="shock-table-container">
          <h3>REAR</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Tighten Exit</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Tighten Entry</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Rear Shock */} 
        <div className="shock-table-container">
          <h3>RIGHT REAR</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pos Bump</td>
                <td>Loosen Exit</td>
              </tr>
              <tr>
                <td>Neg Bump</td>
                <td>Tighten Exit</td>
              </tr>
              <tr>
                <td>Pos Rebound</td>
                <td>Loosen Entry</td>
              </tr>
              <tr>
                <td>Neg Rebound</td>
                <td>Tighten Entry</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Adjustments */} 
      <div className="additional-shocks-info">
        <div className="shock-note-card">
          <h3>LEFT SIDE</h3>
          <p>Pos Rebound = Better Turn-In</p>
        </div>
        <div className="shock-note-card">
          <h3>UN-BALANCED ADJUSTMENTS</h3>
          <p>Loose In / Tight Off</p>
          <p>Tight In / Loose Off</p>
        </div>
        <div className="shock-note-card">
          <h3>RIGHT SIDE</h3>
          <p>Pos Bump = Better Turn-In</p>
        </div>
      </div>

      <div className="shock-specs-container">
        <h3 className="section-sub-header">FRONT SHOCK ABSORBER SPECIFICATIONS</h3>
        <div className="table-responsive">
          <table className="shock-specs-table">
            <thead>
              <tr>
                <th></th>
                <th>FCS 1336343</th>
                <th>FCS 1336349</th>
                <th>MONROE 171346</th>
                <th>MONROE 271346</th>
                <th>KYB SR4140</th>
                <th>KYB 551600</th>
                <th>MONROE 553001</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compressed Length (IN)</td>
                <td>12.01</td>
                <td>11.85</td>
                <td>12.25</td>
                <td>12.25</td>
                <td>12.4</td>
                <td>12.4</td>
                <td>13.875</td>
              </tr>
              <tr>
                <td>Extended Length (IN)</td>
                <td>15.59</td>
                <td>15.94</td>
                <td>15.52</td>
                <td>15.52</td>
                <td>15.51</td>
                <td>15.51</td>
                <td>17</td>
              </tr>
              <tr>
                <td>Stroke Length (IN)</td>
                <td>3.58</td>
                <td>4.09</td>
                <td>3.27</td>
                <td>3.27</td>
                <td>3.11</td>
                <td>3.11</td>
                <td>3.125</td>
              </tr>
              <tr>
                <td>Type</td>
                <td>Base</td>
                <td>Taxi</td>
                <td>Base</td>
                <td>Taxi</td>
                <td>Base</td>
                <td>Base</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="section-sub-header">REAR SHOCK ABSORBER SPECIFICATIONS</h3>
        <div className="table-responsive">
          <table className="shock-specs-table">
            <thead>
              <tr>
                <th></th>
                <th>KYB 555603</th>
                <th>MONROE 550018</th>
                <th>FCS 341967</th>
                <th>MONROE 5993</th>
                <th>FCS DT551380</th>
                <th>PRT 194510</th>
                <th>PRT 194574</th>
                <th>MONROE 33197</th>
                <th>MONROE 210149</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compressed Length (IN)</td>
                <td>12.92</td>
                <td>12.5</td>
                <td>12.56</td>
                <td>12.5</td>
                <td>12.99</td>
                <td>12.28</td>
                <td>12.99</td>
                <td>12.45</td>
                <td>12.28</td>
              </tr>
              <tr>
                <td>Extended Length (IN)</td>
                <td>20.09</td>
                <td>20</td>
                <td>20.2</td>
                <td>21.25</td>
                <td>20</td>
                <td>20.04</td>
                <td>19.88</td>
                <td>20.15</td>
                <td>20.04</td>
              </tr>
              <tr>
                <td>Stroke Length (IN)</td>
                <td>7.17</td>
                <td>7.5</td>
                <td>7.64</td>
                <td>8.75</td>
                <td>7.01</td>
                <td>7.76</td>
                <td>6.89</td>
                <td>7.7</td>
                <td>7.76</td>
              </tr>
              <tr>
                <td>Type</td>
                <td>Taxi</td>
                <td>Taxi</td>
                <td>Base</td>
                <td>Base</td>
                <td>Base</td>
                <td>Taxi</td>
                <td>Base</td>
                <td>Base</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ShocksReference;