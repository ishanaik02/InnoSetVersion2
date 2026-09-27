const TADABill = require('../models/TADABill');
const BillApproval = require('../models/BillApproval');
const User = require('../models/User');
const Branch = require('../models/Branch');
const mongoose = require('mongoose');

// Auto-generate bill number: {BranchCode}-TA-{Year}-{000001}
async function generateBillNumber(branchId) {
  const branch = await Branch.findById(branchId);
  if (!branch) throw new Error('Branch not found');
  const year = new Date().getFullYear();
  const prefix = `${branch.code}-TA-${year}-`;
  // Count existing bills for this branch and year
  const count = await TADABill.countDocuments({
    billNumber: { $regex: `^${prefix}` },
  });
  const seq = String(count + 1).padStart(6, '0');
  return `${prefix}${seq}`;
}

// Determine who should approve next based on current status
async function getNextApprover(branchId, newStatus) {
  switch (newStatus) {
    case 'submitted': {
      // Find a branch_manager in this branch
      const bm = await User.findOne({ branch: branchId, role: 'branch_manager', isActive: true });
      return bm ? bm._id : null;
    }
    case 'approved_by_bm': {
      // Find HR in this branch
      const hr = await User.findOne({ branch: branchId, role: 'hr', isActive: true });
      return hr ? hr._id : null;
    }
    case 'approved_by_hr': {
      // Find service_head (cross-branch role)
      const sh = await User.findOne({ role: 'service_head', isActive: true });
      return sh ? sh._id : null;
    }
    case 'approved_by_sh':
    case 'approved':
    case 'rejected':
    case 'paid':
      return null;
    default:
      return null;
  }
}

// GET /api/bills — list bills (role-scoped)
exports.getBills = async (req, res) => {
  try {
    const { status, from, to, branch } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    const query = {};

    // Scope by role
    if (userRole === 'service_engineer') {
      query.employee = userId;
    } else if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = userBranchId;
    } else if (userRole === 'account_dept') {
      // Account dept only sees approved or paid bills
      query.status = { $in: ['approved', 'paid'] };
    }
    // service_head and super_admin: no branch filter (see all)

    if (status) {
      // Override account_dept restriction only if super_admin
      if (userRole !== 'account_dept' || userRole === 'super_admin') {
        query.status = status;
      }
    }
    if (branch && ['service_head', 'super_admin'].includes(userRole)) {
      query.branch = branch;
    }
    if (from || to) {
      query.billDate = {};
      if (from) query.billDate.$gte = new Date(from);
      if (to) query.billDate.$lte = new Date(to);
    }

    const bills = await TADABill.find(query)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city')
      .populate('trip', 'startLocation destination date tripType conveyance grandTotal')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ bills });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bills/pending — bills awaiting current user's action
exports.getPendingBills = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    let query = {};

    switch (userRole) {
      case 'branch_manager':
        query = { branch: userBranchId, status: 'submitted' };
        break;
      case 'hr':
        query = { branch: userBranchId, status: 'approved_by_bm' };
        break;
      case 'service_head':
        query = { status: 'approved_by_hr' };
        break;
      case 'account_dept':
        query = { status: 'approved' };
        break;
      case 'super_admin':
        query = { status: { $in: ['submitted', 'approved_by_bm', 'approved_by_hr', 'approved_by_sh', 'approved'] } };
        break;
      default:
        return res.json({ bills: [] });
    }

    const bills = await TADABill.find(query)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city')
      .populate('trip', 'startLocation destination date')
      .sort({ createdAt: 1 }); // Oldest first for approval queues

    res.json({ bills });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bills/:id — single bill with full history
