import { useState } from 'react';

const SETUPS = {
  oval: {
    label: '1/4 Mile Oval',
    desc: 'Left-turn only. Fully asymmetric setup — each corner is tuned individually. Right-side shocks are stiffer than left to match constant centrifugal loading. Stiffest RR shock controls wheel hop under 3.73-gear acceleration on corner exit.',
    corners: {
      LF: { camber: '-2.5°', caster: '3.5°', coldPsi: 26, hotPsi: '33–35', pressureNote: 'Inside front — less load, lower pressure' },
      RF: { camber: '-0.75°', caster: '5.5°', coldPsi: 32, hotPsi: '38–40', pressureNote: 'Outside front — most loaded tire, highest pressure' },
      LR: { camber: null, caster: null, coldPsi: 22, hotPsi: '30–32', pressureNote: 'Inside rear — least loaded, lowest pressure' },
      RR: { camber: null, caster: null, coldPsi: 30, hotPsi: '36–38', pressureNote: 'Outside rear — traction critical with 3.73 gears' },
    },
    toe: {
      front: { value: '1/8" toe-out (total)', note: 'Aids turn-in and corner rotation. Monitor inside edge temps — if running too hot, reduce toe-out.' },
    },
    shocks: {
      LF: {
        part: 'KYB SR4140 / KYB 551600',
        type: 'Strut-Plus / Strut (Monotube)',
        rating: 5,
        rationale: 'Inside front takes the least load in left turns. Moderate monotube keeps the inside tire planted over track imperfections without fighting the car\'s natural tendency to rotate left.',
      },
      RF: {
        part: 'Monroe 271346',
        type: 'Quick-Strut (Police/Taxi, Twin-Tube)',
        rating: 2,
        rationale: 'Most loaded corner on a left-turn oval. Police-spec valving resists body roll and maintains the RF contact patch under sustained centrifugal loading. SLA geometry adds negative camber dynamically, so static camber of -0.75° is sufficient.',
      },
      LR: {
        part: 'Motorcraft ASH12277',
        type: 'Shock Absorber (Heavy Duty / Handling)',
        rating: 4,
        rationale: 'Softer than RR on purpose. On a solid rear axle, a compliant LR allows the axle to articulate slightly, aiding rotation through the corner middle. If too stiff, the LR acts as a lever that lifts the whole axle and kills rear traction.',
      },
      RR: {
        part: 'KYB 555603',
        type: 'Gas-a-Just (Monotube, Police/Taxi)',
        rating: 1,
        rationale: 'Stiffest shock available. The RR is traction-critical with 3.73 gears — this shock prevents wheel hop, controls rear squat under hard acceleration, and keeps the RR tire planted through corner exit.',
      },
    },
    notes: [
      'Asymmetric shocks are standard oval racing practice — each corner has a different job. Running the same shock at all four corners is leaving time on the table.',
      'RF camber at -0.75° is intentionally shallow. The SLA front suspension gains negative camber dynamically as the RF compresses in the corner — by mid-corner the RF will be at approximately -2.5° to -3.0° without any additional static setup.',
      'LF camber at -2.5° compensates for the LF extending in a left turn, which causes camber loss. The extra static negative camber keeps the inside tire\'s contact patch usable.',
      'RF caster at 5.5° is higher than LF (3.5°) — this creates additional camber recovery through the corner and improves RF grip and stability at high speed.',
      'Right-side tire pressures run significantly higher (cold) to account for the greater centrifugal load and heat buildup. Check hot pressures after 5 laps; adjust cold pressures to hit the hot targets.',
      'RR shock (KYB 555603, rating 1) is the stiffest option available. With 3.73 gears, wheel hop on exit is the primary threat to lap time — this shock eliminates it.',
      'LR shock (Motorcraft ASH12277, rating 4) being softer than the RR is deliberate on a solid axle. A 3-point stiffness spread (LR at 4, RR at 1) is the right balance between rotation and exit traction.',
      'Pinion angle on the 4-link rear must be parallel to the driveshaft — incorrect pinion angle worsens wheel hop under the aggressive acceleration of a 3.73 gear.',
      'Front toe-out helps rotation but increases inner edge wear. Use pyrometer data to fine-tune — if LF inside edge is significantly hotter than outside, reduce toe-out by 1/16".',
    ],
  },

  figure8: {
    label: 'Figure 8',
    desc: 'Bidirectional. Symmetric setup is mandatory — the car must handle left and right turns equally. Stiffer overall than oval to control body roll in both directions and manage the violent crossing point transitions.',
    corners: {
      LF: { camber: '-1.75°', caster: '4.5°', coldPsi: 28, hotPsi: '36–38', pressureNote: 'Equal side-to-side — turns go both ways' },
      RF: { camber: '-1.75°', caster: '4.5°', coldPsi: 28, hotPsi: '36–38', pressureNote: 'Equal side-to-side — turns go both ways' },
      LR: { camber: null, caster: null, coldPsi: 26, hotPsi: '34–36', pressureNote: 'Slightly lower rear for traction compliance' },
      RR: { camber: null, caster: null, coldPsi: 26, hotPsi: '34–36', pressureNote: 'Slightly lower rear for traction compliance' },
    },
    toe: {
      front: { value: '1/16" toe-in (total)', note: 'Toe-in improves straight-line stability at the crossing and reduces snap oversteer when the driver reverses steering input.' },
    },
    frontStrut: {
      primary: {
        part: 'Monroe 271346',
        type: 'Quick-Strut (Police/Taxi, Twin-Tube)',
        rating: 2,
        rationale: 'Police-spec valving controls body roll in both turn directions. Complete Quick-Strut assembly simplifies maintenance between events.',
      },
      alt: {
        part: 'FCS 1336349',
        type: 'Strut Assembly (Police/Taxi, Twin-Tube)',
        rating: 4,
        rationale: 'Softer police-spec option if 271346 feels too harsh on a rough crossing surface. Longest front stroke (4.09") gives more compliance over the crossing-point bump.',
      },
    },
    rearShock: {
      primary: {
        part: 'KYB 555603',
        type: 'Gas-a-Just (Monotube, Police/Taxi)',
        rating: 1,
        rationale: 'Maximum stiffness at the rear. Figure-8 transitions load the rear asymmetrically and rapidly — the crossing point demands the most control you can get.',
      },
      alt: {
        part: 'Monroe 550018',
        type: 'Magnum Severe Service (Twin-Tube, Police/Taxi)',
        rating: 1,
        rationale: 'Stiffest twin-tube Monroe makes — same rating as the KYB. Good alternative if the monotube feel is too abrupt on a rough crossing surface.',
      },
    },
    notes: [
      'Equal caster side-to-side is the single most critical figure-8 requirement — the car must steer with equal effort in both directions.',
      'Symmetric camber at -1.75° gives up some per-turn advantage compared to an oval setup but is essential for predictable handling in both directions.',
      'Front toe-in (vs. oval\'s toe-out) prevents snap oversteer when the driver rapidly reverses steering direction at the crossing.',
      'Equal tire pressures left-to-right reflect balanced loading from bidirectional racing. If one side consistently runs hotter, investigate alignment or driving technique.',
      'Same rear shock on both sides (KYB 555603) — bidirectional racing requires equal response from left and right. Any stiffness difference would cause the car to favor one turn direction.',
      'The crossing point is the most violent suspension event in figure-8 racing. Maximum rear shock firmness prevents the rear from stepping out during rapid direction changes.',
      'Tire wear is significantly faster in figure 8 than oval due to bidirectional stress. Check wear patterns every session and adjust pressures if one side edges consistently.',
    ],
  },
};

