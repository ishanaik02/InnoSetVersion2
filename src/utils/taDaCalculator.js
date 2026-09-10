/**
 * TA/DA Calculation Logic — rates per company policy sheet (Section 8):
 * Bike -> Rs. 3.5 per km, all grades
 * Car  -> Rs. 6 per km, ONLY grades IE2 and IE1
 * Bus/Train -> manual entry from uploaded receipt (no auto formula)
 */
import { CONVEYANCE_RATES, CONVEYANCE_TYPES, isCarEligible } from './policyRates';

export { CONVEYANCE_TYPES };

/**
 * @param {string} conveyance - 'bike' | 'car' | 'bus' | 'train'
 * @param {number} distanceKm - total trip distance in km
 * @param {number} receiptAmount - amount entered from receipt (bus/train only)
 * @param {string} [grade] - engineer's grade (e.g. 'IE2'), required to validate car eligibility
 * @returns {{ amount: number, mode: 'auto' | 'manual' | 'ineligible' | 'none', breakdown: string }}
 */
export function calculateTaDa(conveyance, distanceKm = 0, receiptAmount = 0, grade = null) {
  const type = (conveyance || '').toLowerCase();

  if (type === 'car' && grade && !isCarEligible(grade)) {
    return {
      amount: 0,
      mode: 'ineligible',
      breakdown: `Car conveyance is only reimbursable for grades IE2/IE1 (your grade: ${grade})`,
    };
  }

  if (type === 'bike' || type === 'car') {
    const rate = CONVEYANCE_RATES[type];
    const amount = Math.round(distanceKm * rate * 100) / 100;
    return {
      amount,
      mode: 'auto',
      breakdown: `${distanceKm.toFixed(2)} km x ₹${rate} = ₹${amount.toFixed(2)}`,
    };
  }

  if (type === 'bus' || type === 'train') {
    const amount = Number(receiptAmount) || 0;
    return {
      amount,
      mode: 'manual',
      breakdown: `As per uploaded ${type} receipt = ₹${amount.toFixed(2)}`,
    };
  }

  return { amount: 0, mode: 'none', breakdown: 'Select a conveyance type' };
}

export function requiresReceiptUpload(conveyance) {
  return conveyance === 'bus' || conveyance === 'train';
}
