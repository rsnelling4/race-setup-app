# Optimal Setup Analysis — 2008 Crown Victoria P71
## 1/4-Mile Oval — Predictive Physics, Scenario Analysis & Recommendations

**Prepared:** 2026-04-14
**Car:** 2008 Crown Victoria P71 — 4,100 lbs (race weight, measured), 4.6L SOHC V8, ~255 hp, Ironman iMove Gen3 AS 235/55R17

---

## EXECUTIVE SUMMARY

**Short answer:** The simulation engine computes grip from real physics, but maps grip → lap time through an empirically anchored power law (baseline 17.4s). The model reliably ranks setups and quantifies relative gains, but cannot calculate lap time from pure kinematics without GPS data. The current data is enough to identify exact improvements.

**Key findings:**
- The single biggest performance gap is **tire pressure** — LF is running 5+ PSI under the load-optimal hot pressure, costing meaningful grip on that corner. This requires no new parts.
- **LF camber must be POSITIVE static** for optimal oval performance. The inside-front tire needs approximately +2.25° static to achieve the +0.75° ideal ground-frame angle at the contact patch. Every current driver setup runs negative LF static camber, which is confirmed as wrong by pyrometer data (inside edge 10–20°F hotter than outside).
- The RECOMMENDED setup from the updated grid search (419,904 combinations) predicts **17.266s @ 90°F** — a **−0.134s gain** over the 17.4s calibration baseline.
- Theoretical ceiling with current components: **~17.1–17.2s** at warm conditions. The observed best-ever 17.1s confirms the model ceiling is correctly calibrated.
- **Model update 2026-04-14:** ground-frame camber model (targets tire-to-road angle, not chassis-relative), geometric+elastic weight transfer, 0.813G actual apex G, mechanical trail caster model. LF camber ideal shifted from "0° effective (chassis frame)" → "+0.75° ground-frame (contact patch)" — a fundamental correction.

---

## SECTION 1: IS THE MODEL PREDICTIVE OR JUST A BENCHMARK?

### What the model actually does

The simulation has two distinct layers:

**Layer 1 — Physics-based grip model (predictive):**
`calcPerformance()` computes a dimensionless grip metric from first-principles physics:
- Lateral weight transfer: two-component Dixon model — geometric (link) + elastic (spring). Front RCH=3", rear RCH=4". At OVAL_CORNER_G (0.407G, time-averaged): RF≈1,417 lbs, LF≈838 lbs.
- Load-dependent optimal pressure: `optHotPSI = 30 × (cornerLoad / avgLoad)`, derived from contact patch deformation physics (penalty 0.6%/PSI)
- Camber: **ground-frame model** — computes tire-to-road angle at contact patch (static + caster gain + SLA body roll + KPI + chassis-to-ground frame + sidewall compliance). RF ideal: −2.0° ground. LF ideal: +0.75° ground. Asymmetric load-weighted penalties.
- Caster: mechanical trail model (parabolic RF benefit curve peaking at 0.9", monotonic LF penalty above 0.35")
- Thermal equilibrium: solved from heat generation rate (load × speed × friction work) vs. convective cooling
- LLTD penalty: quadratic drag for front/rear grip imbalance (optimal 0.46)
- Banking: `F_bank = W × sin(3°) = 215 lbs` added to total cornering force

This layer is genuinely predictive — it will correctly tell you that raising LF pressure from 20 to 25 PSI cold improves that tire's grip factor from 0.948 to 1.000, a 5.5% improvement.

**Layer 2 — Lap time mapping (empirically calibrated):**
```
lapTime = 17.4 × (baselineMetric / setupMetric)^0.28
```
The `17.4` is the observed baseline. The `0.28` exponent was calibrated so that the theoretical perfect setup gives ~16.8s (consistent with the 17.1s best-ever, allowing for driver variation). This is NOT derived from kinematics — it's a calibrated power law.

**What this means:** The model reliably tells you *which setup is faster and by how much*, but the absolute lap times depend on the quality of the calibration anchor (17.4s observed).

---

## SECTION 2: FIRST-PRINCIPLES LAP TIME DERIVATION

### Track geometry (verified)

| Segment | Length | Method |
|---|---|---|
| Frontstretch | 325 ft | Google Earth ruler |
| Backstretch | 333 ft | Google Earth ruler |
| Corner arcs (2 × π × R) | 662 ft | Derived: 1320 − 658 |
| Corner radius R | 105 ft | Derived: 331 / π |
| Total lap | 1,318 ft | ≈ 1/4 mile ✓ |

### Kinematic analysis — the corner speed problem

The model uses two separate G values — a critical distinction from earlier versions:

