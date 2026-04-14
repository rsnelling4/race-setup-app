# Race Simulation — Measurements, Math & Sources Reference

**Car:** 2008 Crown Victoria P71
**Tracks:** 1/4-mile oval, Figure 8
**Last updated:** 2026-04-14

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

The lateral G during cornering determines how much weight transfers from the inside tires to the outside tires and sets the instantaneous suspension geometry at the apex. A **separate time-averaged G** is used for tire pressure and thermal calculations — the tires are only cornering for a fraction of each lap, so using peak apex G would over-inflate the recommended pressures.

The model maintains two distinct G values for the oval:

| Constant | Value | Purpose |
|---|---|---|
| `OVAL_RACING_G` | **0.813G** | Instantaneous apex G — used for suspension geometry, body roll, dynamic camber |
| `OVAL_CORNER_G` | **0.407G** | Time-averaged G over the full lap — used for tire loads, pressure targets, thermal model |

### Oval Racing G = 0.813G (instantaneous apex)

Back-calculated from the observed 17.4s baseline lap time:

```
Lap time 17.4s → v_corner ≈ 47.6 mph (69.8 ft/s) at effective racing line R = 145 ft
  (Driver swings ~40 ft wide from the 105 ft inside radius → effective R ≈ 145 ft)

OVAL_RACING_G = v² / (g × R) = 69.8² / (32.174 × 145) = 4872 / 4665 = 0.813G
```

This is the G the car is *actually pulling* at the corner apex — what the driver feels, what loads the suspension, what determines body roll.

### Oval Time-Averaged Corner G = 0.407G (pressure/thermal)

Using peak apex G (0.813G) for pressure targets would give RF optPsi ≈ 50 PSI — too high. The tires are only cornering for a fraction of the lap; on the straights lateral G = 0. The time-averaged G represents the average sidewall stress over a full lap:

```
Corner arc fraction = 2 × π × 105 / (2 × 329 + 2 × π × 105)
                    = 659.7 / 1317.7 = 0.5007

OVAL_CORNER_G = OVAL_RACING_G × cornerFraction = 0.813 × 0.5007 = 0.407G
```

**Verification against real-world pressure data:**
RF hot PSI observed ≈ 39 PSI (baseline session, 35 PSI cold RF, 130°F tire). At 0.407G: RF load ≈ 1,417 lbs → optPsi ≈ 41.5 PSI. The ~2.5 PSI gap is explained by the front anti-roll bar, which transfers load without body roll and is not modeled in the spring/damper LLTD — it reduces the effective elastic load on the RF, lowering observed hot pressure. No empirical tuning was needed.

### Figure 8 Cornering G = 0.28G (time-averaged)

```
F8_RACING_G  = 0.498G  (actual apex G at F8 loop, back-calculated from 23.283s lap)
Loop fraction ≈ 0.56 of lap distance

F8_CORNER_G  = 0.498 × 0.56 ≈ 0.28G  (used for F8 pressure/thermal)
```

The F8 corner speed through the loops (≈ 33.3 mph at 149 ft radius) gives 0.498G at the apex — lower than the oval's 0.813G because the racing line radius is larger despite similar speeds.

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

The model uses a **two-component** lateral weight transfer formula (Dixon / Kelvin Tse) that separates the load transfer into its physical mechanisms:

**1. Geometric (link) transfer** — acts through the suspension links, independent of springs and shocks. Determined by each axle's share of the car's mass and its roll center height.
```
ΔF_geo,front = m_front × G_lateral × RCH_front / trackWidth
ΔF_geo,rear  = m_rear  × G_lateral × RCH_rear  / trackWidth

Where:
  m_front   = 4100 × 0.55 = 2255 lbs  (front axle mass)
  m_rear    = 4100 × 0.45 = 1845 lbs  (rear axle mass)
  RCH_front = 3/12 ft  (3" — measured, SLA geometry)
  RCH_rear  = 4/12 ft  (4" — estimated, Watts-link solid axle)
  trackWidth = 63/12 ft
```

