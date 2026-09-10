const mongoose = require('mongoose');
const User = require('../models/User');
const Trip = require('../models/Trip');
const Branch = require('../models/Branch');
require('dotenv').config();

async function migrateExistingData() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/service_engineer_trips';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Find Indore branch (BR01)
    const indoreBranch = await Branch.findOne({ code: 'BR01' });
    if (!indoreBranch) {
      console.error('Indore branch (BR01) not found. Please run seedBranches.js first.');
      return;
    }

    console.log(`Found Indore branch: ${indoreBranch._id}`);

    // Step 1: Migrate existing users without branch to Indore
    const usersWithoutBranch = await User.countDocuments({ branch: { $exists: false } });
    if (usersWithoutBranch > 0) {
      const userResult = await User.updateMany(
        { branch: { $exists: false } },
        { $set: { branch: indoreBranch._id } }
      );
      console.log(`Migrated ${userResult.modifiedCount} users to Indore branch`);
    } else {
      console.log('No users without branch assignment');
    }

    // Step 2: Rename 'engineer' to 'service_engineer'
    const engineers = await User.countDocuments({ role: 'engineer' });
    if (engineers > 0) {
      const engResult = await User.updateMany(
        { role: 'engineer' },
        { $set: { role: 'service_engineer' } }
      );
      console.log(`Renamed ${engResult.modifiedCount} engineers to service_engineer`);
    }

    // Step 3: Rename 'admin' to 'super_admin'
    const admins = await User.countDocuments({ role: 'admin' });
    if (admins > 0) {
      const adminResult = await User.updateMany(
        { role: 'admin' },
        { $set: { role: 'super_admin' } }
      );
      console.log(`Renamed ${adminResult.modifiedCount} admins to super_admin`);
    }

    // Step 4: Migrate existing trips without branch to Indore
    const tripsWithoutBranch = await Trip.countDocuments({ branch: { $exists: false } });
    if (tripsWithoutBranch > 0) {
      const tripResult = await Trip.updateMany(
        { branch: { $exists: false } },
        { $set: { branch: indoreBranch._id } }
      );
      console.log(`Migrated ${tripResult.modifiedCount} trips to Indore branch`);
    } else {
      console.log('No trips without branch assignment');
    }

    console.log('\nMigration complete!');
    console.log('\nNext steps:');
    console.log('1. Create Branch Manager for each branch');
    console.log('2. Create HR staff for each branch');
    console.log('3. Create Service Head (HQ-level)');
    console.log('4. Create Account Dept staff (HQ-level)');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  migrateExistingData();
}

module.exports = migrateExistingData;
