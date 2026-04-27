// Shock/strut options for 2008 Ford Crown Victoria P71
// Source: crown_vic_shocks.md (Crown Vic fitments only — Mustang cross-references removed)
// Rating: 0 = stiffest, 10 = softest
//
// Stiffness basis:
//   - Monotube > Twin-Tube at equivalent application (higher gas pressure ~360 PSI,
//     no aeration, faster piston response, more aggressive damping knee)
//   - KYB 555603 (monotube Police) confirmed stiffer than Monroe 550018 Magnum (twin-tube Police)
//   - KYB 554355 removed — Mustang S197 fitment, does not fit Crown Victoria
//   - "Police/Taxi" label indicates heavy-duty valving vs Base/LX but does NOT override
//     the monotube/twin-tube construction difference
//
// Stroke note: stroke length ≠ stiffness. Stroke sets suspension travel range.
//   Shorter stroke limits travel (can feel harsh at limits), but internal valving
//   determines actual damping rate. All ratings are based on valving, not stroke.

export const REAR_SHOCKS = [
  // ── Comfort / OEM replacement (softest) ──────────────────────────────────
  { manufacturer: 'Monroe',     part: '5993',        type: 'Twin-Tube',  use: 'Base Model / LX',        rating: 10, compressed: 12.50, extended: 21.25, stroke: 8.75 },
  { manufacturer: 'Monroe',     part: '210149',      type: 'Twin-Tube',  use: 'Base Model / LX',        rating: 9,  compressed: 12.28, extended: 20.04, stroke: 7.76 },
  { manufacturer: 'PRT',        part: '173898',      type: 'Twin-Tube',  use: 'Base Model / LX',        rating: 9,  compressed: 12.21, extended: 20.04, stroke: 7.84 },
  { manufacturer: 'Motorcraft', part: 'ASH24539',    type: 'Twin-Tube',  use: 'Standard Duty',          rating: 8,  compressed: 12.40, extended: 20.10, stroke: 7.70 },
  { manufacturer: 'FCS',        part: '341967',      type: 'Twin-Tube',  use: 'Base Model / LX',        rating: 8,  compressed: 12.56, extended: 20.20, stroke: 7.64 },
  { manufacturer: 'Duralast',   part: 'TS33-31962B', type: 'Twin-Tube',  use: 'Base Model',             rating: 8,  compressed: 12.56, extended: 20.16, stroke: 7.60 },
  { manufacturer: 'Monroe',     part: '5783',        type: 'Twin-Tube',  use: 'Original Ride Quality',  rating: 8,  compressed: 12.50, extended: 20.00, stroke: 7.50 },
  { manufacturer: 'Gabriel',    part: '69575',       type: 'Twin-Tube',  use: 'Base Model / LX',        rating: 7,  compressed: 12.40, extended: 20.16, stroke: 7.76 },
  // ── Monotube performance (standard) ──────────────────────────────────────
  { manufacturer: 'KYB',        part: '555601',      type: 'Monotube',   use: 'Performance Upgrade',    rating: 5,  compressed: 12.92, extended: 20.09, stroke: 7.17 },
  { manufacturer: 'FCS',        part: 'DT551380',    type: 'Monotube',   use: 'Base Model',             rating: 5,  compressed: 12.99, extended: 20.00, stroke: 7.01 },
  // ── Heavy duty / Police twin-tube ─────────────────────────────────────────
  { manufacturer: 'Motorcraft', part: 'ASH12277',    type: 'Twin-Tube',  use: 'Heavy Duty / Handling',  rating: 4,  compressed: 12.50, extended: 20.26, stroke: 7.76 },
  { manufacturer: 'PRT',        part: '194510',      type: 'Twin-Tube',  use: 'Police / Taxi',          rating: 4,  compressed: 12.28, extended: 20.04, stroke: 7.76 },
  { manufacturer: 'Duralast',   part: 'TS33-32752B', type: 'Twin-Tube',  use: 'Police / Taxi',          rating: 3,  compressed: 12.40, extended: 20.31, stroke: 7.91 },
  { manufacturer: 'PRT',        part: '194574',      type: 'Twin-Tube',  use: 'Police / Taxi',          rating: 3,  compressed: 12.99, extended: 19.88, stroke: 6.89 },
  { manufacturer: 'Gabriel',    part: '69574',       type: 'Twin-Tube',  use: 'Police Interceptor',     rating: 3,  compressed: 12.50, extended: 20.26, stroke: 7.76 },
  // ── Stiffest: Magnum severe service and monotube Police ──────────────────
  // KYB 555603 monotube confirmed stiffer than Monroe 550018 Magnum twin-tube.
  // Monotube gas pressure ~360 PSI vs twin-tube ~50-150 PSI; Police valving adds further stiffness.
  // Monroe 550055 Magnum Severe Service: same Magnum line as 550018, rear fitment.
  // Source markdown incorrectly placed it in the front struts table — dimensions (12.375–20.125",
  // 7.75" stroke) are rear shock geometry; all front struts on this car are ~15.5" extended.
  { manufacturer: 'Monroe',     part: '550018',      type: 'Twin-Tube',  use: 'Magnum Severe Service — Police / Taxi', rating: 1, compressed: 12.50,  extended: 20.00,  stroke: 7.50 },
  { manufacturer: 'Monroe',     part: '550055',      type: 'Twin-Tube',  use: 'Magnum Severe Service — Police Interceptor', rating: 1, compressed: 12.375, extended: 20.125, stroke: 7.75 },
  { manufacturer: 'KYB',        part: '555603',      type: 'Monotube',   use: 'Police / Taxi',          rating: 0,  compressed: 12.92, extended: 20.09, stroke: 7.17 },
];

