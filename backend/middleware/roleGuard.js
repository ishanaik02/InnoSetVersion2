// Must run after auth.js — relies on req.userRole and req.userBranchId set there.
const User = require('../models/User');

// Role hierarchy for permission checking
const ROLE_HIERARCHY = {
  service_engineer: 1,
  hr: 2,
  branch_manager: 3,
  account_dept: 4,
  service_head: 5,
  super_admin: 6,
};

/**
 * Middleware that checks if the authenticated user has one of the allowed roles.
 * @param  {...string} allowedRoles - The roles that are allowed to access the route
 */
function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.userRole;
    
    if (!userRole) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: userRole,
      });
    }

    next();
  };
}

/**
 * Middleware that checks if user's role is at least the minimum level required.
 * Useful for hierarchical access (e.g., service_head can do everything hr can do).
 * @param {string} minimumRole - The minimum role required
 */
function minimumRole(minimumRole) {
  return (req, res, next) => {
    const userRole = req.userRole;
    
    if (!userRole) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ 
        message: 'Access denied. Role level insufficient.',
        required: minimumRole,
        current: userRole,
      });
    }

    next();
  };
}

/**
 * Middleware that checks if the user belongs to the specified branch
 * or has cross-branch access (service_head, account_dept, super_admin).
 * @param {string} branchParamSource - Where to get branchId from: 'params', 'query', 'body', or 'user'
 * @param {string} branchFieldName - The field name containing the branch ID
 */
function branchAccess(branchParamSource = 'params', branchFieldName = 'branchId') {
  return async (req, res, next) => {
    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    // Cross-branch roles can access all branches
    const crossBranchRoles = ['service_head', 'account_dept', 'super_admin'];
    if (crossBranchRoles.includes(userRole)) {
      return next();
    }

    // Get the target branch ID from the specified source
    let targetBranchId;
    switch (branchParamSource) {
      case 'params':
        targetBranchId = req.params[branchFieldName];
        break;
      case 'query':
        targetBranchId = req.query[branchFieldName];
        break;
      case 'body':
        targetBranchId = req.body[branchFieldName];
        break;
      case 'user':
        targetBranchId = userBranchId;
        break;
      default:
        targetBranchId = null;
    }

    // If no branch to check, allow access (e.g., user's own data)
    if (!targetBranchId) {
      return next();
    }

    // Branch-scoped roles can only access their own branch
    if (userBranchId && targetBranchId.toString() === userBranchId.toString()) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied. Cannot access data from another branch.',
    });
  };
}

module.exports = { 
  roleGuard, 
  minimumRole, 
  branchAccess, 
  ROLE_HIERARCHY,
};
