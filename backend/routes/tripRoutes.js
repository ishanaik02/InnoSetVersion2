const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  createTrip,
  updateTrip,
  deleteTrip,
  getTrips,
  getTripById,
  submitTrip,
  uploadReceipt,
  getReceiptFile,
  getDashboardStats,
  saveLocation,
  uploadLocationBatch,
  getLiveLocation,
  getRouteHistory,
} = require('../controllers/tripController');

router.use(auth); // all trip routes require a logged-in user (engineer or admin)

router.get('/stats', getDashboardStats);
router.get('/', getTrips);
router.post('/', createTrip);
router.get('/:id', getTripById);
router.patch('/:id', updateTrip);
router.delete('/:id', deleteTrip);
router.post('/:id/submit', submitTrip);
router.post('/:id/receipts', upload.single('receipt'), uploadReceipt);
router.get('/:id/receipts/:receiptId', getReceiptFile);
router.post('/:id/location', saveLocation);

router.post('/:id/location/batch', uploadLocationBatch);

router.get('/:id/live', getLiveLocation);

router.get('/:id/route', getRouteHistory);

module.exports = router;