const CORNER_LABELS = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
const REAR = ['LR', 'RR'];

function getRatingColor(r) {
  if (r >= 8) return 'var(--green)';
  if (r >= 5) return 'var(--yellow)';
  return 'var(--red)';
}

function CornerCard({ pos, data }) {
  const isRear = REAR.includes(pos);
  return (
    <div className="setup-corner-card">
      <div className="setup-corner-title">{CORNER_LABELS[pos]}</div>
      {!isRear && (
        <>
          <div className="setup-spec-row">
            <span className="setup-spec-label">Camber</span>
            <span className="setup-spec-value">{data.camber}</span>
          </div>
          <div className="setup-spec-row">
            <span className="setup-spec-label">Caster</span>
            <span className="setup-spec-value">{data.caster}</span>
          </div>
        </>
      )}
      <div className="setup-spec-divider" />
      <div className="setup-spec-row">
        <span className="setup-spec-label">Cold PSI</span>
        <span className="setup-spec-value pressure-cold">{data.coldPsi} psi</span>
      </div>
      <div className="setup-spec-row">
        <span className="setup-spec-label">Hot Target</span>
        <span className="setup-spec-value pressure-hot">{data.hotPsi} psi</span>
      </div>
      <div className="setup-pressure-note">{data.pressureNote}</div>
    </div>
  );
}

