import AuditLog from '../models/AuditLog.js';

export const logAction = async (user, username, action, details, ip) => {
  try {
    await AuditLog.create({
      user,
      username,
      action,
      details,
      ipAddress: ip || '127.0.0.1',
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