**2. Elastic (spring) transfer** — acts through the springs and creates body roll. Distributed front/rear by the **spring roll stiffness ratio only** — dampers do not resist steady-state roll.
```
avgRCH        = 0.55 × (3/12) + 0.45 × (4/12) = 0.2875 ft
elasticTotal  = 4100 × G_lateral × (cgHeight − avgRCH) / trackWidth
             = 4100 × G_lateral × (22/12 − 0.2875) / (63/12)
             = 4100 × G_lateral × (1.5417 − 0.2875) / 5.25
             = 4100 × G_lateral × 0.2389

elasticFront  = elasticTotal × springLLTD
elasticRear   = elasticTotal × (1 − springLLTD)
```

**Total per-axle transfer:**
```
ltFront = ΔF_geo,front + elasticFront
ltRear  = ΔF_geo,rear  + elasticRear
```

### Per-Corner Loads

```
LF (inside front)  = 1,127.5 − ltFront
RF (outside front) = 1,127.5 + ltFront
LR (inside rear)   =   922.5 − ltRear
RR (outside rear)  =   922.5 + ltRear
```

**Example at OVAL_CORNER_G (0.407G), springLLTD = 0.500 (stock springs):**
```
ΔF_geo,front  = 2255 × 0.407 × (3/12) / (63/12) = 43.5 lbs
ΔF_geo,rear   = 1845 × 0.407 × (4/12) / (63/12) = 47.6 lbs
elasticTotal  = 4100 × 0.407 × 0.2389 = 398.5 lbs
elasticFront  = 398.5 × 0.500 = 199.3 lbs
elasticRear   = 398.5 × 0.500 = 199.3 lbs
ltFront = 43.5 + 199.3 = 242.8 lbs
ltRear  = 47.6 + 199.3 = 246.9 lbs

RF ≈ 1127.5 + 242.8 = 1,370 lbs
LF ≈ 1127.5 − 242.8 =   885 lbs
RR ≈  922.5 + 246.9 = 1,169 lbs
LR ≈  922.5 − 246.9 =   676 lbs
```

> The RF carries ~1,370 lbs at the corner apex — 22% more than its static load of 1,127.5 lbs. This is why RF tire pressure, camber, and temperature are the most important parameters to get right on a left-turn oval.

> **Why two components?** The geometric transfer travels directly through the rigid links (instant response, no body roll). The elastic transfer acts through the springs as the chassis rolls (lag, body motion). Separating them correctly models how spring changes affect roll (and dynamic camber) while suspension geometry changes (roll center) affect instantaneous load transfer even with zero roll.

**Sources:** Dixon *Tires, Suspension and Handling* [³], Kelvin Tse suspension lecture notes [⁶].

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

Body roll angle affects dynamic camber, which affects grip. The roll stiffness (`rollStiffness`) combines spring rates (85% weight) and damper ratings (15% weight), normalized so the baseline setup gives exactly the calibrated **3.1°/G** body roll:

```
rollStiffness = max(4, (0.85 × springScale + 0.15 × damperNorm) × 28)

Where:
  springScale = (k_front/475 + k_rear/160) / 2   [1.0 = P71 stock springs]
  damperNorm  = (damperFront + damperRear) / 28   [1.0 = 4/4/2/2 dampers]

bodyRoll (°) = G_lateral × 3.1° × (28 / rollStiffness)
```

**Validation at baseline (475/160 springs, 4/4/2/2 dampers):**
```
springScale   = (475/475 + 160/160) / 2 = 1.0
damperNorm    = 28 / 28 = 1.0
rollStiffness = (0.85 × 1.0 + 0.15 × 1.0) × 28 = 28
bodyRoll      = 1.0 × 3.1 × (28/28) = 3.1°/G  ✓
```

> **Why 85/15 spring/damper split for body roll?** At steady-state cornering (constant speed, constant radius), dampers have zero effect — they only resist *changes* in position, not sustained position. Springs are the dominant roll-resistance mechanism. The 15% damper weight is a modeling compromise: the damper rating also implicitly captures sway bar effects which are not separately tracked. The earlier 70/30 split over-weighted dampers and has been corrected to 85/15 to better reflect physics.

