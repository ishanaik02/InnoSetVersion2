const Trip = require("../models/Trip");
const User = require("../models/User");
const { calculateTaDa } = require("../utils/taDaCalculator");
const { calculateDaAmount } = require("../utils/policyRates");

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
    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, engineer: req.userId },
      { status: "submitted" },
      { new: true },
    );
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json({ trip, message: "Trip submitted for approval" });
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
    const trips = await Trip.find({ engineer: req.userId });
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
