const bcrypt = require('bcryptjs');
const User = require('../models/User');

// GET /api/users — list users scoped by role
exports.getUsers = async (req, res) => {
  try {
    const { role, branch } = req.query;
    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    const query = { isActive: true };

    // Branch-scoped roles can only see their own branch
    if (['branch_manager', 'hr'].includes(userRole)) {
      query.branch = userBranchId;
    } else if (['service_head', 'account_dept', 'super_admin'].includes(userRole)) {
      if (branch) query.branch = branch;
    }

    if (role) query.role = role;

    const users = await User.find(query, '-passwordHash')
      .populate('branch', 'name code city')
      .sort({ name: 1 });

    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/users/:id — single user
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-passwordHash').populate('branch', 'name code city');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/users — create user
// BM: can only create service_engineer within own branch
// super_admin: can create any role in any branch
exports.createUser = async (req, res) => {
  try {
    const { name, employeeId, email, password, grade, role, branch } = req.body;

    if (!name || !employeeId || !password) {
      return res.status(400).json({ message: 'name, employeeId and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    // Determine the target role and branch
    let targetRole = role || 'service_engineer';
    let targetBranch = branch || userBranchId;

    // Branch managers can only create service_engineers in their branch
    if (userRole === 'branch_manager') {
      if (targetRole !== 'service_engineer') {
        return res.status(403).json({ message: 'Branch managers can only create service_engineer accounts' });
      }
      targetBranch = userBranchId; // Force to own branch
    }

    const existing = await User.findOne({ employeeId });
    if (existing) return res.status(409).json({ message: 'Employee ID already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      employeeId,
      email: email || undefined,
      passwordHash,
      grade: grade || 'IE7',
      role: targetRole,
      branch: targetBranch,
    });

    const populated = await User.findById(user._id, '-passwordHash').populate('branch', 'name code city');
    res.status(201).json({ user: populated, message: 'User created' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/users/:id — update user
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    // Branch managers can only edit users in their branch
    if (userRole === 'branch_manager') {
      if (!user.branch || user.branch.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Cannot edit users from another branch' });
      }
    }

    const allowed = ['name', 'email', 'grade', 'isActive'];
    // super_admin can also change role and branch
    if (userRole === 'super_admin') {
      allowed.push('role', 'branch');
    }
    allowed.forEach(f => {
      if (req.body[f] !== undefined) user[f] = req.body[f];
    });
    await user.save();

    const populated = await User.findById(user._id, '-passwordHash').populate('branch', 'name code city');
    res.json({ user: populated, message: 'User updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PATCH /api/users/:id/reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userRole = req.userRole;
    const userBranchId = req.userBranchId;

    // Branch managers can only reset passwords for users in their branch
    if (userRole === 'branch_manager') {
      if (!user.branch || user.branch.toString() !== userBranchId.toString()) {
        return res.status(403).json({ message: 'Cannot reset passwords for users in another branch' });
      }
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    res.json({ message: 'Password reset successfully', employeeId: user.employeeId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
