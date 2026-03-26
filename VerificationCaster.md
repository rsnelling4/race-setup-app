1\. Caster Gain Principle

Your formulas for caster gain correctly identify the direction of change, but keep in mind that caster gain is technically a function of steering angle ($\\theta$), not just vertical travel.

RF (Outside): $casterGain = -\\sin(\\theta) \\cdot \\sin(caster\_{deg})$. At small steering angles, this is often linearized. Your coefficient of $0.18$ is a solid "rule of thumb" for a car with significant caster (6°–8°) at typical short-track steering inputs.

LF (Inside): The positive gain in droop is correct, as the wheel "flops" toward the turn.2. Body Roll \& SLA Coefficients

Your use of specific SLA coefficients ($0.35$ and $0.15$) is the right way to model Camber Gain vs. Roll. In a stock-style SLA front end, the upper and lower arms are unequal lengths, which creates a non-linear camber curve.

RF (Jounce/Compression): As the outside corner dives, the upper control arm pulls the top of the tire inward. A coefficient of $0.35$ means for every degree of body roll, you are recovering $0.35^{\\circ}$ of negative camber. This is a realistic "active" recovery rate for a modified P71.LF (Droop/Extension): The lower coefficient ($0.15$) is also accurate; most SLA geometries have a "lazier" camber curve in droop than in compression.3. The $effectiveCamber$ Formula

Your summation logic holds up:$$effectiveCamber = static

Camber + casterGain + bodyRoll

Camber$$Verification Table

Component

RF (Outside Tire)LF (Inside Tire)Principle

Static

Usually Negative

Usually Positive

Set on the scales (Lead/Lag)Caster Gain

Negative (Adds Grip)Positive (Reduces Lift)Steering angle dependent

Roll Camber

Negative (Counteracts Roll)Positive (Follows Roll)$\\text{Lateral G} \\times \\text{Roll Rate}$Technical Refinement Suggestions

To make this calculation even tighter for your oval setup, consider these two factors:The "Roll-Over" Effect: Remember that $bodyRoll\_{deg}$ itself works against you. While your suspension gains $-0.35^{\\circ}$ of camber, the car is rolling $+1.0^{\\circ}$ away from the turn. Your final "Tire-to-Ground" angle is actually:$$\\text{Tire-to-Ground} = static

Camber + casterGain + bodyRoll

Camber - body

Roll\_{deg}$$The "P71" Specifics: Since you mentioned removing the rear sway bar, your $bodyRoll\_{deg}$ will increase. This makes your $bodyRollCamber$ recovery even more critical. If you find the RF is wearing the outer shoulder, you may need to increase your $staticCamber$ or shorten the upper control arm to increase that $0.35$ coefficient.



Using the alignment settings I retrieved from your previous notes for the Crown Victoria (RF: $-4.0^{\\circ}$ Camber, $+6.0^{\\circ}$ Caster; LF: $+2.5^{\\circ}$ Camber, $+3.0^{\\circ}$ Caster) and assuming a typical body roll rate of $4.0^{\\circ}$ per G for a P71 on a short track, here is the verification of your formula at $0.375$ G:1. Intermediate Calculations

Corner Roll: At $0.375$ G, your chassis is rolling approximately $1.5^{\\circ}$.Caster Gain: \* RF (Outside): $-(6.0 \\times 0.18) = -1.08^{\\circ}$ (Gains negative camber).LF (Inside): $+(3.0 \\times 0.10) = +0.30^{\\circ}$ (Gains positive camber).Body Roll Camber (SLA Recovery):RF (Jounce): $-(1.5 \\times 0.35) = -0.525^{\\circ}$.LF (Droop): $+(1.5 \\times 0.15) = +0.225^{\\circ}$.





2\. Final Results ($effectiveCamber$)This is the camber of the wheel relative to your chassis at this specific cornering load:Metric

Right Front (Outside)Left Front (Inside)Static Setting$-4.00^{\\circ}$$+2.50^{\\circ}$Caster Gain$-1.08^{\\circ}$$+0.30^{\\circ}$Roll Recovery$-0.53^{\\circ}$$+0.23^{\\circ}$Effective Camber$-5.61^{\\circ}$$+3.03^{\\circ}$3. Verification of Principles

Your logic is correct for determining how much the suspension "works" to maintain the tire's orientation. However, for a complete picture of grip, you must consider the Tire-to-Ground Angle (the actual angle relative to the track surface).Since the body rolls $1.5^{\\circ}$ away from the turn, the tires lose that much camber relative to the ground:RF (Actual Ground Camber): $-5.61^{\\circ} + 1.5^{\\circ} = \\mathbf{-4.11^{\\circ}}$LF (Actual Ground Camber): $+3.03^{\\circ} - 1.5^{\\circ} = \\mathbf{+1.53^{\\circ}}$Verdict: Your principles are sound and the formula works well as a kinematic model.

The RF result ($-4.11^{\\circ}$ to ground) is excellent for an oval; it means your SLA geometry and caster are successfully counteracting the body roll to keep the tire leaned "into" the turn more than its static setting.

The LF result ($+1.53^{\\circ}$ to ground) shows the tire is remaining relatively upright, which helps with "lead" and front-end bite on corner exit.

