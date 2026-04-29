import mongoose from 'mongoose';

const fileDataSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const FileData = mongoose.model('FileData', fileDataSchema);

export default FileData;
