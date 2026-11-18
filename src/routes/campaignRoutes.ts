import express from 'express';
import { 
  getCampaigns, 
  getCampaignById, 
  createCampaign, 
  updateCampaign, 
  deleteCampaign,
  checkInAttendee,
  appendRecipients,
  resetCheckIn // <-- Import
} from '../controllers/campaignController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getCampaigns)
  .post(protect, createCampaign);

// Check-in Routes
router.route('/:id/checkin')
  .post(protect, checkInAttendee);

router.route('/:id/reset-checkin')
  .post(protect, resetCheckIn); // <-- Add reset route

// Append Recipients Route
router.route('/:id/recipients')
  .post(protect, appendRecipients);

router.route('/:id')
  .get(protect, getCampaignById)
  .put(protect, updateCampaign)
  .delete(protect, deleteCampaign);

export default router;