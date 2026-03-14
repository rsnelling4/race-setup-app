// Tire Temperature Analysis Engine
// Based on research from multiple racing setup resources

/**
 * Analyze a single tire's temperature readings
 * @param {number} inside - Inside edge temperature
 * @param {number} middle - Middle temperature
 * @param {number} outside - Outside edge temperature
 * @param {string} position - 'LF', 'RF', 'LR', 'RR'
 * @param {number} currentPressure - Current tire pressure in PSI (optional)
 * @returns {object} Analysis results
 */
export function analyzeTire(inside, middle, outside, position, currentPressure = null) {
  const avg = (inside + middle + outside) / 3;
  const spread = Math.abs(inside - outside);
  const edgeAvg = (inside + outside) / 2;
  const middleDiff = middle - edgeAvg;
  const psiCalculation = middle - edgeAvg; // New PSI Calculation

  const camberDiff = inside - outside;
  const isFront = position.includes('F');
  const isRF = position === 'RF';
  const rfSpread = isRF ? (inside - outside) : null; // positive = inside hotter (correct for RF)
  const rfSpreadProblem = isRF && rfSpread < 5; // RF inside not hot enough or outside hotter

  const tireRecommendations = []; // Use a single list for all recommendations
  let overallSeverity = 'good'; // Overall severity for the tire
  let recommendedPressure = currentPressure;

  // Internal state for pressure analysis, used for prioritization
  let currentPressureSeverity = 'good'; // Track severity of pressure issues only
  let currentPressureAction = 'none'; // 'increase', 'decrease', 'none', 'good'
  let camberCalculation = null; // Declare here to ensure it's always defined


  const getPressureAdjustment = (amount) => {
    if (!amount) return 0;
    const parts = amount.split(' ')[0].split('-');
    if (parts.length === 1) return parseFloat(parts[0]);
    return (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
  };

  const getDynamicPressureAmount = (diff, isRF) => {
    const absDiff = Math.abs(diff);
    if (isRF) {
      if (absDiff >= 15) return '3-4 PSI'; // Even more critical for RF
      if (absDiff >= 10) return '2-3 PSI';
      if (absDiff >= 5) return '1-2 PSI';
      if (absDiff >= 3) return '0.5-1 PSI'; // Small adjustment for slight difference
    } else {
      if (absDiff >= 20) return '3-4 PSI';
      if (absDiff >= 15) return '2-3 PSI';
      if (absDiff >= 8) return '1-2 PSI';
      if (absDiff >= 4) return '0.5-1 PSI';
    }
    return '0.5-1 PSI'; // Default for very small but noticeable difference
  };


  // Right front uses tighter thresholds — it's the primary loaded tire
  const overCritical = isRF ? 10 : 15;
  const overWarn = isRF ? 5 : 8;
  const underCritical = isRF ? -10 : -15;
  const underWarn = isRF ? -5 : -8;
  const rfNote = isRF ? ' The RF is your hardest-working tire — getting pressure right here is critical.' : '';



  // --- Pressure Analysis ---
  // Prioritize critical conditions
  if (isRF && rfSpread < 0) { // RF outside hotter than inside (critical camber/contact patch issue)
    const amount = getDynamicPressureAmount(rfSpread, isRF);
    tireRecommendations.push({
      type: 'pressure',
      severity: 'critical',
      message: `RF outside is ${Math.round(Math.abs(rfSpread))}°F hotter than inside — the inside must be hotter on the RF. Contact patch is not loading the inside edge. Reduce RF pressure ${amount}.`,
      action: 'decrease',
      amount,
    });
    currentPressureAction = 'decrease';
    currentPressureSeverity = 'critical';
    if (currentPressure) recommendedPressure = currentPressure - getPressureAdjustment(amount);
  } else if (psiCalculation > overCritical) { // Middle is significantly hotter (over-inflated)
    const amount = getDynamicPressureAmount(psiCalculation, isRF);
    tireRecommendations.push({
      type: 'pressure',
      severity: 'critical',
      message: `Over-inflated. Middle is ${Math.round(psiCalculation)}°F hotter than edges. Reduce pressure ${amount}.${rfNote}`,
      action: 'decrease',
      amount,
    });
    currentPressureAction = 'decrease';
    currentPressureSeverity = 'critical'; // Set to critical directly
    if (currentPressure) recommendedPressure = currentPressure - getPressureAdjustment(amount);
  } else if (psiCalculation < underCritical) { // Middle is significantly cooler (under-inflated)
    const amount = getDynamicPressureAmount(psiCalculation, isRF);
    tireRecommendations.push({
      type: 'pressure',
      severity: 'critical',
      message: `Under-inflated. Middle is ${Math.round(Math.abs(psiCalculation))}°F cooler than edges. Increase pressure ${amount}.${rfNote}`,
      action: 'increase',
      amount,
    });
    currentPressureAction = 'increase';
    currentPressureSeverity = 'critical'; // Set to critical directly
    if (currentPressure) recommendedPressure = currentPressure + getPressureAdjustment(amount);
  } else if (psiCalculation > overWarn) { // Middle is moderately hotter (slightly over-inflated)
    const amount = getDynamicPressureAmount(psiCalculation, isRF);
    tireRecommendations.push({
      type: 'pressure',
      severity: 'warning',
      message: `Slightly over-inflated. Middle is ${Math.round(psiCalculation)}°F hotter than edges. Consider reducing pressure ${amount}.${rfNote}`,
      action: 'decrease',
      amount,
    });
    currentPressureAction = 'decrease';
    if (currentPressureSeverity === 'good') currentPressureSeverity = 'warning';
    if (currentPressure) recommendedPressure = currentPressure - getPressureAdjustment(amount);
  } else if (psiCalculation < underWarn) { // Middle is moderately cooler (slightly under-inflated)
    const amount = getDynamicPressureAmount(psiCalculation, isRF);
    tireRecommendations.push({
      type: 'pressure',
      severity: 'warning',
      message: `Slightly under-inflated. Middle is ${Math.round(Math.abs(psiCalculation))}°F cooler than edges. Consider increasing pressure ${amount}.${rfNote}`,
      action: 'increase',
      amount,
    });
    currentPressureAction = 'increase';
    if (currentPressureSeverity === 'good') currentPressureSeverity = 'warning';
    if (currentPressure) recommendedPressure = currentPressure + getPressureAdjustment(amount);
  } else {
    currentPressureAction = 'good'; // All checks passed for pressure
  }

  // --- Camber-Induced Pressure Adjustments (for front tires) ---
  // If primary pressure analysis is good, but there's a significant camber spread on front tires,
  // we recommend a pressure adjustment to compensate.
  if (currentPressureAction === 'good' && isFront && Math.abs(camberDiff) > 10) {
    let camberCmpPressureMessage;
    let camberCmpPressureAction;
    const camberCmpPressureAmount = getDynamicPressureAmount(camberDiff, isRF);

    if (camberDiff > 0) { // Inside hotter, too much effective negative camber
      camberCmpPressureMessage = `Significant inside/outside temperature spread (${Math.round(camberDiff)}°F inside hotter) indicates excessive negative camber or tire roll. While camber adjustment is recommended, *increase* pressure ${camberCmpPressureAmount} to help flatten contact patch and distribute load more evenly.`;
      camberCmpPressureAction = 'increase';
    } else { // Outside hotter, too little effective negative camber
      camberCmpPressureMessage = `Significant inside/outside temperature spread (${Math.round(Math.abs(camberDiff))}°F outside hotter) indicates insufficient negative camber or tire roll. While camber adjustment is recommended, *decrease* pressure ${camberCmpPressureAmount} to help flatten contact patch and load inside.`;
      camberCmpPressureAction = 'decrease';
    }
    tireRecommendations.push({
      type: 'pressure',
      severity: 'warning', // Treat camber-induced pressure changes as warning
      message: camberCmpPressureMessage,
      action: camberCmpPressureAction,
      amount: camberCmpPressureAmount,
    });
    if (currentPressure) {
      const adj = getPressureAdjustment(camberCmpPressureAmount);
      if (camberCmpPressureAction === 'increase') {
        recommendedPressure += adj;
      } else if (camberCmpPressureAction === 'decrease') {
        recommendedPressure -= adj;
      }
    }
    if (currentPressureSeverity === 'good') currentPressureSeverity = 'warning';
    currentPressureAction = camberCmpPressureAction; // Mark that a pressure action was taken due to camber
  }



  // --- Camber Analysis ---


  // Rear tires: pressure adjustment for camber compensation if uneven wear detected
  // This block needs to run regardless of currentPressureSeverity because it adds pressure recommendations.
  if (!isFront && Math.abs(camberDiff) > 10) {
    let camberCmpPressureMessage;
    let camberCmpPressureAction;
    const camberCmpPressureAmount = getDynamicPressureAmount(camberDiff, isRF); // Make this dynamic too
    if (camberDiff > 0) { // Inside hotter, too much effective negative camber
      camberCmpPressureMessage = `Uneven inside/outside wear detected (${Math.round(camberDiff)}°F inside hotter). Rear camber is not adjustable. To compensate, *increase* pressure ${camberCmpPressureAmount} to shift load to middle/outside.`;
      camberCmpPressureAction = 'increase';
    } else { // Outside hotter, too little effective negative camber
      camberCmpPressureMessage = `Uneven inside/outside wear detected (${Math.round(Math.abs(camberDiff))}°F outside hotter). Rear camber is not adjustable. To compensate, *decrease* pressure ${camberCmpPressureAmount} to flatten contact patch and load inside.`;
      camberCmpPressureAction = 'decrease';
    }
    // Add this pressure recommendation to the tireRecommendations list
    tireRecommendations.push({
      type: 'pressure',
      severity: 'warning', // Treat camber-induced pressure changes as warning
      message: camberCmpPressureMessage,
      action: camberCmpPressureAction,
      amount: camberCmpPressureAmount,
    });
    // Update recommendedPressure if currentPressure is available
    if (currentPressure) {
      const adj = getPressureAdjustment(camberCmpPressureAmount);
      if (camberCmpPressureAction === 'increase') {
        recommendedPressure += adj;
      } else if (camberCmpPressureAction === 'decrease') {
        recommendedPressure -= adj;
      }
    }
    // If no critical pressure issues yet, this becomes a warning
    if (currentPressureSeverity === 'good') currentPressureSeverity = 'warning';
    currentPressureAction = camberCmpPressureAction; // Mark that a pressure action was taken due to camber
  }

  // Only add camber *adjustments* if pressure is already good or only minor pressure warnings exist
  if (currentPressureSeverity !== 'critical') { // Allow camber recs if warning or good
    if (isFront) {
      camberCalculation = outside - (inside - 7);

      if (camberCalculation < -5) { // Negative value -> inside is much hotter than 7F target -> too much negative camber
        tireRecommendations.push({
          type: 'camber',
          severity: 'critical',
          message: `Too much negative camber. Inside edge ${Math.round(inside)}°F compared to outside edge ${Math.round(outside)}°F. Camber Calc: ${camberCalculation.toFixed(1)}. Reduce negative camber.`,
          action: 'less_negative',
        });
        if (overallSeverity === 'good' || overallSeverity === 'warning') overallSeverity = 'critical';
      } else if (camberCalculation > 5) { // Positive value -> inside is less hot than 7F target -> too little negative camber
        tireRecommendations.push({
          type: 'camber',
          severity: 'critical',
          message: `Too little negative camber. Inside edge ${Math.round(inside)}°F compared to outside edge ${Math.round(outside)}°F. Camber Calc: ${camberCalculation.toFixed(1)}. Increase negative camber.`,
          action: 'more_negative',
        });
        if (overallSeverity === 'good' || overallSeverity === 'warning') overallSeverity = 'critical';
      } else if (Math.abs(camberCalculation) > 2) {
        tireRecommendations.push({
          type: 'camber',
          severity: 'warning',
        });
        if (overallSeverity === 'good') overallSeverity = 'warning';
      }
    }
  }

  // Determine overall severity based on all collected recommendations
  for (const rec of tireRecommendations) {
    if (rec.severity === 'critical') {
      overallSeverity = 'critical';
      break; // Critical is the highest, no need to check further
    }
    if (rec.severity === 'warning' && overallSeverity === 'good') {
      overallSeverity = 'warning';
    }
  }

  // If no specific recommendations, and currentPressureSeverity is good, add a general good message
  if (tireRecommendations.length === 0 && currentPressureSeverity === 'good') {
    tireRecommendations.push({
      type: 'pressure',
      severity: 'good',
      message: 'Tire pressure looks good!',
      action: 'none',
    });
  }

  return {
    position,
    inside,
    middle,
    outside,
    avg: Math.round(avg),
    spread: Math.round(spread),
    middleDiff: Math.round(middleDiff),
    camberDiff: Math.round(camberDiff),
    pressureAction: currentPressureAction, // Use the last determined pressure action
    severity: overallSeverity, // Use the consolidated overall severity
    recommendations: tireRecommendations, // Return the consolidated list
    currentPressure,
    recommendedPressure,
    camberCalculation,
    psiCalculation,
  };
}

/**
 * Analyze all four tires together for overall balance
 */
export function analyzeFullCar(tires) {
  const { LF, RF, LR, RR } = tires;
  const results = {};
  const overallRecommendations = [];

  // Analyze individual tires
  for (const [pos, data] of Object.entries(tires)) {
    if (data.inside && data.middle && data.outside) {
      results[pos] = analyzeTire(
        parseFloat(data.inside),
        parseFloat(data.middle),
        parseFloat(data.outside),
        pos,
        data.pressure ? parseFloat(data.pressure) : null
      );
    }
  }

  const analyzed = Object.values(results);
  if (analyzed.length < 4) {
    return { tires: results, overall: overallRecommendations, deltas: null };
  }

  // Front vs rear balance
  const frontAvg = (results.LF.avg + results.RF.avg) / 2;
  const rearAvg = (results.LR.avg + results.RR.avg) / 2;
  const frontRearDiff = frontAvg - rearAvg;

  if (frontRearDiff > 20) {
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Front tires are running ${Math.round(frontRearDiff)}°F hotter than rears on average. The front is doing more work — car may be understeering. Try reducing front tire pressure 1-2 PSI or increasing rear pressure 1-2 PSI. Also consider softening front springs.`
    });
  } else if (frontRearDiff < -20) {
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `Rear tires are running ${Math.round(Math.abs(frontRearDiff))}°F hotter than fronts on average. The rear is doing more work — car may be oversteering. Try reducing rear tire pressure 1-2 PSI or increasing front pressure 1-2 PSI. Also consider stiffening rear springs.`
    });
  }

  // Left vs right balance
  const leftAvg = (results.LF.avg + results.LR.avg) / 2;
  const rightAvg = (results.RF.avg + results.RR.avg) / 2;
  const leftRightDiff = leftAvg - rightAvg;

  if (Math.abs(leftRightDiff) > 15) {
    const hotSide = leftRightDiff > 0 ? 'left' : 'right';
    overallRecommendations.push({
      type: 'balance',
      severity: 'warning',
      message: `${hotSide.charAt(0).toUpperCase() + hotSide.slice(1)} side is running ${Math.round(Math.abs(leftRightDiff))}°F hotter. Check weight distribution or consider cross-weight adjustment.`
    });
  }

  // Diagonal balance (cross-weight)
  const diag1 = (results.LF.avg + results.RR.avg) / 2;
  const diag2 = (results.RF.avg + results.LR.avg) / 2;
  const diagDiff = diag1 - diag2;

  if (Math.abs(diagDiff) > 15) {
    overallRecommendations.push({
      type: 'crossweight',
      severity: 'warning',
      message: `Diagonal imbalance detected (${Math.round(Math.abs(diagDiff))}°F). ${diagDiff > 0 ? 'LF/RR diagonal' : 'RF/LR diagonal'} is hotter. Adjust cross-weight to balance.`
    });
  }

  // Check for a tire not working hard enough
  const avgTemps = analyzed.map(t => t.avg);
  const overallAvg = avgTemps.reduce((a, b) => a + b, 0) / avgTemps.length;
  for (const tire of analyzed) {
    if (tire.avg < overallAvg - 20) {
      overallRecommendations.push({
        type: 'individual',
        severity: 'warning',
        message: `${formatPosition(tire.position)} is running ${Math.round(overallAvg - tire.avg)}°F cooler than average. This tire isn't doing enough work. Consider adding static weight at this corner.`
      });
    }
    if (tire.avg > overallAvg + 20) {
      overallRecommendations.push({
        type: 'individual',
        severity: 'warning',
        message: `${formatPosition(tire.position)} is running ${Math.round(tire.avg - overallAvg)}°F hotter than average. This tire is overworked. Try increasing pressure 1 PSI at this corner, or consider reducing static weight or adjusting springs.`
      });
    }
  }

  // Compute deltas for the delta table
  const leftAvgAll = (results.LF.avg + results.LR.avg) / 2;
  const rightAvgAll = (results.RF.avg + results.RR.avg) / 2;
  const diag1All = (results.LF.avg + results.RR.avg) / 2;
  const diag2All = (results.RF.avg + results.LR.avg) / 2;

  const deltas = {
    // Temperature deltas
    frontRear: Math.round(frontRearDiff),       // + = front hotter (understeer), - = rear hotter (oversteer)
    leftRight: Math.round(leftAvgAll - rightAvgAll), // + = left hotter, - = right hotter
    diagonal: Math.round(diag1All - diag2All),  // + = LF/RR hotter, - = RF/LR hotter
    // Individual tire averages
    lfAvg: results.LF.avg,
    rfAvg: results.RF.avg,
    lrAvg: results.LR.avg,
    rrAvg: results.RR.avg,
    frontAvg: Math.round(frontAvg),
    rearAvg: Math.round(rearAvg),
    leftAvg: Math.round(leftAvgAll),
    rightAvg: Math.round(rightAvgAll),
  };

  return { tires: results, overall: overallRecommendations, deltas };
}

