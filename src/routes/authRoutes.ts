import express from 'express';
import { login, signup, getProfile } from '../controllers/authController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.post('/login', login);
router.post('/signup', signup);
router.get('/profile', protect, getProfile);

export default router;