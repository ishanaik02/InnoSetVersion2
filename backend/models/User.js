const mongoose = require('mongoose');
const { GRADES } = require('../utils/policyRates');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    employeeId: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    
    // EXPANDED: from 2 roles to 6 roles
    role: {
      type: String,
      enum: [
        'service_engineer',  // was 'engineer' - field service engineer
        'branch_manager',    // NEW - manages a single branch
        'hr',                // NEW - HR department staff
        'service_head',      // NEW - final approval authority
        'account_dept',      // NEW - accounts/finance department
        'super_admin',       // was 'admin' - full system access
      ],
      default: 'service_engineer',
    },
    
    // Drives conveyance/DA/lodging eligibility per the TA/DA policy sheet.
    grade: { type: String, enum: GRADES, default: 'IE7' },
    
    // NEW: Branch assignment
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
    
    // NEW: Soft-delete support
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Indexes for branch-scoped queries
userSchema.index({ branch: 1 });
userSchema.index({ role: 1 });
userSchema.index({ branch: 1, role: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);
