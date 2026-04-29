import express from 'express';
import multer from 'multer';
import { uploadFile, getFiles, downloadFile, deleteFile, createShareLink, getSharedFileMeta, downloadSharedFile, inviteUserToFile, revokeUserAccess, getSharedWithMeFiles, downloadSharedWithMeFile } from '../controllers/fileController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Use memory storage — files go to Cloudinary, not local disk
const upload = multer({ storage: multer.memoryStorage() });

// Routes
router.route('/')
  .post(protect, upload.single('file'), uploadFile)
  .get(protect, getFiles);

router.route('/shared-with-me')
  .get(protect, getSharedWithMeFiles);

router.route('/:id/download')
  .get(protect, downloadFile);

router.route('/:id/download-shared')
  .get(protect, downloadSharedWithMeFile);

router.route('/share')
  .post(protect, createShareLink);

router.route('/share/:shareId')
  .get(getSharedFileMeta)
  .post(downloadSharedFile);

router.route('/:id/invite')
  .post(protect, inviteUserToFile);

router.route('/:id/revoke')
  .post(protect, revokeUserAccess);

router.route('/:id')
  .delete(protect, deleteFile);

export default router;
