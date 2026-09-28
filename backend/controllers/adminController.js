const bcrypt = require('bcryptjs');
const Trip = require('../models/Trip');
const User = require('../models/User');
const { GRADES } = require('../utils/policyRates');

// GET /api/admin/overview — top-level numbers for the admin dashboard
exports.getOverview = async (req, res) => {
  try {
    const [engineerCount, trips] = await Promise.all([
      User.countDocuments({ role: { $in: ['engineer', 'service_engineer'] } }),
      Trip.find({}, 'status outboundDistanceKm returnDistanceKm grandTotal approvedAmount createdAt'),
    ]);

    const pendingApprovals = trips.filter((t) => t.status === 'submitted').length;
    const approvedTrips = trips.filter((t) => t.status === 'approved');
    const rejectedTrips = trips.filter((t) => t.status === 'rejected').length;

    const totalDistanceKm = trips.reduce(
      (sum, t) => sum + (t.outboundDistanceKm || 0) + (t.returnDistanceKm || 0),
      0
    );
    const pendingReimbursement = trips
      .filter((t) => t.status === 'submitted')
      .reduce((sum, t) => sum + (t.grandTotal || 0), 0);
    const approvedReimbursement = approvedTrips.reduce(
      (sum, t) => sum + (t.approvedAmount ?? t.grandTotal ?? 0),
      0
    );

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const tripsThisMonth = trips.filter((t) => new Date(t.createdAt) >= startOfMonth).length;

    res.json({
      totalEngineers: engineerCount,
      totalTrips: trips.length,
      tripsThisMonth,
      pendingApprovals,
      approvedCount: approvedTrips.length,
      rejectedCount: rejectedTrips,
      totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
      pendingReimbursement: Number(pendingReimbursement.toFixed(2)),
      approvedReimbursement: Number(approvedReimbursement.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/admin/engineers — every engineer with a quick activity summary
exports.getEngineers = async (req, res) => {
  try {
    const engineers = await User.find({ role: { $in: ['engineer', 'service_engineer'] } }, '-passwordHash').sort({ name: 1 });
    // 'receipts' here pulls receipt metadata (category/amount/filename/contentType)
    // for the count below — the heavy `receipts.data` bytes stay excluded by the
    // schema's select:false, so this stays a cheap query.
    const trips = await Trip.find({}, 'engineer status outboundDistanceKm returnDistanceKm grandTotal approvedAmount receipts');

    const byEngineer = {};
    trips.forEach((t) => {
      const key = String(t.engineer);
      if (!byEngineer[key]) {
        byEngineer[key] = { totalTrips: 0, distanceKm: 0, pending: 0, totalReimbursed: 0, totalReceipts: 0, pendingReceipts: 0 };
      }
      byEngineer[key].totalTrips += 1;
      byEngineer[key].distanceKm += (t.outboundDistanceKm || 0) + (t.returnDistanceKm || 0);
      if (t.status === 'submitted') byEngineer[key].pending += 1;
      if (t.status === 'approved') byEngineer[key].totalReimbursed += t.approvedAmount ?? t.grandTotal ?? 0;
      byEngineer[key].totalReceipts += (t.receipts || []).length;
      if (t.status === 'submitted') byEngineer[key].pendingReceipts += (t.receipts || []).length;
    });

    const result = engineers.map((e) => {
      const stats = byEngineer[String(e._id)] || {
        totalTrips: 0, distanceKm: 0, pending: 0, totalReimbursed: 0, totalReceipts: 0, pendingReceipts: 0,
      };
      return {
        id: e._id,
        name: e.name,
        employeeId: e.employeeId,
        email: e.email,
        createdAt: e.createdAt,
        totalTrips: stats.totalTrips,
        distanceKm: Number(stats.distanceKm.toFixed(1)),
        pendingApprovals: stats.pending,
        totalReimbursed: Number(stats.totalReimbursed.toFixed(2)),
        totalReceipts: stats.totalReceipts,
        pendingReceipts: stats.pendingReceipts,
      };
    });

    res.json({ engineers: result });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/admin/trips?status=submitted&engineer=<id>&tripType=round&from=&to=
exports.getAllTrips = async (req, res) => {
  try {
    const { status, engineer, tripType, from, to } = req.query;
    const query = {};
    if (status) query.status = status;
    if (engineer) query.engineer = engineer;
    if (tripType) query.tripType = tripType;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    // List views never need the raw GPS trail (each trip can carry up to
    // 25,000 points per phase) — only the detail view does. Pulling that
    // for every matching trip is what makes broad/unfiltered queries here
    // balloon in size and risk timing out, while narrow filters (e.g. a
    // single status) happen to return fewer trips and slip through.
    const trips = await Trip.find(query)
      .select('-outboundPoints -returnPoints')
      .populate('engineer', 'name employeeId email')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ trips });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/admin/trips/:id — full detail of any engineer's trip (receipts metadata only, not bytes)
exports.getTripDetail = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id).populate('engineer', 'name employeeId email');
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/admin/trips/:id/review  { decision: 'approved' | 'rejected', note, amount }
// `amount` is the final reimbursement figure the admin wants to pay out.
// It's optional — if omitted (or invalid) on approval, the system-calculated
// grandTotal is used as-is. Only meaningful when decision === 'approved'.
//
// This also doubles as the "correct an approved amount" path: once a trip is
// already 'approved', calling this again with decision:'approved' and a new
// amount updates the payout figure (still requires a reason if it changes
// the amount again). An already-approved trip can't be flipped to rejected
// here — reject only applies to the initial decision on a submitted trip.
exports.reviewTrip = async (req, res) => {
  try {
    const { decision, note, amount } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (!['submitted', 'approved'].includes(trip.status)) {
      return res.status(400).json({
        message: 'This trip has already been decided and can no longer be reviewed.',
      });
    }
    if (trip.status === 'approved' && decision !== 'approved') {
      return res.status(400).json({
        message: 'An already-approved trip can only have its amount corrected, not be rejected.',
      });
    }

    trip.status = decision;
    trip.reviewedBy = req.userId;
    trip.reviewedAt = new Date();

    if (decision === 'approved') {
      const parsedAmount = Number(amount);
      const finalAmount =
        Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : trip.grandTotal;

      // If the admin is paying out something other than the system-calculated
      // total, a reason is mandatory — this is what the engineer and any
      // future auditor will see explaining the difference.
      const amountWasChanged = Math.abs(finalAmount - (trip.grandTotal || 0)) > 0.01;
      if (amountWasChanged && !String(note || '').trim()) {
        return res.status(400).json({
          message: 'Please provide a reason for changing the reimbursement amount.',
        });
      }

      trip.approvedAmount = finalAmount;
    } else {
      trip.approvedAmount = null;
    }

    trip.adminReview = {
      reviewedBy: req.userId,
      reviewedAt: trip.reviewedAt,
      remarks: note || '',
      status: decision,
    };
    await trip.save();

    res.json({ trip, message: `Trip ${decision}` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /api/admin/trips/:id — admin can discard drafts/in-progress/completed
// trips (nothing to reimburse yet) and already-decided trips (approved or
// rejected — the decision has been made, and the office may want to clean up
// old records). A trip still awaiting a decision ('submitted') can NEVER be
// deleted here — it must be explicitly approved or rejected first, so a
// pending reimbursement claim can't just quietly disappear.
exports.deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (trip.status === 'submitted') {
      return res.status(400).json({
        message: 'This trip is pending approval — approve or reject it before deleting.',
      });
    }

    await trip.deleteOne();
    res.json({ message: 'Trip deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/admin/engineers/:id/reset-password — admin sets a new password
// for an existing engineer. This is the actual "forgot password" path for
// the app (there's no self-service reset) — the admin sets a new password
// and shares it with the engineer out-of-band, same as account creation.
exports.resetEngineerPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    const engineer = await User.findOne({ _id: req.params.id, role: { $in: ['engineer', 'service_engineer'] } });
    if (!engineer) return res.status(404).json({ message: 'Engineer not found' });

    // $set instead of save() — a legacy doc with stale enum values (pre-
    // migration grade/role) must not block a password change with a
    // whole-document validation error.
    await User.findByIdAndUpdate(engineer._id, {
      $set: { passwordHash: await bcrypt.hash(password, 10) },
    });

    res.json({ message: 'Password reset', employeeId: engineer.employeeId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/admin/engineers — admin creates a new engineer account. The
// admin sets the initial password themselves and shares it with the
// engineer out-of-band (there's no self-service signup in the app).
exports.createEngineer = async (req, res) => {
  try {
    const { name, employeeId, email, password, grade, branch } = req.body;
    if (!name || !employeeId || !password) {
      return res.status(400).json({ message: 'name, employeeId and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    if (grade && !GRADES.includes(grade)) {
      return res.status(400).json({ message: `Invalid grade "${grade}". Must be one of: ${GRADES.join(', ')}` });
    }

    const existing = await User.findOne({ employeeId });
    if (existing) return res.status(409).json({ message: 'Employee ID already registered' });

    // If no branch provided, default to caller's branch or first active branch
    let targetBranch = branch || req.userBranchId;
    if (!targetBranch) {
      const Branch = require('../models/Branch');
      const defaultBranch = await Branch.findOne({ isActive: true });
      targetBranch = defaultBranch?._id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      employeeId,
      email: email || undefined,
      passwordHash,
      grade,
      branch: targetBranch,
      role: 'service_engineer',
    });

    res.status(201).json({
      message: 'Engineer account created',
      engineer: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        email: user.email,
        grade: user.grade,
        branch: user.branch,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
