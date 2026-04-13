// Shock/strut options for 2008 Ford Crown Victoria P71
// Source: crown_vic_shocks.md
// Rating: 0 = stiffest, 10 = softest

export const REAR_SHOCKS = [
  { manufacturer: 'Monroe',    part: '5993',       type: 'OESpectrum (Twin-Tube)',        use: 'Base Model / LX',         rating: 10 },
  { manufacturer: 'Monroe',    part: '210149',      type: 'Restore (Twin-Tube)',           use: 'Base Model / LX',         rating: 9  },
  { manufacturer: 'PRT',       part: '173898',      type: 'Shock Absorber (Twin-Tube)',    use: 'Base Model / LX',         rating: 9  },
  { manufacturer: 'Motorcraft',part: 'ASH24539',    type: 'Shock Absorber (Twin-Tube)',    use: 'Standard Duty',           rating: 8  },
  { manufacturer: 'FCS',       part: '341967',      type: 'Shock Absorber (Twin-Tube)',    use: 'Base Model / LX',         rating: 8  },
  { manufacturer: 'Duralast',  part: 'TS33-31962B', type: 'Shock Absorber (Twin-Tube)',    use: 'Base Model',              rating: 8  },
  { manufacturer: 'Monroe',    part: '5783',        type: 'OESpectrum (Twin-Tube)',        use: 'Original Ride Quality',   rating: 8  },
  { manufacturer: 'Gabriel',   part: '69575',       type: 'Ultra (Twin-Tube)',             use: 'Base Model / LX',         rating: 7  },
  { manufacturer: 'KYB',       part: '555601',      type: 'Gas-a-Just (Monotube)',         use: 'Performance Upgrade',     rating: 5  },
  { manufacturer: 'FCS',       part: 'DT551380',    type: 'Monotube Gas Charged',          use: 'Base Model',              rating: 5  },
  { manufacturer: 'KYB',       part: '554355',      type: 'Gas-A-Just (Monotube)',         use: 'Increased Handling',      rating: 4  },
  { manufacturer: 'Motorcraft',part: 'ASH12277',    type: 'Shock Absorber (Twin-Tube)',    use: 'Heavy Duty / Handling',   rating: 4  },
  { manufacturer: 'PRT',       part: '194510',      type: 'Shock Absorber (Twin-Tube)',    use: 'Police / Taxi',           rating: 4  },
  { manufacturer: 'Duralast',  part: 'TS33-32752B', type: 'Shock Absorber (Twin-Tube)',    use: 'Police / Taxi',           rating: 3  },
  { manufacturer: 'PRT',       part: '194574',      type: 'Shock Absorber (Twin-Tube)',    use: 'Police / Taxi',           rating: 3  },
  { manufacturer: 'Gabriel',   part: '69574',       type: 'Ultra (Twin-Tube)',             use: 'Police Interceptor',      rating: 3  },
  { manufacturer: 'KYB',       part: '555603',      type: 'Gas-a-Just (Monotube)',         use: 'Police / Taxi',           rating: 2  },
  { manufacturer: 'Monroe',    part: '550018',      type: 'Magnum Severe Service (TT)',    use: 'Police / Taxi',           rating: 1  },
];

// springRate: set for ALL complete strut assemblies — every entry in FRONT_STRUTS is a
// pre-assembled unit that ships with its own coil spring. KYB 551600 is the sole exception:
// it is a bare monotube damper body without a spring (must reuse existing spring).
// Civilian (Base/LX) strut assemblies use ~440 lbs/in spring.
// Police/Taxi strut assemblies use ~475 lbs/in spring (stiffer police-package spring).
export const FRONT_STRUTS = [
  { manufacturer: 'FCS',       part: '1336343',     type: 'Strut Assembly (Twin-Tube)',    use: 'Base Model / LX',         rating: 9, springRate: 440  },
  { manufacturer: 'PRT',       part: '714075',      type: 'Strut Assembly (Twin-Tube)',    use: 'Base Model / LX',         rating: 9, springRate: 440  },
  { manufacturer: 'Monroe',    part: '171346',      type: 'Quick-Strut (Twin-Tube)',       use: 'Base Model / LX',         rating: 8, springRate: 440  },
  { manufacturer: 'KYB',       part: 'SR4140',      type: 'Strut-Plus (Monotube)',         use: 'Base Model / LX',         rating: 6, springRate: 440  },
  { manufacturer: 'KYB',       part: '551600',      type: 'Strut (Monotube)',              use: 'Base Model / LX',         rating: 6                   },
  { manufacturer: 'FCS',       part: '1336349',     type: 'Strut Assembly (Twin-Tube)',    use: 'Police / Taxi',           rating: 4, springRate: 475  },
  { manufacturer: 'PRT',       part: '710415',      type: 'Strut Assembly (Twin-Tube)',    use: 'Police / Taxi',           rating: 3, springRate: 475  },
  { manufacturer: 'Monroe',    part: '271346',      type: 'Quick-Strut (Twin-Tube)',       use: 'Police / Taxi',           rating: 2, springRate: 475  },
  { manufacturer: 'Monroe',    part: '550055',      type: 'Magnum Severe Service (TT)',    use: 'Police Interceptor',      rating: 1, springRate: 475  },
];

// Build a label string: "Monroe | 5993 | 10"
export function shockLabel(s) {
  return `${s.manufacturer} | ${s.part} | ${s.rating}`;
}