> **Why 3.1°/G?** Measured from the car: at the actual oval corner speed (47.6 mph, ≈0.813G at the apex), observed body roll is approximately 2.5°. Dividing: 2.5° / 0.813G ≈ 3.1°/G. The baseline stiffness of 28 is anchored to this measurement.

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

pressureGrip = max(0.82,  1 − 0.006 × |hotPSI − optPSI|)
```

- **0.6% grip loss per PSI** of deviation from optimal
- **Floor 0.82** (18% max loss) — reached at 30 PSI off target, which represents catastrophically wrong pressure

> **Why `30 × (load / avgLoad)`?** This formula assumes 30 PSI is the ideal pressure at the average static load (1025 lbs). Tires that carry more load in cornering need more pressure to maintain the same contact patch shape. The factor `cornerLoad / avgLoad` scales from the average. This approach was calibrated so that at oval OVAL_CORNER_G (0.407G), the RF optimal comes out to ~40–42 PSI hot and LF to ~26 PSI hot — consistent with observed hot pressures.

> **Why 0.006/PSI, not 0.010/PSI?** Lap time is less sensitive to pressure than handling balance. The 0.006 coefficient means a 5 PSI deviation costs ~3% grip on lap time, while the balance gauge applies additional correction separately. The original 0.010 was too aggressive and penalized small deviations disproportionately.

**Sources:** Standard tire pressure vs load theory [³][⁶]. Calibrated against real-world pressure data from our sessions.

---

### Camber Grip Factor

Camber is the lean angle of the tire relative to vertical. The model evaluates camber in the **ground frame** — the actual tire-to-road angle at the contact patch — rather than the chassis frame. This is the angle that determines contact patch shape and lateral force.

#### Ideal Ground-Frame Camber Targets

| Corner | Ideal Ground Camber | Rationale |
|---|---|---|
| **RF** (outside front) | **−2.0°** | Slight negative counters centrifugal crown, keeps full contact patch. Calibrated for 235/55R17 tall sidewall at heavy load (~1,300–1,700 lbs). Literature: −2.0° to −2.25° for street tires at heavy load. |
| **LF** (inside front) | **+0.75°** | Small positive is optimal — not 0°. Camber thrust on the lightly loaded inside tire sharpens turn-in. At 0° the LF contributes max area but zero camber thrust. Research: +0.5°–+1.0° ground is the practical optimum where thrust benefit exceeds the modest patch reduction. |
| **RR / LR** (solid axle) | **0.0°** | No static adjustment possible; body roll is the only camber source. |

#### Asymmetric, Load-Weighted Penalty Curves

The penalty is **not symmetric** — insufficient camber costs more than over-camber on the heavily loaded outside tire:

```
RF (outside front, heavily loaded ~1,300–1,700 lbs):
  dev = groundCamber − (−2.0°)   [positive = insufficient, negative = over-camber]

  Insufficient (dev > 0):
    penalty = 0.016 + max(0, (load/avgLoad − 1.0)) × 0.004
    camberGrip = max(0.88,  1 − penalty × dev)
    [At RF ~1,400 lbs: 1.6% + (1400/1025 − 1) × 0.4% ≈ 1.75%/°]

  Over-camber (dev < 0):
    camberGrip = max(0.88,  1 − 0.010 × |dev|)   [flat 1.0%/°]

LF (inside front, lightly loaded ~600–900 lbs):
  dev = groundCamber − 0.75°   [positive = above ideal, negative = below ideal]

  Below ideal (dev < 0): double penalty — loses both camber thrust AND contact patch
    camberGrip = max(0.88,  1 − 0.012 × |dev|)   [1.2%/°]

  Above ideal (dev > 0): gentler — mainly contact patch loss, thrust still present
    camberGrip = max(0.88,  1 − 0.007 × dev)     [0.7%/°]

Rear (solid axle, both RR and LR):
  camberGrip = max(0.88,  1 − 0.010 × |groundCamber − 0°|)   [symmetric 1.0%/°]
