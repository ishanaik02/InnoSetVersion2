const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const User = require('../models/User');

// Helper: normalize a date to midnight UTC
function normalizeDate(dateInput) {
  const d = new Date(dateInput);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: check if current time is before the branch cutoff
async function isBeforeCutoff(branchId) {
  const branch = await Branch.findById(branchId).select('attendanceCutoffTime');
  const cutoff = branch?.attendanceCutoffTime || '09:30';
  const [cutHour, cutMin] = cutoff.split(':').map(Number);

  // Use IST offset (UTC+5:30) to evaluate local branch time
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const currentHour = istNow.getUTCHours();
  const currentMin = istNow.getUTCMinutes();

  return currentHour < cutHour || (currentHour === cutHour && currentMin < cutMin);
}

// POST /api/attendance/mark — employee marks daily attendance
exports.markAttendance = async (req, res) => {
  try {
    const { status, leaveType, leaveReason, onDutyLocation, onDutyPurpose } = req.body;

    if (!['present', 'leave', 'on_duty'].includes(status)) {
      return res.status(400).json({ message: "status must be 'present', 'leave', or 'on_duty'" });
    }
    if (status === 'leave' && !leaveType) {
      return res.status(400).json({ message: 'leaveType is required for leave status' });
    }

    const branchId = req.userBranchId;
    if (!branchId) return res.status(400).json({ message: 'User has no branch assigned' });

    const today = normalizeDate(new Date());
    const markedBeforeCutoff = await isBeforeCutoff(branchId);

    const existing = await Attendance.findOne({ employee: req.userId, date: today });
    if (existing && existing.isLocked) {
      return res.status(400).json({ message: 'Your attendance record is locked and cannot be changed' });
    }
    if (existing && existing.approvalStatus === 'approved') {
      return res.status(400).json({ message: 'Attendance already approved for today' });
    }

    const record = existing || new Attendance({
      employee: req.userId,
      branch: branchId,
      date: today,
    });

    record.status = status;
    record.markedBeforeCutoff = markedBeforeCutoff;
    record.markedAt = new Date();
    record.approvalStatus = 'pending';

    if (status === 'leave') {
      record.leaveType = leaveType;
      record.leaveReason = leaveReason || '';
    } else {
      record.leaveType = undefined;
      record.leaveReason = '';
    }

    if (status === 'on_duty') {
      record.onDutyLocation = onDutyLocation || '';
      record.onDutyPurpose = onDutyPurpose || '';
    } else {
      record.onDutyLocation = '';
      record.onDutyPurpose = '';
    }

    await record.save();
    res.status(existing ? 200 : 201).json({
      record,
      message: existing ? 'Attendance updated' : 'Attendance marked',
      markedBeforeCutoff,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Attendance already marked for today' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/me — own attendance records
exports.getMyAttendance = async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { employee: req.userId };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = normalizeDate(new Date(from));
      if (to) query.date.$lte = normalizeDate(new Date(to));
    }

    const records = await Attendance.find(query)
      .populate('approvedBy', 'name role')
      .sort({ date: -1 })
      .limit(100);

    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/today — today's record for current user
exports.getTodayAttendance = async (req, res) => {
  try {
    const today = normalizeDate(new Date());
    const record = await Attendance.findOne({ employee: req.userId, date: today })
      .populate('approvedBy', 'name role');

    const branchId = req.userBranchId;
    const beforeCutoff = branchId ? await isBeforeCutoff(branchId) : true;

    res.json({ record, date: today, markedBeforeCutoff: beforeCutoff });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/branch — branch records (BM/HR)
exports.getBranchAttendance = async (req, res) => {
  try {
    const { date, from, to, approvalStatus, employeeId } = req.query;
    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    const query = {};

    // Branch-scoped
    if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = userBranchId;
    }
    // super_admin / service_head can filter by branch
    if (['service_head', 'super_admin'].includes(userRole) && req.query.branch) {
      query.branch = req.query.branch;
    }

    if (date) {
      query.date = normalizeDate(new Date(date));
    } else if (from || to) {
      query.date = {};
      if (from) query.date.$gte = normalizeDate(new Date(from));
      if (to) query.date.$lte = normalizeDate(new Date(to));
    }

    if (approvalStatus) query.approvalStatus = approvalStatus;

    if (employeeId) {
      const emp = await User.findOne({ employeeId });
      if (emp) query.employee = emp._id;
    }

    const records = await Attendance.find(query)
      .populate('employee', 'name employeeId role grade')
      .populate('approvedBy', 'name role')
      .sort({ date: -1, 'employee.name': 1 })
      .limit(1000);

    res.json({ records, count: records.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/all — all branches (SH / super_admin)
exports.getAllAttendance = async (req, res) => {
  try {
    const { date, from, to, approvalStatus, branch } = req.query;
    const query = {};

    if (branch) query.branch = branch;
    if (date) {
      query.date = normalizeDate(new Date(date));
    } else if (from || to) {
      query.date = {};
      if (from) query.date.$gte = normalizeDate(new Date(from));
      if (to) query.date.$lte = normalizeDate(new Date(to));
    }
    if (approvalStatus) query.approvalStatus = approvalStatus;

    const records = await Attendance.find(query)
      .populate('employee', 'name employeeId role')
      .populate('branch', 'name code city')
      .populate('approvedBy', 'name role')
      .sort({ date: -1 })
      .limit(2000);

    res.json({ records, count: records.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/pending — pending HR review in branch
exports.getPendingAttendance = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    const query = { approvalStatus: 'pending' };

    if (userRole === 'hr') {
      query.branch = userBranchId;
    } else if (userRole === 'branch_manager') {
      query.branch = userBranchId;
    }
    // service_head, super_admin: see all pending (no branch filter unless requested)

    const today = normalizeDate(new Date());
    if (req.query.today === 'true') {
      query.date = today;
    }

    const records = await Attendance.find(query)
      .populate('employee', 'name employeeId role grade')
      .populate('branch', 'name code')
      .sort({ date: -1, markedAt: 1 })
      .limit(500);

    res.json({ records, count: records.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/attendance/:id/approve — HR approves a record (locks it)
exports.approveAttendance = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    if (req.userRole !== 'hr' && req.userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only HR can approve attendance records' });
    }
    if (req.userRole === 'hr') {
      if (!req.userBranchId || record.branch.toString() !== req.userBranchId.toString()) {
        return res.status(403).json({ message: 'Cannot approve attendance from another branch' });
      }
    }
    if (record.isLocked) {
      return res.status(400).json({ message: 'Record is already locked' });
    }

    record.approvalStatus = 'approved';
    record.approvedBy = req.userId;
    record.approvedAt = new Date();
    record.approvalRemarks = req.body.remarks || '';
    record.isLocked = true;
    await record.save();

    res.json({ record, message: 'Attendance approved and locked' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/attendance/:id/reject — HR rejects; employee can re-mark
exports.rejectAttendance = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    if (req.userRole !== 'hr' && req.userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only HR can reject attendance records' });
    }
    if (req.userRole === 'hr') {
      if (!req.userBranchId || record.branch.toString() !== req.userBranchId.toString()) {
        return res.status(403).json({ message: 'Cannot reject attendance from another branch' });
      }
    }
    if (record.isLocked) {
      return res.status(400).json({ message: 'Record is locked and cannot be rejected' });
    }
    if (!req.body.remarks) {
      return res.status(400).json({ message: 'Rejection remarks are required' });
    }

    record.approvalStatus = 'rejected';
    record.approvalRemarks = req.body.remarks;
    record.approvedBy = req.userId;
    record.approvedAt = new Date();
    await record.save();

    res.json({ record, message: 'Attendance rejected. Employee can re-mark.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/attendance/bulk-approve — HR bulk approves all pending in branch for a date
exports.bulkApproveAttendance = async (req, res) => {
  try {
    const { date, ids } = req.body;

    if (req.userRole !== 'hr' && req.userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only HR can bulk approve attendance' });
    }

    const userBranchId = req.userBranchId;
    let query = { approvalStatus: 'pending', isLocked: false };

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Approve specific records by ID
      query._id = { $in: ids };
    } else if (date) {
      // Approve all pending for a specific date in branch
      query.date = normalizeDate(new Date(date));
      if (req.userRole === 'hr') query.branch = userBranchId;
    } else {
      return res.status(400).json({ message: 'Either date or ids array is required' });
    }

    if (req.userRole === 'hr' && !ids) {
      query.branch = userBranchId;
    }

    const result = await Attendance.updateMany(query, {
      $set: {
        approvalStatus: 'approved',
        approvedBy: req.userId,
        approvedAt: new Date(),
        isLocked: true,
        approvalRemarks: req.body.remarks || 'Bulk approved',
      },
    });

    res.json({
      message: `${result.modifiedCount} attendance records approved`,
      approvedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/attendance/report — attendance summary report
exports.getAttendanceReport = async (req, res) => {
  try {
    const { from, to, branch } = req.query;
    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    const matchQuery = {};
    if (['branch_manager', 'hr'].includes(userRole)) {
      matchQuery.branch = require('mongoose').Types.ObjectId.createFromHexString(userBranchId.toString());
    } else if (branch) {
      matchQuery.branch = require('mongoose').Types.ObjectId.createFromHexString(branch);
    }
    if (from || to) {
      matchQuery.date = {};
      if (from) matchQuery.date.$gte = normalizeDate(new Date(from));
      if (to) matchQuery.date.$lte = normalizeDate(new Date(to));
    }

    const report = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { employee: '$employee', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.employee',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
          total: { $sum: '$count' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: '$employee' },
      {
        $project: {
          employeeName: '$employee.name',
          employeeId: '$employee.employeeId',
          role: '$employee.role',
          statuses: 1,
          total: 1,
        },
      },
      { $sort: { employeeName: 1 } },
    ]);

    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
