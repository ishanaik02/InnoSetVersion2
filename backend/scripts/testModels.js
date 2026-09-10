const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Trip = require('../models/Trip');
const TADABill = require('../models/TADABill');
const Attendance = require('../models/Attendance');
const BillApproval = require('../models/BillApproval');
require('dotenv').config();

async function testModels() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/service_engineer_trips';
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create a branch
    const branch = await Branch.create({
      name: 'Test Branch',
      code: 'TEST01',
      city: 'Test City',
      state: 'Test State',
    });
    console.log('✅ Branch model works');

    // Test 2: Create a user
    const user = await User.create({
      name: 'Test User',
      employeeId: 'TEST-001',
      email: 'test@example.com',
      passwordHash: 'hashed_password',
      role: 'branch_manager',
      branch: branch._id,
    });
    console.log('✅ User model works');

    // Test 3: Create a trip
    const trip = await Trip.create({
      engineer: user._id,
      branch: branch._id,
      startLocation: 'Indore',
      destination: 'Bhopal',
      date: new Date(),
      tripType: 'round',
      conveyance: 'car',
    });
    console.log('✅ Trip model works');

    // Test 4: Create a TADABill
    const bill = await TADABill.create({
      trip: trip._id,
      employee: user._id,
      branch: branch._id,
      billNumber: 'TEST01-TA-2026-000001',
      totalAmount: 1500,
      conveyanceAmount: 800,
      daAmount: 500,
      stayAmount: 200,
    });
    console.log('✅ TADABill model works');

    // Test 5: Create an Attendance
    const attendance = await Attendance.create({
      employee: user._id,
      branch: branch._id,
      date: new Date(),
      status: 'present',
      approvalStatus: 'pending',
    });
    console.log('✅ Attendance model works');

    // Test 6: Create a BillApproval
    const approval = await BillApproval.create({
      bill: bill._id,
      approver: user._id,
      action: 'submitted',
      previousStatus: 'draft',
      newStatus: 'submitted',
    });
    console.log('✅ BillApproval model works');

    // Cleanup test data
    await Branch.findByIdAndDelete(branch._id);
    await User.findByIdAndDelete(user._id);
    await Trip.findByIdAndDelete(trip._id);
    await TADABill.findByIdAndDelete(bill._id);
    await Attendance.findByIdAndDelete(attendance._id);
    await BillApproval.findByIdAndDelete(approval._id);
    console.log('\n✅ Test data cleaned up');

    console.log('\n🎉 All models are working correctly!');
  } catch (error) {
    console.error('❌ Model test failed:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  testModels();
}

module.exports = testModels;