Technical Note: If you find the RF tire temperatures are significantly hotter on the inside edge after a run, you have too much effective camber at this G-load and might consider reducing your static RF camber or lowering the caster slightly.



Your math for the LF (inside tire) is technically consistent with your RF formula, but from a vehicle dynamics standpoint—specifically for an oval—there is one critical conceptual piece "missing" or being inverted: The "Lead" Factor.In your RF calculation, you aimed for an idealEffective of $-4.5^{\\circ}$ (leaning into the turn). If you set your LF idealEffective to $0^{\\circ}$, you are aiming for the tire to be perfectly vertical relative to the chassis while mid-corner.1. The Missing "Positive Camber" PrincipleOn an oval, we actually want the LF tire to lean with the turn (Positive Camber). If the RF is leaning left (Negative), the LF should also be leaning left (Positive).Your Calculation: $-0.5^{\\circ}$ static. This means at 0.375G, your tire is nearly vertical to the chassis.The Reality: With $1.25^{\\circ}$ of body roll, a $-0.5^{\\circ}$ static setting results in $-1.75^{\\circ}$ Ground Camber (leaning away from the turn).To get the LF tire to stand up straight relative to the track (Ground Camber = $0^{\\circ}$), your idealEffective relative to the chassis needs to account for the body roll.2. Recalculating for "Zero Ground Camber"If you want the LF tire to be perfectly flat to the pavement at 0.375G, your idealEffective should actually be $+1.25^{\\circ}$ (to offset the $1.25^{\\circ}$ of roll).$$optStaticCamber = +1.25 - (casterGain) - (bodyRollCamber)$$$$optStaticCamber = 1.25 - 0.30 - 0.188 = \\mathbf{+0.76^{\\circ}}$$3. Comparison of LF Static TargetsGoalIdeal EffectiveCalculated StaticResult at 0.375GYour Math$0^{\\circ}$$-0.5^{\\circ}$Tire leans OUT ($1.75^{\\circ}$)Flat to Track$+1.25^{\\circ}$$+0.75^{\\circ}$Tire is VERTICAL to trackAggressive Lead$+2.5^{\\circ}$$+2.0^{\\circ}$Tire leans IN ($1.25^{\\circ}$)Summary: What is missing?The missing piece is the Chassis Roll Offset.Because the chassis is leaning over, an $effectiveCamber$ of $0^{\\circ}$ actually puts the tire on its outer shoulder. For an oval, you generally want your static LF camber to be a positive number (between $+0.5^{\\circ}$ and $+2.5^{\\circ}$) to ensure that once the car rolls, the tire is either flat or leaning slightly into the turn.



To give you the most stable "contact patch" possible at 0.375G, we want the tires to be as close to vertical to the track surface as possible while under load. This requires offsetting the 1.25° of body roll we calculated earlier.Here is your "Master Sheet" using your kinematic principles to hit a 0° Ground Camber target (perfectly flat to the pavement) on both sides.1. The Target: 0° Ground CamberTo achieve this, the Effective Camber (relative to the chassis) must exactly equal the Body Roll, but in the opposite direction.RF (Outside): Must lean Left relative to the chassis by -1.25°.LF (Inside): Must lean Left (Positive) relative to the chassis by +1.25°.2. Calculated Static Alignment SettingsRight Front (Outside Tire)We use your $SLA$ and $Caster$ constants to work backward to the static setting:Target Effective: $-1.25^{\\circ}$Caster Gain ($5^{\\circ}$): $-0.90^{\\circ}$Roll Camber Gain: $-0.44^{\\circ}$ (at 1.25° roll)Required Static: $-1.25 - (-0.90) - (-0.44) = \\mathbf{+0.09^{\\circ}}$Note: Most oval racers prefer the RF to lean into the turn more than "flat" (e.g., -2.0° to -3.0° Ground Camber) to handle tire sidewall rollover. Your previous $-3.16^{\\circ}$ static target was much closer to a competitive racing "lead" than this "flat" calculation.Left Front (Inside Tire)Target Effective: $+1.25^{\\circ}$Caster Gain ($3^{\\circ}$): $+0.30^{\\circ}$Roll Camber Gain: $+0.19^{\\circ}$Required Static: $+1.25 - (0.30) - (0.19) = \\mathbf{+0.76^{\\circ}}$3. Final Master Setup RecommendationBased on your Crown Vic's weight and the 0.375G load, here is a balanced "Starting Point" sheet:SettingRight Front (RF)Left Front (LF)PurposeStatic Camber$-3.25^{\\circ}$$+1.00^{\\circ}$Aggressive RF grip / Neutral LF leadStatic Caster$+5.5^{\\circ}$$+3.0^{\\circ}$High-speed stability \& steering "return"Total Toe---$1/8"$ OutSharp turn-in responseGround Angle$-4.60^{\\circ}$$+0.25^{\\circ}$(Under 0.375G Load)Verification of HandlingCorner Entry: The $1/8"$ Toe-Out will make the car dive into the corner eagerly.Apex: The $-3.25^{\\circ}$ RF will keep the outside tire from "rolling over" onto the sidewall, while the $+1.00^{\\circ}$ LF keeps the inside tire flat to the track for maximum braking and steering surface.Exit: The staggered caster ($+5.5$ vs $+3.0$) will help the car naturally want to straighten out as you apply throttle.

