const multer = require('multer');

// Receipts are stored as Buffers directly on the Trip document in MongoDB
// (see models/Trip.js) rather than on local disk. This keeps things simple
// and portable for a ~100-user deployment — no separate file storage/CDN
// to provision or back up, and receipts travel with the trip record.
// Memory storage holds the file in RAM only for the duration of the request.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per receipt — plenty for a phone photo/PDF, keeps documents lean
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Upload a JPG, PNG, HEIC or PDF.'));
  },
});

module.exports = upload;