exports.getBillById = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city')
      .populate('trip', 'startLocation destination date tripType conveyance grandTotal outboundDistanceKm returnDistanceKm')
      .populate('currentApprover', 'name role')
      .populate('approvalHistory.approver', 'name role');

    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    // Scope check
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    if (userRole === 'service_engineer' && bill.employee._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (['branch_manager', 'hr'].includes(userRole)) {
      if (!userBranchId || bill.branch._id.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Access denied. Bill belongs to another branch.' });
      }
    }

    res.json({ bill });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bills — create new draft bill
exports.createBill = async (req, res) => {
  try {
    const {
      trip,
      conveyanceAmount,
      daAmount,
      stayAmount,
      otherAmount,
      otherDescription,
    } = req.body;

    if (!trip) {
      return res.status(400).json({ message: 'trip reference is required' });
    }

    const branchId = req.userBranchId;
    if (!branchId) {
      return res.status(400).json({ message: 'User has no branch assigned' });
    }

    const billNumber = await generateBillNumber(branchId);

    const conv = Number(conveyanceAmount) || 0;
    const da = Number(daAmount) || 0;
    const stay = Number(stayAmount) || 0;
    const other = Number(otherAmount) || 0;
    const totalAmount = conv + da + stay + other;

    const bill = await TADABill.create({
      trip,
      employee: req.userId,
      branch: branchId,
      billNumber,
      billDate: new Date(),
      totalAmount,
      conveyanceAmount: conv,
      daAmount: da,
      stayAmount: stay,
      otherAmount: other,
      otherDescription: otherDescription || '',
      status: 'draft',
    });

    const populated = await TADABill.findById(bill._id)
      .populate('employee', 'name employeeId')
      .populate('branch', 'name code')
      .populate('trip', 'startLocation destination date');

    res.status(201).json({ bill: populated, message: 'Bill created as draft' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/bills/:id — update draft bill
exports.updateBill = async (req, res) => {
  try {
    const bill = await TADABill.findOne({ _id: req.params.id, employee: req.userId });
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status !== 'draft' && bill.status !== 'rejected') {
      return res.status(400).json({ message: 'Only draft or rejected bills can be edited' });
    }

    const allowed = ['conveyanceAmount', 'daAmount', 'stayAmount', 'otherAmount', 'otherDescription'];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) bill[f] = req.body[f];
    });

    // Recalculate total
    bill.totalAmount = (bill.conveyanceAmount || 0) + (bill.daAmount || 0) + (bill.stayAmount || 0) + (bill.otherAmount || 0);
    await bill.save();

    res.json({ bill, message: 'Bill updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /api/bills/:id — delete draft only
exports.deleteBill = async (req, res) => {
  try {
    const bill = await TADABill.findOne({ _id: req.params.id, employee: req.userId });
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft bills can be deleted' });
    }
    await bill.deleteOne();
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bills/:id/submit — engineer submits draft → submitted
exports.submitBill = async (req, res) => {
  try {
    const bill = await TADABill.findOne({ _id: req.params.id, employee: req.userId });
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (!['draft', 'rejected'].includes(bill.status)) {
      return res.status(400).json({ message: 'Only draft or rejected bills can be submitted' });
    }

    const employee = await User.findById(req.userId).select('name role');
    const nextApprover = await getNextApprover(bill.branch, 'submitted');

    bill.status = 'submitted';
    bill.currentApprover = nextApprover;
    bill.approvalHistory.push({
      approver: req.userId,
      approverName: employee.name,
      approverRole: employee.role,
      action: 'submitted',
      remarks: req.body.remarks || '',
      timestamp: new Date(),
    });
    await bill.save();

    // Create audit record
    await BillApproval.create({
      bill: bill._id,
      approver: req.userId,
      action: 'submitted',
      previousStatus: 'draft',
      newStatus: 'submitted',
      remarks: req.body.remarks || '',
    });

    res.json({ bill, message: 'Bill submitted for approval' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bills/:id/approve — approve at current stage
exports.approveBill = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    const userRole = req.userRole;
    const userBranchId = req.userBranchId;
    const previousStatus = bill.status;

    // Validate approver role vs current status
    const approvalMap = {
      submitted: 'branch_manager',
      approved_by_bm: 'hr',
      approved_by_hr: 'service_head',
    };

    const requiredRole = approvalMap[bill.status];
    if (!requiredRole) {
      return res.status(400).json({ message: `Bill in status '${bill.status}' cannot be approved` });
    }
    if (userRole !== requiredRole && userRole !== 'super_admin') {
      return res.status(403).json({ message: `Only a ${requiredRole} can approve this bill at this stage` });
    }

    // Branch check for BM and HR
    if (['branch_manager', 'hr'].includes(userRole)) {
      if (!userBranchId || bill.branch.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Bill belongs to another branch' });
      }
    }

    // Calculate new status
    const statusTransitions = {
      submitted: 'approved_by_bm',
      approved_by_bm: 'approved_by_hr',
      approved_by_hr: 'approved_by_sh',
    };
    let newStatus = statusTransitions[bill.status];

    // SH approval finalizes the bill
    if (bill.status === 'approved_by_hr' && userRole === 'service_head') {
      newStatus = 'approved';
      bill.approvedAmount = bill.totalAmount; // Use current total (may have been edited)
      bill.canEdit = false;
    } else if (newStatus === 'approved_by_hr') {
      bill.canEdit = true; // SH can edit at this stage
    }

    const approver = await User.findById(req.userId).select('name role');
    const nextApprover = await getNextApprover(bill.branch, newStatus);

    bill.status = newStatus;
    bill.currentApprover = nextApprover;
    bill.approvalHistory.push({
      approver: req.userId,
      approverName: approver.name,
      approverRole: approver.role,
      action: 'approved',
      remarks: req.body.remarks || '',
      timestamp: new Date(),
    });
    await bill.save();

    await BillApproval.create({
      bill: bill._id,
      approver: req.userId,
      action: 'approved',
      previousStatus,
      newStatus,
      remarks: req.body.remarks || '',
    });

    res.json({ bill, message: `Bill approved. Status: ${newStatus}` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bills/:id/reject — reject at any stage
exports.rejectBill = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    const userRole = req.userRole;
    const userBranchId = req.userBranchId;
    const previousStatus = bill.status;

    const approvableStatuses = ['submitted', 'approved_by_bm', 'approved_by_hr'];
    if (!approvableStatuses.includes(bill.status)) {
      return res.status(400).json({ message: `Bill in status '${bill.status}' cannot be rejected` });
    }

    const approvalMap = {
      submitted: 'branch_manager',
      approved_by_bm: 'hr',
      approved_by_hr: 'service_head',
    };
    const requiredRole = approvalMap[bill.status];
    if (userRole !== requiredRole && userRole !== 'super_admin') {
      return res.status(403).json({ message: `Only a ${requiredRole} can reject this bill at this stage` });
    }
    if (['branch_manager', 'hr'].includes(userRole)) {
      if (!userBranchId || bill.branch.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Bill belongs to another branch' });
      }
    }

    if (!req.body.remarks) {
      return res.status(400).json({ message: 'Rejection remarks are required' });
    }

    const approver = await User.findById(req.userId).select('name role');

    bill.status = 'rejected';
    bill.currentApprover = null;
    bill.canEdit = false;
    bill.approvalHistory.push({
      approver: req.userId,
      approverName: approver.name,
      approverRole: approver.role,
      action: 'rejected',
      remarks: req.body.remarks,
      timestamp: new Date(),
    });
    await bill.save();

    await BillApproval.create({
      bill: bill._id,
      approver: req.userId,
      action: 'rejected',
      previousStatus,
      newStatus: 'rejected',
      remarks: req.body.remarks,
    });

    res.json({ bill, message: 'Bill rejected. Engineer can resubmit after corrections.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/bills/:id/edit — Service Head edits amounts (only when status = approved_by_hr)
exports.editBillAmounts = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    if (req.userRole !== 'service_head' && req.userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only Service Head can edit bill amounts' });
    }
    if (bill.status !== 'approved_by_hr') {
      return res.status(400).json({ message: 'Bills can only be edited when status is approved_by_hr' });
    }

    const editableFields = ['conveyanceAmount', 'daAmount', 'stayAmount', 'otherAmount'];
    const edits = [];
    editableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        const oldValue = bill[field];
        const newValue = Number(req.body[field]);
        if (Math.abs(oldValue - newValue) > 0.01) {
          edits.push({ field, oldValue, newValue, editedBy: req.userId, editedAt: new Date() });
          bill[field] = newValue;
        }
      }
    });

    if (edits.length === 0) {
      return res.status(400).json({ message: 'No changes detected' });
    }

    bill.totalAmount = (bill.conveyanceAmount || 0) + (bill.daAmount || 0) + (bill.stayAmount || 0) + (bill.otherAmount || 0);
    bill.editHistory.push(...edits);
    bill.editedBy = req.userId;
    await bill.save();

    await BillApproval.create({
      bill: bill._id,
      approver: req.userId,
      action: 'edited',
      previousStatus: 'approved_by_hr',
      newStatus: 'approved_by_hr',
      previousAmount: edits[0]?.oldValue,
      newAmount: edits[0]?.newValue,
      remarks: req.body.remarks || 'Amounts adjusted by Service Head',
    });

    res.json({ bill, message: 'Bill amounts updated', edits });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bills/:id/pay — Account Dept marks bill as paid
exports.markBillPaid = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    if (req.userRole !== 'account_dept' && req.userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Only Account Department can mark bills as paid' });
    }
    if (bill.status !== 'approved') {
      return res.status(400).json({ message: 'Only fully approved bills can be marked as paid' });
    }

    const previousStatus = bill.status;
    bill.status = 'paid';
    bill.currentApprover = null;

    const acct = await User.findById(req.userId).select('name role');
    bill.approvalHistory.push({
      approver: req.userId,
      approverName: acct.name,
      approverRole: acct.role,
      action: 'approved',
      remarks: req.body.remarks || 'Payment processed',
      timestamp: new Date(),
    });
    await bill.save();

    await BillApproval.create({
      bill: bill._id,
      approver: req.userId,
      action: 'approved',
      previousStatus,
      newStatus: 'paid',
      remarks: req.body.remarks || 'Payment processed',
    });

    res.json({ bill, message: 'Bill marked as paid' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bills/:id/print — clean printable bill data
// Returns a stripped-down bill object suitable for generating a PDF or
// printing — no internal IDs, no approvalHistory objects, just the
// human-readable information a printed bill needs.
exports.getBillPrint = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id)
      .populate('employee', 'name employeeId grade')
      .populate('branch', 'name code city address')
      .populate('trip', 'startLocation destination date tripType conveyance outboundDistanceKm returnDistanceKm ticketAmount');

    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    // Scope check
    const userRole = req.userRole;
    const userId = req.userId;
    const userBranchId = req.userBranchId;

    if (userRole === 'service_engineer' && bill.employee._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (['branch_manager', 'hr'].includes(userRole)) {
      if (!userBranchId || bill.branch._id.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }
    // SH, account_dept, super_admin: no extra filter

    // Bill can only be printed after all approvals are completed
    if (!['approved', 'paid'].includes(bill.status) && userRole !== 'super_admin') {
      return res.status(400).json({ message: 'Bill can only be printed after all approvals are completed' });
    }

    const employee = bill.employee || {};
    const branch = bill.branch || {};
    const trip = bill.trip || {};

    res.json({
      billNumber: bill.billNumber,
      status: bill.status,
      issueDate: bill.billDate ? new Date(bill.billDate).toLocaleDateString('en-IN') : '',
      employee: {
        name: employee.name,
        employeeId: employee.employeeId,
        grade: employee.grade,
      },
      branch: {
        name: branch.name,
        code: branch.code,
      },
      trip: {
        startLocation: trip.startLocation,
        destination: trip.destination,
        date: trip.date ? new Date(trip.date).toLocaleDateString('en-IN') : '',
        tripType: trip.tripType,
        conveyance: trip.conveyance,
        distanceKm: (trip.outboundDistanceKm || 0) + (trip.returnDistanceKm || 0),
        ticketAmount: trip.ticketAmount || 0,
      },
      amounts: {
        conveyance: bill.conveyanceAmount || 0,
        dailyAllowance: bill.daAmount || 0,
        stay: bill.stayAmount || 0,
        other: bill.otherAmount || 0,
        otherDescription: bill.otherDescription || '',
        total: bill.totalAmount || 0,
        approvedAmount: bill.approvedAmount != null ? bill.approvedAmount : null,
      },
      approvalHistory: (bill.approvalHistory || []).map(h => ({
        action: h.action,
        approver: h.approverName || '—',
        role: h.approverRole || '—',
        remarks: h.remarks || '',
        timestamp: h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN') : '',
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bills/:id/history — full approval audit trail
exports.getBillHistory = async (req, res) => {
  try {
    const bill = await TADABill.findById(req.params.id).select('approvalHistory billNumber status');
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    const auditLogs = await BillApproval.find({ bill: req.params.id })
      .populate('approver', 'name role employeeId')
      .sort({ timestamp: 1 });

    res.json({ billNumber: bill.billNumber, status: bill.status, history: auditLogs });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
