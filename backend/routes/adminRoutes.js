const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const {
  getOverview,
  getEngineers,
  createEngineer,
  resetEngineerPassword,
  getAllTrips,
  getTripDetail,
  reviewTrip,
  deleteTrip,
} = require('../controllers/adminController');

// Legacy admin routes — now requires super_admin or branch_manager
router.use(auth);

router.get('/overview', roleGuard('branch_manager', 'super_admin'), getOverview);
router.get('/engineers', roleGuard('branch_manager', 'super_admin'), getEngineers);
router.post('/engineers', roleGuard('branch_manager', 'super_admin'), createEngineer);
router.patch('/engineers/:id/reset-password', roleGuard('branch_manager', 'super_admin'), resetEngineerPassword);
router.get('/trips', roleGuard('branch_manager', 'super_admin'), getAllTrips);
router.get('/trips/:id', roleGuard('branch_manager', 'super_admin'), getTripDetail);
router.patch('/trips/:id/review', roleGuard('branch_manager', 'super_admin'), reviewTrip);
router.delete('/trips/:id', roleGuard('branch_manager', 'super_admin'), deleteTrip);

module.exports = router;