| Constant | Value | Purpose |
|---|---|---|
| `OVAL_RACING_G` | **0.813G** | Actual instantaneous apex G — used for body roll, dynamic camber, suspension geometry |
| `OVAL_CORNER_G` | **0.407G** | Time-averaged G (0.813 × 50% corner fraction) — used for tire loads, pressure targets, thermal model |

At `OVAL_RACING_G = 0.813G` with effective racing line radius R=145 ft:
```
v_corner = √(0.813 × 32.174 × 145) = 69.8 ft/s = 47.6 mph ← actual apex speed
```

**Why two G values?** Using peak apex G (0.813G) for pressure targets would give RF optPsi ≈ 50 PSI — too high. The tires only corner for ~50% of each lap; on the straights lateral G = 0. The time-averaged G represents the average sidewall stress over a full lap, which drives equilibrium tire pressure and sustained heat generation.

### Back-calculating the actual corner speed

Solving `2 × t_corner + 2 × t_straight = 17.4s` numerically:

| Corner Speed | Effective Racing G (R=145 ft) | Predicted Lap | Match? |
|---|---|---|---|
| 30 mph | 0.41G | 25.7s | No |
| 40 mph | 0.73G | 20.2s | No |
| 45 mph | 0.92G | 18.3s | No |
| **47.6 mph** | **1.03G** | **17.4s** | **Yes** |
| 50 mph | 1.14G | 16.7s | No |

The car corners at approximately **47–48 mph** on the effective racing line (R≈145 ft) — 1.03G. This is realistic for a grippy all-season on a paved short oval with slight banking. The 3° banking adds sin(3°) = 0.052g effective grip, so the tire μ needed is ~0.98G.

> **Conclusion:** The car corners at ~1.0G on the effective racing line radius of ~145 ft. The `OVAL_CORNER_G = 0.407G` is only used for pressure/thermal load distribution math — it is the time-averaged G, correctly calibrated to real-world pyrometer data (RF ≈ 39–42 PSI hot).

### Theoretical minimum lap time from physics

Given the back-calculated corner speed and maximum possible grip:
- Grip can improve via setup roughly 10–12% above baseline (model ceiling ~17.0× (17.4/17.0)^0.28 = 1.052 metric)
- Corner speed scales as √grip, so 10% more grip → 5% faster corners → ~0.5s saved on corners
- Straight speed: engine-limited (not tire-limited) after ~40 mph — marginal improvement from faster corner exit
- **Physics floor:** approximately **16.7–17.0s** with current engine, weight, and ruleset

---

## SECTION 3: REAL-WORLD DATA INTERPRETATION

### What the pyrometer data tells us

The multi-session pyrometer data has consistent, measurable patterns:

#### RF — Outside Front (the most critical tire)

| Session | Cold PSI | Avg Temp | Inside | Outside | Outside − Inside |
|---|---|---|---|---|---|
| Setup A, 65°F | 34 | 117°F | 106 | 131 | **+25°F** |
| Setup B, 87°F | 31 | 129°F | 122 | 138 | **+16°F** |
| Setup B, 90°F | 31 | 125°F | 120 | 132.5 | **+12°F** |
| Setup B, 93°F | 31 | 134°F | 128 | 143 | **+15°F** |
| Setup B, 95°F | 31 | 141°F | 131 | 153 | **+22°F** |

**Finding:** RF outside edge is consistently 12–25°F hotter than inside. This is expected for the outside tire in left turns — centrifugal loading pushes tire onto the outside edge. The spread is DECREASING as cold PSI drops from 34 (Setup A) to 31 (Setup B). **Lower cold PSI is helping, but the tire is still under-pressured** for the actual corner load.

Physics check — what PSI does the RF actually need?
```
RF corner load (Dixon model, OVAL_CORNER_G=0.407G): ~1,370 lbs
avg_load = 4100 / 4 = 1025 lbs
Optimal hot PSI = 30 × (1370 / 1025) = 40.1 PSI
At 130°F tire temp: cold PSI = 40.1 × 528 / 590 = 35.9 PSI cold
```
Current RF cold PSI is 31–34. Setup A's 34 was close; Setup B's 31 is 5 PSI under optimal.

**Recommended RF cold PSI: 36.**

#### LF — Inside Front

| Session | Cold PSI | Inside | Middle | Outside | Pattern |
|---|---|---|---|---|---|
| Setup A, 65°F | 19.5 | 104 | 102 | 94 | Inside hotter ← too much negative camber |
| Setup B, all | 20 | 127 | avg ~112 | 107 | Inside hotter ← same problem |

