const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  resetPassword,
} = require('../controllers/userController');

router.use(auth);

// List users — scoped by role inside controller
router.get(
  '/',
  roleGuard('branch_manager', 'hr', 'service_head', 'account_dept', 'super_admin'),
  getUsers
);

router.get(
  '/:id',
  roleGuard('branch_manager', 'hr', 'service_head', 'account_dept', 'super_admin'),
  getUserById
);

// Create user — BM (service_engineers only) and super_admin (any role)
router.post(
  '/',
  roleGuard('branch_manager', 'super_admin'),
  createUser
);

// Update user
router.patch(
  '/:id',
  roleGuard('branch_manager', 'super_admin'),
  updateUser
);

// Reset password
router.patch(
  '/:id/reset-password',
  roleGuard('branch_manager', 'super_admin'),
  resetPassword
);

module.exports = router;
