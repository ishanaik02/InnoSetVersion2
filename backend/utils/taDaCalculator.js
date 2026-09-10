const { CONVEYANCE_RATES, isCarEligible } = require('./policyRates');

/**
 * Server-side is the source of truth for TA/DA — never trust client-calculated amounts
 * for final reimbursement. Recompute here before persisting/approving.
 *
 * Rates per policy sheet Section 8: Bike Rs.3.5/km (all grades), Car Rs.6/km
 * (ONLY grades IE2/IE1).
 */
function calculateTaDa(conveyance, distanceKm = 0, receiptAmount = 0, grade = null) {
  const type = (conveyance || '').toLowerCase();

  if (type === 'car' && grade && !isCarEligible(grade)) {
    return { amount: 0, mode: 'ineligible' };
  }

  if (type === 'bike' || type === 'car') {
    const amount = Math.round(distanceKm * CONVEYANCE_RATES[type] * 100) / 100;
    return { amount, mode: 'auto' };
  }

  if (type === 'bus' || type === 'train') {
    return { amount: Number(receiptAmount) || 0, mode: 'manual' };
  }

  return { amount: 0, mode: 'none' };
}

module.exports = { calculateTaDa, RATES: CONVEYANCE_RATES };
