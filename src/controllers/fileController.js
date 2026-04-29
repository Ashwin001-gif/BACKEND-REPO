import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import File from '../models/File.js';
import ShareLink from '../models/ShareLink.js';
import { logAction } from '../utils/logger.js';

// @desc    Upload file
// @route   POST /api/files/upload
// @access  Private
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { originalName, encryptedKey, fileIV, keyIV, size, mimetype } = req.body;

    const file = await File.create({
      user: req.user._id,
      originalName,
      mimetype,
      size: Number(size),
      filePath: req.file.path,
      encryptedKey,
      fileIV,
      keyIV,
    });

    await logAction(req.user._id, req.user.username, 'FILE_UPLOAD', `Uploaded ${originalName}`, req.ip);
    res.status(201).json(file);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user files
// @route   GET /api/files
// @access  Private
export const getFiles = async (req, res) => {
  try {
    const files = await File.find({ user: req.user._id })
      .populate('accessList.user', 'username email')
      .sort({ createdAt: -1 });
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download file
// @route   GET /api/files/download/:id
// @access  Private
export const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to access this file' });
    }

    const resolvedPath = path.resolve(file.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File no longer exists on the server (the file might have been deleted from disk storage).' });
    }

    await logAction(req.user._id, req.user.username, 'FILE_DOWNLOAD', `Downloaded ${file.originalName}`, req.ip);
    res.download(resolvedPath, file.originalName, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error downloading file' });
        }
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};