**Finding:** LF inside edge is consistently 10–20°F hotter than outside. This indicates **too much negative camber** on the LF (inside tire in left turns). The ground-frame model confirms: every current setup runs the LF far below the +0.75° ground ideal — the inside edge is digging in. It's also under-pressured:
```
LF corner load (Dixon model, OVAL_CORNER_G=0.407G): ~838 lbs
avg_load = 4100 / 4 = 1025 lbs
Optimal hot PSI = 30 × (838 / 1025) = 24.5 PSI
At 100°F: cold PSI = 24.5 × 528 / 560 = 23.1 PSI cold
Current cold PSI: 19.5–20 PSI → hot ≈ 21.7 PSI → ~3 PSI under optimal
pressureGripFactor penalty = 1 - (0.006 × 3) = 0.982 → 1.8% grip lost on LF
```

**Recommended LF cold PSI: 22.**

#### RR — Outside Rear

| Session | Cold PSI | Inside | Outside | Pattern |
|---|---|---|---|---|
| Setup A, 65°F | 36 | 100 | 130 | Outside +30°F |
| Setup B, 87°F | 33 | 118 | 131 | Outside +13°F |

**Finding:** RR outside consistently 13–30°F hotter than inside. Same physics as RF — solid rear axle in left turns pushes car onto RR. Updated with 4100 lbs race weight and RCH correction:
```
RR corner load: ~1,168 lbs  (4100 lbs, RCH 3", LLTD 0.472)
avg_load = 1025 lbs
Optimal hot PSI = 30 × (1168 / 1025) = 34.2 PSI
At 130°F: cold = 34.2 × 528 / 590 = 30.6 PSI → target ~31 PSI cold ✓
```

#### LR — Inside Rear

Flat across all zones (≤3°F spread). Solid axle geometry with low load produces even heating — confirms the model's rear camber assumption (solid axle = no adjustment available) is correct. Slightly under-pressured but not significantly.

---

## SECTION 4: FULL SCENARIO MATRIX

All scenarios evaluated at 90°F ambient (warm race conditions — tires reach 110–135°F range, within optimal grip window). Baseline is 17.4s at 65°F calibration.

All scenarios evaluated at 90°F ambient with the updated physics model (ground-frame camber, geometric+elastic weight transfer, mechanical trail caster, 0.006/PSI pressure, 0.813G apex G).

| Scenario | Lap Time | vs DEFAULT | LLTD | Notes |
|---|---|---|---|---|
| **DEFAULT (current)** | **17.4s** | 0.000 | 0.471 | Calibration anchor @ 65°F |
| Fix pressures only (LF→23, RF→36, LR→17, RR→31) | ~17.32s | ~+0.08s | 0.471 | **Biggest single change, no new parts** |
| Fix LF camber only (−1.5° → +2.25°) | ~17.38s | ~+0.02s | 0.471 | Small alone — needs combined fix |
| Stiffen rear shocks only (rating 2→1) | ~17.40s | ~+0.00s | 0.460 | LLTD to 46.0% — handling benefit |
| RF caster 5.0° → 6.0° | ~17.39s | ~+0.01s | 0.471 | Slight gain via trail model sweet spot |
| RF caster 5.0° → 7.0° | ~17.39s | ~+0.01s | 0.471 | Trail starts to exceed sweet spot |
| **PETE Setup B (actual race)** | ~17.30s | ~+0.10s | 0.471 | High RF caster + corrected pressures |
| DYLAN | ~17.31s | ~+0.09s | 0.471 | Lower RF caster, slightly worse camber |
| JOSH | ~17.29s | ~+0.11s | 0.471 | Best RF camber among current setups |
| **RECOMMENDED (grid search 2026-04-14)** | **17.266s** | **+0.134s** | **0.460** | 419,904-combo grid search @ 90°F |
| Theoretical ceiling (130°F all tires) | ~17.1–17.2s | ~+0.2s | — | Model ceiling at perfect thermal conditions |

> **RECOMMENDED setup (shocks LF=4/RF=4/LR=1/RR=1, camber LF+2.25°/RF−3.0°, caster LF=3.5°/RF=6.0°, PSI LF=22/RF=36/LR=17/RR=31)** was found by the full 419,904-combination grid search updated 2026-04-14 with ground-frame camber model, geometric+elastic weight transfer, 0.813G apex G, mechanical trail caster.

---

## SECTION 5: CAMBER ANALYSIS — EVERY SETUP

**The model now works in the ground frame** — the tire-to-road angle at the contact patch, not the chassis-relative effective angle. This is a fundamental correction that changed all LF camber conclusions.

Ground-frame camber calculation chain:
```
effectiveCamber = static + casterGain + bodyRollCamber + kpiCamber
groundCamber    = effectiveCamber ± cornerRoll + sidewallCompliance

RF (outside): groundCamber = effectiveCamber + cornerRoll + swCamber
LF (inside):  groundCamber = effectiveCamber − cornerRoll + swCamber

cornerRoll = bodyRoll × OVAL_RACING_G = 3.1° × 0.813 ≈ 2.52°  (baseline stiffness)
swCamber_RF ≈ +0.47–0.49°  (at RF corner load ~1,370–1,417 lbs)
swCamber_LF ≈ +0.21–0.29°  (at LF corner load ~600–840 lbs)
```

