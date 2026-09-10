const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Branch = require('../models/Branch');

// No fallback on purpose — a missing JWT_SECRET should fail loudly at boot
// (see server.js), not silently sign tokens with a well-known default.
const JWT_SECRET = process.env.JWT_SECRET;

exports.register = async (req, res) => {
  try {
    const { name, employeeId, email, password, grade, role, branch } = req.body;
    if (!name || !employeeId || !password) {
      return res.status(400).json({ message: 'name, employeeId and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ employeeId });
    if (existing) return res.status(409).json({ message: 'Employee ID already registered' });

    // Determine branch: from request, or caller's branch
    let targetBranch = branch || req.userBranchId;
    if (!targetBranch) {
      const defaultBranch = await Branch.findOne({ isActive: true });
      targetBranch = defaultBranch?._id;
    }

    // Determine role: from request, or default to service_engineer
    // Only super_admin can create roles other than service_engineer
    let targetRole = role || 'service_engineer';
    if (req.userRole !== 'super_admin' && targetRole !== 'service_engineer') {
      return res.status(403).json({ message: 'Only super_admin can create non-engineer accounts' });
    }

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

    res.status(201).json({
      message: 'User created',
      userId: user._id,
      user: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
        branch: user.branch,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
      return res.status(400).json({ message: 'employeeId and password are required' });
    }

    const user = await User.findOne({
      $or: [{ employeeId }, { email: employeeId }],
    }).populate('branch', 'name code city');
    
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isActive) return res.status(401).json({ message: 'Account is deactivated' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, role: user.role, branchId: user.branch?._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
        grade: user.grade,
        branch: user.branch,
        branchId: user.branch?._id,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
