import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { logAction } from '../utils/logger.js';
import sendEmail from '../utils/sendEmail.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};

export const registerUser = async (req, res) => {
  const { username, email, password, role, publicKey, encryptedPrivateKey } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      username,
      email,
      password,
      role: role || 'user',
      publicKey,
      encryptedPrivateKey,
    });

    if (user) {
      await logAction(user._id, user.username, 'USER_REGISTER', `Registered with email ${email}`, req.ip);
      
      // Send Welcome Email
      try {
        await sendEmail({
          email: user.email,
          subject: 'Welcome to ZK Vault - Account Created',
          message: `
            <h2>Welcome aboard, ${user.username}!</h2>
            <p>Your account has been successfully created. You can now securely store and share your sensitive files with zero-knowledge encryption.</p>
            <p>Get started by exploring your dashboard and setting up your security preferences.</p>
            <a href="${process.env.CLIENT_URL}/login" class="btn">Go to Dashboard</a>
            <div class="security-notice">
              <strong>Security Tip:</strong> Never share your master password or recovery keys with anyone. Our team will never ask for them.
            </div>
          `
        });
      } catch (err) {
        console.error('Email could not be sent', err);
      }

      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const authUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      await logAction(user._id, user.username, 'USER_LOGIN', 'User logged in successfully', req.ip);
      
      // Send Login Notification Email
      try {
        await sendEmail({
          email: user.email,
          subject: 'Security Alert: New Login to ZK Vault',
          message: `
            <h2>New Login Detected</h2>
            <p>Hello ${user.username},</p>
            <p>This is a security notification to inform you that your account was recently accessed from a new session.</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>IP Address:</strong> ${req.ip}</p>
            <p>If this was you, you can safely ignore this email. If you did not authorize this login, please reset your password immediately.</p>
            <a href="${process.env.CLIENT_URL}/forgot" class="btn" style="background: #ef4444;">Secure My Account</a>
          `
        });
      } catch (err) {
        console.error('Email could not be sent', err);
      }

      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        token: generateToken(user._id),
      });
    } else {
      if (user) await logAction(user._id, user.username, 'USER_LOGIN', 'Failed login attempt', req.ip);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists for security, but in this case we'll just return 404
      return res.status(404).json({ message: 'There is no user with that email' });
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expire (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // Create reset url
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    const message = `
      <h2>Password Reset Request</h2>
      <p>You are receiving this email because you (or someone else) has requested a password reset for your ZK Vault account.</p>
      <p>Please click the button below to complete the process. This link will expire in 10 minutes.</p>
      <a href="${resetUrl}" class="btn">Reset My Password</a>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <div class="security-notice">
        <strong>Important:</strong> If you did not initiate this request, your account might be under target. We recommend reviewing your security settings.
      </div>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        message,
      });

      res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
      console.log(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  try {
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    await logAction(user._id, user.username, 'USER_PASSWORD_RESET', 'Password reset successful', req.ip);

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

