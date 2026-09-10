const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getAttendanceReport,
  getBillsReport,
  getTripsReport,
  exportReport,
} = require('../controllers/reportController');

router.use(auth);

router.get('/attendance', getAttendanceReport);
router.get('/bills', getBillsReport);
router.get('/trips', getTripsReport);
router.get('/export', exportReport);

module.exports = router;
