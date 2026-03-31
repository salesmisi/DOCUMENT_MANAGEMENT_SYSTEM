import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import cleanupService from '../services/cleanup.service';

const router = express.Router();

// Get scheduled deletions (preview)
import { AuthRequest } from '../middleware/auth.middleware';

router.get('/scheduled', authenticate, async (req: AuthRequest, res: express.Response) => {
  try {
    const scheduled = await cleanupService.getScheduledDeletions();
    res.json(scheduled);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduled deletions' });
  }
});

// Manually trigger cleanup (admin only)
router.post('/run', authenticate, async (req: AuthRequest, res: express.Response) => {
  try {
    // Check if user is admin (you may need to add this check based on your auth system)
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can manually trigger cleanup' });
    }

    const result = await cleanupService.performCleanup();
    res.json({ message: 'Cleanup completed', ...result });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

export default router;
