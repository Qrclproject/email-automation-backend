import express from 'express';
import { 
  getCampaigns, 
  getCampaignById, 
  createCampaign, 
  updateCampaign, 
  deleteCampaign,
  checkInAttendee
} from '../controllers/campaignController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getCampaigns)
  .post(protect, createCampaign);

// Check-in Route
router.route('/:id/checkin')
  .post(protect, checkInAttendee);

router.route('/:id')
  .get(protect, getCampaignById)
  .put(protect, updateCampaign)
  .delete(protect, deleteCampaign);

export default router;