function CornerShockCard({ pos, data }) {
  return (
    <div className="setup-corner-card">
      <div className="setup-corner-title">{CORNER_LABELS[pos]}</div>
      <div className="shock-rec-part" style={{ marginBottom: '4px' }}>{data.part}</div>
      <div className="shock-rec-type">{data.type}</div>
      <div className="shock-rec-rating" style={{ margin: '6px 0' }}>
        Rating: <span style={{ color: getRatingColor(data.rating), fontWeight: 700 }}>{data.rating}</span>
        <span className="shock-rec-scale"> / 10</span>
      </div>
      <div className="setup-spec-divider" />
      <div className="shock-rec-rationale">{data.rationale}</div>
    </div>
  );
}

function ShockCard({ title, data }) {
  return (
    <div className="setup-shock-card">
      <div className="setup-shock-header">{title}</div>
      <div className="setup-shock-rec">
        <div className="shock-rec-badge primary-badge">Primary</div>
        <div className="shock-rec-part">{data.primary.part}</div>
        <div className="shock-rec-type">{data.primary.type}</div>
        <div className="shock-rec-rating">
          Rating: <span style={{ color: getRatingColor(data.primary.rating), fontWeight: 700 }}>{data.primary.rating}</span>
          <span className="shock-rec-scale"> / 10</span>
        </div>
        <div className="shock-rec-rationale" style={{ marginTop: '6px' }}>{data.primary.rationale}</div>
      </div>
      <div className="setup-shock-rec alt-rec">
        <div className="shock-rec-badge">Alternative</div>
        <div className="shock-rec-part">{data.alt.part}</div>
        <div className="shock-rec-type">{data.alt.type}</div>
        <div className="shock-rec-rating">
          Rating: <span style={{ color: getRatingColor(data.alt.rating), fontWeight: 700 }}>{data.alt.rating}</span>
          <span className="shock-rec-scale"> / 10</span>
        </div>
        <div className="shock-rec-rationale" style={{ marginTop: '6px' }}>{data.alt.rationale}</div>
      </div>
    </div>
  );
}

