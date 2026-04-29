import express from 'express';
import multer from 'multer';
import path from 'path';
import { 
  uploadFile, 
  getFiles, 
  downloadFile, 
  deleteFile,
  createShareLink,
  getSharedFileMeta,
  downloadSharedFile,
  inviteUserToFile,
  revokeUserAccess,
  getSharedWithMeFiles,
  downloadSharedWithMeFile
} from '../controllers/fileController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Multer configuration for local storage
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

router.route('/')
  .post(protect, upload.single('file'), uploadFile)
  .get(protect, getFiles);

router.get('/shared-with-me', protect, getSharedWithMeFiles);
router.get('/shared-with-me/download/:id', protect, downloadSharedWithMeFile);

router.route('/:id')
  .delete(protect, deleteFile);

router.get('/download/:id', protect, downloadFile);

// Sharing routes
router.post('/share', protect, createShareLink);
router.get('/share/:shareId', getSharedFileMeta);
router.post('/share/:shareId/download', downloadSharedFile);

// Invitation routes
router.post('/:id/invite', protect, inviteUserToFile);
router.post('/:id/revoke', protect, revokeUserAccess);

export default router;