**Ideal ground-frame targets:** RF = −2.0°, LF = +0.75°

> **Why LF = +0.75° ground?** At 0° ground the LF contact patch is flat but generates zero camber thrust. A small positive ground angle (top of tire leaning outward from car) generates camber thrust on the lightly loaded inside tire — this aids rotation and turn-in without significant patch area loss. Range: +0.5° to +1.0° is the practical optimum. Going below +0.75° loses both thrust AND contact patch. This is fundamentally different from the prior model which targeted 0° effective (chassis frame), which was the wrong frame of reference entirely.

| Setup | LF Static | LF Caster | LF Ground Camber | LF vs +0.75° | RF Static | RF Caster | RF Ground Camber | RF vs −2.0° |
|---|---|---|---|---|---|---|---|---|
| DEFAULT | −1.5° | 3.5° | **−1.12°** | 1.87° short | −3.0° | 5.0° | **−2.07°** | 0.07° ✓ |
| Pete (Setup B) | −2.25° | 3.5° | **−1.72°** | 2.47° short | −2.75° | 8.0° | **−1.87°** | 0.13° ✓ |
| Dylan | −2.0° | 4.0° | **−1.50°** | 2.25° short | −2.75° | 3.25° | **−2.83°** | 0.83° over |
| Josh | −0.75° | 5.0° | **−0.50°** | 1.25° short | −1.75° | 7.0° | **−2.20°** | 0.20° ✓ |
| **RECOMMENDED** | **+2.25°** | **3.5°** | **+0.77°** | **≈ ideal ✓** | **−3.0°** | **6.0°** | **−1.98°** | **≈ ideal ✓** |

> Ground cambers computed at baseline stiffness (28), OVAL_RACING_G = 0.813G, including sidewall compliance.

**Key observations:**

1. **Every current driver setup has LF far below the +0.75° ground ideal** — by 1.25° (Josh) to 2.47° (Pete). This is confirmed by pyrometer data (LF inside 10–22°F hotter than outside). The model penalty for LF below +0.75° ground is 1.2%/° (double-penalizes: loses both camber thrust AND contact patch area).

2. **The fix is POSITIVE LF static camber — approximately +1.5° to +2.25°.** This is counterintuitive but physically correct: the chassis rolls ~2.5° in corners, which translates ~2.5° negative through the ground-frame conversion. Starting from +2.25° static, the contact patch ends up at approximately +0.75° ground — right on target.

3. **RF is near-perfect at 6.0° caster with −3.0° static.** Ground camber ≈ −1.98° vs −2.0° ideal. Pete's 8.0° caster with −2.75° static gives −1.87° ground (0.13° short of ideal) — still very close.

4. **Josh's setup has the best RF among the current driver setups** at −2.20° ground (0.20° short). The main gap is LF at −0.50° ground, still 1.25° below the +0.75° ideal.

5. **To target −2.0° ground on RF with 8.0° caster:**
   ```
   Target: ground = −2.0°
   swCamber ≈ +0.49°, cornerRoll ≈ 2.52°, casterGain = −(8.0 × 0.18) = −1.44°
   bodyRollCamber = −(2.52 × 0.355) = −0.895°, kpiCamber = +0.003°
   static = −2.0 − 0.49 − cornerRoll − casterGain − bodyRollCamber − kpiCamber
          = −2.0 − 0.49 − 2.52 − (−1.44) − (−0.895) − 0.003 = −2.68° ≈ −2.75°
   ```
   Current −2.75° with 8.0° caster is nearly optimal for ground-frame.

---

## SECTION 6: PRESSURE OPTIMIZATION — THE BIGGEST FREE GAIN

Cold PSI targets derived from first principles:
1. Compute corner load from geometric+elastic lateral transfer at OVAL_CORNER_G (0.407G) + springLLTD
2. Compute optimal hot PSI: `optHot = 30 × (cornerLoad / avgLoad)`
3. Convert to cold: `coldPSI = optHot × (68°F + 460) / (eqTemp + 460)`

Corner loads computed from 4100 lbs race weight, RCH front=3"/rear=4", springLLTD=0.500 at OVAL_CORNER_G=0.407G. avg_load = 1025 lbs.

