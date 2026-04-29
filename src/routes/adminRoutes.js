import express from 'express';
import { getAdminStats } from '../controllers/adminController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/stats').get(protect, admin, getAdminStats);

export default router;
