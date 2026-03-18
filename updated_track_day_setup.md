# Updated Chassis Setup: 2008 Crown Victoria for 1/4 Mile Oval
### Review of `track_day_setup.md` — Changes, Corrections & Additions

---

## Accuracy Review Summary

| Section | Status | Issue |
| :--- | :--- | :--- |
| Shock Selection (direction) | ✅ Correct | Stiff outside / soft inside philosophy is sound |
| LR Shock Rating | ⚠️ Minor Error | Monroe 5993 is rated **10**, not **9**, per reference data |
| LF/LR Shock Extremes | ⚠️ Concern | Ratings 9 & 10 on inside corners are too aggressive with 3.73 gears — wheel hop risk |
| Camber Direction | ✅ Correct | Negative RF / Positive LF is correct for left-turn oval |
| Camber Magnitude | ⚠️ Concern | -3.5° RF and +2.5° LF almost certainly exceed the stock adjustment range |
| Caster Split Direction | ✅ Correct | Higher RF caster than LF is standard oval practice |
| Caster Magnitude RF | ⚠️ Concern | +5.5° may exceed stock adjustment range — hardware note added |
| Tire Pressure Direction | ✅ Correct | Right-side bias is correct |
| Cold Pressures | ⚠️ Incomplete | Document gave a range ("4-6 PSI lower") — specific cold targets added |
| Toe Out Front | ✅ Correct | 1/8" toe-out for oval is appropriate |
| Sway Bars | ❌ Missing | Not addressed — important for oval setup |
| Tire Stagger | ❌ Missing | Not addressed — common and effective oval technique |

---

## 1. Shocks & Struts (Updated)

**Note on Rating Scale:** 0 = stiffest, 10 = softest.

**Change from original:** The original setup used the absolute softest options on both inside corners (LF rating 9, LR rating 10). With a 3.73 gear ratio this is risky — softer rear shocks increase wheel hop potential under hard acceleration. Moderate inside shocks are corrected below.

| Corner | Make/Model | Part Number | Stiffness Rating (0–10) | Change |
| :--- | :--- | :--- | :--- | :--- |
| **Right Front (RF)** | Monroe Quick-Strut (Police) | `271346` | 2 | No change |
| **Left Front (LF)** | KYB Strut-Plus or KYB Strut (Monotube) | `SR4140` or `551600` | 6 | Changed from FCS 1336343 (9) |
| **Right Rear (RR)** | Monroe Magnum Severe Service | `550018` | 1 | No change |
| **Left Rear (LR)** | KYB Gas-a-Just (Monotube) | `555601` | 5 | Changed from Monroe 5993 (10) |

**Rationale for changes:**

- **LF (SR4140/551600, rating 6):** The original FCS 1336343 at rating 9 is one of the softest available. A monotube construction (KYB) provides more consistent damping under repeated load cycles and better heat dissipation than a twin-tube in race conditions. Rating 6 is still notably softer than the RF (rating 2), preserving the asymmetric advantage while maintaining braking stability and turn-in precision.

- **LR (555601, rating 5):** The original Monroe 5993 at rating 10 (not 9 as listed — a data error) is the absolute softest rear shock available. With 3.73 gearing, the rear tires are already under significant wheel hop stress on corner exit. A monotube Gas-a-Just at rating 5 provides meaningful inside-vs-outside damping split (5 vs 1) while controlling wheel hop. The monotube also handles the heat of repeated lap cycles better than the twin-tube Monroe 5993.

---

## 2. Camber (Updated)

**⚠️ Hardware Note:** The stock Crown Victoria SLA suspension has a limited factory camber adjustment range — typically ±0.5° to ±1° via the factory eccentric bolts at the lower control arm. Achieving the settings below **requires aftermarket camber adjustment hardware**, such as:
- Extended-range eccentric cam bolts (commonly available for this platform)
- Aftermarket adjustable upper strut mounts / camber plates
- Modified lower control arm mounting slots

Do not attempt to force the suspension beyond its designed adjustment travel.

### Right Front (RF): `-2.5° to -3.0°` (Negative)

**Change from original:** Original said -3.5°. That is achievable with the right hardware but is an aggressive starting point. Beginning at -2.5° to -3.0° allows you to verify the tire temperature data (inside edge running hotter than outside edge = camber is correct) before pushing further. The SLA geometry will also generate additional dynamic negative camber under body roll, adding to whatever static setting you begin with.

**Justification:** Significant negative camber ensures the RF tire remains flat and fully loaded through the corner as the body rolls to the right. The RF is the hardest-working corner on the car.

### Left Front (LF): `+0.5° to +1.5°` (Positive)

**Change from original:** Original said +2.5°. This is very aggressive. At +2.5°, the car will have a noticeable and fatiguing pull to the left on the straights. Starting at +0.5° to +1.5° still encourages the car to naturally want to turn left and improves initial turn-in response, without the straight-line handling penalty. Adjust based on driver feedback after practice.

**Justification:** Positive LF camber biases the car toward left-hand turns and reduces the steering effort needed on corner entry.

---

## 3. Caster (Minor Update)

**⚠️ Hardware Note:** Factory caster on the Crown Victoria is typically in the +3.0° to +5.0° range. Getting RF caster above +5.0° may require aftermarket caster adjustment hardware or strut tower correction plates. Confirm the range of your specific cam bolts before targeting +5.5°.