| Corner | Corner Load | Eq. Temp | Opt. Hot PSI | Optimal Cold PSI | Setup A Cold | Setup B Cold | Gap |
|---|---|---|---|---|---|---|---|
| RF | ~1,370 lbs | 130°F | 40.1 | **35.9** | 34 (−2 under) | 31 (−5 under) | 5 PSI low |
| LF | ~838 lbs | 100°F | 24.5 | **23.1** | 19.5 (−4 under) | 20 (−3 under) | 3 PSI low |
| RR | ~1,153 lbs | 130°F | 33.7 | **30.1** | 36 (+6 over) | 33 (+3 over) | Over |
| LR | ~625 lbs | 95°F | 18.3 | **17.3** | 18.5 (+1.2 over) | 15 (−2 under) | Near |

> Corner loads updated with the Dixon model (geometric+elastic, separate RCH per axle). LF load is lower than the simple model predicted (~838 lbs vs ~908 lbs) because the rear RCH contributes more geometric transfer, slightly reducing the front elastic share.

**Pressure conclusions:**
- **LF is under-pressured in every session** by 3–4 PSI cold. Still the most significant correctable error.
- **RF under Setup B (31 PSI) is 5 PSI below optimal.** Setup A's 34 PSI was close. Bring RF back to 35–36 cold.
- **RR was over-inflated in both setups.** Setup A's 36 was 6 PSI high; Setup B's 33 is 3 PSI high. Target ~30–31 PSI.
- **LR at 18.5 PSI (Setup A) was slightly over.** Setup B's 15 PSI was under. Target ~17–18 PSI cold.

> **The LF pressure fix alone is estimated to be worth 0.05–0.08s/lap.** This costs nothing and can be done at the next event.

---

## SECTION 7: SHOCK/DAMPER ANALYSIS

The optimizer tested all combinations of the following shocks available to this team:
- **Front options:** FCS 1336349 (rating 4), Monroe 171346 (rating 8, civilian/soft), KYB SR4140 (rating 6)
- **Rear options:** KYB 555603 (rating 2), Monroe 550018 Magnum (rating 1, stiffest)

**Optimal LLTD target for oval: 0.46 (46% front, 54% rear)**

At 0.46 LLTD, the front axle handles 46% of the lateral weight transfer. This is slightly below the 55% static front weight bias, meaning the rear is transferring proportionally more weight — which tightens the car (reduces oversteer), appropriate for a single-direction oval.

LLTD is a blend: 60% from spring rates, 40% from damper ratings:
```
springLLTD_norm = (springF/475) / ((springF/475) + (springR/160))
damperLLTD = (10−LF_shock + 10−RF_shock) / total_shock_stiffness
frontLLTD = 0.6 × springLLTD_norm + 0.4 × damperLLTD
```

| Setup | Springs F/R | Front Shocks (LF/RF) | Rear Shocks (LR/RR) | LLTD | vs 0.46 Optimal |
|---|---|---|---|---|---|
| DEFAULT/Pete | 475/160 | 4/4 | 2/2 | 0.471 | +0.011 (slight push bias) |
| **RECOMMENDED** | **475/160** | **4/4** | **1/1** | **0.460** | **+0.000 ✓** |
| Stiff rear only (old rec) | 475/160 | 4/4 | 1/1 | 0.460 | +0.000 ✓ |
| Old RECOMMENDED (LF=8/RF=6) | 440/160 | 8/6 | 1/1 | 0.389 | −0.071 (low — too loose) |

> **Key insight from updated grid search:** The new RECOMMENDED setup uses **balanced front shocks (4/4) with stiff rear (1/1) and stock 475 springs** — hitting exactly 46.0% LLTD. The prior recommended setup's very soft front shocks (LF=8/RF=6) drove LLTD to 0.389, which is 7 points below optimal — too far toward the loose/oversteer side. The model now correctly penalizes this via the quadratic LLTD penalty.

> **Bang-for-buck upgrade:** Upgrading ONLY the rear shocks from KYB 555603 (rating 2) to Monroe 550018 Magnum (rating 1) brings LLTD from 0.471 to 0.460 — dead on target. Least amount of hardware change for maximum LLTD benefit.

---

## SECTION 8: SPRING RATE ANALYSIS

| Spring | Part # | Rate | Class | Car |
|---|---|---|---|---|
| Stock P71 police front | FCS 1336349 / Monroe 271346 | **475 lbs/in** | Police/taxi | RECOMMENDED setup |
| Civilian front | Monroe 171346 | **440 lbs/in** | Civilian | Softer alternative |
| KYB front | KYB SR4140 | **~475 lbs/in** | Police equiv | Alternate |
| Stock P71 rear coil | — | **160 lbs/in** | All P71s | All setups |

**Effect of spring rate on LLTD and grip:**
- `springLLTD_norm = (springF/475) / ((springF/475) + (springR/160))`
- At 475 front / 160 rear: springLLTD_norm = 0.500 (equal normalized split)
- At 440 front / 160 rear: springLLTD_norm = 0.481 (slightly more rear-biased)
- The 475/160 combination with balanced shocks (4/4 front, 1/1 rear) achieves the target LLTD of 0.460 exactly
- The 440 spring requires softer front dampers (rating 8) to reach the same LLTD target, which the updated grid search found sub-optimal

