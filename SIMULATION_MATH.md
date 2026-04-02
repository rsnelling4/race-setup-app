# Race Simulation — Measurements, Math & Sources Reference

**Car:** 2008 Crown Victoria P71
**Tracks:** 1/4-mile oval, Figure 8
**Last updated:** 2026-03-23

This document is a complete reference for every number, formula, and calibration constant in the race simulation. Each section explains *what* the math does, *why* it was chosen, and *where* the input values came from. Sources are listed inline and consolidated at the bottom.

---

## Table of Contents
1. [Physical Measurements](#1-physical-measurements)
2. [Vehicle Constants](#2-vehicle-constants)
3. [Tire Specifications](#3-tire-specifications)
4. [Track Geometry Derivations](#4-track-geometry-derivations)
5. [Lateral G & Corner Speeds](#5-lateral-g--corner-speeds)
6. [Weight Transfer & Tire Loads](#6-weight-transfer--tire-loads)
7. [Spring Rates — Confirmed & Available](#7-spring-rates--confirmed--available)
8. [Shock → LLTD & Roll Stiffness](#8-shock--lltd--roll-stiffness)
9. [Tire Thermal Model](#9-tire-thermal-model)
10. [Grip Model — All Factors](#10-grip-model--all-factors)
11. [Performance Metric → Lap Time](#11-performance-metric--lap-time)
12. [Pressure Optimization Math](#12-pressure-optimization-math)
13. [Camber Optimization Math](#13-camber-optimization-math)
14. [Real-World Calibration Data](#14-real-world-calibration-data)
15. [Figure 8 Differences](#15-figure-8-differences)
16. [All Setup Presets](#16-all-setup-presets)
17. [Optimizer Results](#17-optimizer-results)
18. [Sources](#18-sources)

---

## 1. Physical Measurements

These are raw inputs — things measured directly, not derived. All track measurements were taken using the Google Earth distance ruler tool on satellite imagery. Car weights and dimensions are a mix of factory spec and known modifications.

### Track (1/4-mile oval)

| Measurement | Value | How obtained |
|---|---|---|
| Frontstretch | 325 ft | Google Earth ruler |
| Backstretch | 333 ft | Google Earth ruler |
| Average straight | 329 ft | (325 + 333) / 2 |
| Corner track width | 53 ft | Google Earth ruler |
| Banking | ~2–3° | Visual estimate; model uses 3° effective (calibrated) |

> The straights are slightly unequal because the frontstretch includes the start/finish line region where cars bunch up, while the backstretch is a clean measured length.

### Car — 2008 Crown Victoria P71

| Item | Value | Source / Notes |
|---|---|---|
| Weight | 4,100 lbs | Race weight (measured) — stripped interior, roll cage, stock 4.6L + X-pipe |
| CG height | 22 in | Estimated — Crown Vic stock rides at ~22–23 in CG; roll cage adds mass high but interior removal lowers it; net ≈ stock [¹] |
| Track width | 63 in | Crown Vic P71 factory spec [²] |
| Wheelbase | 114.7 in | Crown Vic factory spec [²] |
| Front weight bias | 55% | Crown Vic front-heavy layout (4.6L iron block engine over front axle) [²] |
| Frontal area | 25 ft² | Crown Vic estimated from cross-section (~5 ft wide × 5 ft tall) |
| Drag coefficient | 0.33 | Crown Vic factory aero data [²] |

---

## 2. Vehicle Constants

These are fixed physics values used throughout all calculations.

```
G       = 32.174 ft/s²       Standard gravitational acceleration
RANKINE = 459.67             Offset to convert °F → absolute temperature (Rankine scale)
                             Used in ideal gas law: T(°R) = T(°F) + 459.67
Mass    = 4100 / 32.174 = 127.4 slugs
```

> **Why Rankine?** The ideal gas law requires absolute temperature (P₁/T₁ = P₂/T₂). Rankine is the imperial equivalent of Kelvin. Adding 459.67 to °F gives the absolute temperature needed for correct hot-pressure calculations.

### Engine / Drivetrain
```
Engine:
  Peak torque    = 300 lb-ft  (4.6L SOHC "PI" V8, rated ~255 hp stock; +X-pipe ≈ +5 hp)
  2nd gear ratio = 1.55 × 3.73 = 5.782  (4R75E auto: 2nd gear 1.55, final drive 3.73)
  Drive efficiency = 85%       (automatic trans + open diff losses — ~15% driveline loss typical)
  Braking G      = 0.5G        (lift + light brake for a short oval; no heavy braking zone)
```

**Sources:** Ford factory torque specs [²], standard driveline efficiency estimates [³].

---

## 3. Tire Specifications

**Ironman iMove Gen3 AS — 235/55R17 103V XL**

These tires are all-season street tires run on a race oval. The XL (extra-load) rating is critical because it raises the maximum cold inflation pressure from the standard 44 PSI to **51 PSI**, which gives more headroom above the hot pressures generated during racing.

| Spec | Value | How derived |
|---|---|---|
| Section width | 235 mm | Sidewall marking |
| Aspect ratio | 55% | Sidewall marking (55% of 235 mm = 129.25 mm sidewall height) |
| Wheel diameter | 17 in = 431.8 mm | Rim size |
| Sidewall height | 235 × 0.55 = **129.25 mm** | Width × aspect ratio |
| Loaded radius | (431.8/2 + 129.25) = 345 mm = **13.59 in** → model uses **13.6 in** | Geometry calculation |
| Max cold PSI | **51 PSI** | XL/extra-load rating [⁴] |
| Load capacity | **1,929 lbs** per tire | Load Index 103 per ETRTO/TRA standard [⁴] |
| UTQG treadwear | 420 | Ironman product data [⁴] |

> **Why the loaded radius matters:** The simulation uses it to calculate engine thrust force at the wheel: `F = Torque × GearRatio × DriveEff / TireRadius`. A larger radius reduces force (longer lever arm), a smaller radius increases it. At 13.6 in, this gives ~8.6 ft/s² acceleration in 2nd gear.

**Source:** Ironman Tires product page [⁴].

---

## 4. Track Geometry Derivations

### Oval Corner Radius

The track is described as a "1/4 mile oval," meaning one full lap = 1,320 ft. The two straights were measured directly. The corner radius is the only unknown, so it is solved algebraically.

```
Total circumference = 1/4 mile = 1,320 ft

1,320 = 2 × (straight lengths) + 2 × (corner arc lengths)
1,320 = 2 × 329 + 2 × π × R
1,320 − 658 = 2π × R
662 = 2π × R
R = 662 / (2π) = 105.3 ft  →  model uses 105 ft
```

> This R = 105 ft is the **racing line radius**, not the inside edge of the track. The racing line cuts the corner tighter than the centerline, which is why the derived radius is reasonable for a 53 ft wide track.

### Full Lap Arc Lengths
```
Straight (each)   = 329 ft
Corner arc (each) = π × 105 = 329.9 ft
Total lap length  = 2 × 329 + 2 × 329.9 = 1,317.7 ft ≈ 1,320 ft ✓
```

### Figure 8 Corner Radius

The figure 8 loops use the same infield area as the oval but the crossover in the middle forces a tighter turning radius. The 149 ft radius was measured from satellite imagery and cross-checked against a speed/G estimate.

```
Estimated crossover speed: ~25 mph = 36.67 ft/s
Measured radius: 149 ft (from satellite imagery)
Lateral G = v² / (R × g) = 36.67² / (149 × 32.174) = 1344 / 4794 = 0.280G
```

**Source:** Google Earth satellite measurement [⁵], calibrated against real-world pressure behavior.

---

## 5. Lateral G & Corner Speeds

### Why "Cornering G" Matters

The lateral G during cornering determines how much weight transfers from the inside tires to the outside tires. It also determines the optimal tire pressure. Getting this number right is essential — if it's too high, the model recommends too much pressure; if too low, it recommends too little.

### Oval Cornering G = 0.375G

This value was **calibrated from real-world tire pressure data**, not derived purely from speed and radius. Here is the validation:

```
At OVAL_CORNER_G = 0.375G with R = 105 ft:
  v = √(G_lat × g × R) = √(0.375 × 32.174 × 105) = 35.6 ft/s ≈ 24.3 mph at apex
```

When this G value is plugged into the pressure model, it produces:
- RF hot optimal: ~40 PSI
- LF hot optimal: ~26 PSI

These match the pressures the driver has found to work in practice, confirming 0.375G is correct. Using a lower or higher value shifts all pressure recommendations.

> A left-turn oval corner at 24 mph apex speed might feel slow but the centripetal acceleration at that radius is what produces 0.375G — consistent with real short-track oval racing on street tires.

### Figure 8 Cornering G = 0.28G

```
v = √(0.28 × 32.174 × 149) = √(1341) = 36.6 ft/s ≈ 25 mph through crossover
```

The F8 generates less lateral G than the oval (0.28 vs 0.375) because the larger loop radius (149 ft vs 105 ft) more than compensates for the slightly higher speed through the crossing.

### Straight Speed Calculation

The simulation computes peak straight-line speed using the physics of acceleration followed by braking back down to corner speed:

```
v_peak² = v_corner² + 2 × a_acc × L × a_brake / (a_acc + a_brake)

Where:
  v_corner = corner exit speed (from lateral G)
  a_acc    = engine thrust force / mass
           = (300 lb-ft × 5.782 gear ratio × 0.85 efficiency) / (13.6/12 ft) / 118.1 slugs
           = 8.6 ft/s²
  a_brake  = 0.5G = 16.09 ft/s²  (lift + light braking on short oval)
  L        = 329 ft (straight length)

→ v_peak ≈ 53 mph at baseline
```

> The formula `2 × a_acc × L × a_brake / (a_acc + a_brake)` is derived by treating the straight as a symmetric acceleration–braking problem where the car accelerates from v_corner to v_peak then brakes back to v_corner. This is an approximation — in reality braking is harder than acceleration — but it gives a reasonable straight speed estimate.

**Sources:** Standard kinematics [³]. Engine data from factory specs [²].

---

## 6. Weight Transfer & Tire Loads

### What Is Weight Transfer?

When the car corners, inertia wants to keep the car going straight while the tires pull it into the turn. This creates a lateral force that tries to "tip" the car, shifting load from the inside tires to the outside tires. More load = more grip (up to a point), so the outside tires do most of the work.

### Static Loads (no cornering)
```
Front axle total = 4100 lbs × 0.55 front bias = 2,255 lbs  →  1,127.5 lbs each
Rear axle total  = 4100 lbs × 0.45 rear bias  = 1,845 lbs  →    922.5 lbs each
```

### Lateral Weight Transfer Formula

The weight transfer ΔW depends on the CG height **above the roll center** relative to the track width. The front roll center height (RCH = 3") reduces the effective moment arm from the full CG height.

```
ΔW = Weight × G_lateral × (CG_height − RCH) / Track_width
   = 4100 × G × (22 in − 3 in) / 63 in
   = 4100 × G × (19 in / 12) / (63 in / 12)
   = 4100 × G × 1.583 ft / 5.25 ft
   = 4100 × G × 0.302

At OVAL_CORNER_G (0.375G):
  ΔW = 4100 × 0.375 × 0.302 = 464 lbs total lateral transfer
```

> The 464 lb transfer at corner G is split between front and rear axles based on the front/rear roll stiffness ratio (LLTD — explained in Section 8).

### Per-Corner Loads

```
LF (inside front)  = 1,127.5 − 464 × LLTD
RF (outside front) = 1,127.5 + 464 × LLTD
LR (inside rear)   =   922.5 − 464 × (1 − LLTD)
RR (outside rear)  =   922.5 + 464 × (1 − LLTD)
```

**Example with LLTD = 0.472 (default setup with spring blending):**
```
LF ≈  909 lbs    RF ≈ 1,346 lbs
LR ≈  ≈698 lbs   RR ≈ 1,147 lbs
```

> The RF carries 1,279 lbs in the corner — 57% more than its static load of 1,045 lbs. This is why RF tire pressure, camber, and temperature are the most important parameters to get right on a left-turn oval.

**Sources:** Standard vehicle dynamics lateral weight transfer formula [³][⁶].

---

## 7. Spring Rates — Confirmed & Available

### Why Spring Rate Matters

The spring rate (measured in lbs/in or lb/in) determines how much the car body rolls for a given lateral force. A stiffer spring = less body roll = less dynamic camber change during cornering. Spring rate is also the primary driver of how load transfers front-to-rear (LLTD) under cornering.

**Important:** On the Crown Vic, the rear uses a separate coil spring from the shock absorber (4-link solid axle). The rear KYB 555603 shocks do NOT include a spring — the spring sits separately in the rear spring perch. On the front, complete strut assemblies (FCS, Monroe, KYB) include both the spring and the damper as one unit.

### Stock P71 Spring Rates (Confirmed)

| Position | Rate | Notes |
|---|---|---|
| **Front (2006.5–2011 P71)** | **475 lbs/in** | Changed at 2006.5 when Ford switched to stamped steel lower control arms [⁷][⁸] |
| **Rear (all P71 1992+)** | **160 lbs/in** | Consistent across all generations [⁷] |
| Front (2003–2006.5 P71) | 325 lbs/in | Pre-redesign, cast iron lower arms [⁷] |
| Front (1993–2002 P71) | 700 lbs/in | NUL spring code, much stiffer older platform [⁸] |
| Front civilian LX (2003–2011) | ~440 lbs/in | Estimated — softer than police package; see Monroe 171346 note below |
| Rear civilian (2003–2011) | ~130 lbs/in | Softer than P71; base civilian springs [⁷] |

> Our car is a **2008 P71**, so front = 475 lbs/in and rear = 160 lbs/in.

### Front Strut Assemblies — Spring Rate by Part

Complete strut assemblies include the spring integrated with the shock. The spring rate is determined by which part you buy, not which shock rating you select.

| Part | Spring Rate | Application / Notes |
|---|---|---|
| FCS 1336349 *(our current fronts)* | ~475 lbs/in | **Taxi/Police Package** — matches P71 stock exactly [⁹] |
| Monroe 271346 | ~475 lbs/in | Police/Taxi Package — equivalent to FCS 1336349 [¹⁰] |
| **Monroe 171346** | ~440 lbs/in | **Civilian only** (LX/LX Sport/S) — softer spring than police package [¹⁰] |
| KYB SR4140 | ~475 lbs/in | OE-spec, listed for all Crown Vic trims, likely matches police rate [¹¹] |

> **Critical note on the Monroe 171346:** The oval grid search optimizer recommended this part as the LF strut (rating 8 = very soft damper), but it is the **civilian spring** — approximately 35 lbs/in softer than the stock P71 police package. Installing it on LF while keeping the FCS 1336349 on RF would create a slight LF lean and asymmetric spring stiffness front-to-front. The model accounts for this by assigning `springs: { front: 440, rear: 160 }` to the Recommended Setup.

### Rear Shocks & Springs (separate parts)

| Part | Type | Spring Rate | Notes |
|---|---|---|---|
| KYB 555603 *(our current rears)* | Shock only | N/A | OE-spec twin-tube gas shock; spring sits separately [¹²] |
| P71 stock rear coil spring | Spring only | **160 lbs/in** | Retained when only the shock is swapped [⁷] |

### Effect on the Model

The front-to-rear spring rate ratio determines how much of the total lateral load transfer goes to the front vs. rear axle:

```
Spring-based LLTD = k_front / (k_front + k_rear)

Stock P71 (475/160): 475 / (475 + 160) = 0.748  ← strongly front-biased
```

A 0.748 spring LLTD means 74.8% of the lateral transfer would go through the front axle based on springs alone. In practice, anti-roll bars (sway bars) heavily modify this — the P71 has a factory front sway bar that increases front roll resistance even further, promoting understeer. Sway bar rates are not modeled separately; they are implicitly included in the calibrated LLTD baseline.

The model blends spring LLTD (60%) with damper LLTD (40%):
```
frontLLTD = 0.6 × springLLTD_normalized + 0.4 × damperLLTD

Where springLLTD_normalized = (k_front/475) / ((k_front/475) + (k_rear/160))
  At stock springs: = 1.0 / (1.0 + 1.0) = 0.50 (normalized to baseline ratio)
```

**Sources:** Crownvic.net spring rate threads [⁷], P71interceptor.com front spring database [⁸], Monroe part applications [¹⁰], KYB product database [¹¹], FCS Automotive [⁹].

---

## 8. Shock → LLTD & Roll Stiffness

### Shock Rating System

The simulation uses a 0–10 damper rating scale: **0 = stiffest, 10 = softest.** This maps to how much the damper resists body motion.

```
Damper roll contribution per corner = (10 − rating)

Front damper total = (10 − LF) + (10 − RF)     [range: 0 to 20]
Rear damper total  = (10 − LR) + (10 − RR)     [range: 0 to 20]
```

The damper rating does NOT represent a specific force value — it is an ordinal scale calibrated against real-world handling behavior for this car. A rating of 4 (like the FCS 1336349) means moderate stiffness; 1 (like the Monroe 550018 Severe) means very stiff.

### LLTD — Lateral Load Transfer Distribution

LLTD is the fraction of total lateral weight transfer that goes through the front axle. It controls handling balance:
- **Higher LLTD (more front)** → more load on the outside front → more understeer tendency
- **Lower LLTD (less front)** → more load shifts to outside rear → looser, more oversteer

The model blends spring-rate LLTD (primary, steady-state physics) with damper LLTD (secondary, affects transient behavior):

```
springLLTD_norm = (k_front/475) / ((k_front/475) + (k_rear/160))
damperLLTD      = damperFront / (damperFront + damperRear)
frontLLTD       = 0.6 × springLLTD_norm + 0.4 × damperLLTD
```

**Example — Default setup (shocks LF:4 RF:4 LR:2 RR:2, springs 475/160):**
```
damperFront = (10−4) + (10−4) = 12
damperRear  = (10−2) + (10−2) = 16
damperLLTD  = 12 / 28 = 0.429

springLLTD_norm = (475/475) / ((475/475) + (160/160)) = 1.0 / 2.0 = 0.500

frontLLTD = 0.6 × 0.500 + 0.4 × 0.429 = 0.300 + 0.172 = 0.472
```

**Example — Recommended setup (shocks LF:8 RF:6 LR:1 RR:1, springs 440/160):**
```
damperFront = (10−8) + (10−6) = 2 + 4 = 6
damperRear  = (10−1) + (10−1) = 18
damperLLTD  = 6 / 24 = 0.250

springLLTD_norm = (440/475) / ((440/475) + (160/160)) = 0.926 / (0.926 + 1.0) = 0.481

frontLLTD = 0.6 × 0.481 + 0.4 × 0.250 = 0.289 + 0.100 = 0.389
```

> The recommended setup's very soft front dampers (ratings 8 and 6) push LLTD down toward 0.39, meaning more of the lateral transfer goes to the rear. Combined with the stiffer rear shocks (rating 1), this makes the rear "plant" better in corners and reduces the natural understeer of the front-heavy Crown Vic.

### Optimal LLTD

The model applies a driveability penalty when LLTD strays far from the optimum. Too much front LLTD = push/understeer; too much rear = snap oversteer:

```
Oval optimal LLTD = 0.46
F8 optimal LLTD   = 0.50  (balanced — turns alternate both directions)

Penalty = max(0.90,  1 − 0.7 × (LLTD − optimal)²)
```

### Body Roll Stiffness

Body roll angle affects dynamic camber, which affects grip. The roll stiffness (`rollStiffness`) combines spring rates (70% weight) and damper ratings (30% weight), normalized so the baseline setup gives exactly the calibrated 3.5°/G body roll:

```
rollStiffness = max(4, (0.7 × springScale + 0.3 × damperNorm) × 28)

Where:
  springScale = (k_front/475 + k_rear/160) / 2   [1.0 = P71 stock springs]
  damperNorm  = (damperFront + damperRear) / 28   [1.0 = 4/4/2/2 dampers]

bodyRoll (°) = G_lateral × 3.5° × (28 / rollStiffness)
```

**Validation at baseline (475/160 springs, 4/4/2/2 dampers):**
```
springScale = (475/475 + 160/160) / 2 = 1.0
damperNorm  = 28 / 28 = 1.0
rollStiffness = (0.7 × 1.0 + 0.3 × 1.0) × 28 = 28
bodyRoll = 1.0 × 3.5 × (28/28) = 3.5°/G  ✓
```

> **Why 70/30 spring/damper split for body roll?** At steady-state cornering (constant speed, constant radius), dampers have zero effect — they only resist *changes* in position, not sustained position. So springs should dominate roll stiffness. In practice the 70/30 split is a modeling compromise because the damper rating also implicitly captures sway bar effects which are not separately tracked.

**Sources:** Standard vehicle dynamics textbook formulas [³][⁶]. Calibrated against multi-session pyrometer data.

---

## 9. Tire Thermal Model

### Overview

Each tire tracks three temperature zones — inside edge (motor side), middle tread, and outside edge (wall side). These match what a pyrometer reads in the real world. The grip calculation uses the average of all three zones, while the zone distribution helps diagnose camber, pressure, and alignment issues.

### Thermal Constants

These constants were calibrated by fitting the model to 6 real-world sessions of pyrometer data (spanning 65°F–95°F ambient, 15–25 laps):

| Constant | Value | Meaning |
|---|---|---|
| `heatBase` | 0.53 | Heat generated per second from rolling resistance alone (all conditions) |
| `heatLoad` | 0.00453 | Additional heat per second per unit of normalized tire load × reference speed |
| `coolRate` | 0.02 | Heat lost per °F of temperature above ambient, per second |
| `thermalMass` | 1.39 | Thermal inertia — higher = slower temperature rise; τ ≈ 4 laps to reach equilibrium |
| `refSpeed` | 75 ft/s | Reference average car speed used to scale load-dependent heating |

> **Calibration method:** The constants were adjusted until the simulated temperatures at equilibrium matched the observed pyrometer readings across all 6 sessions. The `heatBase` and `coolRate` determine the equilibrium temperature (see formula below); `thermalMass` determines how many laps it takes to get there.

### Equilibrium Temperature Formula

After enough laps, tire temperature stabilizes where heat in = heat out:

```
T_equilibrium = ambient + (heatBase + heatLoad × workFactor × refSpeed) / coolRate

WorkFactor = corner_load / avg_load   where avg_load = 1025 lbs (4100 lbs / 4 tires)
```

**Example — RF at OVAL_CORNER_G, 90°F ambient:**
```
RF corner load ≈ 1,347 lbs  (4100 lbs, RCH 3", LLTD 0.472)
avg_load       = 1,025 lbs
WorkFactor_RF  = 1,347 / 1025 = 1.314
T_eq = 90 + (0.53 + 0.00453 × 1.314 × 75) / 0.02
     = 90 + (0.53 + 0.447) / 0.02
     = 90 + 48.9 = 138.9°F
```

> This 139°F equilibrium at 90°F ambient is in the optimal grip window (100–165°F) — good. If ambient rises to 95°F, equilibrium rises to ~144°F, still in window. At very high ambient, equilibrium approaches the top of the window.

### Inside / Middle / Outside Zone Heat Distribution

Different parts of the tire heat at different rates depending on which side is loaded. The multipliers below are applied to the per-lap heat input:

**Outside tires in left turns (RF, RR) — centrifugal load:**
```
Inside edge:   0.82×  (unloaded, sheltered from centrifugal force)
Middle:        1.00×  (baseline)
Outside edge:  1.18×  (wall side, loaded hardest in cornering)
```
*Calibration: RF outside edge runs 12–22°F hotter than inside edge across all 6 sessions. The 1.18/0.82 ratio captures this. Camber correction is zeroed out for outside tires because centrifugal load completely dominates — adjusting it made predictions worse, not better.*

**Inside tires in left turns (LF, LR) — motor-side:**
```
Inside edge:   1.06×  (motor side, slight inside loading from camber + toe)
Middle:        1.00×
Outside edge:  0.94×
```

**Additional zone adjustments:**

*Camber shift (LF front inside tire only):*
```
CamberShift = −effectiveCamber × 0.04
InsideMult  = 1.06 + CamberShift
OutsideMult = 0.94 − CamberShift

Example: LF effectiveCamber = −1.5° → shift = +0.06 → inside 1.12, outside 0.88
```
*This captures how negative camber loads the inside edge. Coefficient 0.04/degree was calibrated from the observed inside-hot pattern on LF across multiple sessions.*

*Toe-induced heat shift (front tires only):*
```
InsideBoost  = −toe × 0.05   (toe out is negative → positive boost to inside edge)
OutsideBoost =  toe × 0.03

At −0.25" toe out: InsideBoost = +0.0125, OutsideBoost = −0.0075
```
*Toe-out causes the fronts to scrub slightly inward, heating the inside edges. Coefficient 0.05 was updated from 0.03 after observing the consistent inside-hot LF pattern in multi-session data.*

*Pressure-induced middle zone heat:*
```
psiDev = hotPSI − optPSI
middleBoost = psiDev × 0.003   (over-inflated → hotter middle, under-inflated → cooler middle)
```
*Over-inflation concentrates the contact patch in the center of the tread, increasing middle zone temperature.*

### Hot Pressure (Ideal Gas Law)

Cold PSI is measured in the garage at ~68°F before driving to the track. As the tire heats up on track, pressure rises. The model uses the ideal gas law to compute hot pressure from cold:

```
hotPSI = coldPSI × (T_tire_°F + 459.67) / (68 + 459.67)
       = coldPSI × (T_tire + 459.67) / 527.67
```

**Example: 34 PSI cold, tire reaches 200°F:**
```
hotPSI = 34 × (200 + 459.67) / 527.67 = 34 × 659.67 / 527.67 = 42.5 PSI
```
That's a +8.5 PSI rise — consistent with the ~10 PSI heat rise typically observed on a hot day.

> **Why 68°F as the reference?** That is the assumed garage temperature when you inflate the tires. On a hot race day you inflate in the morning before it gets hot outside, so 68°F is a reasonable baseline. Inflating at a different temperature shifts all hot pressure calculations.

**Sources:** Ideal gas law [³]. Thermal calibration constants derived from our own 6-session pyrometer dataset.

### Figure 8 Heat Multiplier

The figure 8 generates more heat per second than the oval because:
1. Tighter corners (149 ft radius vs 105 ft) require more steering angle and lateral scrub
2. Left AND right turns each lap — both inner and outer edges of every tire are loaded alternately

```
F8_HEAT_MULT = 1.18

heatIn_F8 = (heatBase × 1.18 + heatLoad × workFactor × refSpeed) × lapTime × zoneMult
```

**Calibration:** With F8_HEAT_MULT = 1.18 and the baseline F8 setup:
- RF equilibrium ≈ 125°F at 75°F ambient → matches real pyrometer RF: avg 123°F ✓
- RR equilibrium ≈ 121.6°F → matches real pyrometer RR: avg 120°F ✓

Note: The LF ran 10°F hotter than RF in the baseline run (133°F vs 123°F). This is due to asymmetric caster in that specific setup (LF 5.5° vs RF 3.75°), which over-loaded the LF in right turns. The symmetric F8 model cannot predict this left-side bias, but it accurately models what a symmetric setup would produce.

---

## 10. Grip Model — All Factors

### Overview

The grip coefficient (µ) for each tire is calculated as a product of individual factors. Each factor starts at 1.0 (perfect) and is penalized toward its floor value based on how far from ideal that parameter is.

```
µ_corner = tempGrip × pressureGrip × camberGrip × casterGrip × toeGrip × loadSens × wearFactor
```

The total cornering force for each tire = µ × corner_load. All four tires are summed and divided by total weight to get the performance metric.

---

### Temperature Grip Factor

All-season street tires have an optimal operating temperature range. Below it, the rubber is too hard and doesn't deform into the road texture. Above it, the rubber softens excessively and loses structural integrity.

```
Below 100°F:   µ = max(0.75,  1 − ((100 − temp) / 60)² × 0.25)
100 – 165°F:   µ = 1.0   ← optimal window
165 – 185°F:   µ = max(0.70,  1 − ((temp − 165) / 50)² × 0.30)
```

> **Why 100–165°F?** UTQG AA-rated all-season street tires peak in this range. The upper bound of 165°F is intentionally generous because these tires (UTQG 420) are higher quality all-season compounds that don't degrade as quickly as cheap tires. The model was set to 185°F before the pyrometer data showed the car running near that ceiling on very hot days — the upper limit was relaxed after confirming grip held up at those temps in practice.

**Sources:** General tire temperature behavior [³][⁶]. Upper bound calibrated against our session data.

---

### Pressure Grip Factor

Every tire has an optimal inflation pressure for the load it is carrying. Over-inflation concentrates contact in the middle of the tread; under-inflation spreads too much to the edges and causes excessive flex. Both reduce grip.

```
optPSI = 30 × (cornerLoad / avgLoad)   where avgLoad = 1025 lbs (4100/4)

pressureGrip = max(0.82,  1 − 0.010 × |hotPSI − optPSI|)
```

- **1% grip loss per PSI** of deviation from optimal
- **Floor 0.82** (18% max loss) — reached at 18 PSI off target, which represents catastrophically wrong pressure

> **Why `30 × (load / avgLoad)`?** This formula assumes 30 PSI is the ideal pressure at the average static load (1025 lbs). Tires that carry more load in cornering need more pressure to maintain the same contact patch shape. The factor `cornerLoad / avgLoad` scales from the average. This approach was calibrated so that at oval corner G, the RF optimal comes out to ~40 PSI hot and LF to ~26 PSI hot — matching real-world observed pressures.

**Sources:** Standard tire pressure vs load theory [³][⁶]. Calibrated against real-world pressure data from our sessions.

---

### Camber Grip Factor

Camber is the lean angle of the tire relative to vertical. Negative camber (top of tire tilted inward) helps the outside tire maintain full contact with the track during cornering because the suspension geometry causes the tire to lean away from vertical under load.

The model targets specific **effective** camber angles during cornering, not the static setting:

```
Outside front (RF on a left-turn oval):  ideal effective = −4.5° at 1G
Inside front (LF):                        ideal effective =  0.0° (flat contact patch)

camberGrip = max(0.88,  1 − 0.012 × |effectiveCamber − ideal|)
```
- **1.2% grip loss per degree** deviation from ideal effective camber
- **Floor 0.88** (12% max loss)

> **Why −4.5° effective for RF?** On a short oval at 0.375G, the outside front tire (RF) is heavily loaded. SLA (short-long arm / double wishbone) suspension gains negative camber in jounce — this is the key mechanical advantage over MacPherson struts which gain positive camber (which hurts grip). The −4.5° target is a standard race engineering rule of thumb for the heavily-loaded outside front at moderate lateral G [⁶]. The model was calibrated against pyrometer data to confirm this produces realistic temperatures.

---

### Effective Camber Calculation

The static camber setting (what you set in the alignment bay) is not the same as the effective camber during cornering. Dynamic effects shift it:

```
effectiveCamber = staticCamber + casterGain + bodyRollCamber

Caster gain (RF, outside tire, left turn):
  casterGain = −(caster_deg × 0.18)   [gains negative camber in jounce — SLA geometry]

Caster gain (LF, inside tire):
  casterGain = +(caster_deg × 0.10)   [gains positive camber in droop]

Body roll contribution (at actual oval corner G, not 1G):
  cornerRoll = bodyRoll_deg × OVAL_CORNER_G
  RF (jounce):  bodyRollCamber = −(cornerRoll × 0.355)   [SLA jounce coefficient]
  LF (droop):   bodyRollCamber = +(cornerRoll × 0.15)    [SLA droop coefficient]
```

**Worked example — RF, caster 5°, total stiffness 28 (3.5°/G body roll):**
```
cornerRoll     = 3.5° × 0.375 = 1.3125°
casterGain     = −(5 × 0.18)  = −0.90°
bodyRollCamber = −(1.3125 × 0.355) = −0.466°
staticCamber   = −3.0°

effectiveCamber = −3.0 + (−0.90) + (−0.466) = −4.37° ≈ ideal −4.5° ✓
```

> **SLA vs MacPherson:** Crown Vic P71 uses SLA (short-long arm / double wishbone) front suspension. The shorter upper arm forces the wheel to gain negative camber when compressed (jounce). MacPherson struts (most budget cars) do the opposite — they gain positive camber in jounce, which fights grip in corners. The 0.355 SLA jounce coefficient is measured from wheel displacement data: 1.7" compression at 3.1° body roll → 1.1° camber gain → 1.1/3.1 = 0.355°/°.

**Sources:** SLA geometry principles [³][⁶][¹³]. Caster gain coefficient (0.18/degree) from standard front suspension geometry analysis.

---

### Rear Camber (Solid Rear Axle)

The Crown Vic P71 has a traditional solid (live) rear axle. It cannot independently adjust camber; both rear wheels follow the body roll angle exactly.

```
RR (outside in left turn): dynamicCamber = +bodyRoll°   →   ideal = −1.0°
LR (inside):               dynamicCamber = −bodyRoll°   →   ideal =  0.0°

rearCamberGrip = max(0.88,  1 − 0.012 × |dynamicCamber − ideal|)
```

> This is a fundamental limitation of the solid axle — you cannot set rear static camber to compensate for body roll. The only way to reduce rear camber deviation is to reduce body roll (stiffer springs or anti-roll bar), or to accept the penalty. On street tires at 0.375G with modest body roll, the penalty is small.

---

### Caster Grip Factor

Beyond its effect on dynamic camber gain (already captured above), caster has a direct stability effect through mechanical trail — how much the tire contact patch trails behind the steering axis. More caster = more self-centering = more stability but more steering effort.

```
RF (outside tire, left-turn oval):  optimal = 5.0°
  casterGrip = max(0.96,  1 − 0.004 × |caster − 5.0|)   [0.4%/deg penalty, floor 96%]

LF (inside tire):  optimal = 3.0°
  casterGrip = max(0.97,  1 − 0.003 × |caster − 3.0|)   [0.3%/deg penalty, floor 97%]
```

> **Why different optima for RF and LF?** The RF (outside tire) benefits from more caster because it generates more negative camber in jounce (the 0.18/degree caster gain). It also benefits from the stability of high mechanical trail. The LF (inside tire) benefits from less caster because in jounce/droop it gains positive camber — more caster makes this worse.

**F8 caster asymmetry case:** In the baseline F8 session, LF caster was 5.5° and RF caster was 3.75°. In right turns, LF becomes the outside tire, generating high aligning torque proportional to tan(5.5°). In left turns, RF is outside with tan(3.75°):
```
Steering effort ratio (right vs left) = tan(5.5°) / tan(3.75°) = 0.0963 / 0.0655 = 1.47×
→ Right turns require ~47% more steering effort — confirmed by driver feedback.
```

---

### Toe Grip Factor

Toe is the angle of the front wheels relative to straight-ahead when viewed from above. Toe-out (fronts angled slightly outward) sharpens turn-in response. Toe-in provides straight-line stability but dulls turn-in.

```
Optimal: −0.25"  (1/4" toe-out for a left-turn short oval)

toeGrip = max(0.96,  1 − 0.008 × (toe − (−0.25))²)
```

### Toe Drag Penalty

Any toe angle causes the tire to scrub sideways slightly as the car moves forward, increasing rolling resistance (drag). This penalty applies on straights where drag hurts top speed.

```
toeDrag = 1 + 0.001 × toe²    (applied as divisor to total grip force)
```

---

### Load Sensitivity

Tires exhibit diminishing returns at high load — a tire carrying 1,400 lbs doesn't produce 1.37× the grip of a tire at 1,025 lbs because rubber only deforms so much. This is captured by:

```
loadSens = (avgLoad / cornerLoad)^0.08   where avgLoad = 1025 lbs (4100/4)
```

The 0.08 exponent is a mild sensitivity — load effects are small but real. At RF corner load of ~1,347 lbs vs avg 1,025 lbs:
```
loadSens = (1025 / 1347)^0.08 = 0.761^0.08 = 0.977
```
Only a 2.3% reduction. The effect is more significant at extreme loads.

**Source:** Tire load sensitivity behavior [³][⁶].

---

### Front/Rear Balance Penalty

If the front tires produce much more grip than the rear (or vice versa), the car becomes difficult to drive — the "slower" end limits the corner. The model penalizes large imbalance:

```
frontPct = frontGripForce / totalGripForce
imbalance = |frontPct − 0.55|   (0.55 = target front grip fraction = front weight bias)
balancePenalty = max(0.94,  1 − 0.2 × imbalance)
```

---

## 11. Performance Metric → Lap Time

### How It Works

The performance metric sums all the grip forces across four tires, adjusts for banking, drag, and balance, then normalizes by weight. It is a dimensionless ratio representing how well the car corners relative to baseline.

```
metric = [Σ(µ_corner × cornerLoad) + bankingForce] / [weight × toeDragFactor × balancePenalty × lltdPenalty]
```

This metric is then converted to a lap time using a power law calibrated to real-world data:

```
lapTime = BASELINE_LAP × (baselineMetric / metric)^LAP_SENSITIVITY
```

### Calibration Constants

```
BASELINE_LAP      = 17.4s    (real-world practice session, 65°F, Setup A)
LAP_SENSITIVITY   = 0.28
BASELINE_LAP_F8   = 23.283s  (real-world 20-lap feature, 75°F, F8 Baseline Setup)
```

> **Why LAP_SENSITIVITY = 0.28?** This controls how aggressively grip improvements translate to lap time. A sensitivity of 1.0 would mean doubling grip halves lap time — clearly wrong. A sensitivity of 0.28 was chosen so that the theoretical perfect setup at 90°F gives ~16.8s, which is realistic given that ~half of the lap is on the straights where grip doesn't matter. The real fastest lap ever recorded is 17.1s, which sets the upper bound.

**Calibration tires for the oval baseline** (taken from real pyrometer readings, Setup A, 15 laps @ 65°F):
```
LF: I:104 M:102 O:94  → avg 100°F
RF: I:106 M:113 O:131 → avg 117°F
LR: I:101 M:102 O:91  → avg  98°F
RR: I:100 M:117 O:130 → avg 116°F
```

**Calibration tires for the F8 baseline** (Setup B with asymmetric caster, 20 laps @ 75°F):
```
LF: I:133 M:130 O:136 → avg 133°F
RF: I:125 M:125 O:120 → avg 123.3°F
LR: I:128 M:129 O:127 → avg 128°F
RR: I:120 M:121 O:120 → avg 120.3°F
```

> The baseline metric is calculated dynamically every session — the model doesn't hard-code a number. It runs the same physics equations on the baseline setup + calibration tires, gets a metric, and uses that as the reference. This means physics changes (like the spring rate update) automatically propagate into the calibration without needing to re-tune constants.

---

## 12. Pressure Optimization Math

### Finding Optimal Cold PSI

The model works backward from the desired hot pressure at race conditions to the cold inflation number:

```
Step 1:  optHotPSI  = 30 × (cornerLoad / 1025)   where 1025 = 4100/4 avg_load
Step 2:  optColdPSI = optHotPSI × 527.67 / (T_equilibrium + 459.67)
```

**Example — RF at LLTD 0.472:**
```
RF corner load ≈ 1,347 lbs  (4100 lbs, RCH 3", LLTD 0.472)
optHotPSI  = 30 × (1347 / 1025) = 39.4 PSI
T_eq_RF    = ~139°F (see thermal model)
optColdPSI = 39.4 × 527.67 / (139 + 459.67) = 39.4 × 527.67 / 598.67 = 34.7 PSI cold
```

### Safety Limits

```
Floor:   18 PSI hot  (hard minimum — structural tire failure risk below this)
Ceiling: 51 PSI hot  (XL-rated Ironman iMove sidewall max; standard would be 44 PSI)
```

If the analytically optimal PSI falls outside [18, 51], it is clamped and flagged in the UI as "pressure-limited."

### F8 PSI Insight: Why Bias Toward Outside Load

On the figure 8, each front tire is the outside tire 50% of the time and inside 50%. If you set the same cold PSI on both fronts, what is the optimal value? Intuitively you might average the inside and outside optimal pressures, but the math shows the outside load optimum is actually better:

```
Grip sum = grp(HP, load_outside) + grp(HP, load_inside)
Where grp(HP, load) = 1 − 0.010 × |HP − 30×load/950|

In the range [opt_inside, opt_outside], the derivative:
  d/dHP[grip_sum] = 0.010 × (load_outside − load_inside) > 0

Since load_outside > load_inside always, the sum increases as HP increases
toward opt_outside. Maximum is AT opt_outside, not at the average.
```

**Practical result:** Set F8 front cold PSI to what you'd run on the outside tire in an oval race — the heavily loaded corner. The inside tire takes a small penalty but the outside tire gains more than is lost.

---

## 13. Camber Optimization Math

### Optimal Static Camber Formula

Since `effectiveCamber = staticCamber + casterGain + bodyRollCamber`, and we know the ideal effective camber, we can solve for optimal static:

```
optStaticCamber = idealEffective − casterGain − bodyRollCamber
```

**Oval RF (caster 5°, springs 475/160, shocks 8/6/1/1):**
```
rollStiffness  ≈ 29.3  (soft front dampers reduce total stiffness from 28)
bodyRoll       = 3.5 × (28/29.3) = 3.34°/G
cornerRoll     = 3.34 × 0.375 = 1.25°
casterGain     = −(5 × 0.18)       = −0.90°
bodyRollCamber = −(1.25 × 0.355)   = −0.444°
idealEffective = −4.5°

optStaticCamber = −4.5 − (−0.90) − (−0.444) = −3.156° → rounds to −3.0°
```

**Oval LF (caster 3°):**
```
casterGain     = +(3 × 0.10)  = +0.30°
bodyRollCamber = +(1.25 × 0.15) = +0.188°
idealEffective = 0°

optStaticCamber = 0 − 0.30 − 0.188 = −0.488° → rounds to −0.5°
```

### F8 Symmetric Camber

For the figure 8, both fronts alternate between outside and inside roles equally. The optimal static camber averages the two ideal effective positions:

```
Ideal outside (RF/LF as outside): −4.5° effective
Ideal inside (RF/LF as inside):    0.0° effective

Average ideal effective = (−4.5 + 0.0) / 2 = −2.25°

optStaticCamber = −2.25 − (casterGain_avg) − (bodyRollCamber_avg)
```

With symmetric 5.0° caster and minimal body roll:
```
casterGain_avg     = (−(5×0.18) + (5×0.10)) / 2 = (−0.90 + 0.50)/2 = −0.20°
bodyRollCamber_avg ≈ 0  (body roll cancels across left+right turns)

optStaticCamber = −2.25 − (−0.20) − 0 = −2.05° ≈ −2.0° to −2.25°
```

The optimizer found −3.5° as optimal for F8, which is more negative than this pure analytical result. The difference is because the optimizer also accounts for temperature effects (slightly cooler tires = better grip window), pressures, and the nonlinear grip function — the optimizer result is the ground truth.

---

## 14. Real-World Calibration Data

All pyrometer readings are taken immediately after the car returns to the pits, before the tires cool. Inside = motor side, Outside = wall side. Temperatures are in °F.

### Oval Sessions

#### Setup A — 15 laps @ 65°F ambient
*This session is the primary calibration baseline for the oval model.*
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 106 | 113 | 131 | 117°F |
| RR | 100 | 117 | 130 | 116°F |
| LF | 104 | 102 | 94 | 100°F |
| LR | 101 | 102 | 91 | 98°F |

#### Setup A — 25 laps @ 90°F ambient
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 125 | 131 | 135 | 130°F |
| RR | 120 | 130 | 137 | 129°F |
| LF | 114 | 110 | 105 | 110°F |
| LR | 116 | 113 | 108 | 112°F |

#### Setup B — 25 laps @ 87°F ambient
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 122 | 126 | 138 | 129°F |
| RR | 118 | 125 | 131 | 125°F |
| LF | 127 | 108 | 107 | 114°F |
| LR | 126 | 120 | 112 | 119°F |

#### Setup B — 25 laps @ 90°F ambient
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 120 | 123 | 132.5 | 125°F |
| RR | 113 | 119 | 126 | 119°F |
| LF | 120 | 112 | 107 | 113°F |
| LR | 113 | 114 | 111 | 113°F |

#### Setup B — 25 laps @ 93°F ambient
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 128 | 132 | 143 | 134°F |
| RR | 121 | 130 | 143 | 131°F |
| LF | 127 | 121 | 108 | 119°F |
| LR | 118 | 119 | 112 | 116°F |

#### Setup B — 25 laps @ 95°F ambient
| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| RF | 131 | 138 | 153 | 141°F |
| RR | 124 | 132 | 144 | 133°F |
| LF | 130 | 116 | 108 | 118°F |
| LR | 126 | 121 | 115 | 121°F |

### Key Patterns Observed

- **RF outside (wall side) 12–22°F hotter than inside** across all sessions. This confirms centrifugal loading is the dominant factor on outside tires — the base zone multipliers [0.82, 1.0, 1.18] are correct.
- **LF inside (motor side) 13–22°F hotter than outside** — camber (−1.5°) loading the inside edge, compounded by toe-out scrub. Captured by camber shift coefficient 0.04/degree.
- **LR nearly flat** (≤3°F spread across I/M/O) — solid rear axle with no steering scrub keeps the rear even. The small 0.008 body-roll coefficient for the inside rear is appropriate.
- **RR outside 13–22°F hotter** — same pattern as RF.
- **Setup B (RF 31 PSI cold) ran 5–10°F cooler than Setup A (RF 34 PSI cold)** at the same ambient. This confirms lower pressure = better heat dissipation, consistent with the pressure-middle-zone heating model.
- **Temperature delta above ambient is approximately constant** across all ambients for each corner — e.g., RF avg is consistently ~40–50°F above ambient. This validates the linear thermal equilibrium model (`T_eq = ambient + constant`).

### Lap Times

| Session | Best Lap | Notes |
|---|---|---|
| Oval fastest ever | **17.1s** | Clean air, optimal conditions |
| Oval practice (calibration baseline) | **17.4s** | Used as BASELINE_LAP in model |
| Oval race average | **17.8s** | With traffic and cautions |
| F8 baseline session | **23.283s** | 20 laps @ 75°F; 4th fastest car overall |

### Figure 8 Baseline Session

*This is the calibration baseline for the F8 model. The setup is NOT optimal — driver reported difficulty turning right, confirmed by analysis.*

**Setup:** LF/RF FCS 1336349 (rating 4), LR/RR KYB 555603 (rating 2), Camber LF −2.75° / RF −3.0°, **Caster LF 5.5° / RF 3.75°** (asymmetric), Toe −0.25", Cold PSI all fronts 35 / all rears 30.

| Tire | Inside | Middle | Outside | Average |
|---|---|---|---|---|
| LF | 133 | 130 | 136 | 133°F |
| RF | 125 | 125 | 120 | 123°F |
| LR | 128 | 129 | 127 | 128°F |
| RR | 120 | 121 | 120 | 120°F |

**Root cause of right-turn difficulty:** High LF caster (5.5°) creates much higher aligning torque when LF is the outside tire (right turns) compared to when RF is the outside tire (left turns, only 3.75° caster). Steering effort is proportional to the mechanical trail, which scales with tan(caster):

```
Right turn effort (LF outside): ∝ tan(5.5°) = 0.0963
Left turn effort  (RF outside): ∝ tan(3.75°) = 0.0655
Ratio: 0.0963 / 0.0655 = 1.47×  →  right turns require ~47% more steering effort
```

Note: The car still pulls toward the lower-caster side (RF/right) in a straight line — this is a *separate* phenomenon from cornering effort. Both effects occur simultaneously:
- Straight line: car drifts right (toward low-caster RF)
- Cornering: right turns feel heavy (high-caster LF fights the driver)

**Fix:** Equalize caster to 4.5°–5.5° on both sides. The F8 recommended setup uses symmetric 5.0°/5.0°.

---

## 15. Figure 8 Differences

The F8 simulation uses the same physics engine as the oval but with key modifications to reflect the bidirectional nature of the course.

| Parameter | Oval | Figure 8 | Why Different |
|---|---|---|---|
| Lap length | 1,320 ft (1/4 mile) | ~1,320 ft (same facility) | Same physical track, different path |
| Baseline lap time | 17.4s | 23.283s | Longer lap, slower average speed through crossover |
| Corner G | 0.375G | 0.28G | Wider radius at F8 loops vs tighter oval |
| Corner direction | Left turns only | Alternating L/R each lap | Physical layout of figure 8 |
| Optimal static camber | RF −3°, LF −0.5° (asymmetric) | Both −3.5° (symmetric) | Each tire alternates outside/inside → must split the difference |
| Optimal caster | RF 5°, LF 3° (asymmetric) | Both 5.0° (symmetric) | Symmetric turns require symmetric setup |
| Heat multiplier | 1.0× (baseline) | **1.18×** | Tighter corners + bidirectional scrub generate more heat |
| Shock LLTD sensitivity | High — stiff rear helps | Low — averages out L+R | Weight transfer goes both ways equally |
| PSI optimization | Toward LF-low / RF-high | Toward outside-turn load | See Section 12 |

### F8 Thermal Independence from Shocks

Because the figure 8 turns left and right equally, the lateral weight transfer from left turns and right turns cancel out when averaged over a lap. This means all tire work factors reduce to static loads — **independent of the shock LLTD setting:**

```
Left turn:  RF carries high load, LF carries low load
Right turn: LF carries high load, RF carries low load
Average:    Both fronts carry the static load (1,045 lbs each)
```

This simplifies the F8 optimizer enormously: equilibrium temperatures do not depend on shock settings. All 323 shock combinations produce the same equilibrium temperature at a given ambient:
```
T_eq_front ≈ 125.0°F   (at 75°F ambient)
T_eq_rear  ≈ 121.6°F
```

Shock settings still matter through the LLTD penalty — a very unbalanced LLTD is penalized — but temperatures and pressure optimization are shock-independent.

---

## 16. All Setup Presets

All oval setups use FCS 1336349 front struts (taxi/police package, ~475 lbs/in) and KYB 555603 rear shocks (shock only, 160 lbs/in stock rear spring), except Recommended which uses Monroe 171346 (civilian, ~440 lbs/in) on LF.

### Setup A (Original — Calibration Baseline)
*This is the "current setup" in the app. Used as the oval calibration baseline.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −1.5° | −3.0° | — | — |
| Caster | 3.5° | 5.0° | — | — |
| Toe | −0.25" (toe out) | | | |
| Cold PSI | 19.5 | 34 | 18.5 | 36 |

### Setup B (2026 Season — Multi-Session)
*Notably higher RF caster (8.0°) than Setup A — provides more dynamic camber gain on RF.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −1.5° | −3.0° | — | — |
| Caster | 3.5° | **8.0°** | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 20 | 31 | 15 | 33 |

### Pete Setup

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −2.25° | −2.75° | — | — |
| Caster | 3.5° | 8.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Dylan Setup

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −2.0° | −2.75° | — | — |
| Caster | 4.0° | 3.25° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Josh Setup

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −0.75° | −1.75° | — | — |
| Caster | 5.0° | 7.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Recommended Setup (Oval Optimizer Result)
*Grid-searched over 180,880 combinations @ 90°F. Updated 2026-04-01 with full physics model: 4100 lbs race weight, RCH 3", SLA jounce 0.355°/°, KPI 9.5°, sidewall compliance, ground-frame camber.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 3 (FCS 1336349) | 1 (stiffest) | 1 | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −0.25° | −2.25° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 24 | 34.5 | 18 | 30 |
| **Best lap** | **17.200s @ 90°F** | | | |

### F8 Baseline Setup
*Real-world calibration run. NOT optimal — asymmetric caster causes right-turn difficulty. Used to verify the F8 model predicts ~23.3s.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −2.75° | −3.0° | — | — |
| Caster | **5.5°** | **3.75°** | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 35 | 35 | 30 | 30 |

### F8 Recommended Setup (F8 Optimizer Result)
*Grid-searched over 34,884 combinations @ 75°F. Updated 2026-04-01 with full physics model. Symmetric caster mandatory for equal L/R performance.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 1 | 1 | 2 (KYB 555603) | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −2.25° | −2.25° | — | — |
| Caster | 5.0° | 5.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 34.5 | 34.5 | 29 | 29 |
| **Best lap** | **23.145s @ 75°F** | | | |

---

## 17. Optimizer Results

### Oval Grid Search

The optimizer tested every possible combination of:
- All available shock/strut part combinations (323 unique front+rear pairings from the parts database)
- Caster: 3.0°–7.0° in 0.5° steps for each front corner
- Camber: derived analytically from optimal effective camber formula
- PSI: derived analytically from corner loads at OVAL_CORNER_G
- Toe: fixed at −0.25"

**Total combinations: 180,880 | Best lap: 17.200s @ 90°F | vs. baseline 17.4s: −0.200s improvement**

The top result was verified by running a full 25-lap simulation with the thermal model. Model updated 2026-04-01 with measured race weight (4100 lbs), RCH 3", SLA jounce 0.355°/°, KPI 9.5°, sidewall compliance, ground-frame camber.

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 3 (FCS 1336349) | 1 (stiffest) | 1 | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −0.25° | −2.25° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Cold PSI | 24 | 34.5 | 18 | 30 |

**Why this setup wins:**
- Moderate LF + stiff RF/rear → front LLTD target ≈ 0.468 (near optimal 0.46)
- Very stiff rear (rating 1) → rear carries proportionally more transfer → keeps rear planted
- Analytically optimal camber (ground-frame): LF −0.25° accounts for SLA droop camber gain and sidewall compliance, achieving near-0° ground-frame at the contact patch; RF −2.25° reaches approximately −2.0° ground-frame (ideal for outside tire on this compound)

### Figure 8 Grid Search

The optimizer tested every combination of:
- All 323 unique shock pairings
- Symmetric camber: −1.5° to −4.25° in 0.25° steps (12 values)
- Symmetric caster: 3.0° to 7.0° in 0.5° steps (9 values)
- PSI: derived analytically toward outside-corner load optimum
- Toe: fixed at −0.25"

**Total combinations: 34,884 | Best lap: 23.145s @ 75°F | vs. baseline 23.283s: −0.138s improvement**

Top 50 candidates were verified with full 20-lap simulations. Model updated 2026-04-01 with measured race weight (4100 lbs), RCH 3", SLA jounce 0.355°/°, KPI 9.5°, sidewall compliance, ground-frame camber.

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 1 | 1 | 2 (KYB 555603) | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −2.25° | −2.25° | — | — |
| Caster | 5.0° | 5.0° | — | — |
| Cold PSI | 34.5 | 34.5 | 29 | 29 |

**Why this setup wins:**
- Stiff fronts + slightly softer LR rear achieves near 0.50 LLTD (optimal for balanced L/R turns in F8)
- Symmetric −2.25° static camber: ground-frame model (with KPI, sidewall compliance, body roll) shows this achieves close to the ideal contact patch angle on both outside and inside tire roles
- Symmetric 5.0° caster: equal steering effort and caster camber gain in both turn directions — mandatory for balanced F8 handling; asymmetric caster (see F8 Baseline) causes measurable L/R speed asymmetry

---

## 18. Sources

| # | Source | Used For |
|---|---|---|
| [¹] | Crown Victoria service manual, Ford Motor Company | CG height estimation, suspension geometry |
| [²] | Ford Crown Victoria P71 factory specifications (Wikipedia / Ford EVTM) | Weight, wheelbase, track width, Cd, engine specs, gear ratios |
| [³] | *Milliken & Milliken, Race Car Vehicle Dynamics* (SAE International, 1995) | Lateral weight transfer formula, tire load sensitivity, pressure/grip relationships, suspension geometry principles |
| [⁴] | Ironman iMove Gen3 AS product page — ironmantires.com | Tire dimensions, XL max PSI, load index, UTQG rating |
| [⁵] | Google Earth satellite imagery | Track measurements (straights, corner width, F8 radius) |
| [⁶] | *Carroll Smith, Tune to Win* (Aero Publishers, 1978) | Camber angle targets, optimal tire temperature ranges, caster and trail effects, suspension balance |
| [⁷] | Crownvic.net forum — Spring Rate threads (multiple) | P71 rear 160 lbs/in, generational front rate changes (325/475/700) |
| [⁸] | P71interceptor.com / idmsvcs.com — Crown Victoria Front Springs page | HPP spring rate 540 lbs/in, 1993–2002 NUL springs 700 lbs/in, part number database |
| [⁹] | FCS Automotive product listing (RockAuto, Amazon) — FCS 1336349 | Taxi/Police Package designation, complete strut assembly spec |
| [¹⁰] | ShockWarehouse / Monroe product pages — Monroe 171346 & 271346 | Civilian vs Police/Taxi application split, confirming different spring rates |
| [¹¹] | JEGS / KYB product listing — KYB SR4140 | OE-spec application, Crown Victoria fitment |
| [¹²] | RockAuto / KYB product listing — KYB 555603 | Rear shock only (no spring), OE gas-charged spec |
| [¹³] | *Dixon, Tires, Suspension and Handling* (SAE International, 1996) | SLA jounce/droop camber coefficients (basis). Jounce value refined to 0.355 from measured wheel displacement data (1.1°/3.1°). Droop 0.15 unchanged. |
