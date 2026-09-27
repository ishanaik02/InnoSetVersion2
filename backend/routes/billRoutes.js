const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const {
  getBills,
  getPendingBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  submitBill,
  approveBill,
  rejectBill,
  editBillAmounts,
  markBillPaid,
  getBillHistory,
  getBillPrint,
} = require('../controllers/billController');

router.use(auth);

// List and create
router.get('/', getBills);
router.post(
  '/',
  roleGuard('service_engineer', 'branch_manager', 'hr', 'service_head', 'super_admin'),
  createBill
);

// Pending queue (role-filtered inside controller)
router.get('/pending', getPendingBills);

// Single bill
router.get('/:id', getBillById);
router.patch(
  '/:id',
  roleGuard('service_engineer', 'super_admin'),
  updateBill
);
router.delete(
  '/:id',
  roleGuard('service_engineer', 'super_admin'),
  deleteBill
);

// Workflow actions
router.post(
  '/:id/submit',
  roleGuard('service_engineer', 'branch_manager', 'hr', 'service_head', 'super_admin'),
  submitBill
);
router.post(
  '/:id/approve',
  roleGuard('branch_manager', 'hr', 'service_head', 'super_admin'),
  approveBill
);
router.post(
  '/:id/reject',
  roleGuard('branch_manager', 'hr', 'service_head', 'super_admin'),
  rejectBill
);
router.patch(
  '/:id/edit',
  roleGuard('service_head', 'super_admin'),
  editBillAmounts
);
router.post(
  '/:id/pay',
  roleGuard('account_dept', 'super_admin'),
  markBillPaid
);

// History / audit
router.get('/:id/history', getBillHistory);

// Printable bill data
router.get('/:id/print', getBillPrint);

module.exports = router;