- **Right Front (RF):** `+5.0° to +5.5°` (Positive) — no significant change, just flag the hardware requirement
- **Left Front (LF):** `+2.5° to +3.0°` (Positive)
- **Split:** ~2.5° to 3.0° difference — this is the key number. The split creates a natural left-pull and generates dynamic negative camber gain on the RF as the wheel steers through the corner.

**Justification from original is correct:** The caster split is a proven oval technique. High RF caster increases RF stability on straights and generates significant dynamic negative camber under turn-in. The pull toward the left reduces driver effort and improves corner entry aggressiveness.

---

## 4. Tire Pressures (Updated with Cold Starting Values)

**Hot targets** remain the same as the original. **Cold starting pressures added** (based on typical 5–6 PSI build-up from ambient to operating temp on a 1/4 mile oval):

| Tire | Cold Start (PSI) | Hot Target (PSI) | Notes |
| :--- | :--- | :--- | :--- |
| **Right Front (RF)** | 36 | 42 | Hardest working tire — highest pressure supports sidewall under load |
| **Right Rear (RR)** | 34 | 40 | Second hardest — maintains stability on acceleration and corner exit |
| **Left Rear (LR)** | 26 | 32 | Allows slip angle on corner exit; aids rotation through the turn |
| **Left Front (LF)** | 22 | 28 | Most unloaded tire — lower pressure maximizes contact patch for turn-in and braking |

**Note:** The LF runs significantly cooler than the RF and may not reach its hot target during short practice sessions. Monitor with a pyrometer. If the LF is consistently underperforming its hot target, the cold starting pressure may need to be adjusted up slightly to compensate.

**Note on pressure spread:** The 14 PSI difference between LF (28 hot) and RF (42 hot) is intentional and correct for this asymmetric setup. Do not attempt to equalize pressures — the right-side bias is a core part of the setup philosophy.

---

## 5. Toe (No Change)

- **Front Wheels:** `1/8" Toe Out`
- The original is correct. Toe-out on the front points the inside (left) tire slightly into the corner, quickening initial turn-in response and reducing driver steering effort.
- **Rear toe** is not adjustable on the solid rear axle — no change needed there.

---

## 6. Additional Recommendations (New)

These items were not addressed in the original document but have meaningful impact on 1/4 mile oval performance.

### Sway Bars

**Front sway bar — consider softening or disconnecting:**
The Crown Victoria has a front sway bar. In oval racing (left turns only), the front sway bar works against you: it resists body roll, which reduces load transfer to the RF and reduces camber gain. Softening the front bar (or removing it entirely, if rules allow) lets the body roll more freely, which loads the RF tire harder and allows the static negative camber to work as designed.

**Rear sway bar — keep or slightly stiffen:**
With a 3.73 gear ratio, the rear end is prone to getting loose on corner exit. The rear sway bar helps transfer cornering resistance across both rear tires, reducing the tendency to oversteer under power. If the car is consistently loose on exit, increasing rear sway bar stiffness (or using a larger bar, if available) is a tuning option before touching shocks.

### Tire Stagger

Tire stagger is a subtle but effective oval technique. Running a slightly larger/taller tire on the **Right Rear** than the **Left Rear** causes the car to naturally arc to the left — the same direction you want to go. This reduces steering effort and can meaningfully improve lap times.

- **Method 1 (if rules allow different tire sizes):** RR one size larger than LR, e.g., P245/55R17 RR vs P235/55R17 LR.
- **Method 2 (within the same size):** Inflate RR to its maximum safe hot pressure and run LR at the lower end of its range. This creates a small circumference difference through pressure differential.
- **Measurement:** Measure tire circumference with a tape measure at the center tread (or walk the car and mark the floor — count rotations). A stagger of 1–3 inches is a starting target for a 1/4 mile oval.

---

## 7. Summary & Philosophy (Updated)

The core asymmetric philosophy from the original document remains correct and is the right approach for a left-turn-only oval:

- **The Right Side** (RF + RR): Stiff shocks, maximum negative camber RF, high tire pressures. Acts as a rigid, stable platform absorbing cornering forces.
- **The Left Side** (LF + LR): Softer shocks (but not extreme), positive LF camber, lower tire pressures. Compliant and reactive, helps the car rotate and keeps inside tires in contact with the track.

**What changed and why:**
The original's most aggressive choices (rating 9/10 inside shocks, -3.5°/-+2.5° camber, no cold pressures, no sway bar or stagger guidance) were either too extreme for a starting setup or incomplete. This updated document pulls the inside shocks toward moderate (ratings 5–6), trims the camber to achievable starting values with clear hardware caveats, adds specific cold pressures, and introduces the sway bar and stagger tuning levers that are available without significant cost.

**Starting point philosophy:**
Begin at the conservative end of each range. Use tire temperature data (pyrometer across inside/middle/outside of each tire) after hot laps to verify the setup is working correctly, then adjust one variable at a time toward the aggressive end. The tire temperature page of this app is your most important feedback tool.

---

*All settings are starting points. Track conditions, driver style, tire compound, and ambient temperature all affect the optimal setup. Verify all settings with proper alignment equipment before racing.*
