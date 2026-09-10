/**
 * One-off CLI script to bulk-create engineer accounts from a CSV file.
 * Mirrors the pattern in scripts/createAdmin.js — connects directly to
 * MongoDB rather than going through the API, since this is a one-time
 * onboarding operation, not a runtime feature.
 *
 * CSV format (first row must be a header row, exactly these columns —
 * password and grade are optional):
 *
 *   name,employeeId,email,grade,password
 *   Ravi Kumar,EMP1024,ravi@company.com,IE5,
 *   Priya Singh,EMP1025,priya@company.com,IE4,MyOwnPass123
 *
 * - If "password" is left blank, a random secure password is generated
 *   for that engineer automatically.
 * - If "grade" is left blank, it defaults to the schema default (IE7).
 * - Rows with an employeeId that already exists in the database are
 *   skipped (not overwritten) and reported at the end.
 *
 * Usage:
 *   cd backend
 *   node scripts/bulkCreateEngineers.js path/to/engineers.csv
 *
 * Output:
 *   - Progress printed to the console as each row is processed.
 *   - A results CSV written to scripts/output/created-<timestamp>.csv
 *     containing every successfully created account's employeeId and
 *     password in plaintext — this is the ONLY place the plaintext
 *     password ever exists (the database only ever stores the bcrypt
 *     hash). Treat this output file as sensitive: share each engineer's
 *     row with them individually and then delete the file. Do not
 *     commit it, email it as one big list, or leave it sitting in a
 *     shared folder.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');
const { GRADES } = require('../utils/policyRates');

const DEFAULT_GRADE = 'IE7'; // matches the schema default in models/User.js

function generatePassword() {
  // 12 chars, alphanumeric, avoids visually-ambiguous characters (0/O, 1/l/I)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    pw += alphabet[bytes[i] % alphabet.length];
  }
  return pw;
}

// Minimal CSV line parser that handles quoted fields containing commas
// (e.g. "Kumar, Ravi") without pulling in an external dependency.
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must have a header row plus at least one data row.');
  }
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const required = ['name', 'employeeid'];
  for (const col of required) {
    if (!header.includes(col)) {
      throw new Error(`CSV header is missing required column "${col}". Header found: ${header.join(', ')}`);
    }
  }
  return lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line);
    const row = {};
    header.forEach((col, i) => {
      row[col] = values[i] !== undefined ? values[i] : '';
    });
    row._rowNumber = idx + 2; // +2 = 1 for header row, 1 for 0-index
    return row;
  });
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.log('Usage: node scripts/bulkCreateEngineers.js path/to/engineers.csv');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.log(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  let rows;
  try {
    rows = parseCsv(raw);
  } catch (err) {
    console.log(`CSV parse error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} row(s) from ${csvPath}. Connecting to database...`);
  await connectDB();

  const created = [];
  const skipped = [];
  const failed = [];

  for (const row of rows) {
    const name = row.name;
    const employeeId = row.employeeid;
    const email = row.email || undefined;
    let grade = (row.grade || '').toUpperCase() || DEFAULT_GRADE;
    let password = row.password || '';

    if (!name || !employeeId) {
      failed.push({ row: row._rowNumber, reason: 'Missing required name or employeeId' });
      continue;
    }
    if (!GRADES.includes(grade)) {
      failed.push({ row: row._rowNumber, employeeId, reason: `Invalid grade "${grade}". Must be one of: ${GRADES.join(', ')}` });
      continue;
    }

    const existing = await User.findOne({ employeeId });
    if (existing) {
      skipped.push({ row: row._rowNumber, employeeId, reason: 'employeeId already exists — not overwritten' });
      continue;
    }

    if (!password) {
      password = generatePassword();
    } else if (password.length < 6) {
      failed.push({ row: row._rowNumber, employeeId, reason: 'Provided password is under 6 characters' });
      continue;
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        employeeId,
        email,
        passwordHash,
        grade,
        role: 'engineer',
      });
      created.push({ employeeId: user.employeeId, name: user.name, email: user.email || '', grade: user.grade, password });
      console.log(`  ✓ Created ${employeeId} (${name})`);
    } catch (err) {
      failed.push({ row: row._rowNumber, employeeId, reason: err.message });
    }
  }

  // Write results CSV with plaintext passwords — see file header for handling guidance
  if (created.length > 0) {
    const outDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `created-${timestamp}.csv`);
    const csvLines = ['name,employeeId,email,grade,password'];
    for (const c of created) {
      csvLines.push([c.name, c.employeeId, c.email, c.grade, c.password].map((v) => `"${v}"`).join(','));
    }
    fs.writeFileSync(outPath, csvLines.join('\n'));
    console.log(`\nCredentials for ${created.length} new account(s) written to: ${outPath}`);
    console.log('Distribute each row individually to that engineer, then delete this file.');
  }

  console.log('\n--- Summary ---');
  console.log(`Created: ${created.length}`);
  console.log(`Skipped (already existed): ${skipped.length}`);
  console.log(`Failed: ${failed.length}`);
  if (skipped.length > 0) {
    console.log('\nSkipped rows:');
    skipped.forEach((s) => console.log(`  Row ${s.row} (${s.employeeId}): ${s.reason}`));
  }
  if (failed.length > 0) {
    console.log('\nFailed rows:');
    failed.forEach((f) => console.log(`  Row ${f.row}${f.employeeId ? ' (' + f.employeeId + ')' : ''}: ${f.reason}`));
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
