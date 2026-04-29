import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getNotifications, markNotificationRead, markAllRead } from '../controllers/notificationController.js';

const router = express.Router();

router.route('/').get(protect, getNotifications);
router.route('/read-all').put(protect, markAllRead);
router.route('/:id/read').put(protect, markNotificationRead);

export default router;
