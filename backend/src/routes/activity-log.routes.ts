import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as activityLogController from '../controllers/activity-log.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/activity-logs - Get all activity logs (admin only, but we'll allow all authenticated users to write)
router.get('/', activityLogController.getActivityLogs);

// GET /api/activity-logs/download - Download activity logs as Excel
router.get('/download', activityLogController.downloadActivityLogs);

// GET /api/activity-logs/download-pdf - Download activity logs as PDF
router.get('/download-pdf', activityLogController.downloadActivityLogsPdf);

// GET /api/activity-logs/count - Get activity log count
router.get('/count', activityLogController.getActivityLogCount);

// POST /api/activity-logs/download-and-archive - Download logs as Excel and archive them
router.post('/download-and-archive', activityLogController.downloadAndArchiveActivityLogs);

// POST /api/activity-logs - Create a new activity log
router.post('/', activityLogController.createActivityLog);

export default router;
