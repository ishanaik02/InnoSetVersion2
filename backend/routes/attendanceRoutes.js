const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const {
  markAttendance,
  getMyAttendance,
  getTodayAttendance,
  getBranchAttendance,
  getAllAttendance,
  getPendingAttendance,
  approveAttendance,
  rejectAttendance,
  bulkApproveAttendance,
  getAttendanceReport,
} = require('../controllers/attendanceController');

router.use(auth);

// Employee routes — any role can mark their own attendance
router.post('/mark', markAttendance);
router.get('/me', getMyAttendance);
router.get('/today', getTodayAttendance);

// HR pending queue — within branch
router.get('/pending', roleGuard('hr', 'branch_manager', 'service_head', 'super_admin'), getPendingAttendance);

// Branch view (BM, HR, SH, super_admin)
router.get(
  '/branch',
  roleGuard('branch_manager', 'hr', 'service_head', 'account_dept', 'super_admin'),
  getBranchAttendance
);

// All branches (SH, super_admin)
router.get(
  '/all',
  roleGuard('service_head', 'super_admin'),
  getAllAttendance
);

// Report
router.get(
  '/report',
  roleGuard('branch_manager', 'hr', 'service_head', 'account_dept', 'super_admin'),
  getAttendanceReport
);

// Bulk approve (HR only or super_admin)
router.post('/bulk-approve', roleGuard('hr', 'super_admin'), bulkApproveAttendance);

// Per-record approve/reject (HR)
router.post('/:id/approve', roleGuard('hr', 'super_admin'), approveAttendance);
router.post('/:id/reject', roleGuard('hr', 'super_admin'), rejectAttendance);

module.exports = router;
