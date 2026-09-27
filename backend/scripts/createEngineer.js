/**
 * One-off CLI script to create a single service engineer from command-line
 * arguments. Mirrors scripts/createAdmin.js — connects directly to MongoDB
 * rather than going through the API.
 *
 * Usage:
 *   cd backend
 *   node scripts/createEngineer.js "Ravi Kumar" EMP1024 [email] BR01 [grade] [password]
 *
 *   - name, employeeId required
 *   - email optional (pass "" to skip)
 *   - branchCode must match an existing branch's `code` (e.g. BR01) — the
 *     script looks up the branch and assigns its _id
 *   - grade optional, one of: IE1..IE7 (default IE7); drives TA/DA rates
 *   - password optional; if omitted a random 12-char password is generated
 *     and printed once. Distribute it to the engineer and have them change
 *     it after first login.
 *
 * Examples:
 *   node scripts/createEngineer.js "Ravi Kumar" EMP1024 ravi@company.com BR01
 *   node scripts/createEngineer.js "Priya Singh" EMP1025 priya@company.com BR02 IE5 MyOwnPass123
 *   node scripts/createEngineer.js "Amit Verma" EMP1026 "" BR03 IE4
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Branch = require('../models/Branch');
const connectDB = require('../config/db');
const { GRADES } = require('../utils/policyRates');

const DEFAULT_GRADE = 'IE7';

function generatePassword() {
  // 12 chars, alphanumeric, avoids visually-ambiguous characters (0/O, 1/l/I)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += alphabet[bytes[i] % alphabet.length];
  }
  return pw;
}

async function main() {
  const [name, employeeId, emailArg, branchCodeArg, gradeArg, passwordArg] = process.argv.slice(2);

  if (!name || !employeeId) {
    console.log('Usage: node scripts/createEngineer.js "Name" EMPID [email] BRANCHCODE [grade] [password]');
    console.log('  email: pass "" to skip. grade: IE1..IE7 (default IE7). password: optional, random if omitted.');
    process.exit(1);
  }

  await connectDB();

  // Resolve branch by code so the user lands in the right branch scope
  const branchCode = (branchCodeArg || '').toUpperCase();
  let branch = null;
  if (branchCode) {
    branch = await Branch.findOne({ code: branchCode });
    if (!branch) {
      console.error(`Branch "${branchCode}" not found. Run seed-branches first, or use one of the seeded codes (BR01..BR05).`);
      process.exit(1);
    }
  }

  const existing = await User.findOne({ employeeId });
  if (existing) {
    console.error(`User ${employeeId} already exists — nothing changed.`);
    process.exit(1);
  }

  const email = emailArg && emailArg.trim() ? emailArg.trim() : undefined;
  const grade = (gradeArg || '').toUpperCase() || DEFAULT_GRADE;
  if (!GRADES.includes(grade)) {
    console.error(`Invalid grade "${grade}". Must be one of: ${GRADES.join(', ')}`);
    process.exit(1);
  }

  const password = passwordArg || generatePassword();
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    employeeId,
    email,
    passwordHash,
    grade,
    role: 'service_engineer',
    branch: branch ? branch._id : undefined,
    isActive: true,
  });

  console.log('\n✓ Service engineer created');
  console.log(`  Name:        ${user.name}`);
  console.log(`  Employee ID: ${user.employeeId}`);
  console.log(`  Email:       ${user.email || '(none)'}`);
  console.log(`  Grade:       ${user.grade}`);
  console.log(`  Branch:      ${branch ? `${branch.code} (${branch.city})` : '(none)'}`);
  console.log(`  Role:        ${user.role}`);
  console.log(`  Password:    ${password}   <-- share securely, change after first login`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create engineer:', err.message);
  process.exit(1);
});
