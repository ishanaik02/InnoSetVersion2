/**
 * TA/DA policy constants, transcribed from the company policy sheet
 * (sections 6-8). This backend copy is the source of truth for what
 * actually gets reimbursed — never trust client-submitted amounts.
 * Keep in sync with src/utils/policyRates.js (frontend display copy).
 */

const GRADES = ['IE8', 'IE7', 'IE6', 'IE5', 'IE4', 'IE3', 'IE2', 'IE1'];

const CONVEYANCE_RATES = {
  bike: 3.5,
  car: 6,
};
const CAR_ELIGIBLE_GRADES = ['IE2', 'IE1'];

function isCarEligible(grade) {
  return CAR_ELIGIBLE_GRADES.includes(grade);
}

const DA_SLABS = {
  belowOrEqual100Km: 150,
  above100Km: 250,
  nightStay: 300,
};

function calculateDaAmount({ distanceKm = 0, isLocalVisit = false, tripType }) {
  if (isLocalVisit) return 0;
  if (tripType === 'stay') return DA_SLABS.nightStay;
  return distanceKm > 100 ? DA_SLABS.above100Km : DA_SLABS.belowOrEqual100Km;
}

const LODGING_LIMITS = [
  { grades: ['IE8', 'IE7'], withBill: 250, withoutBill: 200 },
  { grades: ['IE6', 'IE5'], withBill: 400, withoutBill: 200 },
  { grades: ['IE4', 'IE3'], withBill: 600, withoutBill: 300 },
  { grades: ['IE2', 'IE1'], withBill: 1000, withoutBill: 500 },
];

function getLodgingLimit(grade, hasBill = true) {
  const band = LODGING_LIMITS.find((b) => b.grades.includes(grade));
  if (!band) return null;
  return hasBill ? band.withBill : band.withoutBill;
}

module.exports = {
  GRADES,
  CONVEYANCE_RATES,
  CAR_ELIGIBLE_GRADES,
  isCarEligible,
  DA_SLABS,
  calculateDaAmount,
  LODGING_LIMITS,
  getLodgingLimit,
};