```

> **Why asymmetric RF penalty?** At insufficient camber (too positive), the outer edge lifts and lateral force drops sharply — the contact patch loses area on the most critical part. At over-camber, the inner edge carries load and some lateral force is retained. Source: Pacejka tire model, JOES Racing / Speed Academy contact patch research.

> **Why load-weighted RF penalty?** Camber thrust coefficient scales nearly linearly with vertical load (Pacejka). A 1° deviation costs more grip on the heavily loaded RF (~1.75%/° at 1,400 lbs) than at average load (~1.6%/°). The `(load/avgLoad − 1.0) × 0.004` term captures this.

---

### Ground-Frame Camber Calculation

Camber at the contact patch (ground frame) is what the grip model receives. It is computed from static camber through several geometric stages:

```
Step 1 — Effective camber (chassis frame):
  effectiveCamber = staticCamber + casterCamberGain + bodyRollCamber + kpiCamber

  casterCamberGain:
    RF (outside): −(caster_deg × 0.18 × refG)   [jounce → negative camber, SLA geometry]
    LF (inside):  +(caster_deg × 0.10 × refG)   [droop → positive camber]

  bodyRollCamber (at actual apex cornerRoll = bodyRoll × OVAL_RACING_G):
    RF (jounce): −(cornerRoll × 0.355)   [SLA jounce coefficient: 1.1° per 3.1° roll]
    LF (droop):  +(cornerRoll × 0.15)    [SLA droop coefficient]

  kpiCamber (KPI = 9.5°, steerAngle = 10°):
    formula: KPI_deg × (1 − cos(steerAngle))
    = 9.5° × (1 − cos(10°)) = 9.5° × 0.01519 = +0.144°
    RF: +0.144° (positive — adds to outside tire lean)
    LF: −0.144°

Step 2 — Convert chassis frame → ground frame:
  RF (outside): groundCamber_geom = effectiveCamber + cornerRoll
  LF (inside):  groundCamber_geom = effectiveCamber − cornerRoll

Step 3 — Add sidewall compliance camber:
  The sidewall deflects outward under load, adding positive camber at the contact patch.
  sidewallCamber = load × K   where K = 1.2 × (sectionHeight/sectionWidth) / ratedLoad
                             = 1.2 × (5.09/9.25) / 1929 ≈ 0.000342 °/lb
  At RF apex load ~1,300 lbs: +0.45°  (must be compensated with additional static negative camber)
  At LF load ~600 lbs: +0.21°

  groundCamber = groundCamber_geom + sidewallCamber
```

**Worked example — RF, static −2.25°, caster 5.0°, total stiffness 28 (3.1°/G base roll), RF corner load 1,370 lbs:**
```
cornerRoll      = 3.1° × 0.813 = 2.52°  (bodyRoll at 1G × OVAL_RACING_G)
casterGain      = −(5.0 × 0.18) = −0.90°
bodyRollCamber  = −(2.52 × 0.355) = −0.895°
kpiCamber       = +0.144°

effectiveCamber = −2.25 + (−0.90) + (−0.895) + 0.144 = −3.90°

groundCamber_geom = −3.90 + 2.52 = −1.38°
sidewallCamber    = 1370 × 0.000342 = +0.47°
groundCamber      = −1.38 + 0.47 = −0.91°

dev = −0.91 − (−2.0) = +1.09°  (insufficient — above ideal −2.0°)
penalty = 0.016 + (1370/1025 − 1.0) × 0.004 = 0.016 + 0.00134 = 0.01734
camberGrip = 1 − 0.01734 × 1.09 ≈ 0.981
```

> **SLA vs MacPherson:** Crown Vic P71 uses SLA (short-long arm / double wishbone) front suspension. The shorter upper arm forces the wheel to gain negative camber in jounce. MacPherson struts (most budget cars) gain positive camber in jounce, which hurts grip. The 0.355 SLA jounce coefficient is measured: 1.7" compression at 3.1° body roll → 1.1° camber gain → 1.1/3.1 = 0.355°/°.

> **Why KPI matters:** Kingpin inclination (KPI = 9.5°) causes both front tires to gain positive camber when steered. The correct formula is `KPI_deg × (1 − cos(steerAngle))`. At 10° steer this is only +0.144° — small but it adds to the ground-frame positive camber direction and must be compensated.

**Sources:** SLA geometry principles [³][⁶][¹³]. Caster gain coefficient (0.18/degree) from standard front suspension geometry analysis. KPI formula from EvolutionM / Kelvin Tse kinematic curves.

---

### Rear Camber (Solid Rear Axle)

The Crown Vic P71 has a traditional solid (live) rear axle. It cannot independently adjust camber; both rear wheels follow the body roll angle exactly.

```
cornerRoll = bodyRoll × OVAL_RACING_G

