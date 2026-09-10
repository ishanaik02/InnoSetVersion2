const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    address: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      default: 'Madhya Pradesh',
    },
    phone: {
      type: String,
      default: '',
    },
    attendanceCutoffTime: {
      type: String,
      default: '09:30', // 9:30 AM daily cutoff
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// code index is created by unique: true in schema definition
branchSchema.index({ name: 1 });

module.exports = mongoose.model('Branch', branchSchema);
