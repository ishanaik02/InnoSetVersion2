/**
 * TA/DA policy constants, transcribed from the company policy sheet
 * (sections 6-8: DA Slabs, Lodging & Boarding Allowance, Conveyance
 * Allowance). Keep this in sync with backend/utils/policyRates.js — the
 * backend copy is the source of truth for what actually gets reimbursed;
 * this one drives the UI so engineers see the same numbers before they submit.
 */

// Grades ordered highest-to-lowest per the policy table bands.
export const GRADES = ['IE8', 'IE7', 'IE6', 'IE5', 'IE4', 'IE3', 'IE2', 'IE1'];

// Section 8 — Conveyance Allowance
export const CONVEYANCE_RATES = {
  bike: 3.5, // Rs. 3.5 per km, all grades
  car: 6, // Rs. 6 per km, ONLY grades IE2 and IE1
};
export const CAR_ELIGIBLE_GRADES = ['IE2', 'IE1'];
export const CONVEYANCE_TYPES = ['bike', 'car', 'bus', 'train'];

export function isCarEligible(grade) {
  return CAR_ELIGIBLE_GRADES.includes(grade);
}

// Section 6 — DA Slabs. "Local Visit (within Indore/current branch)" is
// explicitly excluded from DA regardless of distance.
export const DA_SLABS = {
  belowOrEqual100Km: 150,
  above100Km: 250,
  nightStay: 300,
};

/**
 * @param {{ distanceKm: number, isLocalVisit: boolean, tripType: 'round'|'stay' }} params
 * @returns {{ amount: number, breakdown: string }}
 */
export function calculateDaAmount({ distanceKm = 0, isLocalVisit = false, tripType }) {
  if (isLocalVisit) {
    return { amount: 0, breakdown: 'Local visit (within Indore/current branch) — DA not applicable' };
  }
  if (tripType === 'stay') {
    return { amount: DA_SLABS.nightStay, breakdown: `Night Stay DA = ₹${DA_SLABS.nightStay}` };
  }
  if (distanceKm > 100) {
    return { amount: DA_SLABS.above100Km, breakdown: `Travel above 100km DA = ₹${DA_SLABS.above100Km}` };
  }
  return { amount: DA_SLABS.belowOrEqual100Km, breakdown: `Travel below 100km DA = ₹${DA_SLABS.belowOrEqual100Km}` };
}

// Section 7 — Lodging and Boarding Allowance (hotel night-stay limit by grade band)
export const LODGING_LIMITS = [
  { grades: ['IE8', 'IE7'], withBill: 250, withoutBill: 200, conveyanceEligibility: 'Bus, Train (SL)' },
  { grades: ['IE6', 'IE5'], withBill: 400, withoutBill: 200, conveyanceEligibility: 'Bus, Train (SL)' },
  {
    grades: ['IE4', 'IE3'],
    withBill: 600,
    withoutBill: 300,
    conveyanceEligibility: 'Manager: Bus, Train (SL) · Sr. Manager: Bus, Train 3AC/Share Taxi',
  },
  { grades: ['IE2', 'IE1'], withBill: 1000, withoutBill: 500, conveyanceEligibility: 'Bus/Train 3AC/Share Taxi' },
];

export function getLodgingLimit(grade, hasBill = true) {
  const band = LODGING_LIMITS.find((b) => b.grades.includes(grade));
  if (!band) return null;
  return hasBill ? band.withBill : band.withoutBill;
}
