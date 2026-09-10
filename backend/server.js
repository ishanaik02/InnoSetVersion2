require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const adminRoutes = require('./routes/adminRoutes');
const branchRoutes = require('./routes/branchRoutes');
const billRoutes = require('./routes/billRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');

// Fail fast on missing required config instead of silently falling back to
// an insecure default (a hardcoded DB credential or JWT secret in code is
// far worse than a crash-on-boot with a clear message).
const REQUIRED_ENV_VARS = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}. See backend/.env.example.`);
  process.exit(1);
}

const app = express();

// Railway (and most PaaS hosts) sit the app behind a reverse proxy.
// Without this, express-rate-limit can't correctly read the real client IP
// from X-Forwarded-For, and throws a ValidationError on every request.
app.set('trust proxy', 1);

app.use(helmet());

// Restrict CORS to a known allowlist rather than accepting requests from any
// origin. The Expo/React Native app itself isn't subject to CORS (it's not
// a browser), but anything served from a browser (an admin web console,
// Postman-in-browser tooling, etc.) should be explicitly listed here.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
if (allowedOrigins.length === 0) {
  if (isProduction) {
    console.warn(
      'CORS_ALLOWED_ORIGINS is not set in production — no browser-based origin will be allowed ' +
        '(the native app itself is unaffected, since it sends no Origin header).'
    );
  } else {
    console.warn('CORS_ALLOWED_ORIGINS is not set — allowing all origins for local development only.');
  }
}
app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server / native app requests with no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Only fall back to "allow everything" outside production — in
      // production an empty allowlist should mean "no browser origins",
      // not "any origin," which was the previous (insecure) default.
      if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  })
);

// Receipts are stored as Buffers in MongoDB now (see backend/uploads/README),
// so raise the JSON body limit slightly for other payloads and drop the old
// disk-based /uploads static file server — it's no longer used.
app.use(express.json({ limit: '2mb' }));

// Auth endpoints are the main brute-force target — cap login/register
// attempts per IP rather than leaving them unlimited.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Centralized error handler — keeps internal error details (stack traces,
// raw mongoose/driver messages) out of client responses.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});