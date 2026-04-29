import express from 'express';
import { protect, admin } from '../middlewares/authMiddleware.js';
import { updateUserStatus, updateUserProfile, getUserStats, getUserLogs, getUsers, deleteUserProfile, getUserByEmail } from '../controllers/userController.js';

const router = express.Router();

router.route('/').get(protect, admin, getUsers);
router.route('/lookup').post(protect, getUserByEmail);
router.route('/profile')
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);
router.route('/stats').get(protect, getUserStats);
router.route('/logs').get(protect, getUserLogs);
router.route('/:id/status').put(protect, admin, updateUserStatus);

export default router;