RR (outside in left turn): groundCamber = +cornerRoll + sidewallCamber
LR (inside in left turn):  groundCamber = −cornerRoll + sidewallCamber

rearCamberGrip = max(0.88,  1 − 0.010 × |groundCamber − 0°|)
```

> This is a fundamental limitation of the solid axle — you cannot set rear static camber to compensate for body roll. The only way to reduce rear camber deviation is to reduce body roll (stiffer springs or anti-roll bar), or to accept the penalty. On street tires at moderate body roll, the penalty is small.

---

### Caster Grip Factor

Caster's camber gain effect is fully captured above. The `casterGripFactor` handles only the **mechanical trail** effect — the self-aligning torque that determines steering feel, stability, and driver workload.

#### Mechanical Trail Formula

Mechanical trail is the horizontal distance between where the steering axis meets the ground and the tire contact patch center (side-view geometry):

```
mechanicalTrail (inches) = R_tire × sin(caster_rad) − scrubRadius × cos(caster_rad)

Where:
  R_tire      = 13.6"  (235/55R17 loaded radius)
  scrubRadius = 0.525" (positive: kingpin axis meets ground inboard of contact patch)

Trail values across the P71 caster range:
  3°    → 0.19"   (very light — little self-centering)
  5°    → 0.66"   (good light feel)
  7°    → 1.13"   (solid self-centering)
  9°    → 1.60"   (approaching workload limit without power steering)
  9.75° → 1.79"   (at/past fatigue threshold at slow oval speeds)
```

#### RF (Outside Tire) — Parabolic Benefit Curve

On a left-turn oval, RF trail provides a beneficial self-aligning effect that resists the car's tendency to chase the inside and reduces steering corrections mid-corner:

```
PEAK_TRAIL = 0.9"   ← peak of benefit curve

