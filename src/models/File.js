import mongoose from 'mongoose';

const fileSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    originalName: {
      type: String,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    filePath: {
      type: String,
      required: false,
    },
    fileUrl: {
      type: String, // Cloudinary URL for cloud-stored files
      required: false,
    },
    cloudinaryPublicId: {
      type: String, // Cloudinary public_id for deletion
      required: false,
    },
    encryptedKey: {
      type: String, // The AES-GCM key used to encrypt the file, encrypted with the user's master key
      required: true,
    },
    fileIV: {
      type: String, // Initialization Vector used for encrypting the file
      required: true,
    },
    keyIV: {
      type: String, // Initialization Vector used for encrypting the file key
      required: true,
    },
    accessList: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        encryptedKeyForUser: { type: String, required: true },
        permissions: {
          view: { type: Boolean, default: true },
          download: { type: Boolean, default: true },
          edit: { type: Boolean, default: false },
          reshare: { type: Boolean, default: false },
          watermark: { type: Boolean, default: false },
        },
        expiresAt: { type: Date }
      }
    ]
  },
  {
    timestamps: true,
  }
);

const File = mongoose.model('File', fileSchema);

export default File;
