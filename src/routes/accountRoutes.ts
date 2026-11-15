import express from 'express';
import { 
  getAuthUrl, 
  handleCallback, 
  getAccounts, 
  updateAccount, 
  deleteAccount 
} from '../controllers/accountController';
// Add this import
import { sendTestEmail } from '../controllers/emailTestController'; 
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

// OAuth Routes
router.get('/auth-url', protect, getAuthUrl);
router.get('/callback', handleCallback);

// CRUD Routes
router.route('/')
  .get(protect, getAccounts);

router.route('/:id')
  .put(protect, updateAccount)
  .delete(protect, deleteAccount);

// Test Email Route
router.post('/test-send', protect, sendTestEmail); // <-- Add this

export default router;