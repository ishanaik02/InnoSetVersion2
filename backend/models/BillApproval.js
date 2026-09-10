const mongoose = require('mongoose');

const billApprovalSchema = new mongoose.Schema(
  {
    bill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TADABill',
      required: true,
    },
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['submitted', 'approved', 'rejected', 'edited'],
      required: true,
    },
    previousStatus: {
      type: String,
      required: true,
    },
    newStatus: {
      type: String,
      required: true,
    },
    previousAmount: {
      type: Number,
      default: null,
    },
    newAmount: {
      type: Number,
      default: null,
    },
    remarks: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

billApprovalSchema.index({ bill: 1, timestamp: 1 });
billApprovalSchema.index({ approver: 1 });

module.exports = mongoose.model('BillApproval', billApprovalSchema);
