import express from 'express';
import { getDesigns, getDesignById, createDesign, updateDesign, deleteDesign } from '../controllers/designController';
import { upload } from '../middlewares/uploadMiddleware';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getDesigns)
  .post(protect, upload.single('image'), createDesign);

router.route('/:id')
  .get(protect, getDesignById)
  .put(protect, updateDesign)
  .delete(protect, deleteDesign);

export default router;