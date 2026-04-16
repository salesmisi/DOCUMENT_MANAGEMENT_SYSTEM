import { Router } from 'express';
import { loginUser, createUser, forgotPassword } from '../controllers/user.controller';

const router = Router();

router.post('/login', loginUser);
router.post('/register', createUser);
router.post('/forgot-password', forgotPassword);

export default router;