export function formatPosition(pos) {
  const names = { LF: 'Left Front', RF: 'Right Front', LR: 'Left Rear', RR: 'Right Rear' };
  return names[pos] || pos;
}

/**
 * Get handling recommendations based on reported car behavior
 */
const perTireRecommendations = {
  tight_entry: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Decrease PSI",
      RR: "Increase PSI",
    },
    Camber: {
      LF: "Add 0.5-1.0° negative camber",
      RF: "Reduce 0.5-1.0° negative camber",
    },
    Caster: {
      LF: "Increase caster slightly",
      RF: "Increase caster slightly",
    },
    "Front Toe": {
      "Front Toe": "Reduce toe-out slightly",
    },
    Spring: {
      LF: "Higher Spring Rate",
      LR: "Lower Spring Rate",
      RF: "Lower Spring Rate",
      RR: "Higher Spring Rate",
    },
    Shock: {
      LF: "More compression",
      LR: "Same compression",
      RF: "Less Compression",
      RR: "More Compression",
      "LF-Rebound": "Less Rebound",
      "LR-Rebound": "More Rebound",
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "More Rebound",
    },
  },
  tight_middle: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Decrease PSI",
      RR: "Increase PSI",
    },
    Camber: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Spring: {
      LF: "Leave alone",
      LR: "Leave alone",
      RF: "Lower Spring Rate",
      RR: "Higher Spring Rate",
    },
    Shock: {
      LF: "More Compression",
      LR: "Less Compression",
      RF: "Less Compression",
      RR: "More Compression",
      "LF-Rebound": "Less Rebound",
      "LR-Rebound": "More Rebound",
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "Less Rebound",
    },
  },
  tight_exit: {
    "Tire Pressures": {
      LF: "Increase PSI",
      LR: "Decrease PSI",
      RF: "Decrease PSI",
      RR: "Increase PSI",
    },
    Camber: {
      LF: "More by a lot",
      RF: "Less by a lot",
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Spring: {
      LF: "Higher Spring Rate",
      LR: "Lower Spring Rate",
      RF: "Lower Spring Rate",
      RR: "Higher Spring Rate",
    },
    Shock: {
      LF: "Leave alone",
      LR: "Less Compression",
      RF: "Leave alone",
      RR: "More Compression",
      "LF-Rebound": "More Rebound",
      "LR-Rebound": "Less Rebound",
      "RF-Rebound": "More Rebound",
      "RR-Rebound": "Leave Alone",
    },
  },
  loose_entry: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Increase PSI",
      RR: "Decrease PSI",
    },
    Camber: {
      LF: "Reduce 0.5-1.0° negative camber",
      RF: "Add 0.5-1.0° negative camber",
    },
    Caster: {
      LF: "Decrease caster slightly",
      RF: "Decrease caster slightly",
    },
    "Front Toe": {
      "Front Toe": "Increase toe-out slightly",
    },
    Spring: {
      LF: "Lower Spring Rate",
      LR: "Higher Spring Rate",
      RF: "Higher Spring Rate",
      RR: "Lower Spring Rate",
    },
    Shock: {
      LF: "Less compression",
      LR: "Same compression",
      RF: "More Compression",
      RR: "Less Compression",
      "LF-Rebound": "More Rebound",
      "LR-Rebound": "Less Rebound",
      "RF-Rebound": "Leave Alone",
      "RR-Rebound": "Less Rebound",
    },
  },
  loose_middle: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Increase PSI",
      RR: "Decrease PSI",
    },
    Camber: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Spring: {
      LF: "Leave alone",
      LR: "Leave alone",
      RF: "Higher Spring Rate",
      RR: "Lower Spring Rate",
    },
    Shock: {
      LF: "Less Compression",
      LR: "More Compression",
      RF: "Leave Alone",
      RR: "Less Compression",
      "LF-Rebound": "More Rebound",
      "LR-Rebound": "Less Rebound",
      "RF-Rebound": "More Rebound",
      "RR-Rebound": "More Rebound",
    },
  },
  loose_exit: {
    "Tire Pressures": {
      LF: "Decrease PSI",
      LR: "Increase PSI",
      RF: "Increase PSI",
      RR: "Decrease PSI",
    },
    Camber: {
      LF: "Less by a lot",
      RF: "More by a lot",
    },
    Caster: {
      LF: "Leave alone",
      RF: "Leave alone",
    },
    "Front Toe": {
      "Front Toe": "Leave alone",
    },
    Spring: {
      LF: "Lower Spring Rate",
      LR: "Higher Spring Rate",
      RF: "Higher Spring Rate",
      RR: "Lower Spring Rate",
    },
    Shock: {
      LF: "Leave alone",
      LR: "More Compression",
      RF: "Leave alone",
      RR: "Less Compression",
      "LF-Rebound": "Less Rebound",
      "LR-Rebound": "More Rebound",
      "RF-Rebound": "Less Rebound",
      "RR-Rebound": "Leave Alone",
    },
  },
};

