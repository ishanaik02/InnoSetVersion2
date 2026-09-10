const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

module.exports = async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch full user data to get current branch and role
    const user = await User.findById(decoded.userId).select('role branch isActive');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account deactivated' });
    }
    
    req.userId = decoded.userId;
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
};
