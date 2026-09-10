const Branch = require('../models/Branch');
const User = require('../models/User');
const Trip = require('../models/Trip');
const TADABill = require('../models/TADABill');
const Attendance = require('../models/Attendance');

// GET /api/branches — list all active branches
exports.getBranches = async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true }).sort({ code: 1 });
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/branches/:id — single branch
exports.getBranchById = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json({ branch });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/branches — create new branch (super_admin only)
exports.createBranch = async (req, res) => {
  try {
    const { name, code, address, city, state, phone, attendanceCutoffTime } = req.body;
    if (!name || !code || !city) {
      return res.status(400).json({ message: 'name, code and city are required' });
    }

    const existing = await Branch.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(409).json({ message: 'Branch code already exists' });

    const branch = await Branch.create({
      name,
      code: code.toUpperCase(),
      address: address || '',
      city,
      state: state || 'Madhya Pradesh',
      phone: phone || '',
      attendanceCutoffTime: attendanceCutoffTime || '09:30',
    });

    res.status(201).json({ branch, message: 'Branch created' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/branches/:id — update branch (super_admin only)
exports.updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const allowed = ['name', 'address', 'city', 'state', 'phone', 'attendanceCutoffTime', 'isActive'];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) branch[f] = req.body[f];
    });
    await branch.save();
    res.json({ branch, message: 'Branch updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/branches/:id/stats — branch statistics
exports.getBranchStats = async (req, res) => {
  try {
    const branchId = req.params.id;

    const [userCount, tripCount, pendingBills, pendingAttendance] = await Promise.all([
      User.countDocuments({ branch: branchId, isActive: true }),
      Trip.countDocuments({ branch: branchId }),
      TADABill.countDocuments({ branch: branchId, status: 'submitted' }),
      Attendance.countDocuments({ branch: branchId, approvalStatus: 'pending' }),
    ]);

    const approvedBillsAgg = await TADABill.aggregate([
      { $match: { branch: require('mongoose').Types.ObjectId.createFromHexString(branchId), status: { $in: ['approved', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
    ]);
    const totalApprovedAmount = approvedBillsAgg[0]?.total || 0;

    res.json({
      branchId,
      userCount,
      tripCount,
      pendingBills,
      pendingAttendance,
      totalApprovedAmount: Number(totalApprovedAmount.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
