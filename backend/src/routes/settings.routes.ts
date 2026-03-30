import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getLogo, uploadLogo, resetLogo, updateLogoSize } from '../controllers/settings.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Ensure logos directory exists
const logosDir = path.join(process.cwd(), 'uploads', 'logos');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, GIF, SVG, and WebP are allowed.'));
    }
  },
});

// Public route - get logo (no auth required)
router.get('/logo', getLogo);

// Protected routes - admin only
router.post('/logo', authenticate, requireRole(['admin']), upload.single('logo'), uploadLogo);
router.post('/logo/reset', authenticate, requireRole(['admin']), resetLogo);
router.post('/logo/size', authenticate, requireRole(['admin']), updateLogoSize);

export default router;
