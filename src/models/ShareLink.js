import mongoose from 'mongoose';

const shareLinkSchema = mongoose.Schema(
  {
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shareId: {
      type: String,
      required: true,
      unique: true, // This will be the random ID in the URL
    },
    passwordHash: {
      type: String, // Optional bcrypt hash of the password protecting the share
    },
    expiresAt: {
      type: Date, // Optional expiration date
    },
    accessCount: {
      type: Number,
      default: 0,
    }
  },
  {
    timestamps: true,
  }
);

const ShareLink = mongoose.model('ShareLink', shareLinkSchema);

export default ShareLink;
