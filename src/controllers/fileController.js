import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Readable } from 'stream';
import File from '../models/File.js';
import ShareLink from '../models/ShareLink.js';
import cloudinary from '../config/cloudinary.js';
import { logAction } from '../utils/logger.js';

// ─── Helper: upload buffer to Cloudinary ────────────────────────────────────
const uploadToCloudinary = (buffer, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'zk-vault',
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
};

// ─── Helper: stream file to response (from Cloudinary URL or local disk) ────
const streamFileToResponse = async (file, res) => {
  if (file.fileUrl) {
    // Cloudinary-stored file: fetch and pipe
    const cloudRes = await fetch(file.fileUrl);
    if (!cloudRes.ok) {
      res.status(404).json({ message: 'File not found on cloud storage.' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    // Node 18+ ReadableStream → pipe
    const reader = cloudRes.body.getReader();
    const nodeStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) this.push(null);
        else this.push(Buffer.from(value));
      }
    });
    nodeStream.pipe(res);
  } else {
    // Legacy: local disk
    const resolvedPath = path.resolve(file.filePath);
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({
        message: 'File no longer exists on the server. This is a legacy file stored on ephemeral disk storage — please re-upload it.',
      });
      return;
    }
    res.download(resolvedPath, file.originalName, (err) => {
      if (err && !res.headersSent) res.status(500).json({ message: 'Error downloading file' });
    });
  }
};

// ─── Upload ──────────────────────────────────────────────────────────────────
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { originalName, encryptedKey, fileIV, keyIV, size, mimetype } = req.body;

    // Upload encrypted buffer to Cloudinary
    const publicId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const uploadResult = await uploadToCloudinary(req.file.buffer, publicId);

    const file = await File.create({
      user: req.user._id,
      originalName,
      mimetype,
      size: Number(size),
      filePath: uploadResult.secure_url, // store URL here for backward compat
      fileUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      encryptedKey,
      fileIV,
      keyIV,
    });

    await logAction(req.user._id, req.user.username, 'FILE_UPLOAD', `Uploaded ${originalName}`, req.ip);
    res.status(201).json(file);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─── Get All Files ───────────────────────────────────────────────────────────
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

// ─── Download (owner) ────────────────────────────────────────────────────────
export const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to access this file' });
    }

    await logAction(req.user._id, req.user.username, 'FILE_DOWNLOAD', `Downloaded ${file.originalName}`, req.ip);
    await streamFileToResponse(file, res);
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message });
  }
};

// ─── Delete ──────────────────────────────────────────────────────────────────
export const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to delete this file' });
    }

    // Delete from Cloudinary or local disk
    if (file.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(file.cloudinaryPublicId, { resource_type: 'raw' });
      } catch (cloudErr) {
        console.error('Cloudinary delete error:', cloudErr.message);
      }
    } else if (file.filePath && fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    await file.deleteOne();
    await logAction(req.user._id, req.user.username, 'FILE_DELETE', `Deleted ${file.originalName}`, req.ip);
    res.json({ message: 'File removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Create Share Link ───────────────────────────────────────────────────────
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

// ─── Get Shared File Meta (public) ──────────────────────────────────────────
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

// ─── Download Shared File (public) ──────────────────────────────────────────
export const downloadSharedFile = async (req, res) => {
  try {
    const { shareId } = req.params;
    const { password } = req.body;

    const shareLink = await ShareLink.findOne({ shareId }).populate('file');

    if (!shareLink) {
      return res.status(404).json({ message: 'Share link not found or expired' });
    }

    if (shareLink.passwordHash) {
      const isMatch = await bcrypt.compare(password || '', shareLink.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    shareLink.accessCount += 1;
    await shareLink.save();

    await logAction(null, 'Anonymous', 'SHARE_ACCESSED', `Accessed shared file ${shareLink.file.originalName}`, req.ip);

    // Notify file owner
    try {
      const Notification = (await import('../models/Notification.js')).default;
      const notification = await Notification.create({
        user: shareLink.file.user,
        title: 'File Accessed',
        message: `Your shared file "${shareLink.file.originalName}" was just downloaded!`,
        type: 'FILE_SHARED',
      });
      req.io.to(shareLink.file.user.toString()).emit('new_notification', notification);
    } catch (err) {
      console.error('Failed to send notification', err);
    }

    await streamFileToResponse(shareLink.file, res);
  } catch (error) {
    console.error('Download shared error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message });
  }
};

// ─── Invite User ─────────────────────────────────────────────────────────────
export const inviteUserToFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, encryptedKeyForUser, permissions } = req.body;

    const file = await File.findById(id);

    if (!file || file.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'File not found or unauthorized' });
    }

    const existingIndex = file.accessList.findIndex(a => a.user.toString() === userId);

    if (existingIndex >= 0) {
      file.accessList[existingIndex].permissions = { ...file.accessList[existingIndex].permissions, ...permissions };
      file.accessList[existingIndex].encryptedKeyForUser = encryptedKeyForUser;
    } else {
      file.accessList.push({
        user: userId,
        encryptedKeyForUser,
        permissions: permissions || { view: true, download: true },
      });
    }

    await file.save();
    await logAction(req.user._id, req.user.username, 'FILE_INVITE', `Invited user to ${file.originalName}`, req.ip);

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
      console.error('Failed to send notification', err);
    }

    res.json({ message: 'User invited successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Revoke User Access ──────────────────────────────────────────────────────
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

    await logAction(req.user._id, req.user.username, 'FILE_REVOKE', `Revoked access to ${file.originalName}`, req.ip);
    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get Files Shared With Me ────────────────────────────────────────────────
export const getSharedWithMeFiles = async (req, res) => {
  try {
    const files = await File.find({ 'accessList.user': req.user._id })
      .populate('user', 'username email')
      .sort({ createdAt: -1 });

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

// ─── Download Shared-With-Me File ───────────────────────────────────────────
export const downloadSharedWithMeFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const access = file.accessList.find(a => a.user.toString() === req.user._id.toString());

    if (!access) {
      return res.status(401).json({ message: 'Not authorized to access this file' });
    }

    if (!access.permissions.download) {
      return res.status(403).json({ message: 'You do not have permission to download this file' });
    }

    await logAction(req.user._id, req.user.username, 'FILE_DOWNLOAD_SHARED', `Downloaded shared file ${file.originalName}`, req.ip);
    await streamFileToResponse(file, res);
  } catch (error) {
    console.error('Download shared-with-me error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message });
  }
};
