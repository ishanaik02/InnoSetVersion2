const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema(
  {
    // File bytes are stored directly in MongoDB (fine at ~100-user scale —
    // no S3/disk to manage). Served back out via GET /api/trips/:id/receipts/:receiptId.
    // select: false keeps these heavy bytes OUT of normal Trip.find()/getTripById
    // queries (dashboard lists, admin trip lists, etc). They're only pulled in
    // by the dedicated receipt-file route below, which explicitly re-selects them.
    data: { type: Buffer, required: true, select: false },
    contentType: { type: String, required: true },
    filename: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    category: {
      type: String,
      enum: ["ticket", "hotel", "food", "other"],
      default: "other",
    },
    amount: Number,
    notes: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const pointSchema = new mongoose.Schema(
  {
    latitude: Number,
    longitude: Number,
    altitude: Number,
    accuracy: Number,
    speed: Number,
    heading: Number,
    phase: String,
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tripSchema = new mongoose.Schema(
  {
    engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    
    // NEW: Branch assignment
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },
    
    startLocation: { type: String, required: true },
    destination: { type: String, required: true },
    date: { type: Date, required: true },
    tripType: { type: String, enum: ["round", "stay"], required: true },
    conveyance: {
      type: String,
      enum: ["bike", "car", "bus", "train"],
      required: true,
    },

    // EXPANDED: New statuses for multi-level approval
    status: {
      type: String,
      enum: [
        // Existing statuses
        "draft",
        "in_progress",
        "at_site",
        "returning",
        "completed",
        "submitted",
        "approved",
        "rejected",
        // NEW: Multi-level approval statuses
        "approved_by_bm",    // Branch Manager approved, pending HR
        "approved_by_hr",    // HR approved, pending Service Head
        "approved_by_sh",    // Service Head approved, pending Accounts
        "paid",              // Account Dept processed payment
      ],
      default: "draft",
    },

    outboundPoints: [pointSchema],
    returnPoints: [pointSchema],
    outboundDistanceKm: { type: Number, default: 0 },
    returnDistanceKm: { type: Number, default: 0 },
    tracking: {
      isTracking: {
        type: Boolean,
        default: false,
      },

      trackingStartedAt: Date,

      trackingStoppedAt: Date,

      lastSyncAt: Date,

      gpsAccuracy: {
        type: Number,
        default: 0,
      },

      batteryLevel: {
        type: Number,
        default: 100,
      },

      lastKnownLocation: {
        latitude: Number,
        longitude: Number,
        recordedAt: Date,
      },

      totalPointsCollected: {
        type: Number,
        default: 0,
      },
    },
    startTime: Date,
    siteReachedTime: Date,
    visitCompletedTime: Date,
    endTime: Date,

    ticketAmount: { type: Number, default: 0 },
    taDaAmount: { type: Number, default: 0 },
    isLocalVisit: { type: Boolean, default: false }, // within Indore/current branch — DA not applicable
    daAmount: { type: Number, default: 0 },
    stayExpensesTotal: { type: Number, default: 0 },
    // System-calculated total (TA/DA + DA + stay expenses). This never changes
    // once computed — it's the audit trail of "what the formula said".
    grandTotal: { type: Number, default: 0 },
    // Admin-editable final reimbursement amount. Defaults to grandTotal at
    // approval time, but the admin can override it (e.g. partial approval,
    // policy exception) before approving. This is the number that actually
    // gets paid out — null until a decision has been made.
    approvedAmount: { type: Number, default: null },
    callerDetails: {
      callerName: {
        type: String,
        default: "",
      },
    },
    engineerRemarks: {
      type: String,
      default: "",
    },
    additionalKm: { type: Number, default: 0 },
    additionalKmReason: { type: String, default: '' },

    receipts: [receiptSchema],

    // Admin approval trail
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    adminReview: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      reviewedAt: Date,

      remarks: { type: String, default: '' },

      status: {
        type: String,
        enum: ["approved", "rejected", "pending"],
        default: "pending",
      },
    },

    // NEW: Multi-level approval trail
    approvalTrail: [
      {
        approver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["branch_manager", "hr", "service_head", "account_dept"],
        },
        action: {
          type: String,
          enum: ["approved", "rejected", "edited"],
        },
        remarks: { type: String, default: '' },
        editedAmount: { type: Number, default: null }, // SH can edit final amount
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

tripSchema.index({ engineer: 1, createdAt: -1 });
tripSchema.index({ status: 1 });
// NEW: Branch-scoped indexes
tripSchema.index({ branch: 1 });
tripSchema.index({ branch: 1, status: 1 });

module.exports = mongoose.model("Trip", tripSchema);