Below peak (trail < 0.9"):
  deficit = (0.9 − trail) / 0.9
  casterGrip = max(0.97, 1 − 0.010 × deficit² × 0.81)
  [~1% loss at trail = 0", 0 at peak]

Above peak (trail > 0.9"):
  excess = trail − 0.9
  casterGrip = max(0.94, 1 − 0.055 × excess²)
  [at 1.5" → ~2% loss; at 1.79" (9.75°) → ~2% loss; at 2.0" → ~3.5% loss]
```

#### LF (Inside Tire) — Monotonic Penalty

LF trail creates torque that fights turn-in and loads the inside edge. Optimal LF trail is low (0.3–0.5"). Above ~0.8" it adds to push tendency:

```
OPTIMAL_LF = 0.35"

excess = max(0, trail − 0.35)
casterGrip = max(0.96, 1 − 0.030 × excess²)
[at 3° LF → trail ≈ 0.19" (ideal); at 7° LF → trail ≈ 1.13" (noticeable push)]
```

**F8 caster asymmetry case:** In the baseline F8 session, LF caster was 5.5° and RF caster was 3.75°. In right turns, LF becomes the outside tire, generating high aligning torque proportional to tan(5.5°). In left turns, RF is outside with tan(3.75°):
```
Steering effort ratio (right vs left) = tan(5.5°) / tan(3.75°) = 0.0963 / 0.0655 = 1.47×
→ Right turns require ~47% more steering effort — confirmed by driver feedback.
```

**Sources:** SAE mechanical trail geometry [³][⁶]. Circle-track caster research (iRacing/Speed Academy), DrRacing SAT model, P71 alignment community data.

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
toeDrag = 1 + 0.08 × toe²    (applied as divisor to total grip force)
```

> **Why 0.08?** Calibrated to measured lap-time sensitivity: ~0.08s per 1/4" additional toe on a 17.2s oval lap. Each 1/4" of toe ≈ 0.1° scrub angle per wheel. At 1/4" toe out: drag penalty ≈ 0.5%; at 1/2" toe out: ≈ 2%. The earlier value of 0.001 was too small and would produce negligible penalty even at extreme toe angles.

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

The model targets specific **ground-frame** camber angles (see Section 10). Since the ground-frame camber is built up from static camber through several geometric stages, we can solve backward:

```
groundCamber = effectiveCamber + cornerRoll + sidewallCamber    [RF, outside]
groundCamber = effectiveCamber − cornerRoll + sidewallCamber    [LF, inside]

effectiveCamber = staticCamber + casterGain + bodyRollCamber + kpiCamber

→ optStaticCamber = idealGroundCamber − casterGain − bodyRollCamber − kpiCamber
                    ∓ cornerRoll − sidewallCamber
```

Where ∓ means: subtract cornerRoll for RF (outside), add cornerRoll for LF (inside).

**Oval RF (static −2.25°, caster 5.0°, stock springs 475/160, shocks 4/4/2/2):**
```
rollStiffness  = 28  (baseline)
bodyRoll       = 3.1° / G at baseline
cornerRoll     = 3.1° × 0.813 = 2.52°  (OVAL_RACING_G — instantaneous apex G)
casterGain     = −(5.0 × 0.18)       = −0.90°
bodyRollCamber = −(2.52 × 0.355)     = −0.895°
kpiCamber      = +0.144°
sidewallCamber ≈ +0.47° (at RF ~1,370 lbs load)

groundCamber_geom = staticCamber + casterGain + bodyRollCamber + kpiCamber + cornerRoll
                  = −2.25 + (−0.90) + (−0.895) + 0.144 + 2.52 = −1.38°
groundCamber      = −1.38 + 0.47 = −0.91°   (vs ideal −2.0°)
```

This shows the static setting of −2.25° is not yet at the ideal −2.0° ground-frame. The optimizer accounts for this when selecting the recommended setup.

**Oval LF (static −0.25°, caster 3.0°):**
```
cornerRoll     = 2.52° (same as RF)
casterGain     = +(3.0 × 0.10)      = +0.30°
bodyRollCamber = +(2.52 × 0.15)     = +0.378°
kpiCamber      = −0.144°
sidewallCamber ≈ +0.21° (at LF ~600 lbs load)

groundCamber_geom = −0.25 + 0.30 + 0.378 + (−0.144) − 2.52 = −2.24°
groundCamber      = −2.24 + 0.21 = −2.03°   (below ideal +0.75°)
```

The LF at −0.25° static is still well below the +0.75° ground ideal. Static must be set significantly more positive to achieve the target ground-frame angle.

### F8 Symmetric Camber

For the figure 8, both fronts alternate between outside and inside roles equally. The optimal static camber is a compromise between the two roles. Because body roll partially cancels over a lap (left rolls one way, right the other), the calculation uses smaller effective roll:

```
Ideal ground camber (outside role): −2.0°
Ideal ground camber (inside role):  +0.75°

Average ideal ground = (−2.0 + 0.75) / 2 = −0.625°
```

With symmetric 5.0° caster and canceling body roll (≈ 0 net):
```
casterGain_avg     = (−(5×0.18) + (5×0.10)) / 2 = (−0.90 + 0.50)/2 = −0.20°
sidewallCamber_avg ≈ +0.34° (average of outside/inside loads)

optStaticCamber ≈ −0.625 − (−0.20) − 0.34 ≈ −0.77°
```

The optimizer found −2.25° as optimal for F8, which is substantially more negative than this analytical result. The difference arises because the optimizer also optimizes over temperature effects (cooler tires = better grip), the nonlinear grip function, and pressure interaction — the optimizer result is the ground truth. The analytical formula gives the direction (negative camber needed) but the optimizer refines the magnitude.

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

All oval setups use FCS 1336349 front struts (taxi/police package, ~475 lbs/in) and KYB 555603 rear shocks (shock only, 160 lbs/in stock rear spring). The RECOMMENDED setup uses FCS 1336349 at both front positions (475 lbs/in).

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
*Grid-searched over 419,904 combinations @ 90°F. Updated 2026-04-14 with ground-frame camber model, Dixon geometric+elastic weight transfer, 0.813G apex G, 0.407G time-averaged G, mechanical trail caster model.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 (FCS 1336349) | 4 (FCS 1336349) | 1 (Monroe 550018) | 1 (Monroe 550018) |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | **+2.25° (positive)** | −3.0° | — | — |
| Caster | 3.5° | 6.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 22 | 36 | 17 | 31 |
| **Best lap** | **17.266s @ 90°F** | | | |

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
*Grid-searched over 5,832 combinations @ 75°F. Updated 2026-04-14 with full physics model. Symmetric caster mandatory for equal L/R performance.*

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 1 | 1 | 1 | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −0.5° | −0.5° | — | — |
| Caster | 6.5° | 6.5° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 34.5 | 34.5 | 29 | 29 |
| **Best lap** | **23.017s @ 75°F** | | | |

---

## 17. Optimizer Results

### Oval Grid Search

The optimizer tested every possible combination of:
- All available shock/strut part combinations (LF×RF front pairings × LR×RR rear pairings from the parts database)
- LF caster: 3.0°–7.0° in 0.5° steps (9 values), RF caster: 3.0°–7.0° in 0.5° steps (9 values)
- Camber: swept independently LF −3.0° to +3.0° and RF −4.0° to −1.5° (grid search; not analytically derived)
- PSI: derived analytically from corner loads at OVAL_CORNER_G = 0.407G
- Toe: fixed at −0.25"

**Total combinations: 419,904 | Best lap: 17.266s @ 90°F | vs. baseline 17.4s: −0.134s improvement**

Model updated 2026-04-14: ground-frame camber (tire-to-road angle at contact patch), Dixon geometric+elastic weight transfer (front RCH=3", rear RCH=4"), 0.813G instantaneous apex G for roll/geometry, 0.407G time-averaged G for pressure/thermal loads, mechanical trail caster model.

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 (FCS 1336349) | 4 (FCS 1336349) | 1 (Monroe 550018) | 1 (Monroe 550018) |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | **+2.25° (positive)** | −3.0° | — | — |
| Caster | 3.5° | 6.0° | — | — |
| Cold PSI | 22 | 36 | 17 | 31 |

**Why this setup wins:**
- Balanced front shocks (4/4) + stiff rear (1/1) → LLTD = 0.460 (exactly optimal)
- LF +2.25° static camber → +0.77° ground-frame (target +0.75°): inside-front generates camber thrust and runs flat contact patch at the apex
- RF −3.0° static + 6.0° caster → −1.98° ground-frame (target −2.0°): mechanical trail ≈ 0.9" (sweet spot per trail model)
- PSI analytically derived from Dixon corner loads: RF 36 cold for 1,370-lb corner load; LF 22 cold for 838-lb corner load

### Figure 8 Grid Search

The optimizer tested every combination of:
- All available shock pairings (front and rear)
- Symmetric camber: −3.0° to 0° in 0.5° steps (7 values)
- Symmetric caster: 3.0° to 8.0° in 0.5° steps (11 values)
- PSI: derived analytically toward outside-corner load optimum
- Toe: fixed at −0.25"

**Total combinations: 5,832 | Best lap: 23.017s @ 75°F | vs. baseline 23.283s: −0.266s improvement**

Model updated 2026-04-14 (same corrections as oval search above).

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 1 | 1 | 1 | 1 |
| Springs | 475 lbs/in | 475 lbs/in | 160 lbs/in | 160 lbs/in |
| Camber | −0.5° | −0.5° | — | — |
| Caster | 6.5° | 6.5° | — | — |
| Cold PSI | 34.5 | 34.5 | 29 | 29 |

**Why this setup wins:**
- All-stiff shocks (1/1/1/1) → maximum LLTD balance for symmetric L/R turns in F8
- Symmetric −0.5° static camber: F8 averages both outside and inside roles per corner — near-zero static gives the lowest combined penalty across both roles after ground-frame conversion
- Symmetric 6.5° caster: mechanical trail at 6.5° ≈ 0.9–1.0" (near RF sweet spot); mandatory symmetry for equal handling in both turn directions

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
