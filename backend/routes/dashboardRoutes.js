const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getStats, getBranchStats, getHqStats } = require('../controllers/dashboardController');

router.use(auth);

// Any authenticated user gets their role-appropriate stats
router.get('/stats', getStats);
router.get('/branch', getBranchStats);
router.get('/hq', getHqStats);

module.exports = router;
