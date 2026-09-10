// Must run after auth.js — relies on req.userRole set there.
module.exports = function adminOnly(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};