function CrownVicSetup() {
  const [activeSetup, setActiveSetup] = useState('oval');
  const setup = SETUPS[activeSetup];
  const isOval = activeSetup === 'oval';

  return (
    <div className="setup-page">
      <div className="section-header">
        <h2>Crown Victoria – Race Setup Guide</h2>
        <p className="section-description">
          Optimized chassis setups for a 2005–2011 Crown Victoria P71 with 3.73 final drive on a 1/4 mile track.
          All alignment values are starting points — validate with pyrometer data after every session and adjust accordingly.
        </p>
      </div>

      <div className="reference-grid" style={{ marginBottom: '28px' }}>
        <div className="reference-card">
          <h4>Vehicle</h4>
          <p>4.6L SOHC V8 · 250 hp · 297 lb-ft</p>
          <p>4-speed auto (4R75E) · 3.73 final drive</p>
          <p>Body-on-frame · ~4,057 lbs</p>
          <p>Wheelbase: 114.7" · Tires: P235/55R17</p>
        </div>
        <div className="reference-card">
          <h4>Suspension</h4>
          <p><strong>Front:</strong> Independent SLA (Twin A-arm), coil spring struts, stabilizer bar</p>
          <p><strong>Rear:</strong> Solid axle, 4-link, coil springs, stabilizer bar</p>
          <p>Solid rear axle: camber, caster, and toe are fixed. Shock stiffness and tire pressure are the primary rear tuning tools.</p>
        </div>
        <div className="reference-card">
          <h4>3.73 Gear Implications</h4>
          <p>Engine hits powerband quickly — higher wheel spin potential on corner exit.</p>
          <p>Firm RR shock is critical to prevent hop under hard acceleration.</p>
          <p>Aggressive weight transfer under acceleration demands a planted, stable rear suspension.</p>
        </div>
      </div>

      <div className="button-group" style={{ marginBottom: '8px' }}>
        <button
          className={`select-button ${isOval ? 'active' : ''}`}
          onClick={() => setActiveSetup('oval')}
        >
          <span className="btn-label">1/4 Mile Oval</span>
          <span className="btn-desc">Left-turn only · Asymmetric per corner</span>
        </button>
        <button
          className={`select-button ${!isOval ? 'active' : ''}`}
          onClick={() => setActiveSetup('figure8')}
        >
          <span className="btn-label">Figure 8</span>
          <span className="btn-desc">Bidirectional · Symmetric setup</span>
        </button>
      </div>

      <p className="section-description" style={{ marginBottom: '24px', marginTop: '12px' }}>
        {setup.desc}
      </p>

      <h3 className="setup-section-title">Alignment &amp; Tire Pressures</h3>
      <div className="setup-corner-grid">
        <div className="setup-grid-label">FRONT</div>
        <CornerCard pos="LF" data={setup.corners.LF} />
        <CornerCard pos="RF" data={setup.corners.RF} />
        <CornerCard pos="LR" data={setup.corners.LR} />
        <CornerCard pos="RR" data={setup.corners.RR} />
        <div className="setup-grid-label">REAR</div>
      </div>

      <h3 className="setup-section-title">Toe Settings</h3>
      <div className="setup-toe-grid">
        <div className="setup-corner-card">
          <div className="setup-corner-title">Front Axle</div>
          <div className="setup-spec-row">
            <span className="setup-spec-label">Total Toe</span>
            <span className="setup-spec-value">{setup.toe.front.value}</span>
          </div>
          <div className="setup-pressure-note" style={{ marginTop: '8px' }}>{setup.toe.front.note}</div>
        </div>
      </div>

      <h3 className="setup-section-title">
        Shocks &amp; Struts {isOval && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— asymmetric per corner</span>}
      </h3>

      {isOval ? (
        <div className="setup-corner-grid">
          <div className="setup-grid-label">FRONT</div>
          <CornerShockCard pos="LF" data={setup.shocks.LF} />
          <CornerShockCard pos="RF" data={setup.shocks.RF} />
          <CornerShockCard pos="LR" data={setup.shocks.LR} />
          <CornerShockCard pos="RR" data={setup.shocks.RR} />
          <div className="setup-grid-label">REAR</div>
        </div>
      ) : (
        <div className="setup-shock-grid">
          <ShockCard title="Front Struts" data={setup.frontStrut} />
          <ShockCard title="Rear Shocks" data={setup.rearShock} />
        </div>
      )}

      <div className="handling-tips-considerations" style={{ marginTop: '32px' }}>
        <h3>Setup Rationale</h3>
        <ul>
          {setup.notes.map((note, i) => <li key={i}>{note}</li>)}
        </ul>
      </div>

      <div className="handling-tip" style={{ marginTop: '20px' }}>
        <strong>Starting Point Only:</strong> These are baseline setups derived from suspension physics, vehicle specs, and oval racing principles.
        Always validate with pyrometer data after on-track sessions and adjust accordingly.
        Track surface, banking angle, and driving style will require further fine-tuning.
      </div>
    </div>
  );
}

export default CrownVicSetup;
