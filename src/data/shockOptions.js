// Shock/strut options for 2008 Ford Crown Victoria P71
// Source: RockAuto (Crown Vic fitments only — Mustang cross-references removed)
// Rating: 0 = stiffest, 10 = softest
//
// Stiffness basis:
//   - Monotube > Twin-Tube at equivalent application (higher gas pressure ~360 PSI,
//     no aeration, faster piston response, more aggressive damping knee)
//   - KYB 555603 (monotube Police) confirmed stiffer than Monroe 550018 Magnum (twin-tube Police)
//   - "Police/Taxi" label indicates heavy-duty valving vs Base/LX but does NOT override
//     the monotube/twin-tube construction difference
//
// Stroke note: stroke length ≠ stiffness. Stroke sets suspension travel range.
//   Shorter stroke limits travel (can feel harsh at limits), but internal valving
//   determines actual damping rate. All ratings are based on valving, not stroke.
//
// dampingBias: estimated rebound / compression split (R% / C%) by construction type.
//   Published engineering convention — not derivable from length measurements.
//   Twin-tube base:          ~58/42  (comfort-biased, slow return to ride height)
//   Twin-tube police/heavy:  ~62/38  (moderate rebound — resists body roll recovery)
//   Monotube:                ~65/35  (highest rebound bias — gas charge handles compression)
//   Monroe Magnum:           ~63/37  (police-rated twin-tube, firm overall, moderate rebound)
//
// ovalRole: how this shock behaves at each corner position on a left-turn oval.
//   RF rebound = keeps RF planted under throttle; steering authority on exit.
//   LF rebound = controls body roll rate → front LLTD → tight/loose entry.
//   RR rebound = resists rear rotation → tighter car.
//   LR rebound = controls roll return rate → affects rotation availability.
//   "More rebound" at a corner = stiffer shock rating (lower number).
//
// f8Role: behavior on a figure 8 where each front alternates outside/inside every turn.
//   Front rebound = direction change speed (more = slower transition = push through crossover).
//   Rear rebound  = crossover stability and rotation availability.
//   Symmetric front selection strongly preferred — asymmetric fronts hurt one direction.

