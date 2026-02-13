// feeCalculator.js - Scalable state fee calculation system

/**
 * Calculate all fees for a vehicle based on state fee schedules
 * @param {string} state - Two-letter state code (e.g., 'UT')
 * @param {object} vehicle - Vehicle object with year, make, model, mileage, price, etc.
 * @param {object} supabase - Supabase client instance
 * @returns {object|null} - Object with calculated fees or null if no schedules found
 */
export async function calculateFees(state, vehicle, supabase) {
  if (!state || !vehicle || !supabase) {
    console.error('[feeCalculator] Missing required parameters');
    return null;
  }

  const stateUpper = state.toUpperCase();

  try {
    // Fetch fee schedules for this state
    const { data: schedules, error } = await supabase
      .from('state_fee_schedules')
      .select('*')
      .eq('state', stateUpper);

    if (error) {
      console.error('[feeCalculator] Error fetching schedules:', error);
      return null;
    }

    if (!schedules || schedules.length === 0) {
      console.log(`[feeCalculator] No fee schedules found for ${stateUpper} - manual entry required`);
      return null;
    }

    const fees = {};
    let total = 0;

    for (const schedule of schedules) {
      const feeAmount = calculateSingleFee(schedule.formula, vehicle);

      fees[schedule.fee_type] = {
        name: schedule.fee_name || schedule.fee_type,
        amount: feeAmount,
        calculation_type: schedule.calculation_type,
        source_agency: schedule.source_agency,
        ai_discovered: schedule.ai_discovered,
        human_verified: schedule.human_verified
      };

      total += feeAmount;
    }

    fees.total = total;
    fees.state = stateUpper;
    fees.schedules_count = schedules.length;

    console.log(`[feeCalculator] Calculated ${schedules.length} fees for ${stateUpper}:`, fees);
    return fees;

  } catch (err) {
    console.error('[feeCalculator] Error calculating fees:', err);
    return null;
  }
}

/**
 * Calculate a single fee based on its formula
 * @param {object} formula - JSON formula object
 * @param {object} vehicle - Vehicle object
 * @returns {number} - Calculated fee amount
 */
export function calculateSingleFee(formula, vehicle) {
  if (!formula || !formula.type) {
    return 0;
  }

  try {
    switch (formula.type) {
      case 'flat':
        return parseFloat(formula.amount) || 0;

      case 'percentage':
        // Percentage of vehicle price, trade value, etc.
        const baseField = formula.base_field || 'price';
        const baseValue = parseFloat(vehicle[baseField]) || 0;
        const percentage = parseFloat(formula.percentage) || 0;
        return baseValue * percentage;

      case 'age_based_percentage':
        // Utah property tax: age-based percentage of MSRP
        return calculateAgeBased(formula, vehicle);

      case 'weight_based':
        // Fee based on vehicle weight
        const weight = parseFloat(vehicle.weight) || 0;
        return calculateWeightBased(formula, weight);

      case 'tiered':
        // Tiered fee based on value ranges
        const value = parseFloat(vehicle[formula.base_field || 'price']) || 0;
        return calculateTiered(formula, value);

      default:
        console.warn(`[feeCalculator] Unknown formula type: ${formula.type}`);
        return 0;
    }
  } catch (err) {
    console.error('[feeCalculator] Error calculating single fee:', err);
    return 0;
  }
}

/**
 * Calculate age-based fee (e.g., Utah property tax)
 * @param {object} formula - Formula with rates_by_age
 * @param {object} vehicle - Vehicle with year
 * @returns {number} - Calculated fee
 */
function calculateAgeBased(formula, vehicle) {
  const currentYear = new Date().getFullYear();
  const vehicleYear = parseInt(vehicle.year) || currentYear;
  const age = Math.max(0, currentYear - vehicleYear);

  const baseValue = parseFloat(vehicle[formula.base_field || 'price']) || 0;
  const rates = formula.rates_by_age || {};

  // Find applicable rate
  let rate = 0;
  if (rates[age] !== undefined) {
    rate = parseFloat(rates[age]);
  } else if (rates[`${age}+`] !== undefined) {
    rate = parseFloat(rates[`${age}+`]);
  } else {
    // Check for range like "6+"
    const rangeKeys = Object.keys(rates).filter(k => k.includes('+'));
    for (const key of rangeKeys) {
      const minAge = parseInt(key);
      if (age >= minAge) {
        rate = parseFloat(rates[key]);
        break;
      }
    }
  }

  const calculatedFee = baseValue * rate;
  const minimum = parseFloat(formula.minimum) || 0;

  return Math.max(calculatedFee, minimum);
}

/**
 * Calculate weight-based fee
 * @param {object} formula - Formula with weight tiers
 * @param {number} weight - Vehicle weight in pounds
 * @returns {number} - Calculated fee
 */
function calculateWeightBased(formula, weight) {
  const tiers = formula.weight_tiers || [];

  for (const tier of tiers) {
    const min = parseFloat(tier.min) || 0;
    const max = parseFloat(tier.max) || Infinity;

    if (weight >= min && weight < max) {
      return parseFloat(tier.amount) || 0;
    }
  }

  return parseFloat(formula.default_amount) || 0;
}

/**
 * Calculate tiered fee based on value ranges
 * @param {object} formula - Formula with value tiers
 * @param {number} value - Base value (e.g., vehicle price)
 * @returns {number} - Calculated fee
 */
function calculateTiered(formula, value) {
  const tiers = formula.value_tiers || [];

  for (const tier of tiers) {
    const min = parseFloat(tier.min) || 0;
    const max = parseFloat(tier.max) || Infinity;

    if (value >= min && value < max) {
      return parseFloat(tier.amount) || 0;
    }
  }

  return parseFloat(formula.default_amount) || 0;
}

/**
 * Get fee schedule metadata for a state
 * @param {string} state - Two-letter state code
 * @param {object} supabase - Supabase client instance
 * @returns {object|null} - Metadata about fee schedules
 */
export async function getFeeScheduleInfo(state, supabase) {
  if (!state || !supabase) return null;

  const stateUpper = state.toUpperCase();

  try {
    const { data: schedules, error } = await supabase
      .from('state_fee_schedules')
      .select('fee_type, fee_name, ai_discovered, human_verified, source_agency, last_verified')
      .eq('state', stateUpper);

    if (error) throw error;

    if (!schedules || schedules.length === 0) {
      return {
        state: stateUpper,
        has_schedules: false,
        count: 0,
        needs_discovery: true
      };
    }

    const aiCount = schedules.filter(s => s.ai_discovered).length;
    const verifiedCount = schedules.filter(s => s.human_verified).length;

    return {
      state: stateUpper,
      has_schedules: true,
      count: schedules.length,
      ai_discovered_count: aiCount,
      human_verified_count: verifiedCount,
      needs_verification: aiCount > 0 && verifiedCount === 0,
      schedules: schedules.map(s => ({
        fee_type: s.fee_type,
        fee_name: s.fee_name,
        verified: s.human_verified,
        ai_discovered: s.ai_discovered
      }))
    };
  } catch (err) {
    console.error('[feeCalculator] Error getting schedule info:', err);
    return null;
  }
}
