# Race Simulation — Measurements & Math Reference

**Car:** 2008 Crown Victoria P71
**Tracks:** 1/4-mile oval, Figure 8
**Last updated:** 2026-03-23

---

## Table of Contents
1. [Physical Measurements](#1-physical-measurements)
2. [Vehicle Constants](#2-vehicle-constants)
3. [Tire Specifications](#3-tire-specifications)
4. [Track Geometry Derivations](#4-track-geometry-derivations)
5. [Lateral G & Corner Speeds](#5-lateral-g--corner-speeds)
6. [Weight Transfer & Tire Loads](#6-weight-transfer--tire-loads)
7. [Spring Rates — Confirmed & Available](#7-spring-rates--confirmed--available)
8. [Shock → Roll Stiffness (LLTD)](#8-shock--roll-stiffness-lltd)
9. [Tire Thermal Model](#9-tire-thermal-model)
10. [Grip Model — All Factors](#10-grip-model--all-factors)
11. [Performance Metric → Lap Time](#11-performance-metric--lap-time)
12. [Pressure Optimization Math](#12-pressure-optimization-math)
13. [Camber Optimization Math](#13-camber-optimization-math)
14. [Real-World Calibration Data](#14-real-world-calibration-data)
15. [Figure 8 Differences](#15-figure-8-differences)
16. [All Setup Presets](#16-all-setup-presets)
17. [Optimizer Results](#17-optimizer-results)

---

## 1. Physical Measurements

### Track — measured via Google Earth
| Measurement | Value | Method |
|---|---|---|
| Frontstretch | 325 ft | Google Earth ruler |
| Backstretch | 333 ft | Google Earth ruler |
| Average straight | 329 ft | (325 + 333) / 2 |
| Corner track width | 53 ft | Google Earth ruler |
| Banking | ~2–3° | Visual estimate; model uses 3° effective |

### Car
| Item | Value | Source |
|---|---|---|
| Weight | 3,800 lbs | Stripped interior, roll cage, stock engine + X-pipe |
| CG height | 22 in | Estimated (Crown Vic stock ~22–23 in) |
| Track width | 63 in | Crown Vic stock |
| Wheelbase | 114.7 in | Crown Vic spec |
| Front weight bias | 55% | Crown Vic front-heavy bias |
| Frontal area | 25 ft² | Crown Vic estimated |
| Drag coefficient | 0.33 | Crown Vic spec |

---

## 2. Vehicle Constants

```
G       = 32.174 ft/s²
RANKINE = 459.67   (converts °F to absolute temperature)
Mass    = 3800 / 32.174 = 118.1 slugs

Engine:
  Peak torque    = 300 lb-ft (4.6L SOHC V8, ~255 hp)
  2nd gear ratio = 1.55 × 3.73 = 5.782 total
  Drive efficiency = 85%
  Braking G (oval) = 0.5G (lift + light brake on short oval)
```

---

## 3. Tire Specifications

**Ironman iMove Gen3 AS — 235/55R17 103V XL**

| Spec | Value |
|---|---|
| Section width | 235 mm |
| Aspect ratio | 55% |
| Wheel diameter | 17 in |
| Sidewall height | 235 × 0.55 = 129.25 mm |
| Loaded radius | 215.9 mm wheel + 129.25 mm sidewall = 13.59 in → model uses **13.6 in** |
| Max cold PSI (XL) | **51 PSI** (extra-load rated) |
| Load capacity | 1,929 lbs per tire (Load Index 103) |
| UTQG | 420 AA A |

---

## 4. Track Geometry Derivations

### Corner Radius (Oval)
Total track circumference = **1/4 mile = 1,320 ft**

```
1,320 = 2 × straights + 2 × corner arcs
1,320 = 2 × 329 + 2 × π × R
1,320 - 658 = 2π × R
R = 662 / (2π) = 105.3 ft → model uses 105 ft
```

### Track Arc Lengths
```
Straight (each)  = 329 ft
Corner arc (each) = π × 105 = 329.9 ft
Total lap length  = 2 × 329 + 2 × 329.9 = 1,317.7 ft ≈ 1/4 mile ✓
```

### Figure 8 Corner Radius
The figure 8 uses the same physical corners as the oval, but the racing line through the crossover tightens the effective radius:

```
25 mph ≈ 36.67 ft/s through the F8 cross
Measured radius ≈ 149 ft (tighter crossover line)
G = v² / (R × g) = 36.67² / (149 × 32.174) = 0.28G
```

---

## 5. Lateral G & Corner Speeds

### Oval Cornering G = 0.375G
**Calibrated from real-world pressure data**, not from speed/radius.
At 0.375G with R = 105 ft:
```
v = √(G_lat × g × R) = √(0.375 × 32.174 × 105) = 35.6 ft/s ≈ 24.3 mph
```
Using 0.375G in the pressure model gives RF ≈ 40 PSI hot, LF ≈ 26 PSI hot — matches real-world pyrometer data.

### Figure 8 Cornering G = 0.28G
```
v = √(0.28 × 32.174 × 149) = 36.7 ft/s ≈ 25 mph through crossover
```

### Straight Speed (Physics)
Corner exit speed to peak speed to next corner entry:
```
v_peak² = v_corner² + 2 × a_acc × L × a_brake / (a_acc + a_brake)

Where:
  v_corner  = corner apex speed (from lateral G)
  a_acc     = engine thrust / mass = (300 × 5.782 × 0.85) / (13.6/12) / 118.1 = 8.6 ft/s²
  a_brake   = 0.5G = 16.09 ft/s²
  L         = 329 ft (straight length)

→ v_peak ≈ 53 mph (baseline)
```

---

## 6. Weight Transfer & Tire Loads

### Static Loads (no cornering)
```
Front axle total = 3800 × 0.55 = 2,090 lbs → each front = 1,045 lbs
Rear axle total  = 3800 × 0.45 = 1,710 lbs → each rear  =   855 lbs
```

### Lateral Weight Transfer
```
ΔW = Weight × G_lateral × CG_height / Track_width
   = 3800 × G × (22/12) / (63/12)
   = 3800 × G × 1.833 / 5.25
   = 3800 × G × 0.349

At OVAL_CORNER_G (0.375G):
  ΔW = 3800 × 0.375 × 0.349 = 497 lbs total lateral transfer
```

### Corner Loads (left turn, OVAL_CORNER_G, default setup)
LLTD (front lateral load transfer distribution) = front shock share (see section 7)

```
LF (inside front) = 1,045 − 497 × LLTD  ← unloaded
RF (outside front) = 1,045 + 497 × LLTD  ← loaded
LR (inside rear)  =   855 − 497 × (1−LLTD)
RR (outside rear) =   855 + 497 × (1−LLTD)
```

For default setup (LLTD ≈ 0.50):
```
LF ≈ 797 lbs    RF ≈ 1,294 lbs
LR ≈ 607 lbs    RR ≈ 1,103 lbs
```

---

## 7. Spring Rates — Confirmed & Available

### Stock P71 Spring Rates (Confirmed)
| Position | Rate | Source |
|---|---|---|
| **Front (2006.5–2011 P71)** | **475 lbs/in** | Crownvic.net / idmsvcs.com (redesigned at 2006.5 with stamped steel lower arms) |
| **Rear (all P71 1992+)** | **160 lbs/in** | idmsvcs.com / forum community data |
| Front (2003–2006.5 P71) | 325 lbs/in | Pre-redesign generation |
| Front (1993–2002 P71) | 700 lbs/in | NUL springs, older platform |
| Front civilian LX (2003–2011) | ~440 lbs/in | Estimated (softer than police) |
| Rear civilian (2003–2011) | ~130 lbs/in | Base civilian, softer than P71 |

### Front Strut Assemblies — Spring Rate by Part
| Part | Spring Rate | Notes |
|---|---|---|
| FCS 1336349 (our current fronts) | ~475 lbs/in | **Taxi/Police Package** — matches P71 stock |
| Monroe 271346 | ~475 lbs/in | Police/Taxi Package — same spec as FCS 1336349 |
| Monroe 171346 | ~440 lbs/in | **Civilian only** (LX/S/Sport) — softer spring |
| KYB SR4140 | ~475 lbs/in | OE-spec, fits all trims, likely matches police rate |
| Aldan American 300183 | **550 lbs/in** | Coilover, 0–2" adjustable height, single adj. shock |
| Aldan American 300335 | **650 lbs/in** | Coilover, double adjustable shock |
| Aldan American 300185 | **750 lbs/in** | Coilover, 0–2" adjustable height, single adj. shock |

### Rear Shocks & Springs
| Part | Type | Spring Rate | Notes |
|---|---|---|---|
| KYB 555603 (our current rears) | Shock only | N/A (spring separate) | OE-spec gas shock |
| Bilstein B6 24-184755 | Shock only | N/A | Fits 2003–2011, monotube performance |
| Aldan rear shock (pkg with 300183/185) | Shock only | N/A | Adjustable, keeps factory 160 lbs/in rear spring |
| P71 stock rear coil spring | Spring only | **160 lbs/in** | Retained in all shock-only swaps |
| Eaton Detroit Spring (custom) | Spring only | Custom order | For stiffer rear options (200–250 lbs/in range) |

### Why This Matters for the Model
The **front-to-rear spring rate ratio** determines steady-state body roll and lateral load transfer distribution (LLTD):

```
Spring LLTD = k_front / (k_front + k_rear)

Stock P71:  475 / (475 + 160) = 0.748  ← front-heavy, promotes understeer
(Note: sway bars significantly modify this — they are not modeled separately)
```

The model blends spring LLTD (60%) with damper LLTD (40%):
```
frontLLTD = 0.6 × (k_front / (k_front + k_rear))_normalized
           + 0.4 × (damperFront / damperTotal)
```

Body roll uses a `rollStiffness(setup)` function:
```
rollStiffness = (0.7 × springScale + 0.3 × damperNorm) × 28

Where:
  springScale = (k_front/475 + k_rear/160) / 2   [normalized, 1.0 = P71 stock]
  damperNorm  = ss.total / 28                      [normalized, 1.0 = 4/4/2/2 dampers]

At baseline (475/160 springs, 4/4/2/2 dampers): rollStiffness = 28 → bodyRoll = 3.5°/G ✓
With Aldan 750 front:  rollStiffness = 33.7 → bodyRoll = 2.91°/G (17% less roll)
With Aldan 550 front:  rollStiffness = 29.6 → bodyRoll = 3.31°/G (5% less roll)
```

### Performance Spring Comparison
| Option | Front Rate | vs. Stock | Body Roll at 0.375G | Notes |
|---|---|---|---|---|
| Stock P71 (FCS 1336349) | 475 lbs/in | baseline | 1.31° | Police/taxi package |
| Monroe 171346 (civilian) | 440 lbs/in | −7.4% | 1.40° | Slight more roll; softer spring |
| Aldan 550 | 550 lbs/in | +15.8% | 1.24° | Moderate track improvement |
| Aldan 650 | 650 lbs/in | +36.8% | 1.16° | Significant stiffening |
| Aldan 750 | 750 lbs/in | +57.9% | 1.09° | Aggressive track; stiffer than pre-2003 P71 |

---

## 8. Shock → Roll Stiffness (LLTD)

Shock ratings: **0 = stiffest, 10 = softest**

```
Damper contribution = (10 − rating) per corner

Front damper total = (10 − LF) + (10 − RF)
Rear damper total  = (10 − LR) + (10 − RR)
```

**LLTD now blends spring rate (60%) + damper rating (40%):**
```
springLLTD = (k_front/475) / ((k_front/475) + (k_rear/160))
damperLLTD = damperFront / (damperFront + damperRear)
frontLLTD  = 0.6 × springLLTD + 0.4 × damperLLTD
```

**Example — Default setup (LF:4, RF:4, LR:2, RR:2):**
```
Front = (10−4) + (10−4) = 12
Rear  = (10−2) + (10−2) = 16
Total = 28
LLTD  = 12 / 28 = 0.429
```

**Example — Recommended setup (LF:8, RF:6, LR:1, RR:1):**
```
Front = (10−8) + (10−6) = 2 + 4 = 6
Rear  = (10−1) + (10−1) = 9 + 9 = 18
Total = 24
LLTD  = 6 / 24 = 0.25
```

**Optimal LLTD (oval) = 0.46** — model penalizes deviation:
```
Balance penalty = max(0.90,  1 − 0.7 × (LLTD − 0.46)²)
```

### Body Roll (degrees)
```
Roll = G_lateral × 3.5° × (28 / total_stiffness)
     = G × 3.5 × (28 / total)

Baseline (total=28): 3.5° per G
Stiffer setup (total=24): 4.08° per G
Very stiff (total=36): 2.72° per G
```

---

## 8. Tire Thermal Model

### Constants (calibrated from 4-session pyrometer dataset)
| Constant | Value | Meaning |
|---|---|---|
| heatBase | 0.53 | Base heat rate/sec (rolling resistance) |
| heatLoad | 0.00453 | Load-dependent heat rate/sec |
| coolRate | 0.02 | Cooling per °F delta per second |
| thermalMass | 1.39 | Thermal inertia (τ ≈ 4 laps) |
| refSpeed | 75 ft/s | Reference avg speed for heat calc |

### Equilibrium Temperature Formula
At steady state (heat in = heat out):
```
T_eq = ambient + (heatBase + heatLoad × workFactor × refSpeed) / coolRate

WorkFactor = corner_load / avg_load  (= corner_load / 950)

Example: RF at OVAL_CORNER_G (load ≈ 1294 lbs), 90°F ambient:
  WF_RF  = 1294 / 950 = 1.362
  T_eq   = 90 + (0.53 + 0.00453 × 1.362 × 75) / 0.02
          = 90 + (0.53 + 0.463) / 0.02
          = 90 + 49.6 = 139.6°F
```

### Inside / Middle / Outside Zone Distribution
Multipliers applied to heat per lap (base = 1.0):

**Outside tires (RF, RR) — centrifugal cornering load:**
```
Inside: 0.82 × heat   (sheltered from centrifugal force)
Middle: 1.00 × heat
Outside: 1.18 × heat   (wall-side edge loaded hardest)
Camber shift = 0        (centrifugal dominates; camber correction zeroed out)
```

**Inside tires (LF, LR) — motor-side:**
```
Inside: 1.06 × heat
Middle: 1.00 × heat
Outside: 0.94 × heat
```

**Camber shift (LF only — front inside tire):**
```
CamberShift = −effectiveCamber × 0.04
InsideMult  = 1.06 + camberShift
OutsideMult = 0.94 − camberShift
```
*Example: LF effectiveCamber = −1.5° → shift = +0.06 → inside 1.12, outside 0.88*

**Toe-induced heat shift (fronts only):**
```
InsideBoost  = −toe × 0.05   (toe out → positive → heats inside edge)
OutsideBoost =  toe × 0.03   (toe out → cools outside slightly)

At −0.25" toe: inside boost = +0.0125, outside boost = −0.0075
```

**Pressure-induced heat shift (middle zone):**
```
psiDev = hotPSI − optPSI
middleBoost = psiDev × 0.003   (over-inflation heats middle more)
```

### Hot Pressure (Ideal Gas Law)
Cold PSI measured at **68°F** (garage, not on track):
```
hotPSI = coldPSI × (tireTempF + 459.67) / (68 + 459.67)
       = coldPSI × (tireTempF + 459.67) / 527.67

Example: 34 cold PSI, 200°F tire:
  hotPSI = 34 × 659.67 / 527.67 = 42.5 PSI
  (≈ +8.5 PSI heat rise ✓)
```

### Figure 8 Heat Multiplier
F8 generates more heat per second due to tighter corners and bidirectional scrub:
```
F8_HEAT_MULT = 1.18

heatIn_F8 = (heatBase × 1.18 + heatLoad × wf × refSpeed) × lapTime × zoneMult
```
Calibrated so F8 equilibrium ≈ 125°F front / 121.6°F rear at 75°F ambient with baseline setup.

---

## 9. Grip Model — All Factors

Final grip µ per corner = product of all factors below:

### Temperature Grip Factor
Optimal range: **100°F – 165°F** (AS street tires on short oval)
```
temp < 100°F:  µ = max(0.75,  1 − ((100 − temp) / 60)² × 0.25)
100 – 165°F:   µ = 1.0   (optimal window)
165 – 185°F:   µ = max(0.70,  1 − ((temp − 165) / 50)² × 0.30)
```

### Pressure Grip Factor
Optimal hot PSI derived from actual corner loads at OVAL_CORNER_G (not static or 1G):
```
optPSI = 30 × (cornerLoad / avgLoad)   where avgLoad = 950 lbs

pressureGrip = max(0.82,  1 − 0.010 × |hotPSI − optPSI|)
```
1% grip loss per PSI of deviation; floor at 82% (catastrophic mismatch).

**Approximate optimal hot PSIs (default setup):**
```
RF: 30 × 1294/950 = 40.9 PSI hot → ~32.5 cold
LF: 30 × 797/950  = 25.2 PSI hot → ~20.0 cold
RR: 30 × 1103/950 = 34.8 PSI hot → ~27.7 cold
LR: 30 × 607/950  = 19.2 PSI hot → ~15.2 cold
```

### Camber Grip Factor
Outside front (RF): ideal effective = **−4.5° at 1G** (SLA geometry advantage)
Inside front (LF): ideal effective = **0°** (flat contact patch when unloaded)
```
camberGrip = max(0.88,  1 − 0.012 × |effectiveCamber − ideal|)
1.2% grip loss per degree deviation; floor 88%
```

### Effective Camber Calculation (front tires)
```
effectiveCamber = staticCamber + casterGain + bodyRollCamber

Caster gain (RF, outside): −(caster × 0.18) per G   [SLA gains negative in jounce]
Caster gain (LF, inside):  +(caster × 0.10) per G   [gains positive in droop]

Body roll at actual racing G (OVAL_CORNER_G, not 1G):
  cornerRoll = bodyRollDeg × OVAL_CORNER_G
  RF (jounce): −(cornerRoll × 0.35)   [SLA coefficient — key advantage over MacPherson]
  LF (droop):  +(cornerRoll × 0.15)

Example: RF with caster 5°, body roll 3.5° at 1G (→ 1.3125° at 0.375G):
  casterGain     = −(5 × 0.18) = −0.90°
  bodyRollCamber = −(1.3125 × 0.35) = −0.459°
  effectiveCamber = −3.0 + (−0.90) + (−0.459) = −4.36° ≈ ideal −4.5° ✓
```

### Rear Camber (solid rear axle)
```
RR (outside): dynamicCamber = +bodyRoll → ideal = −1.0°, dev = roll + 1.0
LR (inside):  dynamicCamber = −bodyRoll → ideal =  0.0°, dev = roll
rearCamberGrip = max(0.88,  1 − 0.012 × dev)
```

### Caster Grip Factor (direct stability effect, front only)
```
RF (outside): optimal = 5.0°; casterGrip = max(0.96, 1 − 0.004 × |caster − 5.0|)
LF (inside):  optimal = 3.0°; casterGrip = max(0.97, 1 − 0.003 × |caster − 3.0|)
```

### Toe Grip Factor
```
optimal = −0.25" (1/4" toe out for left-turn oval)
toeGrip = max(0.96,  1 − 0.008 × (toe − (−0.25))²)
```

### Toe Drag Penalty
```
toeDrag = 1 + 0.001 × toe²    (applied as divisor to total force)
```

### Load Sensitivity
```
loadSens = (avgLoad / cornerLoad)^0.08   [diminishing returns at high load]
```

### Front/Rear Balance Penalty
```
frontPct = frontGripForce / totalGripForce
imbalance = |frontPct − 0.55|
balancePenalty = max(0.94,  1 − 0.2 × imbalance)
```

---

## 10. Performance Metric → Lap Time

### Baseline
```
BASELINE_LAP = 17.4s   (oval, 65°F, current setup A, 15-lap session)
LAP_SENSITIVITY = 0.28
```
*Sensitivity of 0.28 caps perfect setup at ~16.8s (realistic — engine-limited straights reduce returns).*

### Formula
```
metric = Σ(µ × load) / weight + banking_bonus − drag_penalty − balance_penalty

lapTime = BASELINE_LAP × (baselineMetric / metric)^0.28
```

The baseline metric is computed from **Setup A pyrometer data at 65°F**:
```
Calibration tires:
  LF: I:104 M:102 O:94  → avg 100°F
  RF: I:106 M:113 O:131 → avg 117°F
  LR: I:101 M:102 O:91  → avg  98°F
  RR: I:100 M:117 O:130 → avg 116°F
```

### Figure 8 Baseline
```
BASELINE_LAP_F8 = 23.283s   (20 laps @ 75°F, real-world session)
```
Calibration tires from F8 baseline session (F8_BASELINE_SETUP):
```
  LF: I:133 M:130 O:136 → avg 133°F
  RF: I:125 M:125 O:120 → avg 123.3°F
  LR: I:128 M:129 O:127 → avg 128°F
  RR: I:120 M:121 O:120 → avg 120.3°F
```

---

## 11. Pressure Optimization Math

### Optimal Cold PSI Back-Calculation
```
Step 1: optHotPSI = 30 × (cornerLoad / 950)
Step 2: optColdPSI = optHotPSI × 527.67 / (T_eq + 459.67)
```

**Example: RF at equilibrium 139.6°F:**
```
optHotPSI  = 30 × 1294/950 = 40.9 PSI
optColdPSI = 40.9 × 527.67 / 599.27 = 36.0 PSI cold
```

### PSI Limits
- Floor: 18 PSI hot (safety minimum)
- Ceiling: 51 PSI hot (XL-rated sidewall max)
- If optHotPSI outside [18, 51], clamped and flagged as "pressure-limited"

### F8 PSI Optimization Key Insight
For F8, both LF and RF are outside tires 50% of the time and inside tires 50%. Grip sum:
```
pressureGripSum = grp(HP, load_out) + grp(HP, load_in)

Where grp(HP, load) = 1 − 0.010 × |HP − 30×load/950|

d/dHP[pressureGripSum] in the region [opt_in, opt_out]:
  = 0.010 × (load_out − load_in) > 0  (since load_out > load_in)
```
Therefore grip sum is **maximized at HP = opt_out** (outside corner load), not the average.
F8 PSI should be biased toward the outside-turn load, not the inside or the average.

---

## 12. Camber Optimization Math

### Optimal Static Camber Formula
Rearranging effectiveCamber = staticCamber + casterGain + bodyRollCamber:
```
optStaticCamber = idealEffective − casterGain − bodyRollCamber
```

**Example: RF at caster 5°, body roll 3.5° per G (total stiffness 28):**
```
cornerRoll      = 3.5 × 0.375 = 1.3125°
casterGain      = −(5 × 0.18) = −0.90°
bodyRollCamber  = −(1.3125 × 0.35) = −0.459°
idealEffective  = −4.5°

optStaticCamber = −4.5 − (−0.90) − (−0.459) = −3.14° → rounds to −3.0°
```

**Example: LF at caster 3.5°:**
```
casterGain      = +(3.5 × 0.10) = +0.35°
bodyRollCamber  = +(1.3125 × 0.15) = +0.197°
idealEffective  = 0°

optStaticCamber = 0 − 0.35 − 0.197 = −0.547° → rounds to −0.5°
```

### F8 Symmetric Camber
Both fronts are outside tire 50% of laps → symmetric camber required. Ideal effective −4.5° each.
Optimal symmetric caster = 5.0° each:
```
casterGain     = −(5.0 × 0.18) = −0.90°  (used symmetrically for both)
bodyRollCamber = −(cornerRoll × 0.35)     (same both sides, symmetric)
optStatic      = −4.5 + 0.90 + bodyRollContribution ≈ −3.5°
```

---

## 13. Real-World Calibration Data

### Oval Session Data

#### Setup A — 15 laps @ 65°F
- RF: I:106 M:113 O:131 (avg 117°F)
- RR: I:100 M:117 O:130 (avg 116°F)
- LR: I:101 M:102 O:91  (avg  98°F)
- LF: I:104 M:102 O:94  (avg 100°F)

#### Setup A — 25 laps @ 90°F
- RF: I:125 M:131 O:135 (avg 130°F)
- RR: I:120 M:130 O:137 (avg 129°F)
- LR: I:116 M:113 O:108 (avg 112°F)
- LF: I:114 M:110 O:105 (avg 110°F)

#### Setup B — 25 laps @ 87°F
- RF: I:122 M:126 O:138 (avg 129°F)
- RR: I:118 M:125 O:131 (avg 125°F)
- LR: I:126 M:120 O:112 (avg 119°F)
- LF: I:127 M:108 O:107 (avg 114°F)

#### Setup B — 25 laps @ 90°F
- RF: I:120 M:123 O:132.5 (avg 125°F)
- RR: I:113 M:119 O:126   (avg 119°F)
- LR: I:113 M:114 O:111   (avg 113°F)
- LF: I:120 M:112 O:107   (avg 113°F)

#### Setup B — 25 laps @ 93°F
- RF: I:128 M:132 O:143 (avg 134°F)
- RR: I:121 M:130 O:143 (avg 131°F)
- LR: I:118 M:119 O:112 (avg 116°F)
- LF: I:127 M:121 O:108 (avg 119°F)

#### Setup B — 25 laps @ 95°F
- RF: I:131 M:138 O:153 (avg 141°F)
- RR: I:124 M:132 O:144 (avg 133°F)
- LR: I:126 M:121 O:115 (avg 121°F)
- LF: I:130 M:116 O:108 (avg 118°F)

### Key Patterns Observed
- **RF outside (wall side)** consistently 12–22°F hotter than inside — centrifugal loading dominates
- **LF inside (motor side)** consistently 13–22°F hotter than outside — camber (−1.5°) + toe-out scrub
- **LR nearly flat** (≤3°F spread) — solid axle, no steering scrub
- **RR outside** 13–22°F hotter than inside (same pattern as RF)
- **RF avg temp with Setup B (31 PSI)** runs 5–10°F cooler than Setup A (34 PSI) at same ambient
- **Temperature delta above ambient is approximately constant** across sessions for each corner

### Lap Times
| Session | Best | Notes |
|---|---|---|
| Oval fastest ever | 17.1s | Clean air |
| Oval practice | 17.4s | Calibration baseline |
| Oval race avg | 17.8s | With traffic |
| F8 baseline session | 23.283s | 20 laps @ 75°F, 4th fastest |

---

### Figure 8 Baseline Session (F8_BASELINE_SETUP)
- **20 laps @ 75°F → 23.283s best lap**
- Camber: LF −2.75°, RF −3.0°
- Caster: LF 5.5°, RF 3.75° ← **ASYMMETRIC — root cause of issue**
- Cold PSI: all fronts 35, all rears 30

**Pyrometer:**
- LF: I:133 M:130 O:136 (avg 133°F)
- RF: I:125 M:125 O:120 (avg 123°F)
- LR: I:128 M:129 O:127 (avg 128°F)
- RR: I:120 M:121 O:120 (avg 120°F)

**Root cause of hard right-turn difficulty:**

High LF caster (5.5°) makes LF the heavy-effort tire when it's the *outside* tire in right turns. The aligning torque is proportional to tan(caster). Ratio of effort right vs. left:
```
tan(5.5°) / tan(3.75°) = 0.0963 / 0.0655 = 1.47×
→ Right turns require ~47% more steering effort than left turns
```
Note: This is **separate** from straight-line pull (which goes toward low-caster RF side = rightward). Both effects coexist.

**Fix: Equalize caster both sides (4.0°–5.5° symmetric)**

---

## 14. Figure 8 Differences

| Parameter | Oval | Figure 8 |
|---|---|---|
| Lap length | 1/4 mile | ~1/3 mile (estimate) |
| Baseline lap | 17.4s | 23.283s |
| Corner G | 0.375G | 0.28G |
| Corner direction | Left only | Alternating L/R |
| Optimal camber | RF −3°, LF −0.5° (asymmetric) | Both −3.5° (symmetric) |
| Optimal caster | RF 5°, LF 3° (asymmetric) | Both 5.0° (symmetric) |
| Heat multiplier | 1.0× | **1.18×** (tighter + bidirectional scrub) |
| Shock sensitivity | LLTD matters significantly | LLTD effect averaged out (L+R) |
| PSI optimization | Toward LF-low / RF-high | Toward outside-corner load |

**F8 Thermal Insight:** Because the car turns left and right equally, work factors average to static loads (L+R cancel). Equilibrium temperatures are therefore **shock-independent** for F8. All 323 shock configs produce the same T_eq:
```
T_eq_front ≈ 125.0°F   (at 75°F ambient)
T_eq_rear  ≈ 121.6°F
```

---

## 15. All Setup Presets

### Setup A (Original Calibration)
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Camber | −1.5° | −3.0° | — | — |
| Caster | 3.5° | 5.0° | — | — |
| Toe | −0.25" (toe out) | | | |
| Cold PSI | 19.5 | 34 | 18.5 | 36 |

### Setup B (2026 Season Multi-Session)
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Camber | −1.5° | −3.0° | — | — |
| Caster | 3.5° | **8.0°** | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 20 | 31 | 15 | 33 |

### Pete Setup
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Camber | −2.25° | −2.75° | — | — |
| Caster | 3.5° | 8.0° | — | — |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Dylan Setup
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Camber | −2.0° | −2.75° | — | — |
| Caster | 4.0° | 3.25° | — | — |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Josh Setup
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 4 | 4 | 2 | 2 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −0.75° | −1.75° | — | — |
| Caster | 5.0° | 7.0° | — | — |
| Cold PSI | 24 | 35 | 17.5 | 32 |

### Bilstein B6 Setup
**Parts:** Front Bilstein B6 24-184731 (shock insert only, keeps 475 lbs/in OE spring) + rear Bilstein B6 24-184755 (shock insert, keeps 160 lbs/in rear spring). Rating ~5 (firmer/monotube vs FCS rating 4).
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 5 | 5 | 3 | 3 |
| Springs | 475 lbs/in front | | 160 lbs/in rear | |
| Camber | −0.75° | −3.0° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Cold PSI | 26 | 33 | 17 | 34 |

### Aldan 550 Setup
**Parts:** Aldan American 300183 (550 lbs/in front coilover, 0–2" adjustable) + Aldan adjustable rear shocks + stock 160 lbs/in rear springs. 15.8% stiffer front than stock → less body roll → optimal camber shifts slightly more negative.
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 5 | 5 | 3 | 3 |
| Springs | **550 lbs/in** front | | 160 lbs/in rear | |
| Camber | −1.0° | −3.25° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Cold PSI | 26 | 33 | 17 | 34 |

### Aldan 750 Setup
**Parts:** Aldan American 300185 (750 lbs/in front coilover, 0–2" adjustable) + Aldan adjustable rear shocks + stock 160 lbs/in rear springs. 57.9% stiffer front than stock → significantly reduced body roll → optimal static camber more negative to compensate for reduced dynamic gain.
| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 5 | 5 | 3 | 3 |
| Springs | **750 lbs/in** front | | 160 lbs/in rear | |
| Camber | −1.5° | −3.5° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Cold PSI | 26 | 33 | 17 | 34 |

---

## 16. Optimizer Results

### Oval Grid Search
- **Combinations tested:** 180,880 (all shock pairs × caster × analytical camber × analytical PSI × toe)
- **Best lap:** 17.196s @ 90°F
- **Improvement over baseline:** +0.204s

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 8 (Monroe 171346) | 6 (KYB SR4140) | 1 (Monroe 550018 Severe) | 1 |
| Camber | −0.5° | −3.0° | — | — |
| Caster | 3.0° | 5.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 26 | 32.5 | 16.5 | 33.5 |

Key logic: Soft front + stiff rear pushes LLTD → 0.25, biasing rear roll resistance. Analytical PSI derived at OVAL_CORNER_G. Analytical camber: LF optimal static ≈ −0.5°, RF ≈ −3.0°.

### Figure 8 Grid Search
- **Combinations tested:** 34,884 (323 shock pairs × 12 symmetric camber × 9 symmetric caster)
- **Best lap:** 23.152s @ 75°F
- **Improvement over baseline:** +0.131s (from 23.283s)

| Parameter | LF | RF | LR | RR |
|---|---|---|---|---|
| Shocks | 1 (stiffest) | 1 | 1 | 1 |
| Camber | −3.5° | −3.5° | — | — |
| Caster | 5.0° | 5.0° | — | — |
| Toe | −0.25" | | | |
| Cold PSI | 35 | 35 | 30 | 30 |

Key logic: All-stiff shocks maximize tire loads (more lateral resistance), symmetric −3.5° camber matches ideal effective at F8 corner G, symmetric 5.0° caster gives equal left/right steering effort and optimal RF caster gain.