export const REAR_SHOCKS = [
  // ── Comfort / OEM replacement (softest) ──────────────────────────────────
  {
    manufacturer: 'Monroe', part: '5993', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 10, compressed: 12.50, extended: 21.25, stroke: 8.75,
    dampingBias: '58/42',
    ovalRole: 'Maximum body roll, very loose rear — rear rotates freely on all exits. Not recommended for oval racing.',
    f8Role: 'Slowest rear settlement — rear very slow to return after direction change. Sluggish through F8 crossover.',
  },
  {
    manufacturer: 'Monroe', part: '210149', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 9, compressed: 12.28, extended: 20.04, stroke: 7.76,
    dampingBias: '58/42',
    ovalRole: 'Soft rear — allows rear to rotate freely; car will feel loose, especially on corner exit.',
    f8Role: 'Soft rear — fast direction change initiation but rear may feel unsettled mid-transition.',
  },
  {
    manufacturer: 'PRT', part: '173898', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 9, compressed: 12.21, extended: 20.04, stroke: 7.84,
    dampingBias: '58/42',
    ovalRole: 'Same as Monroe 210149 — soft, rear rotates freely, loose exit.',
    f8Role: 'Same as Monroe 210149 — fast crossover but unsettled rear.',
  },
  {
    manufacturer: 'Motorcraft', part: 'ASH24539', type: 'Twin-Tube', use: 'Standard Duty',
    rating: 8, compressed: 12.40, extended: 20.10, stroke: 7.70,
    dampingBias: '58/42',
    ovalRole: 'Mild rear rebound — moderate rotation, neutral-to-loose rear feel. Decent starting point.',
    f8Role: 'Good baseline F8 rear — allows rotation without excessive rear instability through crossover.',
  },
  {
    manufacturer: 'FCS', part: '341967', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 8, compressed: 12.56, extended: 20.20, stroke: 7.64,
    dampingBias: '58/42',
    ovalRole: 'Mild rear rebound — similar to Motorcraft ASH24539; neutral-to-loose rear.',
    f8Role: 'Similar to Motorcraft ASH24539; usable F8 baseline rear.',
  },
  {
    manufacturer: 'Duralast', part: 'TS33-31962B', type: 'Twin-Tube', use: 'Base Model',
    rating: 8, compressed: 12.56, extended: 20.16, stroke: 7.60,
    dampingBias: '58/42',
    ovalRole: 'Mild rear rebound — neutral-to-loose rear. Similar to other rating-8 base shocks.',
    f8Role: 'Neutral F8 rear baseline — adequate crossover settling.',
  },
  {
    manufacturer: 'Monroe', part: '5783', type: 'Twin-Tube', use: 'Original Ride Quality',
    rating: 8, compressed: 12.50, extended: 20.00, stroke: 7.50,
    dampingBias: '58/42',
    ovalRole: 'Mild rear rebound — neutral-to-loose. OE ride quality match.',
    f8Role: 'Neutral F8 rear baseline.',
  },
  {
    manufacturer: 'Gabriel', part: '69575', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 7, compressed: 12.40, extended: 20.16, stroke: 7.76,
    dampingBias: '58/42',
    ovalRole: 'Slightly firmer than base — modest rear rebound; mild tightening effect vs rating-8 shocks.',
    f8Role: 'Slightly firmer rear — marginally better crossover stability than base shocks.',
  },
  // ── Monotube performance (standard) ──────────────────────────────────────
  {
    manufacturer: 'KYB', part: '555601', type: 'Monotube', use: 'Performance Upgrade',
    rating: 5, compressed: 12.92, extended: 20.09, stroke: 7.17,
    dampingBias: '65/35',
    ovalRole: 'Moderate-firm rear rebound — rear stays planted longer; tightens rotation vs base shocks. Good step up for oval.',
    f8Role: 'Good F8 rear — monotube gas charge gives consistent feel; plants rear through direction changes without overdamping.',
  },
  {
    manufacturer: 'FCS', part: 'DT551380', type: 'Monotube', use: 'Base Model',
    rating: 5, compressed: 12.99, extended: 20.00, stroke: 7.01,
    dampingBias: '65/35',
    ovalRole: 'Similar to KYB 555601 — moderate-firm rear, reduces rear rotation. Shorter stroke limits travel on rough surfaces.',
    f8Role: 'Similar to KYB 555601 F8 behavior; consistent rear damping. Shorter stroke may feel harsher on rough F8 surface.',
  },
  // ── Heavy duty / Police twin-tube ─────────────────────────────────────────
  {
    manufacturer: 'Motorcraft', part: 'ASH12277', type: 'Twin-Tube', use: 'Heavy Duty / Handling',
    rating: 4, compressed: 12.50, extended: 20.26, stroke: 7.76,
    dampingBias: '62/38',
    ovalRole: 'Firm rear — slower rear rotation, more rear stability. Good for drivers who want a planted rear on exits.',
    f8Role: 'Firm rear — good directional stability at the cost of slightly slower rotation initiation.',
  },
  {
    manufacturer: 'PRT', part: '194510', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 4, compressed: 12.28, extended: 20.04, stroke: 7.76,
    dampingBias: '62/38',
    ovalRole: 'Firm rear — similar to Motorcraft ASH12277; planted rear, resists rotation.',
    f8Role: 'Firm rear — reduces rear instability through crossover. Slightly slower direction change initiation.',
  },
  {
    manufacturer: 'Duralast', part: 'TS33-32752B', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 3, compressed: 12.40, extended: 20.31, stroke: 7.91,
    dampingBias: '62/38',
    ovalRole: 'Stiff rear — significantly reduces rear rotation; tight/push tendency unless paired with stiff fronts.',
    f8Role: 'Stiff rear — very planted through crossovers; may fight rotation initiation if front struts are also stiff.',
  },
  {
    manufacturer: 'PRT', part: '194574', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 3, compressed: 12.99, extended: 19.88, stroke: 6.89,
    dampingBias: '62/38',
    ovalRole: 'Stiff rear — same role as Duralast TS33-32752B; shortest stroke of all rears, limits travel on rough surface.',
    f8Role: 'Stiff rear — same as Duralast TS33-32752B; shortest stroke (6.89") may feel harsh on rough F8 track surface.',
  },
  {
    manufacturer: 'Gabriel', part: '69574', type: 'Twin-Tube', use: 'Police Interceptor',
    rating: 3, compressed: 12.50, extended: 20.26, stroke: 7.76,
    dampingBias: '62/38',
    ovalRole: 'Stiff rear — reduces rotation, plants rear; good for tight/push-resistant setup.',
    f8Role: 'Stiff rear — stable through crossovers but may feel rigid on direction change.',
  },
  // ── Stiffest ─────────────────────────────────────────────────────────────
  {
    manufacturer: 'Monroe', part: '550018', type: 'Twin-Tube', use: 'Magnum Severe Service — Police / Taxi',
    rating: 1, compressed: 12.50, extended: 20.00, stroke: 7.50,
    dampingBias: '63/37',
    ovalRole: 'Very stiff rear — maximum twin-tube rebound; very tight; only use with stiff front struts to avoid excessive push.',
    f8Role: 'Very stiff rear — maximum crossover stability; very slow rotation initiation. Not recommended unless fronts are also very stiff.',
  },
  {
    manufacturer: 'Monroe', part: '550055', type: 'Twin-Tube', use: 'Magnum Severe Service — Police Interceptor',
    rating: 1, compressed: 12.375, extended: 20.125, stroke: 7.75,
    dampingBias: '63/37',
    ovalRole: 'Same as Monroe 550018 — stiffest twin-tube rear; requires stiff fronts to balance.',
    f8Role: 'Same as Monroe 550018 F8 role.',
  },
  {
    manufacturer: 'KYB', part: '555603', type: 'Monotube', use: 'Police / Taxi',
    rating: 0, compressed: 12.92, extended: 20.09, stroke: 7.17,
    dampingBias: '65/35',
    ovalRole: 'Stiffest rear available — highest rebound bias (monotube Police); rear stays planted; significant push tendency; requires stiff fronts to balance.',
    f8Role: 'Stiffest rear — excellent crossover stability; pairs well with softer front struts for F8 rotation. Very slow rotation initiation on its own.',
  },
];

