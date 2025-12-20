const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const db = require('../db/database'); // Assuming models are attached here
const { hashPassword, verifyPassword, needsRehash } = require('../utils/password');
const rateLimit = require('express-rate-limit');

// Dummy hash for timing attack mitigation (pre-calculated)
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$fK5/5Q$dummyhashvalueforsecurity';

// Email Transporter (Configure with your SMTP details in .env)
const transporter = nodemailer.createTransport({
  service: 'gmail', // Example: use 'gmail' or configure host/port
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Rate Limiter for Login (Brute Force Protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const handleSignup = async (req, res) => {
  try {
    let { email, password, name, role, companyCode } = req.body;

    // Default role if not provided
    if (!role) role = 'employee';

    // --- Role-Based Logic ---
    if (role === 'employer') {
      // Auto-generate Company Code for employers (6 chars)
      companyCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    } else if (role === 'employee') {
      // Require Company Code for employees
      if (!companyCode) {
        throw new Error('Company Code is required for employees.');
      }
      // Verify company code exists
      const employer = await db.User.findOne({ where: { companyCode } });
      if (!employer) {
        throw new Error('Invalid Company Code.');
      }
    }

    // 1. Hash password (throws if length < 10)
    const hashedPassword = await hashPassword(password);

    // 2. Store user with hashed password
    // Assuming db.User is your Sequelize model
    const user = await db.User.create({
      email,
      password: hashedPassword,
      name,
      role,
      companyCode
    });

    res.status(201).json({
      message: 'User registered successfully',
      userId: user.id,
      role: user.role,
      companyCode: user.companyCode // Return code so employer can see it
    });
  } catch (error) {
    console.error('Signup error:', error);

    // Handle specific errors for better UX
    if (error.message.includes('Password') || error.message.includes('Company Code')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email is already registered.' });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
    }

    res.status(400).json({ error: 'Registration failed: ' + error.message });
  }
};

router.post('/signup', handleSignup);

router.post('/signup/employer', (req, res) => {
  req.body.role = 'employer';
  handleSignup(req, res);
});

router.post('/signup/employee', (req, res) => {
  req.body.role = 'employee';
  handleSignup(req, res);
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const genericError = 'Invalid email or password';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Debug: Check if User model is loaded
    if (!db || !db.User) {
      throw new Error('Database User model is missing. Check db/database.js exports.');
    }

    // 1. Find user
    const user = await db.User.findOne({ where: { email } });

    // 2. Verify password (or dummy verify to prevent timing leaks)
    if (!user) {
      await verifyPassword(DUMMY_HASH, password || 'dummy');
      return res.status(401).json({ error: genericError });
    }

    const isValid = await verifyPassword(user.password, password);
    if (!isValid) {
      return res.status(401).json({ error: genericError });
    }

    // Rehash password if parameters have changed (security best practice)
    if (needsRehash(user.password)) {
      const newHash = await hashPassword(password);
      user.password = newHash;
      await user.save();
    }

    res.json({
      message: 'Login successful',
      token: 'mock-token',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyCode: user.companyCode
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * SECURE RECOVERY: Forgot Password
 * Input: Email
 * Action: Generates token, saves to DB, sends email.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.User.findOne({ where: { email } });

    if (!user) {
      // Security: Always return success to prevent email enumeration
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate random token
    const token = crypto.randomBytes(20).toString('hex');
    
    // Set token and expiry (1 hour) on user model
    // NOTE: Ensure 'resetPasswordToken' and 'resetPasswordExpires' columns exist in your User model
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; 
    await user.save();

    // Send Email
    const resetUrl = `${req.protocol}://${req.headers.host}/reset-password?token=${token}`;
    await transporter.sendMail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
            `Please use the following token to reset your password: ${token}\n\n` +
            `Or click: ${resetUrl}\n\n` +
            `If you did not request this, please ignore this email.\n`
    });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * SECURE RECOVERY: Reset Password
 * Input: Token + New Password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find user with valid token and unexpired time
    const user = await db.User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: Date.now() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
    }

    // Hash new password and clear tokens
    user.password = await hashPassword(newPassword);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/employees?companyCode=XYZ
// Fetches list of employees for the employer dashboard
router.get('/employees', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ error: 'Company code is required' });
    }

    const employees = await db.User.findAll({
      where: { 
        companyCode, 
        [Op.or]: [{ role: 'employee' }, { role: null }] // Include employees and legacy users
      },
      attributes: ['id', 'name', 'email', 'createdAt'],
      order: [['id', 'DESC']]
    });

    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees: ' + error.message });
  }
});

module.exports = router;