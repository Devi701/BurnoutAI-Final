const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const db = require('../config/database'); // Assuming models are attached here
const { hashPassword, verifyPassword, needsRehash } = require('../utils/password');
const rateLimit = require('express-rate-limit');
const GamificationService = require('../services/gamificationService');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/authMiddleware');

// PostHog Backend Initialization
let posthog = null;
try {
  const PostHog = require('posthog-node').PostHog;
  if (process.env.POSTHOG_KEY) {
    posthog = new PostHog(process.env.POSTHOG_KEY, { host: 'https://eu.posthog.com' });
    console.log('✅ PostHog backend SDK initialized.');
  } else {
    console.log('⚠️ PostHog backend SDK not initialized (POSTHOG_KEY missing).');
  }
} catch (e) { console.error('PostHog not configured or installed on backend:', e.message); }

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
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

async function resolveCompanyCode(role, companyCode) {
  if (role === 'employer') {
    if (companyCode) {
      const existing = await db.User.findOne({ where: { companyCode: companyCode.toUpperCase() } });
      if (!existing) throw new Error('Invalid Company Code.');
      return companyCode.toUpperCase();
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  } 
  if (role === 'employee' && companyCode) {
    const code = companyCode.toUpperCase();
    const employer = await db.User.findOne({ where: { companyCode: code } });
    if (!employer) throw new Error('Invalid Company Code.');
    return code;
  }
  return companyCode ? companyCode.toUpperCase() : null;
}

const handleSignup = async (req, res) => {
  try {
    let { email, password, name, role, companyCode, referralCode } = req.body;


    // Normalize email to lowercase to avoid case-sensitivity issues
    if (email) email = email.toLowerCase();

    // Default role if not provided
    if (!role) role = 'employee';

    // --- Role-Based Logic ---
    companyCode = await resolveCompanyCode(role, companyCode);

    // 1. Hash password (throws if length < 10)
    const hashedPassword = await hashPassword(password);

    // 2. Store user with hashed password
    // Assuming db.User is my Sequelize model
    const user = await db.User.create({
      email,
      password: hashedPassword,
      name,
      role,
      companyCode
    });

    // --- Gamification: Initialize & Handle Referral ---
    await GamificationService.initProfile(user.id);
    
    if (referralCode) {
      // Process the referral reward for both parties
      await GamificationService.processReferral(referralCode, user.id);
    }

    // Track Signup Event
    if (posthog) {
      posthog.capture({
        distinctId: String(user.id),
        event: 'user_signed_up',
        properties: {
          role: user.role,
          company_id: user.companyCode,
          signup_source: 'web_app'
        }
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyCode: user.companyCode
      }
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
      return res.status(400).json({ error: error.errors?.map(e => e.message)?.join(', ') });
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
    let { email, password } = req.body;
    const genericError = 'Invalid email or password';

    if (email) email = email.toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // 1. Find user
    const user = await db.User.findOne({
      where: { email },
      attributes: ['id', 'name', 'email', 'role', 'companyCode', 'password']
    });

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

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      token,
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
    
    try {
      await transporter.sendMail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
              `Please use the following token to reset your password: ${token}\n\n` +
              `Or click: ${resetUrl}\n\n` +
              `If you did not request this, please ignore this email.\n`
      });
    } catch (error_) {
      console.error('Email send failed (expected in dev without SMTP):', error_.message);
      // Log for development/testing purposes so you can still reset password
      console.log('---------------------------------------------------');
      console.log(`[DEV] Password Reset Link for ${user.email}:`);
      console.log(resetUrl);
      console.log('---------------------------------------------------');
    }

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

    // Ensure consistent casing for query
    const code = companyCode.toUpperCase().trim();

    // Use Sequelize Model instead of raw query to avoid table name casing issues ("Users" vs users)
    const employees = await db.User.findAll({
      where: {
        companyCode: code,
        [Op.or]: [{ role: 'employee' }, { role: null }]
      },
      attributes: ['id', 'name', 'email', 'createdAt', 'teamId'],
      order: [['id', 'DESC']]
    });

    console.log(`[API] /employees: Found ${employees.length} records for company ${companyCode}`);
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees: ' + error.message });
  }
});