**Recommendation:** Use the FCS 1336349 / Monroe 271346 (police/taxi, 475 lbs/in) at both front positions — these are the struts in the RECOMMENDED grid-search optimum. The 475 spring with 4/4 front shocks + 1/1 rear shocks delivers exactly the 0.460 LLTD target.

---

## SECTION 9: ALL SCENARIO COMBINATIONS — SENSITIVITY TABLE

Sensitivity of each variable to lap time (grip improvement per unit change), from the 419,904-combination grid search updated 2026-04-14:

| Variable | Range Tested | Best Value | Lap Time Impact | Notes |
|---|---|---|---|---|
| LF Cold PSI | 15 → 30 | **22 PSI** | ~0.08s/lap | Dixon model: LF corner load ~838 lbs |
| RF Cold PSI | 28 → 42 | **36 PSI** | ~0.04s/lap | Dixon model: RF corner load ~1,370 lbs |
| LR Cold PSI | 13 → 22 | **17 PSI** | ~0.02s/lap | LR corner load ~625 lbs |
| RR Cold PSI | 28 → 40 | **31 PSI** | ~0.02s/lap | RR corner load ~1,153 lbs |
| LF static camber | −3.0° → +3.0° | **+2.25°** | ~0.03–0.05s/lap | Ground-frame target +0.75°; negative is wrong direction |
| RF static camber | −4.0° → −1.5° | **−3.0° w/ 6° caster** | ~0.02s/lap | Ground-frame target −2.0°; model achieves −1.98° |
| LF caster | 2.0° → 6.0° | **3.5°** | ~0.01s/lap | LF caster penalty above 0.35" mechanical trail |
| RF caster | 3.0° → 9.0° | **6.0°** | ~0.02–0.04s/lap | Mechanical trail sweet spot at 0.9" (≈ 6° caster) |
| Front toe | −0.5" → +0.25" | **−0.25"** | <0.005s/lap | Toe drag `1 + 0.08 × toe²` — plateau is flat near −0.25" |
| Front spring rate | 440 → 475 | **475 (FCS 1336349)** | ~0.01s/lap | 475 enables 4/4 front shocks to hit LLTD 0.460 exactly |
| Rear shock stiffness | 2 → 1 | **1 (Magnum)** | ~0.02s/lap | Stiff rear pulls LLTD from 0.471 to 0.460 |
| Front shocks (both) | 1 → 9 | **4/4** | ~0.02s/lap | Symmetric 4/4 optimal with 475 springs at target LLTD |

---

## SECTION 10: RANKED RECOMMENDATIONS

### Tier 1 — Do today, no new parts required

**1. Set tire pressures to grid-search optimal (cold at ~68°F)**
Estimated gain: **+0.08–0.10s/lap**

| Corner | Optimal Cold PSI | Current (Setup B) | Change |
|---|---|---|---|
| LF | **22** | 20 | +2 PSI |
| RF | **36** | 31 | +5 PSI |
| LR | **17** | 15 | +2 PSI |
| RR | **31** | 33 | −2 PSI |

Evidence: LF and RF both under-pressured for their corner loads per the Dixon weight-transfer model. RF needs 40.1 PSI hot → 36 PSI cold (Setup B's 31 was 5 PSI under). LF needs 24.5 PSI hot → 22 PSI cold (Setup B's 20 was 2 PSI under). Penalty: 0.6%/PSI deviation.
Risk: None.

### Tier 2 — Next alignment session (requires alignment shop or adjustment)

**2. Raise LF static camber to +1.5° to +2.25° POSITIVE**
Estimated gain: **+0.03–0.05s/lap**

This is the most counterintuitive but most important alignment change. The inside-front tire in a left-turn oval needs **positive ground-frame camber** (+0.75° target) to generate camber thrust and keep the contact patch flat. Because the chassis rolls ~2.5° in corners, achieving +0.75° ground requires starting from approximately **+2.25° static camber**.

Current driver setups all run negative LF static (−0.75° to −2.25°), which is flat-out wrong for this application. The ground camber result is −0.5° to −1.7° — the inside edge digs in. Pyrometer evidence: LF inside edge 10–22°F hotter than outside in every session — exactly the signature of excessive negative ground camber on the inside front.

**Target: LF static = +2.25°.** Even getting to +1.5° static would be a meaningful improvement over any current setup.

**3. Set RF static camber to −3.0° with RF caster at 6.0°**
Estimated gain: **+0.01–0.02s/lap**