// @desc    Delete file
// @route   DELETE /api/files/:id
// @access  Private
export const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this file' });
    }

    // Delete from disk
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    await file.deleteOne();
    await logAction(req.user._id, req.user.username, 'FILE_DELETE', `Deleted ${file.originalName}`, req.ip);
    res.json({ message: 'File removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create share link
// @route   POST /api/files/share
// @access  Private
export const createShareLink = async (req, res) => {
  try {
    const { fileId, password } = req.body;
    const file = await File.findById(fileId);

    if (!file || file.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'File not found or unauthorized' });
    }

    const shareId = crypto.randomBytes(16).toString('hex');
    let passwordHash = null;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    await ShareLink.create({
      file: fileId,
      createdBy: req.user._id,
      shareId,
      passwordHash,
    });

    await logAction(req.user._id, req.user.username, 'FILE_SHARE', `Created share link for ${file.originalName}`, req.ip);
    res.status(201).json({ shareId, requiresPassword: !!password });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get shared file metadata
// @route   GET /api/files/share/:shareId
// @access  Public
export const getSharedFileMeta = async (req, res) => {
  try {
    const { shareId } = req.params;
    const shareLink = await ShareLink.findOne({ shareId }).populate('file', 'originalName mimetype size fileIV');

    if (!shareLink) {
      return res.status(404).json({ message: 'Share link not found or expired' });
    }

    res.json({
      fileId: shareLink.file._id,
      originalName: shareLink.file.originalName,
      mimetype: shareLink.file.mimetype,
      size: shareLink.file.size,
      fileIV: shareLink.file.fileIV,
      requiresPassword: !!shareLink.passwordHash,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download shared file
// @route   POST /api/files/share/:shareId/download
// @access  Public
export const downloadSharedFile = async (req, res) => {
  try {
    const { shareId } = req.params;
    const { password } = req.body;

    const shareLink = await ShareLink.findOne({ shareId }).populate('file');

    if (!shareLink) {
      return res.status(404).json({ message: 'Share link not found or expired' });
    }

    // Check password if required
    if (shareLink.passwordHash) {
      const isMatch = await bcrypt.compare(password || '', shareLink.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    shareLink.accessCount += 1;
    await shareLink.save();

    await logAction(null, 'Anonymous', 'SHARE_ACCESSED', `Accessed shared file ${shareLink.file.originalName}`, req.ip);

    // Add notification for the owner
    try {
      const Notification = (await import('../models/Notification.js')).default;
      const notification = await Notification.create({
        user: shareLink.file.user,
        title: 'File Accessed',
        message: `Your shared file "${shareLink.file.originalName}" was just downloaded!`,
        type: 'FILE_SHARED',
      });
      
      // Emit socket event if user is online
      req.io.to(shareLink.file.user.toString()).emit('new_notification', notification);
    } catch (err) {
      console.error('Failed to send notification:', err);
    }

    const resolvedPath = path.resolve(shareLink.file.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File no longer exists on the server (the file might have been deleted from disk storage).' });
    }

    res.download(resolvedPath, shareLink.file.originalName, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error downloading file' });
        }
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};

// @desc    Invite user to file
// @route   POST /api/files/:id/invite
// @access  Private
export const inviteUserToFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, encryptedKeyForUser, permissions } = req.body;

    const file = await File.findById(id);

    if (!file || file.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'File not found or unauthorized' });
    }

    // Add to access list
    const existingIndex = file.accessList.findIndex(a => a.user.toString() === userId);
    
    if (existingIndex >= 0) {
      file.accessList[existingIndex].permissions = { ...file.accessList[existingIndex].permissions, ...permissions };
      file.accessList[existingIndex].encryptedKeyForUser = encryptedKeyForUser;
    } else {
      file.accessList.push({
        user: userId,
        encryptedKeyForUser,
        permissions: permissions || { view: true, download: true }
      });
    }

    await file.save();
    await logAction(req.user._id, req.user.username, 'FILE_INVITE', `Invited user to ${file.originalName}`, req.ip);

    // Notify the invited user
    try {
      const Notification = (await import('../models/Notification.js')).default;
      const notification = await Notification.create({
        user: userId,
        title: 'New File Shared',
        message: `${req.user.username} shared "${file.originalName}" with you.`,
        type: 'FILE_SHARED',
      });
      
      req.io.to(userId.toString()).emit('new_notification', notification);
    } catch (err) {
      console.error('Failed to send notification:', err);
    }

    res.json({ message: 'User invited successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Revoke user access
// @route   POST /api/files/:id/revoke
// @access  Private
export const revokeUserAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const file = await File.findById(id);

    if (!file || file.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'File not found or unauthorized' });
    }

    file.accessList = file.accessList.filter(a => a.user.toString() !== userId);
    await file.save();

    await logAction(req.user._id, req.user.username, 'FILE_REVOKE', `Revoked access for user from ${file.originalName}`, req.ip);
    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get files shared with me
// @route   GET /api/files/shared-with-me
// @access  Private
export const getSharedWithMeFiles = async (req, res) => {
  try {
    const files = await File.find({
      'accessList.user': req.user._id
    }).populate('user', 'username email').sort({ createdAt: -1 });

    // Filter the accessList in the result to only show the current user's access info
    const sanitizedFiles = files.map(file => {
      const fObj = file.toObject();
      fObj.accessList = fObj.accessList.filter(a => a.user.toString() === req.user._id.toString());
      return fObj;
    });

    res.json(sanitizedFiles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download shared-with-me file
// @route   GET /api/files/shared-with-me/download/:id
// @access  Private
export const downloadSharedWithMeFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user has access
    const access = file.accessList.find(a => a.user.toString() === req.user._id.toString());
    
    if (!access) {
      return res.status(401).json({ message: 'Not authorized to access this file' });
    }

    if (!access.permissions.download) {
      return res.status(403).json({ message: 'You do not have permission to download this file' });
    }

    await logAction(req.user._id, req.user.username, 'FILE_DOWNLOAD_SHARED', `Downloaded shared file ${file.originalName}`, req.ip);
    
    const resolvedPath = path.resolve(file.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File no longer exists on the server (the file might have been deleted from disk storage).' });
    }

    res.download(resolvedPath, file.originalName, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error downloading file' });
        }
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};
