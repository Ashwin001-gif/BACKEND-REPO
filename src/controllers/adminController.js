import User from '../models/User.js';
import File from '../models/File.js';
import AuditLog from '../models/AuditLog.js';

export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalFiles = await File.countDocuments();
    
    // Calculate total storage
    const files = await File.find({}, 'size');
    const totalStorageBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(2);

    const recentLogs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'username email');

    res.json({
      totalUsers,
      totalFiles,
      totalStorageMB,
      recentLogs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
