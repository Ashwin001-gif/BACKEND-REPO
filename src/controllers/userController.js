import User from '../models/User.js';
import Notification from '../models/Notification.js';
import File from '../models/File.js';
import AuditLog from '../models/AuditLog.js';
import ShareLink from '../models/ShareLink.js';

export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.username = req.body.username || user.username;
      user.email = req.body.email || user.email;
      
      // Allow initializing keys for older accounts
      if (req.body.publicKey && !user.publicKey) {
        user.publicKey = req.body.publicKey;
      }
      if (req.body.encryptedPrivateKey && !user.encryptedPrivateKey) {
        user.encryptedPrivateKey = req.body.encryptedPrivateKey;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        publicKey: updatedUser.publicKey,
        encryptedPrivateKey: updatedUser.encryptedPrivateKey,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      if (user.role === 'admin') {
        return res.status(400).json({ message: 'Cannot suspend an admin user' });
      }

      user.status = req.body.status || user.status;
      await user.save();

      // Create and emit notification to the user
      const notification = await Notification.create({
        user: user._id,
        title: 'Account Status Updated',
        message: `Your account has been ${user.status} by an administrator.`,
        type: 'ACCOUNT_ALERT'
      });
      req.io.to(user._id.toString()).emit('new_notification', notification);

      res.json({ message: `User status updated to ${user.status}` });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const files = await File.find({ user: userId });
    const totalFiles = files.length;
    const totalSizeBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    const totalStorageMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    
    const sharedCount = await ShareLink.countDocuments({ createdBy: userId });

    res.json({
      totalFiles,
      totalStorageMB,
      sharedCount,
      recentActivity: await AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(5)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Delete all files from database (Note: In a real app, you would also delete from disk/S3)
    await File.deleteMany({ user: userId });

    // 2. Delete all notifications
    await Notification.deleteMany({ user: userId });

    // 3. Delete all audit logs
    await AuditLog.deleteMany({ userId });

    // 4. Delete all share links
    await ShareLink.deleteMany({ createdBy: userId });

    // 5. Delete the user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserByEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email }).select('_id username email publicKey');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.publicKey) {
      return res.status(400).json({ message: 'User has not initialized their security keys' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
