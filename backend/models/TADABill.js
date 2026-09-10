const mongoose = require('mongoose');

const tadaBillSchema = new mongoose.Schema(
  {
    // References
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
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

    // Bill Details
    billNumber: {
      type: String,
      required: true,
      unique: true,
    },
    billDate: {
      type: Date,
      default: Date.now,
    },

    // Financial Details
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    approvedAmount: {
      type: Number,
      default: null, // Set during final approval
    },
    conveyanceAmount: {
      type: Number,
      default: 0, // TA component
    },
    daAmount: {
      type: Number,
      default: 0, // DA component
    },
    stayAmount: {
      type: Number,
      default: 0, // Lodging component
    },
    otherAmount: {
      type: Number,
      default: 0,
    },
    otherDescription: {
      type: String,
      default: '',
    },

    // Supporting Documents
    receipts: [
      {
        data: { type: Buffer, required: true, select: false },
        contentType: { type: String, required: true },
        filename: { type: String, required: true },
        sizeBytes: { type: Number, default: 0 },
        category: {
          type: String,
          enum: ['ticket', 'hotel', 'food', 'other'],
          default: 'other',
        },
        amount: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Approval Status
    status: {
      type: String,
      enum: [
        'draft',           // Engineer is still editing
        'submitted',       // Awaiting Branch Manager review
        'approved_by_bm',  // BM approved, awaiting HR
        'approved_by_hr',  // HR approved, awaiting Service Head
        'approved_by_sh',  // SH approved (final), awaiting Accounts
        'approved',        // Fully approved, visible to Account Dept
        'rejected',        // Rejected at any stage
        'paid',            // Account Dept processed payment
      ],
      default: 'draft',
    },

    // Who should act next
    currentApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Full approval audit trail
    approvalHistory: [
      {
        approver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approverName: { type: String }, // Denormalized for display
        approverRole: { type: String },
        action: {
          type: String,
          enum: ['submitted', 'approved', 'rejected', 'edited'],
        },
        remarks: { type: String, default: '' },
        editedAmount: { type: Number, default: null },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Service Head Edit Permissions
    canEdit: {
      type: Boolean,
      default: false, // true only when status is 'approved_by_hr'
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    editHistory: [
      {
        field: { type: String },
        oldValue: { type: Number },
        newValue: { type: Number },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        editedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Indexes (billNumber unique index is created by unique: true in schema definition)
tadaBillSchema.index({ employee: 1, createdAt: -1 });
tadaBillSchema.index({ branch: 1, status: 1 });
tadaBillSchema.index({ currentApprover: 1 });
tadaBillSchema.index({ status: 1 });

module.exports = mongoose.model('TADABill', tadaBillSchema);
