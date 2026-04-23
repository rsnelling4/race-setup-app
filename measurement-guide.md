# Race Setup Measurement Guide
### 2008 Crown Victoria P71 — Race Simulation Calibration

This guide covers every measurement needed to improve the physics model accuracy. No scales required. Complete in order — each measurement feeds into the next.

---

## Before You Start

**Tools needed:**
- Tape measure (25 ft, locking)
- Digital angle finder / inclinometer (a free phone app like "Bubble Level" works)
- 6-ft or 8-ft level (or a long straight-edge)
- Floor jack and 4 jack stands
- Ruler or digital calipers
- String line (50 ft of mason's line)
- Chalk or masking tape
- Someone to help hold things level

**Prep:**
- Park on the flattest possible surface (garage floor ideal)
- Set cold tire pressure to your race setup: RF 31, RR 33, LF 20, LR 15
- Do NOT lift the car until the measurements that specifically require it
- Bounce the suspension a few times to settle before any ride-height measurement

---

## Measurement 1: Track Width (Center-to-Center Tire Width)

**What it feeds:** `VEH.trackWidth` — currently estimated at 63". Every load transfer calculation uses this.

**How to measure:**

1. Park on flat ground with wheels pointed straight ahead.
2. On the front passenger side tire, use chalk to mark the exact center of the tread on the ground (stand back and eyeball the midpoint of the contact patch).
3. On the front driver side tire, do the same.
4. Measure the distance between the two chalk marks with a tape measure.
5. Repeat at the rear.

**Record:**
- Front track width: ___64__ inches
- Rear track width: _65 1/8 inches
- Average (if similar): _______ inches

**Note:** If front and rear differ by more than 1 inch, record both separately.

---

## Measurement 2: Rear Roll Center Height (Watts Link Pivot)

**What it feeds:** `VEH.rollCenterHeightRear` — currently estimated at 4". On a Watts-link rear axle, the roll center IS the center pivot of the Watts link. This is almost certainly wrong — the real value is likely 8–11 inches.

**How to measure:**

1. Car on flat ground, at ride height, driver in seat (or add ~200 lbs to the driver's seat to simulate driver weight).
2. Find the Watts link center pivot. It is the single large bolt/pivot in the middle of the rear axle, connecting the two horizontal arms that attach to the chassis on both sides. It is mounted on a bracket that sits on top of the rear axle housing.
3. Measure straight down from the center of that pivot bolt to the floor.

**To find the center of the pivot:**
- Look for the pivot bracket centered on the rear axle.
- The pivot center is the center of the pivot bolt — measure to the bolt centerline, not the top or bottom of the bracket.

**Record:**
- Height of Watts link center pivot from floor: 14 1/2_ inches

**This is your rear roll center height. Enter it directly.**

---

## Measurement 3: Front Roll Center Height (SLA Geometry Method)

**What it feeds:** `VEH.rollCenterHeight` — currently stated as 3" but labeled "unverified" in the code.

The front roll center on an SLA (short-long arm) suspension is found geometrically. You do NOT need to compute the full instant center — follow these steps.

**How to measure:**

### Step A — Measure lower ball joint height from ground

1. Car at ride height on flat ground.
2. On the driver's side front wheel: look at the lower control arm. The lower ball joint is the pivot at the outer end of the lower arm (where the spindle connects).
3. Measure from the center of the lower ball joint to the floor.
4. Repeat on passenger side.

**Record:**
- LF lower ball joint height: _7 3/4_ inches
- RF lower ball joint height: _6 3/4_ inches

### Step B — Measure upper ball joint height from ground

1. Same method — the upper ball joint is at the outer end of the upper control arm.
2. Measure from center of upper ball joint to floor.

**Record:**
- LF upper ball joint height: 18 1/2_ inches
- RF upper ball joint height: 17 5/8_ inches

### Step C — Measure lower control arm inner pivot height

1. The lower control arm has two inner pivot bolts that attach it to the subframe/crossmember.
2. Measure from the center of those pivot bolts to the floor. If there are two bolts (front and rear of arm), average them.

**Record:**
- LF lower arm inner pivot height: _10____ inches
- RF lower arm inner pivot height: _9 3/8  inches

### Step D — Record wheel center height

1. Measure from the center of the wheel/hub to the floor.

**Record:**
- Front wheel center height: _13____ inches (should be ~13.6" = tire radius)

**Bring these numbers back and I will compute the roll center height geometrically from them. You do not need to do the geometry yourself.**

---

## Measurement 4: CG Height Estimation (Without a Tilt Table)

**What it feeds:** `VEH.cgHeight` — currently estimated at 22". Since you can't use a tilt table or scales, we use the best available method: the P71 dimensional data plus a weight-bias adjustment.

**You don't need to measure anything new for this** — but confirm the following from physical inspection:

1. Is the car lowered from stock? (Aftermarket springs, cut springs, etc.)
   - [ ] Stock ride height
   - [ ] Lowered — estimate how many inches lower than stock: _______ inches

2. Does the car carry any ballast or heavy add-ons not in a stock P71? (Cage, heavy seats, batteries relocated, etc.)
   - List anything unusual: Roll Cage installed, and battery in passenger seat area

**If stock ride height:** The 22" estimate is within ±1" of reality for a P71 at stock height. No change needed.

**If lowered:** For every 1" of lowering, CG drops approximately 0.6–0.7". Record the lowering amount and I will update the model.

---

## Measurement 5: SLA Droop Camber Coefficient

**What it feeds:** `SLA.droopCoeff` — currently estimated at 0.15°/° roll. The jounce coefficient (0.355) was derived from your measured pyrometer data and is reliable. Droop is the unloaded side and is harder to infer from temps.

**This requires the car to be safely on jack stands.**

**Setup:**
1. Place the car on jack stands under the frame rails (NOT the control arms). The front wheels must hang free.
2. With the car supported this way, the front suspension will be at full droop.

**Measure:**
1. At full droop (wheel hanging freely), measure the camber of the front wheel using your phone inclinometer or angle finder.
   - Hold the phone flat against the wheel face (use a level or flat piece of cardboard against the wheel to get a clean reading surface).
   - Record the camber at full droop.

**Record:**
- LF camber at full droop: +1 3/4_ ° (negative = tilts inward at top)
- RF camber at full droop: -1 1/2_ °
- LF camber at ride height (your static setup): +2 3/4°
- RF camber at ride height (your static setup): -2 1/4°

**Also measure full droop travel:**
1. With wheel at full droop, measure from wheel center to the fender lip (or a fixed chassis reference point).
2. Then lower the car back to ride height and measure the same distance.
3. The difference is your droop travel in inches.

**Record:**
- Droop travel (ride height to full droop): _1/2___ inches
- Change in camber from ride height to full droop: _______ °

**I will calculate the droop coefficient (°/inch and °/° roll) from these numbers.**

---

## Measurement 6: Caster Camber Gain Validation

**What it feeds:** Coefficients `RF: 0.18°/° caster, LF: 0.10°/° caster` — both estimated. These affect how much camber change we predict when steering into the corner.

Your current alignment: LF 7° caster, RF 3° caster.

**How to measure:**

This requires turning the wheels to a known angle and measuring camber change.

1. With car at ride height on flat ground, set wheels straight ahead.
2. Measure static camber (same as your alignment specs — LF +2 3/4 RF -2 1/4.
3. Turn the steering wheel to the right (clockwise) until the front tires are at approximately 20° of steer. Use a reference mark on the steering wheel or count turns and use a protractor/angle finder on the tire sidewall.
4. Measure camber of LF and RF wheels at 20° steer.

**Record:**
- LF camber at 20° steer: _+1 1/2 °
- RF camber at 20° steer: _+1____ °
- Camber change LF (steer minus straight): _+ 1 1/4°
- Camber change RF (steer minus straight): _______ °

Divide each change by 20 to get °/° steer for comparison.

**Note:** At the corner apex the model uses 10° of steer, so half these values apply.

---

## Measurement 7: Front Weight Bias (Without Scales)

**What it feeds:** `VEH.frontBias` — currently estimated at 0.55 (55% front). The P71 is a heavy front-biased car but the exact split matters for load calculations.

**Without scales, use the published Ford Engineering data:**

The 2008 P71 has a published front/rear weight distribution of approximately **57/43** (front heavy) at curb weight, per Ford's police fleet documentation. This is without driver.

With a ~200 lb driver in the LF seat, front bias shifts slightly: the driver's seat is approximately over the front axle, so driver weight adds roughly proportionally — bias remains close to **56–57% front**.

**You don't need to measure this** — update the model from 0.55 to **0.57** based on published data.

**However, if you want to verify:** Park on an incline (driveway works) and use the following trick:

1. Find an incline with known angle (use your phone inclinometer on the ground surface).
2. Park nose-uphill, note which direction the car wants to roll.
3. Park nose-downhill. The point where the car is balanced (equal tendency to roll either direction) on an incline is when the CG is directly over the midpoint — this only works if you can find a specific slope, so skip this unless you have a convenient calibrated incline.

**Recommendation:** Use 0.57 as the updated value — it's based on published Ford data and more accurate than the current 0.55 estimate.

---

## Summary: What to Record and Report Back

When you've completed the measurements, report these numbers and I will update `raceSimulation.js` with calibrated values:

```
Track width (front): ___64____ inches
Track width (rear):  ___65 1/8__ inches

Rear roll center height (Watts pivot from floor): ___14 1/2____ inches

Front SLA measurements:
  LF lower ball joint height:        ____7 3/4___ inches
  RF lower ball joint height:        _____6 3/4__ inches
  LF upper ball joint height:        ____ 18 1/2___ inches
  RF upper ball joint height:        ____17 5/8___ inches
  LF lower arm inner pivot height:   ___10__ inches
  RF lower arm inner pivot height:   __9 3/8 inches
  Front wheel center height:         _13____ inches

Droop measurements:
  LF camber at full droop:           _+1 3/4 °
  RF camber at full droop:           _-1 1/2 °
  Droop travel (ride height → full droop): __1/2__ inches

Caster camber gain (at 20° steer):
  LF camber at 20° steer:            +1 1/2_ °
  RF camber at 20° steer:            _+1____ °

Ride height lowering (0 if stock):   ___0___ inches
Unusual ballast or add-ons:          _Roll cage added, battery in passenger seat area
```

---

*Generated for race simulation calibration — Crown Victoria P71 oval/figure-8 setup*
