# Post-Alignment Remeasurement Guide
### Crown Victoria P71 — After Setting Oval Alignment (LF 4° / RF 6° Caster)

Complete these measurements **after** the alignment is set to your oval target:
- LF caster: 4°, RF caster: 6°
- LF static camber: +1.5°, RF static camber: -2.5° to -3°
- Front toe: -0.25" (out)

Do these in order. Each feeds the next.

---

## Tools Needed

- Phone inclinometer app (Bubble Level or similar)
- Flat piece of cardboard or small aluminum plate (~6" square) to hold against wheel face
- Tape measure
- Floor jack and 4 jack stands
- Helper recommended for droop measurements

---

## Measurement 1: Static Camber (Confirm at Ride Height)

**What it feeds:** Baseline for all camber gain calculations.

1. Park on flat ground, wheels straight ahead. Bounce suspension a few times to settle.
2. Hold your flat plate flush against the wheel face (avoid the valve stem area).
3. Hold phone flat against the plate and read camber.
4. Repeat on RF.

**Record:**
- LF static camber: _______ °
- RF static camber: _______ °

These should match your alignment spec. If they don't, stop and recheck alignment before continuing.

---

## Measurement 2: Bump/Droop Camber Curves

**What it feeds:** `SLA.droopCoeff` and jounce coefficient — both shift with caster changes.

**This requires the car safely on jack stands with front wheels hanging free.**

### Step A — Full Droop Camber

1. Support car under frame rails (NOT control arms). Front wheels must hang freely at full droop.
2. Measure camber at full droop using phone against flat plate on wheel face.
3. Measure droop travel: distance from wheel center to a fixed chassis reference point (fender lip works). Record this, then lower to ride height and measure again — the difference is droop travel.

**Record:**
- LF camber at full droop: _______ °
- RF camber at full droop: _______ °
- LF droop travel (ride height to full droop): _______ inches
- RF droop travel (ride height to full droop): _______ inches

### Step B — Full Bump Camber

1. With car on jack stands, use the floor jack under the lower control arm to push the wheel up into full bump (until the bumpstop is compressed or motion stops).
2. Measure camber at full bump.
3. Measure bump travel using same chassis reference point as droop.

**Record:**
- LF camber at full bump: _______ °
- RF camber at full bump: _______ °
- LF bump travel (ride height to full bump): _______ inches
- RF bump travel (ride height to full bump): _______ inches

---

## Measurement 3: Caster Camber Gain (Steering Input)

**What it feeds:** Caster camber gain coefficients used at corner entry and apex.

**Car at ride height on flat ground.**

1. Confirm static camber with wheels straight (from Measurement 1).
2. Turn steering wheel right (clockwise) until front wheels are at approximately 20° of steer. Use a protractor or angle finder on the tire sidewall to confirm.
3. Measure camber on both front wheels at 20° steer.

**Record:**
- LF camber at 20° right steer: _______ °
- RF camber at 20° right steer: _______ °
- LF camber change (20° steer minus straight): _______ °
- RF camber change (20° steer minus straight): _______ °

---

## Summary: Numbers to Report Back

```
Alignment set to:
  LF caster: ______ °   (target 4°)
  RF caster: ______ °   (target 6°)

Static camber (ride height, straight ahead):
  LF: ______ °          (target +1.5°)
  RF: ______ °          (target -2.5° to -3°)

Droop camber:
  LF camber at full droop:       ______ °
  RF camber at full droop:       ______ °
  LF droop travel:               ______ inches
  RF droop travel:               ______ inches

Bump camber:
  LF camber at full bump:        ______ °
  RF camber at full bump:        ______ °
  LF bump travel:                ______ inches
  RF bump travel:                ______ inches

Caster camber gain (at 20° right steer):
  LF camber:                     ______ °
  RF camber:                     ______ °
```

---

*Use these numbers to recalibrate raceSimulation.js camber gain coefficients after alignment change.*