// springRate: set for all complete strut assemblies (pre-assembled units ship with their own coil).
// KYB 551600 is a bare monotube damper body — reuses existing spring, no springRate set.
// Civilian (Base/LX) assemblies: ~440 lbs/in spring.
// Police/Taxi assemblies: ~475 lbs/in spring (stiffer police-package coil).
export const FRONT_STRUTS = [
  // ── Comfort / OEM replacement (softest) ──────────────────────────────────
  { manufacturer: 'FCS',    part: '1336343', type: 'Twin-Tube', use: 'Base Model / LX',       rating: 9, springRate: 440, compressed: 12.01, extended: 15.59, stroke: 3.58 },
  { manufacturer: 'PRT',    part: '714075',  type: 'Twin-Tube', use: 'Base Model / LX',       rating: 9, springRate: 440, compressed: 12.09, extended: 15.55, stroke: 3.47 },
  { manufacturer: 'Monroe', part: '171346',  type: 'Twin-Tube', use: 'Base Model / LX',       rating: 8, springRate: 440, compressed: 12.25, extended: 15.52, stroke: 3.27 },
  // ── Monotube (standard application) ──────────────────────────────────────
  { manufacturer: 'KYB',    part: 'SR4140',  type: 'Monotube',  use: 'Base Model / LX',       rating: 6, springRate: 440, compressed: 12.40, extended: 15.51, stroke: 3.11 },
  { manufacturer: 'KYB',    part: '551600',  type: 'Monotube',  use: 'Base Model / LX',       rating: 6,                  compressed: 12.40, extended: 15.51, stroke: 3.11 },
  // ── Heavy duty / Police twin-tube ─────────────────────────────────────────
  { manufacturer: 'FCS',    part: '1336349', type: 'Twin-Tube', use: 'Police / Taxi',         rating: 4, springRate: 475, compressed: 11.85, extended: 15.94, stroke: 4.09 },
  { manufacturer: 'PRT',    part: '710415',  type: 'Twin-Tube', use: 'Police / Taxi',         rating: 3, springRate: 475, compressed: 12.28, extended: 15.71, stroke: 3.43 },
  // Monroe 271346 Quick-Strut Police: spring is stiffer (475 lb/in police coil) but Monroe's
  // Quick-Strut damper valving is comfort-biased even in Police trim — rated 2, not 1.
  { manufacturer: 'Monroe', part: '271346',  type: 'Twin-Tube', use: 'Police / Taxi',         rating: 2, springRate: 475, compressed: 12.25, extended: 15.52, stroke: 3.27 },
];

// Build a label string: "Monroe | 5993 | TT | 10"
export function shockLabel(s) {
  const tt = s.type === 'Monotube' ? 'Mono' : 'TT';
  return `${s.manufacturer} | ${s.part} | ${tt} | ${s.rating}`;
}
