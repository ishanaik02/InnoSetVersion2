const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  getBranchStats,
} = require('../controllers/branchController');

router.use(auth); // All routes require authentication

// All authenticated users can list branches (for dropdowns etc.)
router.get('/', getBranches);
router.get('/:id', getBranchById);
router.get('/:id/stats', getBranchStats);

// Only super_admin can create/update branches
router.post('/', roleGuard('super_admin'), createBranch);
router.patch('/:id', roleGuard('super_admin'), updateBranch);

module.exports = router;
