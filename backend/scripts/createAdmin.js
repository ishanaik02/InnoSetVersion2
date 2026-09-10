/**
 * One-off CLI script to create (or promote) an admin user.
 * There is no public "sign up as admin" API route on purpose — admin
 * accounts are provisioned by whoever controls the server/database.
 *
 * Usage:
 *   cd backend
 *   node scripts/createAdmin.js "Admin Name" admin@company.com ADM001 aStrongPassword123
 *
 * If a user with that employeeId already exists, this promotes them to
 * role "admin" and resets their password instead of creating a duplicate.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');

async function main() {
  const [name, email, employeeId, password] = process.argv.slice(2);

  if (!name || !email || !employeeId || !password) {
    console.log('Usage: node scripts/createAdmin.js "Admin Name" admin@company.com ADM001 aStrongPassword123');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('Password should be at least 8 characters.');
    process.exit(1);
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ employeeId });

  if (existing) {
    existing.role = 'admin';
    existing.passwordHash = passwordHash;
    existing.name = name;
    existing.email = email;
    await existing.save();
    console.log(`Existing user ${employeeId} promoted to admin and password updated.`);
  } else {
    await User.create({ name, employeeId, email, passwordHash, role: 'admin' });
    console.log(`Admin user created: ${employeeId} / ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
