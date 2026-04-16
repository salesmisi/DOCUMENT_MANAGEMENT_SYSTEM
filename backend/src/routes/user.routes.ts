import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  changePassword,
  regenerateRecoveryKey,
  uploadAvatar,
  restoreUser,
  permanentlyDeleteUser,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

// Ensure avatars directory exists
const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.get('/', authenticate, getUsers);
router.get('/:id', authenticate, getUserById);
router.post('/', authenticate, createUser);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, deleteUser);
router.put('/:id/reset-password', authenticate, resetPassword);
router.put('/:id/change-password', authenticate, changePassword);
router.put('/:id/recovery-key/regenerate', authenticate, regenerateRecoveryKey);
router.post('/:id/avatar', authenticate, avatarUpload.single('avatar'), uploadAvatar);
router.patch('/:id/restore', authenticate, restoreUser);
router.delete('/:id/permanent', authenticate, permanentlyDeleteUser);

export default router;