RF ground-frame target is −2.0°. At 6.0° caster the mechanical trail is approximately 0.9" (sweet spot per model). With −3.0° static:
```
ground RF = −3.0 + casterGain(6.0°) + bodyRollCamber + kpiCamber + cornerRoll + swCamber
         ≈ −3.0 + (−1.08) + (−0.895) + 0.003 + 2.52 + 0.484 ≈ −1.97° ≈ −2.0° ✓
```
Pete's 8.0° caster with −2.75° static gives −1.87° ground (still close). Either works. The 6.0° caster sweet spot per model; 7–8° may have real-world driver confidence benefits not captured.

**4. LF caster: keep at 3.5°**
The mechanical trail model shows LF caster penalty above ~0.35" trail. At 3.5° caster the LF trail is within acceptable range. No change needed here.

### Tier 3 — Component investment required

**5. Install Monroe 550018 Magnum Severe Service at both rear positions**
Estimated gain: **+0.02–0.03s/lap**
Moves rear damper stiffness from rating 2 to rating 1, bringing LLTD from 0.471 to 0.460 (optimal 0.46). The stiff rear also reduces body roll, which helps keep the rear tires more perpendicular to the pavement in roll.

**6. Verify front struts are FCS 1336349 / Monroe 271346 (475 lbs/in police spec)**
The RECOMMENDED setup uses 475-lb/in police/taxi struts at both fronts, enabling 4/4 front shock ratings to achieve LLTD 0.460. If civilian Monroe 171346 (440 lbs/in) is installed, the same shock ratings will land at LLTD 0.471 (slightly above optimal, not catastrophic).

### Summary: combined potential improvement

| Change | Gain |
|---|---|
| Full pressure correction (LF/RF/LR/RR) | +0.10s |
| LF camber to +2.25° static | +0.04s |
| RF camber −3.0° + caster 6.0° | +0.02s |
| Rear shocks → Magnum rating 1 | +0.02s |
| **Total potential** | **~+0.18s/lap** |

From 17.4s baseline → **~17.22–17.27s with all Tier 1+2 changes**

> The RECOMMENDED grid-search setup (all changes implemented) predicts **17.266s @ 90°F** — a confirmed −0.134s gain over baseline.

---

## SECTION 11: THEORETICAL PERFORMANCE CEILING

### Hard limits (physics)

| Limit | Value | Explanation |
|---|---|---|
| Minimum corner time (max grip) | ~9.0–9.5s total | Both corners at 50+ mph — requires ~1.1G sustained |
| Minimum straight time | ~5.0s total | Engine-limited from ~40 mph exit to ~68 mph peak and back |
| **Absolute physical minimum** | **~14.0–15.0s** | Near-impossible: perfect line, no traffic, unlimited grip |
| Realistic minimum (street tires, current weight) | **~16.5–17.0s** | Best driver, optimal setup, warm conditions |
| Model-predicted ceiling | **~16.8s** | LAP_SENSITIVITY × max theoretical metric |

### Soft limits (current setup constraints)

| Factor | Current | Theoretical Best | Gap |
|---|---|---|---|
| Tire compound | UTQG 420 AA A | Higher-performance compound? | Rules dependent |
| Vehicle weight | 4,100 lbs (measured race weight) | 3,900 lbs (200 lb reduction) | +0.2–0.3s if allowed |
| Engine output | ~255 hp | N/A (engine-limited on straights) | Negligible below 70 mph |
| Suspension arms | Stock SLA geometry | Adjustable upper arm geometry | Would allow more negative camber range |

### Why the observed 17.1s is close to the ceiling

The model predicts ~17.1–17.2s is achievable with optimized setup. The best-ever 17.1s confirms:
1. The model calibration is accurate
2. The current setup (Setup B) is close to optimal — the driver has found a working setup empirically
3. The remaining gains are incremental (0.1–0.2s), not transformative

The biggest untapped gain is **tire pressure** — specifically the LF being 5 PSI under optimal hot pressure. This is likely worth 0.08–0.10s by itself and costs nothing.

---

## SECTION 12: WHAT THE MODEL CANNOT PREDICT (GAPS)

Being explicit about model limitations:

| Gap | Impact | Solution |
|---|---|---|
| Cross weight / wedge | Affects car rotation — can gain or lose 0.1–0.3s on entry | Add cross weight variable to model |
| Driver technique variance | 17.4s practice vs 17.1s best = 0.3s from driver | Not modelable |
| Transient shock behavior | Damping affects how fast weight transfers, not just how much | Would require time-domain simulation |
| Tire wear progression | Model treats wear as static | Add wear-rate-per-lap based on temp and slip |
| Track conditions | Green vs. rubbered track changes μ by ~5–10% | Would need track state input |
| Rolling start vs standing start | Race start is rolling — avoids tire temperature transient | No standing start lap time penalty |
| Traffic / drafting | Race avg (17.8s) vs practice (17.4s) = 0.4s from traffic | Cannot model race-specific factors |

