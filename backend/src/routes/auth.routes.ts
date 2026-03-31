import { Router } from 'express';
import { loginUser, createUser } from '../controllers/user.controller';

const router = Router();

router.post('/login', loginUser);
router.post('/register', createUser);

export default router;
