const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { register, login } = require('../controllers/authController');

// Locked down, not removed: /register still works exactly as before, but now
// only for an already-logged-in admin (matches the "admin creates the
// engineer" flow in the app). This keeps the endpoint around for scripts/
// tooling that already call it, while closing the "anyone can self-register"
// gap. New engineer accounts should generally go through
// POST /api/admin/engineers instead — this route is kept for compatibility.
router.post('/register', auth, adminOnly, register);
router.post('/login', login);

module.exports = router;