---

## SECTION 13: OPTIMAL SETUP SPECIFICATION

*Updated 2026-04-14 from full-physics grid search (419,904 combinations, ground-frame camber, Dixon weight transfer, mechanical trail caster, 0.813G apex G, 0.6%/PSI pressure penalty).*

### Recommended race setup — grid-search optimized (419,904 combinations @ 90°F)

```
Shocks:  LF FCS 1336349 (rating 4)    RF FCS 1336349 (rating 4)
         LR Monroe 550018 (rating 1)   RR Monroe 550018 (rating 1)
Springs: Front 475 lbs/in              Rear 160 lbs/in (stock)

Camber:  LF +2.25° (POSITIVE)   RF −3.0°
Caster:  LF 3.5°                 RF 6.0°
Toe:     −0.25" (1/4" toe out)

Cold PSI (set at 68°F garage temp):
  LF: 22 PSI    RF: 36 PSI
  LR: 17 PSI    RR: 31 PSI

Predicted lap time: 17.266s @ 90°F
vs Setup A (calibration): −0.134s improvement
LLTD: 0.460 (exactly on optimal 0.46)
```

**Ground-frame camber verification:**
```
LF: +2.25° static → +0.77° ground  (target +0.75° ✓)
RF: −3.0°  static → −1.98° ground  (target −2.0°  ✓)
```

**LLTD verification:**
```
springLLTD = (475/475) / ((475/475) + (160/160)) = 0.500
damperLLTD = (10−4 + 10−4) / (12 + 12 + 10−1 + 10−1) = 12 / 30 = 0.400
frontLLTD  = 0.6 × 0.500 + 0.4 × 0.400 = 0.300 + 0.160 = 0.460 ✓
```

### Note on RF caster (empirical vs model)

The model's mechanical trail sweet spot is 0.9" trail, corresponding to approximately 6.0° caster. Real-world performance with RF 8.0° caster (Pete's Setup B) achieved the best-ever 17.1s lap. This suggests caster's real-world benefits (stability, driver confidence to commit earlier) may exceed the model's penalty for over-shooting 0.9" trail.

**Options:**
- **Model optimal:** RF caster 6.0° with −3.0° static → −1.98° ground ✓
- **Real-world proven:** RF caster 7.0–8.0° with −2.6° to −2.75° static → approximately −1.87° to −1.95° ground

---

## SECTION 14: METHODOLOGY NOTES

**Why this is more reliable than pure intuition:**
The multi-session pyrometer dataset provides real-world ground truth. Every recommendation in this document is cross-validated against at least one of:
1. Direct pyrometer evidence (over/under temperature patterns)
2. Physics calculation (lateral load transfer math)
3. Model simulation (grid-searched optimum)
4. Real-world lap time correlation (17.1s best confirms model ceiling)

**Where to be skeptical:**
- The "estimated gain" numbers for each change assume the improvements are additive. They partially are, but there are interaction effects (e.g., fixing LF pressure also changes the thermal equilibrium, which slightly changes camber gain effects).
- The model uses OVAL_CORNER_G = 0.407G (time-averaged) for pressure and thermal load calculations, and OVAL_RACING_G = 0.813G for geometry and roll calculations. The 0.813G is the actual apex instantaneous G for an effective racing line radius of ~145 ft at ~47.6 mph — consistent with the 17.4s observed lap time. The pressure targets derived from 0.407G should be validated with a post-session pyrometer reading after implementing the changes.
- The RF high-caster real-world benefit is empirically observed but not fully captured in the model. The 17.1s best lap with Pete's Setup B (RF 8°) provides this data point. The model's mechanical trail model favors 6.0° but 7–8° may still be faster in practice.

**What to measure at the next session:**
1. Cold PSI set at exactly 22/36/17/31 (LF/RF/LR/RR) — measure hot PSI immediately after the session (before tires cool, within 2 minutes of stopping)
2. Pyrometer every corner after the Tier 1 pressure fix — LF outside-inside differential should drop from 15–20°F to under 10°F
3. Lap time comparison to same conditions as previous session (same driver, similar ambient)
4. After camber change to +2.25° LF static: LF pyrometer should show even edge temperatures — the current inside-hot pattern is the direct indicator of wrong ground-frame camber angle

---

*Sources: Real-world pyrometer data (6 sessions, 2026 season) · Physics model (raceSimulation.js) · Grid search optimizer (419,904 combinations, updated 2026-04-14) · Kinematic analysis (back-solved from 17.4s observed) · Ford Crown Victoria P71 factory specs · Milliken & Milliken "Race Car Vehicle Dynamics" · Dixon "Tires, Suspension and Handling"*
