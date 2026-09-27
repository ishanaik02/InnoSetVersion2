const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error(
      'MONGO_URI is not set. Refusing to start with a hardcoded fallback — set it in your .env file (see .env.example).'
    );
    process.exit(1);
  }
  try {
    // MONGO_DEBUG=true logs every query — used by costPassTest.js to count
    // actual DB reads, and handy for ops debugging.
    if (process.env.MONGO_DEBUG === 'true') {
      mongoose.set('debug', true);
    }
    await mongoose.connect(uri);
    // Never log the full URI — it contains the DB credentials.
    const safeHost = uri.split('@')[1]?.split('/')[0] || 'database';
    console.log('MongoDB connected:', safeHost);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