export function getHandlingRecommendations(condition, phase) {
  const recommendations = {
    loose_entry: {
      title: 'Loose on Entry (Oversteer entering the turn)',
      description: 'The rear end wants to come around when you turn in or brake into the corner.',
      changes: [
        { component: 'Rear Spring Rate', adjustment: 'Soften (lower rate)', effect: 'Allows more rear weight transfer, increasing rear grip' },
        { component: 'Rear Rebound (Shock)', adjustment: 'Soften rear rebound', effect: 'Allows rear to settle faster on entry, gaining grip' },
        { component: 'Front Compression (Shock)', adjustment: 'Stiffen front compression', effect: 'Slows front weight transfer on braking, keeping more weight on rear' },
      ]
    },
    loose_middle: {
      title: 'Loose in the Middle (Oversteer at mid-corner)',
      description: 'The rear slides out while maintaining steady throttle through the middle of the corner.',
      changes: [
        { component: 'Rear Spring Rate', adjustment: 'Soften', effect: 'Allows more mechanical grip at the rear' },
        { component: 'Rear Ride Height', adjustment: 'Lower slightly', effect: 'Lowers rear roll center, reducing rear load transfer' },
      ]
    },
    loose_exit: {
      title: 'Loose on Exit (Oversteer on throttle application)',
      description: 'The rear steps out when you apply throttle coming off the corner.',
      changes: [
        { component: 'Rear Spring Rate', adjustment: 'Soften', effect: 'Allows rear to plant better under acceleration' },
        { component: 'Rear Rebound (Shock)', adjustment: 'Stiffen rear rebound', effect: 'Keeps rear planted during weight transfer on acceleration' },
        { component: 'Rear Compression (Shock)', adjustment: 'Soften rear compression', effect: 'Allows rear to absorb bumps and maintain contact' },
        { component: 'Throttle Application', adjustment: 'Apply throttle more gradually (driver adjustment)', effect: 'Reduces sudden weight transfer off rear tires' },
      ]
    },
    tight_entry: {
      title: 'Tight on Entry (Understeer entering the turn)',
      description: 'The car wants to go straight (push) when you turn into the corner.',
      changes: [
        { component: 'Front Spring Rate', adjustment: 'Soften', effect: 'Allows more front weight transfer and grip on entry' },
        { component: 'Front Compression (Shock)', adjustment: 'Soften front compression', effect: 'Allows the front to load up faster on entry' },
        { component: 'Front Camber', adjustment: 'Add negative camber (0.25-0.5°)', effect: 'Improves front tire contact in cornering' },
        { component: 'Caster', adjustment: 'Increase caster', effect: 'Adds dynamic negative camber gain in turns, improving front grip' },
      ]
    },
    tight_middle: {
      title: 'Tight in the Middle (Understeer at mid-corner)',
      description: 'The car pushes/plows through the middle of the corner despite consistent steering input.',
      changes: [
        { component: 'Front Spring Rate', adjustment: 'Soften', effect: 'Allows more front grip in sustained cornering' },
        { component: 'Front Camber', adjustment: 'Add negative camber', effect: 'Improves front tire contact patch through the corner' },
        { component: 'Rear Ride Height', adjustment: 'Raise slightly', effect: 'Raises rear roll center, increasing rear load transfer and freeing the front' },
      ]
    },
    tight_exit: {
      title: 'Tight on Exit (Understeer on acceleration)',
      description: 'The car pushes wide when applying throttle coming off the corner.',
      changes: [
        { component: 'Rear Spring Rate', adjustment: 'Stiffen', effect: 'Reduces rear squat, keeping front loaded longer' },
        { component: 'Front Rebound (Shock)', adjustment: 'Soften front rebound', effect: 'Allows front to extend slower, maintaining front grip longer on exit' },
        { component: 'Rear Compression (Shock)', adjustment: 'Stiffen rear compression', effect: 'Controls rear squat, preventing too much weight transfer off the front' },
      ]
    }
  };

  const key = `${condition}_${phase}`;
  const result = recommendations[key] || null;

  if (result) {
    result.perTire = perTireRecommendations[key] || null;
  }

  return result;
}

export const handlingConditions = [
  { value: 'loose', label: 'Loose (Oversteer)', description: 'Rear end slides out' },
  { value: 'tight', label: 'Tight (Understeer)', description: 'Car pushes/plows wide' },
];

export const cornerPhases = [
  { value: 'entry', label: 'Corner Entry', description: 'Braking zone into the turn' },
  { value: 'middle', label: 'Mid-Corner', description: 'Steady state through the apex' },
  { value: 'exit', label: 'Corner Exit', description: 'Applying throttle out of the turn' },
];
