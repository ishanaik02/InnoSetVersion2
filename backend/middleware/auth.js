const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Auth user cache ─────────────────────────────────────────────────────
// Every API request used to pay a MongoDB User.findById (H2 in
// PRODUCTION_RED_FLAGS.md). We now cache user lookups in-process for a short
// TTL so repeated requests within the window skip the DB entirely — but we do
// NOT trust JWT claims blindly: role/branch/isActive always come from the
// cached DB document, which is refreshed at most TTL after the previous read.
//
// Safety properties (verified in costPassTest.js):
//  - Deactivating a user cuts access within TTL seconds (was: immediately).
//  - Role changes take effect within TTL seconds.
//  - JWT_SECRET is still verified on every request; role comes from the
//    DB document, not from token claims, so a stale token role cannot escalate.
// ============================================================
const USER_CACHE_TTL_MS = Number(process.env.USER_CACHE_TTL_MS) || 60 * 1000; // 60s default staleness window
const USER_CACHE_MAX = 1000;         // bound memory: ~1000 users × ~1KB

const userCache = new Map(); // userId -> { user, cachedAt }

function cacheGet(userId) {
  const entry = userCache.get(String(userId));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > USER_CACHE_TTL_MS) {
    userCache.delete(String(userId));
    return null;
  }
  return entry.user;
}

function cacheSet(user) {
  // Cheap bounded-map eviction: drop the oldest ~10% when full.
  if (userCache.size >= USER_CACHE_MAX) {
    const drop = Math.max(1, Math.floor(USER_CACHE_MAX * 0.1));
    let i = 0;
    for (const key of userCache.keys()) {
      userCache.delete(key);
      if (++i >= drop) break;
    }
  }
  userCache.set(String(user._id), { user, cachedAt: Date.now() });
}

// ── Token extraction ────────────────────────────────────────────────────
// Reads the token from the Authorization header (normal case) or from a
// ?token= query param (used only for <Image>/<a> style GET requests to the
// receipt-file route, where React Native's Image component can't easily
// attach custom headers).
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.split(' ')[1];
  if (req.query && req.query.token) return req.query.token;
  return null;
}

// ── Middleware ──────────────────────────────────────────────────────────
async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cache-first: most requests hit the in-process map, not MongoDB.
    let user = cacheGet(decoded.userId);
    if (!user) {
      user = await User.findById(decoded.userId).select('role branch isActive');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      cacheSet(user);
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account deactivated' });
    }

    req.userId = decoded.userId;
    // Role/branch always from the DB document (possibly cached ≤TTL) — never
    // from token claims, so a stale role in a live token cannot escalate.
    req.userRole = user.role;
    req.userBranchId = user.branch; // Branch assignment for scoping
    req.user = user; // Full user object if needed

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;

// Test-only hook (unit tests import the module in-process and call this to
// reset cache state between assertions):
authMiddleware._clearUserCacheForTests = function clearUserCache() {
  userCache.clear();
};
