import mongoose from 'mongoose';

const auditLogSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Sometimes actions are by anonymous users (e.g. failed logins)
    },
    username: {
      type: String, // Useful to have string name if user is deleted
    },
    action: {
      type: String,
      required: true,
      enum: ['USER_REGISTER', 'USER_LOGIN', 'FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE', 'FILE_SHARE', 'SHARE_ACCESSED'],
    },
    details: {
      type: String,
    },
    ipAddress: {
      type: String,
    }
  },
  {
    timestamps: true,
  }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
