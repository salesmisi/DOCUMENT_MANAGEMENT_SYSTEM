import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  deleteNotificationsByType,
} from '../controllers/notification.controller';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../controllers/notificationPreferences.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getNotifications);
router.get('/unread-count', authenticate, getUnreadCount);
router.get('/preferences', authenticate, getNotificationPreferences);
router.put('/preferences', authenticate, updateNotificationPreferences);
router.put('/:id/read', authenticate, markAsRead);
router.put('/read-all', authenticate, markAllAsRead);
router.post('/', authenticate, createNotification);
router.delete('/:id', authenticate, deleteNotification);
router.delete('/type/:type', authenticate, deleteNotificationsByType);

export default router;
