import multer from 'multer';

// Use memory storage so we can stream directly to MinIO
const storage = multer.memoryStorage();

export const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});