// springRate: set for all complete strut assemblies (pre-assembled units ship with their own coil).
// KYB 551600 is a bare monotube damper body — reuses existing spring, no springRate set.
// Civilian (Base/LX) assemblies: ~440 lbs/in spring.
// Police/Taxi assemblies: ~475 lbs/in spring (stiffer police-package coil).
export const FRONT_STRUTS = [
  // ── Comfort / OEM replacement (softest) ──────────────────────────────────
  {
    manufacturer: 'FCS', part: '1336343', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 9, springRate: 440, compressed: 12.01, extended: 15.59, stroke: 3.58,
    dampingBias: '58/42',
    ovalRole: 'Very soft fronts — maximum body roll, low front LLTD; loose entry. RF has little rebound to resist unloading. Not recommended for oval.',
    f8Role: 'Very soft — fastest direction change initiation but very little front control. Car will be erratic through crossover. Not recommended for F8.',
  },
  {
    manufacturer: 'PRT', part: '714075', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 9, springRate: 440, compressed: 12.09, extended: 15.55, stroke: 3.47,
    dampingBias: '58/42',
    ovalRole: 'Same as FCS 1336343 — very soft, high body roll, loose entry.',
    f8Role: 'Same as FCS 1336343 — erratic through crossover.',
  },
  {
    manufacturer: 'Monroe', part: '171346', type: 'Twin-Tube', use: 'Base Model / LX',
    rating: 8, springRate: 440, compressed: 12.25, extended: 15.52, stroke: 3.27,
    dampingBias: '58/42',
    ovalRole: 'Soft fronts — loose entry, allows generous body roll; limited RF rebound and steering authority.',
    f8Role: 'Soft front — good rotation initiation; less front stability and control through crossover.',
  },
  // ── Monotube (standard application) ──────────────────────────────────────
  {
    manufacturer: 'KYB', part: 'SR4140', type: 'Monotube', use: 'Base Model / LX',
    rating: 6, springRate: 440, compressed: 12.40, extended: 15.51, stroke: 3.11,
    dampingBias: '65/35',
    ovalRole: 'Moderate front — reasonable body roll control, moderate front LLTD; good balance starting point for oval.',
    f8Role: 'Good F8 baseline — monotube consistency; reasonable crossover control without fighting rotation.',
  },
  {
    manufacturer: 'KYB', part: '551600', type: 'Monotube', use: 'Base Model / LX',
    rating: 6, compressed: 12.40, extended: 15.51, stroke: 3.11,
    dampingBias: '65/35',
    ovalRole: 'Same as KYB SR4140 — moderate front; bare damper body, uses existing car spring.',
    f8Role: 'Same as KYB SR4140 (bare damper — uses existing car spring).',
  },
  // ── Heavy duty / Police twin-tube ─────────────────────────────────────────
  {
    manufacturer: 'FCS', part: '1336349', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 4, springRate: 475, compressed: 11.85, extended: 15.94, stroke: 4.09,
    dampingBias: '62/38',
    ovalRole: 'Firm fronts — good RF rebound, resists body roll return; raises front LLTD; tightens entry. Current baseline setup.',
    f8Role: 'Firm front — slows direction change initiation; better crossover control. Current F8 baseline. Pair with stiff rear for balance.',
  },
  {
    manufacturer: 'PRT', part: '710415', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 3, springRate: 475, compressed: 12.28, extended: 15.71, stroke: 3.43,
    dampingBias: '62/38',
    ovalRole: 'Stiff fronts — high front LLTD, strong RF rebound; tight entry; pair with stiff rears to avoid imbalance.',
    f8Role: 'Stiff front — noticeably slower direction change. Use only if rear is also stiff to prevent chronic push through crossover.',
  },
  {
    manufacturer: 'Monroe', part: '271346', type: 'Twin-Tube', use: 'Police / Taxi',
    rating: 2, springRate: 475, compressed: 12.25, extended: 15.52, stroke: 3.27,
    dampingBias: '62/38',
    ovalRole: 'Very stiff fronts — very high front LLTD; strong push tendency unless rear is equally stiff.',
    f8Role: 'Very stiff front — very slow rotation initiation; requires very stiff rear to balance.',
  },
];

// Build a label string: "Monroe | 5993 | TT | 10"
export function shockLabel(s) {
  const tt = s.type === 'Monotube' ? 'Mono' : 'TT';
  return `${s.manufacturer} | ${s.part} | ${tt} | ${s.rating}`;
}
