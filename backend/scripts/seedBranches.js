const mongoose = require('mongoose');
const Branch = require('../models/Branch');
require('dotenv').config();

const branches = [
  {
    name: 'Indore Branch',
    code: 'BR01',
    city: 'Indore',
    state: 'Madhya Pradesh',
    attendanceCutoffTime: '09:30',
    isActive: true,
  },
  {
    name: 'Bhopal Branch',
    code: 'BR02',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    attendanceCutoffTime: '09:30',
    isActive: true,
  },
  {
    name: 'Jabalpur Branch',
    code: 'BR03',
    city: 'Jabalpur',
    state: 'Madhya Pradesh',
    attendanceCutoffTime: '09:30',
    isActive: true,
  },
  {
    name: 'Ujjain Branch',
    code: 'BR04',
    city: 'Ujjain',
    state: 'Madhya Pradesh',
    attendanceCutoffTime: '09:30',
    isActive: true,
  },
  {
    name: 'Dewas Branch',
    code: 'BR05',
    city: 'Dewas',
    state: 'Madhya Pradesh',
    attendanceCutoffTime: '09:30',
    isActive: true,
  },
];

async function seedBranches() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/service_engineer_trips';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Check if branches already exist
    const existingCount = await Branch.countDocuments();
    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing branches. Skipping seed.`);
      return;
    }

    // Insert branches
    const result = await Branch.insertMany(branches);
    console.log(`Successfully seeded ${result.length} branches:`);
    result.forEach((branch) => {
      console.log(`  - ${branch.code}: ${branch.name} (${branch.city})`);
    });

    console.log('\nBranch seeding complete!');
  } catch (error) {
    console.error('Error seeding branches:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  seedBranches();
}

module.exports = seedBranches;
