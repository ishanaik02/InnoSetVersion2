const Trip = require('../models/Trip');
const TADABill = require('../models/TADABill');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

// GET /api/dashboard/stats — role-aware statistics
exports.getStats = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    let stats = {};

    if (userRole === 'service_engineer') {
      // Engineer: own stats only
      const [trips, bills, attendance] = await Promise.all([
        Trip.find({ engineer: userId }, 'status grandTotal approvedAmount'),
        TADABill.find({ employee: userId }, 'status totalAmount approvedAmount'),
        Attendance.find({ employee: userId, date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, 'status approvalStatus'),
      ]);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      stats = {
        totalTrips: trips.length,
        tripsThisMonth: trips.filter(t => new Date(t.createdAt) >= startOfMonth).length,
        pendingBills: bills.filter(b => ['draft', 'submitted', 'approved_by_bm', 'approved_by_hr', 'approved_by_sh'].includes(b.status)).length,
        approvedBills: bills.filter(b => ['approved', 'paid'].includes(b.status)).length,
        totalReimbursed: bills.reduce((sum, b) => sum + (b.approvedAmount || 0), 0).toFixed(2),
        attendanceThisMonth: attendance.filter(a => a.approvalStatus === 'approved').length,
      };

    } else if (['branch_manager', 'hr'].includes(userRole)) {
      // Branch-level stats
      const branchFilter = { branch: userBranchId };

      const [engineers, trips, pendingBills, pendingAttendance, approvedBillsAgg] = await Promise.all([
        User.countDocuments({ ...branchFilter, role: 'service_engineer', isActive: true }),
        Trip.countDocuments(branchFilter),
        TADABill.countDocuments({ ...branchFilter, status: { $in: ['submitted', 'approved_by_bm', 'approved_by_hr'] } }),
        Attendance.countDocuments({ ...branchFilter, approvalStatus: 'pending' }),
        TADABill.aggregate([
          { $match: { branch: require('mongoose').Types.ObjectId.createFromHexString(userBranchId.toString()), status: { $in: ['approved', 'paid'] } } },
          { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
        ]),
      ]);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const tripsThisMonth = await Trip.countDocuments({ ...branchFilter, createdAt: { $gte: startOfMonth } });

      stats = {
        engineers,
        totalTrips: trips,
        tripsThisMonth,
        pendingBills,
        pendingAttendance,
        totalApprovedAmount: Number((approvedBillsAgg[0]?.total || 0).toFixed(2)),
        pendingBillsForMyRole: userRole === 'branch_manager'
          ? await TADABill.countDocuments({ ...branchFilter, status: 'submitted' })
          : await TADABill.countDocuments({ ...branchFilter, status: 'approved_by_bm' }),
      };

    } else if (userRole === 'service_head') {
      // Cross-branch stats
      const [totalTrips, pendingBills, approvedBillsAgg, totalUsers] = await Promise.all([
        Trip.countDocuments({}),
        TADABill.countDocuments({ status: 'approved_by_hr' }), // Bills awaiting SH
        TADABill.aggregate([
          { $match: { status: { $in: ['approved', 'paid'] } } },
          { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
        ]),
        User.countDocuments({ isActive: true }),
      ]);

      // Per-branch breakdown
      const branchBreakdown = await TADABill.aggregate([
        { $match: { status: { $in: ['submitted', 'approved_by_bm', 'approved_by_hr', 'approved', 'paid'] } } },
        { $group: { _id: '$branch', count: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: '$branch' },
        { $project: { branchName: '$branch.name', branchCode: '$branch.code', count: 1, totalAmount: 1 } },
      ]);

      stats = {
        totalTrips,
        pendingFinalApproval: pendingBills,
        totalApprovedAmount: Number((approvedBillsAgg[0]?.total || 0).toFixed(2)),
        totalUsers,
        branchBreakdown,
      };

    } else if (userRole === 'account_dept') {
      // Account dept: approved bills
      const [approvedBills, paidBills, approvedAgg, paidAgg] = await Promise.all([
        TADABill.countDocuments({ status: 'approved' }),
        TADABill.countDocuments({ status: 'paid' }),
        TADABill.aggregate([
          { $match: { status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
        ]),
        TADABill.aggregate([
          { $match: { status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
        ]),
      ]);

      stats = {
        approvedBillsCount: approvedBills,
        paidBillsCount: paidBills,
        pendingPaymentAmount: Number((approvedAgg[0]?.total || 0).toFixed(2)),
        totalPaidAmount: Number((paidAgg[0]?.total || 0).toFixed(2)),
      };

    } else if (userRole === 'super_admin') {
      // Full system overview
      const [totalUsers, totalBranches, totalTrips, totalBills, paidAgg, pendingAgg] = await Promise.all([
        User.countDocuments({ isActive: true }),
        require('../models/Branch').countDocuments({ isActive: true }),
        Trip.countDocuments({}),
        TADABill.countDocuments({}),
        TADABill.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$approvedAmount' } } }]),
        TADABill.aggregate([
          { $match: { status: { $in: ['submitted', 'approved_by_bm', 'approved_by_hr', 'approved_by_sh', 'approved'] } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
      ]);

      stats = {
        totalUsers,
        totalBranches,
        totalTrips,
        totalBills,
        totalPaidAmount: Number((paidAgg[0]?.total || 0).toFixed(2)),
        totalPendingAmount: Number((pendingAgg[0]?.total || 0).toFixed(2)),
      };
    }

    res.json({ role: userRole, stats });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/dashboard/branch — branch-level detailed statistics
exports.getBranchStats = async (req, res) => {
  try {
    const branchId = req.query.branchId || req.userBranchId;
    if (!branchId) {
      return res.status(400).json({ message: 'Branch ID is required' });
    }

    const branchFilter = { branch: branchId };
    const [engineers, trips, pendingBills, attendancePending, approvedBills] = await Promise.all([
      User.countDocuments({ ...branchFilter, role: 'service_engineer', isActive: true }),
      Trip.countDocuments(branchFilter),
      TADABill.countDocuments({ ...branchFilter, status: { $in: ['submitted', 'approved_by_bm', 'approved_by_hr'] } }),
      Attendance.countDocuments({ ...branchFilter, approvalStatus: 'pending' }),
      TADABill.countDocuments({ ...branchFilter, status: 'approved' }),
    ]);

    res.json({
      branchId,
      engineers,
      trips,
      pendingBills,
      attendancePending,
      approvedBills,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/dashboard/hq — HQ cross-branch overview
exports.getHqStats = async (req, res) => {
  try {
    const Branch = require('../models/Branch');
    const [branches, totalUsers, totalTrips, totalBills, totalAttendance] = await Promise.all([
      Branch.find({ isActive: true }).select('name code city'),
      User.countDocuments({ isActive: true }),
      Trip.countDocuments({}),
      TADABill.countDocuments({}),
      Attendance.countDocuments({}),
    ]);

    const branchSummaries = await Promise.all(
      branches.map(async (b) => {
        const [engCount, tripCount, billCount] = await Promise.all([
          User.countDocuments({ branch: b._id, role: 'service_engineer', isActive: true }),
          Trip.countDocuments({ branch: b._id }),
          TADABill.countDocuments({ branch: b._id, status: { $nin: ['paid', 'rejected'] } }),
        ]);
        return {
          id: b._id,
          name: b.name,
          code: b.code,
          city: b.city,
          engineers: engCount,
          trips: tripCount,
          pendingBills: billCount,
        };
      })
    );

    res.json({
      overview: {
        totalBranches: branches.length,
        totalUsers,
        totalTrips,
        totalBills,
        totalAttendance,
      },
      branches: branchSummaries,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