// POST /api/auth/join-company
// Allows an existing user (employee) to join a company by code
router.post('/join-company', async (req, res) => {
  try {
    console.log('Hit join-company route:', req.body); // Debug: Confirm request received
    let { userId, companyCode } = req.body;

    if (!userId || !companyCode) {
      return res.status(400).json({ error: 'User ID and Company Code are required.' });
    }

    companyCode = companyCode.toUpperCase();

    if (!db || !db.User) {
      throw new Error('Database User model is not initialized.');
    }

    // Verify company code exists
    const employer = await db.User.findOne({ where: { companyCode } });
    if (!employer) {
      return res.status(400).json({ error: 'Invalid Company Code.' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.companyCode = companyCode;
    await user.save();

    res.json({ message: 'Successfully joined company.', companyCode });
  } catch (error) {
    console.error('Join company error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/leave-company
// Allows an employee to leave their current company
router.post('/leave-company', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.companyCode = null;
    await user.save();

    res.json({ message: 'Successfully left company.' });
  } catch (error) {
    console.error('Leave company error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/profile
// Updates user profile information
router.put('/profile', async (req, res) => {
  try {
    const { userId, name, email, industry } = req.body;
    
    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (industry) user.industry = industry;
    // Note: For MVP, settings/preferences would be saved here if the model supported it.
    
    await user.save();
    
    // Return updated user object
    res.json({ 
      message: 'Profile updated successfully', 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        industry: user.industry,
        companyCode: user.companyCode
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/regenerate-code
// Regenerates company code for employers
router.post('/regenerate-code', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await db.User.findByPk(userId);
    
    if (!user || user.role !== 'employer') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    user.companyCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    await user.save();

    res.json({ companyCode: user.companyCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/me
// Permanently deletes a user account (Right to Erasure)
router.delete('/me', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete related data to ensure clean removal
    await db.Checkin.destroy({ where: { userId } });
    if (db.QuizResult) await db.QuizResult.destroy({ where: { userId } });
    if (db.sequelize.models.ActionPlan) await db.sequelize.models.ActionPlan.destroy({ where: { userId } });
    if (db.sequelize.models.ActionPlanTracking) await db.sequelize.models.ActionPlanTracking.destroy({ where: { userId } });
    if (db.sequelize.models.PilotSurvey) await db.sequelize.models.PilotSurvey.destroy({ where: { userId } });

    // Delete user
    await user.destroy();

    if (posthog) posthog.capture({ distinctId: String(userId), event: 'account_deleted' });
    res.json({ message: 'Account deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/magic-link
// One-click login for Pilot Users
router.get('/magic-link', async (req, res) => {
  try {
    const { key } = req.query;
    // Simple security check
    if (key !== 'burnout_pilot_2026') {
      return res.status(403).send('Invalid magic link key.');
    }

    const email = 'testcompany@gmail.com';
    const companyCode = '10B196';
    const password = 'Pilot2026!';

    let user = await db.User.findOne({ where: { email } });

    if (!user) {
      // Create the pilot user if missing
      const hashedPassword = await hashPassword(password);
      user = await db.User.create({
        name: 'Pilot Employer',
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'employer',
        companyCode: companyCode
      });
    }

    if (!process.env.JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET is missing in env! Using fallback. This may cause verification errors.');
    }

    // Generate a long-lived token (30 days) for the pilot
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    // Redirect to frontend login page with token
    let frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
    
    // Force custom domain in production to ensure magic link stays on brand
    if (process.env.NODE_ENV === 'production') {
      frontendUrl = 'https://www.razoncomfort.com';
    }

    // Ensure protocol and no trailing slash
    if (!frontendUrl.startsWith('http')) frontendUrl = `https://${frontendUrl}`;
    if (frontendUrl.endsWith('/')) frontendUrl = frontendUrl.slice(0, -1);

    console.log(`[Magic Link] Generated token for ${email}`);
    console.log(`[Magic Link] Redirecting to: ${frontendUrl}/login`);
    res.redirect(`${frontendUrl}/login?token=${encodeURIComponent(token)}`);

  } catch (error) {
    console.error('Magic link error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// POST /api/auth/pilot-feedback
// Sends pilot enrollment feedback to admin email
router.post('/pilot-feedback', async (req, res) => {
  try {
    const { userId, companyCode, response, feedback } = req.body;
    
    // Attempt to find user email for context, fallback if not found
    let userEmail = 'Unknown';
    if (userId) {
      const u = await db.User.findByPk(userId);
      if (u) userEmail = u.email;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'maheshwariv919@gmail.com', // Admin email
      subject: `Pilot Feedback: ${response} - ${companyCode || 'No Company'}`,
      text: `User: ${userEmail} (ID: ${userId})\nCompany: ${companyCode}\nResponse: ${response}\nFeedback: ${feedback || 'None'}`
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Feedback email error:', error);
    // Don't block the UI if email fails, just log it
    res.json({ success: false, error: error.message });
  }
});

// GET /api/auth/me
// Returns the currently authenticated user's details
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'role', 'companyCode', 'industry']
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
