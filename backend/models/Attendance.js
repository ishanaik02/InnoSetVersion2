const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    // References
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },

    // Attendance Details
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'on_duty'],
      default: 'absent',
    },

    // Leave Details (when status = leave)
    leaveType: {
      type: String,
      enum: ['casual', 'sick', 'earned', 'unpaid', 'other'],
    },
    leaveReason: {
      type: String,
      default: '',
    },
    leaveDocumentUrl: {
      type: String,
      default: '', // Medical certificate etc.
    },

    // On Duty Details (when status = on_duty)
    onDutyLocation: {
      type: String,
      default: '',
    },
    onDutyPurpose: {
      type: String,
      default: '',
    },

    // Approval
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvalRemarks: {
      type: String,
      default: '',
    },

    // Approval Status
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    isLocked: {
      type: Boolean,
      default: false, // Once HR approves = true = no edits
    },

    // Cut-off compliance
    markedBeforeCutoff: {
      type: Boolean,
      default: false,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One record per day per employee
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ branch: 1, date: 1 });
attendanceSchema.index({ branch: 1, date: 1, approvalStatus: 1 });
attendanceSchema.index({ approvedBy: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
