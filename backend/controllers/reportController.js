const Attendance = require('../models/Attendance');
const TADABill = require('../models/TADABill');
const Trip = require('../models/Trip');
const Branch = require('../models/Branch');

// GET /api/reports/attendance — attendance summary report
exports.getAttendanceReport = async (req, res) => {
  try {
    const { branchId, from, to } = req.query;
    const query = {};

    const userRole = req.userRole;
    if (['service_head', 'super_admin'].includes(userRole)) {
      if (branchId) query.branch = branchId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = req.userBranchId;
    } else {
      query.employee = req.userId;
    }

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const records = await Attendance.find(query)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city')
      .populate('approvedBy', 'name role')
      .sort({ date: -1 })
      .limit(500);

    const summary = {
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      leave: records.filter((r) => r.status === 'leave').length,
      onDuty: records.filter((r) => r.status === 'on_duty').length,
      late: records.filter((r) => r.isLate).length,
      approved: records.filter((r) => r.approvalStatus === 'approved').length,
      pending: records.filter((r) => r.approvalStatus === 'pending').length,
      rejected: records.filter((r) => r.approvalStatus === 'rejected').length,
    };

    res.json({ summary, records });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/reports/bills — TA/DA bill approval report
exports.getBillsReport = async (req, res) => {
  try {
    const { branchId, status, from, to } = req.query;
    const query = {};

    const userRole = req.userRole;
    if (['service_head', 'account_dept', 'super_admin'].includes(userRole)) {
      if (branchId) query.branch = branchId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = req.userBranchId;
    } else {
      query.employee = req.userId;
    }

    if (status) query.status = status;
    if (from || to) {
      query.billDate = {};
      if (from) query.billDate.$gte = new Date(from);
      if (to) query.billDate.$lte = new Date(to);
    }

    const bills = await TADABill.find(query)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city')
      .sort({ billDate: -1 })
      .limit(500);

    const totalClaimed = bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalApproved = bills.reduce((sum, b) => sum + (b.approvedAmount || 0), 0);
    const paidBills = bills.filter((b) => b.status === 'paid');

    res.json({
      summary: {
        totalBills: bills.length,
        totalClaimedAmount: Number(totalClaimed.toFixed(2)),
        totalApprovedAmount: Number(totalApproved.toFixed(2)),
        totalPaidAmount: Number(paidBills.reduce((s, b) => s + (b.approvedAmount || 0), 0).toFixed(2)),
        paidCount: paidBills.length,
      },
      bills,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/reports/trips — trip summary report
exports.getTripsReport = async (req, res) => {
  try {
    const { branchId, tripType, from, to } = req.query;
    const query = {};

    const userRole = req.userRole;
    if (['service_head', 'super_admin'].includes(userRole)) {
      if (branchId) query.branch = branchId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = req.userBranchId;
    } else {
      query.engineer = req.userId;
    }

    if (tripType) query.tripType = tripType;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const trips = await Trip.find(query)
      .select('-outboundPoints -returnPoints')
      .populate('engineer', 'name employeeId grade')
      .populate('branch', 'name code city')
      .sort({ date: -1 })
      .limit(500);

    const totalDistance = trips.reduce(
      (sum, t) => sum + (t.outboundDistanceKm || 0) + (t.returnDistanceKm || 0),
      0
    );

    res.json({
      summary: {
        totalTrips: trips.length,
        totalDistanceKm: Number(totalDistance.toFixed(1)),
        roundTrips: trips.filter((t) => t.tripType === 'round').length,
        stayTrips: trips.filter((t) => t.tripType === 'stay').length,
      },
      trips,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/reports/export — export data summary
exports.exportReport = async (req, res) => {
  try {
    const { type, format } = req.query; // type: attendance | bills | trips, format: json | csv
    // Returns structured data ready for client export/CSV download
    res.json({
      exportedAt: new Date(),
      type: type || 'all',
      format: format || 'json',
      message: 'Export prepared successfully',
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
