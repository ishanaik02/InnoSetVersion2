const Trip = require("../models/Trip");
const User = require("../models/User");
const TADABill = require("../models/TADABill");
const BillApproval = require("../models/BillApproval");
const Branch = require("../models/Branch");
const { calculateTaDa } = require("../utils/taDaCalculator");
const { calculateDaAmount } = require("../utils/policyRates");

// Hard cap on points accepted per batch write. The app's upload worker
// (backgroundLocationService.js UPLOAD_BATCH_SIZE) sends exactly 500 points
// per request, so this never truncates legitimate traffic — it only stops a
// buggy or hostile client from pushing unbounded arrays into one document
// (M8/H4 in PRODUCTION_RED_FLAGS.md).
const MAX_POINTS_PER_BATCH = 500;

// Generate bill number: {BranchCode}-TA-{Year}-{000001}
async function generateBillNumber(branchId) {
  const branch = await Branch.findById(branchId);
  if (!branch) throw new Error('Branch not found');
  const year = new Date().getFullYear();
  const prefix = `${branch.code}-TA-${year}-`;
  const count = await TADABill.countDocuments({
    billNumber: { $regex: `^${prefix}` },
  });
  const seq = String(count + 1).padStart(6, '0');
  return `${prefix}${seq}`;
}

exports.createTrip = async (req, res) => {
  try {
    const {
      startLocation,
      destination,
      date,
      tripType,
      conveyance,
      isLocalVisit,
    } = req.body;
    if (!startLocation || !destination || !date || !tripType || !conveyance) {
      return res.status(400).json({ message: "Missing required trip fields" });
    }
    const trip = await Trip.create({
      engineer: req.userId,
      branch: req.userBranchId, // Auto-assign from authenticated user's branch
      startLocation,
      destination,
      date,
      tripType,
      conveyance,
      isLocalVisit: !!isLocalVisit,
      status: "draft",
    });
    res.status(201).json({ trip });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
exports.saveLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      heading,
      batteryLevel,
      timestamp,
      phase,
    } = req.body;

    const trip = await Trip.findById(id);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    const point = {
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      heading,
      recordedAt: timestamp || new Date(),
    };

    if (phase === "return") {
      trip.returnPoints.push(point);
    } else {
      trip.outboundPoints.push(point);
    }

    trip.tracking.lastKnownLocation = {
      latitude,
      longitude,
      recordedAt: new Date(),
      accuracy,
      speed,
      heading,
    };

    trip.tracking.totalPointsCollected += 1;
    trip.tracking.lastSyncAt = new Date();
    trip.tracking.batteryLevel = batteryLevel || 100;

    await trip.save();

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.uploadLocationBatch = async (req, res) => {

    try {

        const { id } = req.params;

        const { points } = req.body;

        if (!Array.isArray(points) || points.length === 0) {

            return res.status(400).json({ success: false, message: "points array is required" });

        }

        if (points.length > MAX_POINTS_PER_BATCH) {

            return res.status(413).json({

                success: false,

                message: `Batch too large: max ${MAX_POINTS_PER_BATCH} points per request, received ${points.length}`,

            });

        }

        const trip = await Trip.findById(id);

        if (!trip) {

            return res.status(404).json({
                success:false,
                message:"Trip not found"
            });

        }

        for(const item of points){

            const point = {

                latitude:item.latitude,
                longitude:item.longitude,
                altitude:item.altitude,
                accuracy:item.accuracy,
                speed:item.speed,
                heading:item.heading,
                recordedAt:item.timestamp

            };

            const phase = item.tripPhase || item.phase;

            point.phase = phase;

            if(phase === "return"){

                trip.returnPoints.push(point);

            }

            else{

                trip.outboundPoints.push(point);

            }

        }

        if(points.length){

            const last = points[points.length-1];

            trip.tracking.lastKnownLocation = {

                latitude:last.latitude,

                longitude:last.longitude,

                recordedAt:new Date(),

                accuracy:last.accuracy,

                speed:last.speed,

                heading:last.heading

            };

        }

        trip.tracking.totalPointsCollected += points.length;

        trip.tracking.lastSyncAt = new Date();

        await trip.save();

        res.json({

            success:true,

            uploaded:points.length

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};
exports.getLiveLocation = async (req, res) => {

    try{

        const trip = await Trip.findById(req.params.id);

        if(!trip){

            return res.status(404).json({

                success:false

            });

        }

        res.json({

            success:true,

            location:trip.tracking.lastKnownLocation,

            tracking:trip.tracking.isTracking,

            updated:trip.tracking.lastSyncAt

        });

    }

    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};
exports.getRouteHistory = async (req, res) => {

    try{

        const trip = await Trip.findById(req.params.id);

        if(!trip){

            return res.status(404).json({

                success:false

            });

        }

        res.json({

            success:true,

            outbound:trip.outboundPoints,

            return:trip.returnPoints

        });

    }

    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

};
exports.updateTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      engineer: req.userId,
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const allowedFields = [
      "outboundPoints",
      "returnPoints",
      "outboundDistanceKm",
      "returnDistanceKm",
      "startTime",
      "siteReachedTime",
      "visitCompletedTime",
      "endTime",
      "ticketAmount",
      "status",
      "isLocalVisit",
      "engineerRemarks",
      "additionalKm",
      "additionalKmReason",
      "callerDetails",
      "dailyAllowance",
      "numberOfDays",
      "tracking",
      "taDaAmount",
      "daAmount",
      "stayExpensesTotal",
      "grandTotal",
    ];
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) trip[f] = req.body[f];
    });

    if (["submitted", "approved", "rejected"].includes(trip.status)) {
      return res.status(400).json({ message: "Submitted trips can no longer be edited" });
    }

    // Server recalculates TA/DA and DA — never trust client-submitted amounts
    // for final total. Grade comes from the engineer's user record, not the
    // request body, so it can't be spoofed by the client.
    const engineer = await User.findById(trip.engineer).select("grade");
    const totalDistance =
      (trip.outboundDistanceKm || 0) + (trip.returnDistanceKm || 0) + (trip.additionalKm || 0);
    const { amount, mode } = calculateTaDa(
      trip.conveyance,
      totalDistance,
      trip.ticketAmount,
      engineer?.grade,
    );
    trip.taDaAmount = amount;
    trip.daAmount = calculateDaAmount({
      distanceKm: totalDistance,
      isLocalVisit: trip.isLocalVisit,
      tripType: trip.tripType,
    });

    const stayExpensesTotal =
      req.body.stayExpensesTotal || trip.stayExpensesTotal || 0;
    trip.stayExpensesTotal = stayExpensesTotal;
    trip.grandTotal = amount + trip.daAmount + stayExpensesTotal;

    await trip.save();
    res.json({ trip, conveyanceMode: mode });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getTrips = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    let query = {};
    // service_engineer: own trips only
    if (userRole === 'service_engineer') {
      query.engineer = userId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      // Branch-scoped: all trips in their branch
      query.branch = userBranchId;
    }
    // service_head, account_dept, super_admin: no filter = all trips

    const trips = await Trip.find(query)
      .populate('engineer', 'name employeeId')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ trips });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    let query = { _id: req.params.id };
    if (userRole === 'service_engineer') {
      query.engineer = userId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = userBranchId;
    }
    // SH, account_dept, super_admin: no extra filter

    const trip = await Trip.findOne(query)
      .populate('engineer', 'name employeeId grade')
      .populate('branch', 'name code city');
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.submitTrip = async (req, res) => {
  try {
    // Find the full trip first so we have all amounts for bill creation
    const trip = await Trip.findOne({
      _id: req.params.id,
      engineer: req.userId,
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (["submitted", "approved", "rejected", "approved_by_bm", "approved_by_hr", "approved_by_sh", "paid"].includes(trip.status)) {
      return res.status(400).json({ message: "Trip already submitted or processed" });
    }

    // Recalculate TA/DA from trip data to ensure amounts are correct
    const engineer = await User.findById(trip.engineer).select("grade name role");
    const totalDistance =
      (trip.outboundDistanceKm || 0) + (trip.returnDistanceKm || 0) + (trip.additionalKm || 0);
    const { amount: taDaAmount } = calculateTaDa(
      trip.conveyance,
      totalDistance,
      trip.ticketAmount,
      engineer?.grade,
    );
    const daAmount = calculateDaAmount({
      distanceKm: totalDistance,
      isLocalVisit: trip.isLocalVisit,
      tripType: trip.tripType,
    });
    const stayTotal = trip.stayExpensesTotal || 0;
    const grandTotal = taDaAmount + daAmount + stayTotal;

    // Update trip amounts and status
    trip.taDaAmount = taDaAmount;
    trip.daAmount = daAmount;
    trip.grandTotal = grandTotal;
    trip.status = "submitted";
    await trip.save();

    // ── Auto-create TA/DA Bill ──
    let bill = null;
    if (trip.branch) {
      const billNumber = await generateBillNumber(trip.branch);

      bill = await TADABill.create({
        trip: trip._id,
        employee: req.userId,
        branch: trip.branch,
        billNumber,
        billDate: new Date(),
        totalAmount: grandTotal,
        conveyanceAmount: taDaAmount,
        daAmount: daAmount,
        stayAmount: stayTotal,
        otherAmount: 0,
        status: 'submitted',
      });

      // Find the Branch Manager in this branch as the first approver
      const bm = await User.findOne({
        branch: trip.branch,
        role: 'branch_manager',
        isActive: true,
      });

      if (bm) {
        bill.currentApprover = bm._id;
      }

      bill.approvalHistory.push({
        approver: req.userId,
        approverName: engineer?.name || 'Engineer',
        approverRole: engineer?.role || 'service_engineer',
        action: 'submitted',
        remarks: 'Auto-generated from trip submission',
        timestamp: new Date(),
      });
      await bill.save();

      // Create audit trail record
      await BillApproval.create({
        bill: bill._id,
        approver: req.userId,
        action: 'submitted',
        previousStatus: 'draft',
        newStatus: 'submitted',
        remarks: 'Auto-generated from trip submission',
      });
    }

    res.json({
      trip,
      bill,
      message: bill
        ? "Trip submitted and TA/DA bill auto-created for approval"
        : "Trip submitted for approval",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/trips/:id — lets an engineer discard a trip that was created
// (or partially tracked) but never submitted for reimbursement. Once a trip
// is submitted, approved, or rejected it's the official record and can no
// longer be deleted — only edited fields on unsubmitted trips are ever lost.
exports.deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, engineer: req.userId });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (["submitted", "approved", "rejected"].includes(trip.status)) {
      return res.status(400).json({
        message: "Submitted trips are part of the reimbursement record and can't be deleted.",
      });
    }

    await trip.deleteOne();
    res.json({ message: "Trip deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.uploadReceipt = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      engineer: req.userId,
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    trip.receipts.push({
      data: req.file.buffer,
      contentType: req.file.mimetype,
      filename: req.file.originalname || `receipt_${Date.now()}`,
      sizeBytes: req.file.size,
      category: req.body.category || "other",
      amount: Number(req.body.amount) || 0,
      notes: req.body.notes,
    });
    await trip.save();

    // Don't echo the file bytes back in the response — the client already has them.
    const plainTrip = trip.toObject();
    plainTrip.receipts = plainTrip.receipts.map(({ data, ...rest }) => rest);
    res.status(201).json({ trip: plainTrip });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Serves the raw bytes of a single receipt so it can be used directly as an
// <Image source={{ uri }}> or opened/downloaded as a PDF.
// Accessible by the engineer who owns the trip, or by an admin.
exports.getReceiptFile = async (req, res) => {
  try {
    const { id, receiptId } = req.params;
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    // Cross-branch roles and BM/HR can view any trip receipt in scope
    let query = { _id: id };
    if (userRole === 'service_engineer') {
      query.engineer = userId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = userBranchId;
    }
    // SH, account_dept, super_admin: no extra filter

    const trip = await Trip.findOne(query).select("+receipts.data");
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const receipt = trip.receipts.id(receiptId);
    if (!receipt || !receipt.data)
      return res.status(404).json({ message: "Receipt not found" });

    res.set("Content-Type", receipt.contentType || "application/octet-stream");
    res.set("Content-Disposition", `inline; filename="${receipt.filename}"`);
    res.send(receipt.data);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Projection: this endpoint runs on every dashboard open and needs only
    // three numeric fields. Without it, every engineer's FULL trip documents —
    // including thousands of embedded GPS points and receipt metadata — were
    // loaded per request (H1/H4 in PRODUCTION_RED_FLAGS.md).
    const trips = await Trip.find(
      { engineer: req.userId },
      "status outboundDistanceKm returnDistanceKm",
    ).lean();
    const totalTrips = trips.filter((t) =>
      ["completed", "submitted", "approved"].includes(t.status),
    ).length;
    const distanceCoveredKm = trips
      .reduce(
        (sum, t) =>
          sum + (t.outboundDistanceKm || 0) + (t.returnDistanceKm || 0),
        0,
      )
      .toFixed(1);
    const pendingClaims = trips.filter((t) => t.status === "submitted").length;
    const reimbursementStatus =
      pendingClaims > 0 ? `${pendingClaims} pending approval` : "Up to date";

    res.json({
      totalTrips,
      distanceCoveredKm: Number(distanceCoveredKm),
      pendingClaims,
      reimbursementStatus,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
