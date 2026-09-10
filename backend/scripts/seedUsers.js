const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Branch = require('../models/Branch');
require('dotenv').config();

// Default password for all seeded users
const DEFAULT_PASSWORD = 'InnoSet@2026';

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function seedUsers() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/service_engineer_trips';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Get all branches
    const branches = await Branch.find({ isActive: true });
    if (branches.length === 0) {
      console.error('No branches found. Please run seedBranches.js first.');
      return;
    }

    console.log(`Found ${branches.length} active branches`);

    const hashedPassword = await hashPassword(DEFAULT_PASSWORD);
    const usersToCreate = [];

    // Create Branch Manager and HR for each branch
    for (const branch of branches) {
      const branchCode = branch.code;
      
      // Branch Manager
      usersToCreate.push({
        name: `${branch.city} Branch Manager`,
        employeeId: `EMP-BM-${branchCode}`,
        email: `bm.${branchCode.toLowerCase()}@innoset.com`,
        passwordHash: hashedPassword,
        role: 'branch_manager',
        branch: branch._id,
        isActive: true,
      });

      // HR Staff
      usersToCreate.push({
        name: `${branch.city} HR`,
        employeeId: `EMP-HR-${branchCode}`,
        email: `hr.${branchCode.toLowerCase()}@innoset.com`,
        passwordHash: hashedPassword,
        role: 'hr',
        branch: branch._id,
        isActive: true,
      });
    }

    // Service Head (HQ-level, not branch-specific)
    usersToCreate.push({
      name: 'Service Head',
      employeeId: 'EMP-SH-001',
      email: 'service.head@innoset.com',
      passwordHash: hashedPassword,
      role: 'service_head',
      branch: branches[0]._id, // Assigned to Indore for reference
      isActive: true,
    });

    // Account Dept (HQ-level, not branch-specific)
    usersToCreate.push({
      name: 'Account Department',
      employeeId: 'EMP-ACCT-001',
      email: 'account.dept@innoset.com',
      passwordHash: hashedPassword,
      role: 'account_dept',
      branch: branches[0]._id, // Assigned to Indore for reference
      isActive: true,
    });

    // Super Admin (already exists, skip if present)
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (!existingAdmin) {
      usersToCreate.push({
        name: 'Super Admin',
        employeeId: 'EMP-ADMIN-001',
        email: 'admin@innoset.com',
        passwordHash: hashedPassword,
        role: 'super_admin',
        branch: branches[0]._id,
        isActive: true,
      });
    }

    // Insert users (skip duplicates by employeeId)
    let createdCount = 0;
    for (const userData of usersToCreate) {
      try {
        await User.create(userData);
        createdCount++;
      } catch (err) {
        if (err.code === 11000) {
          console.log(`Skipping duplicate: ${userData.employeeId}`);
        } else {
          console.error(`Error creating ${userData.employeeId}:`, err.message);
        }
      }
    }

    console.log(`\nSuccessfully created ${createdCount} users`);
    console.log('\nUser Summary:');
    console.log('-------------');
    
    const summary = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    
    summary.forEach((s) => {
      console.log(`  ${s._id}: ${s.count}`);
    });

    console.log('\nDefault password for all seeded users: InnoSet@2026');
    console.log('⚠️  IMPORTANT: Change passwords after first login!');
  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  seedUsers();
}

module.exports = seedUsers;
