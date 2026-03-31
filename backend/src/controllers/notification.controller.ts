import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';

// ── GET notifications for the logged-in user ─────────────
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT id, user_id, type, title, message, document_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    const notifications = result.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      documentId: r.document_id,
      isRead: r.is_read,
      createdAt: r.created_at,
    }));

    return res.json(notifications);
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET unread count ──────────────────────────────────────
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return res.json({ count: parseInt(result.rows[0]?.count || '0', 10) });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── MARK a single notification as read ────────────────────
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [id, userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Notification not found' });

    return res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('markAsRead error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── MARK ALL notifications as read ────────────────────────
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return res.json({ message: 'All marked as read' });
  } catch (err) {
    console.error('markAllAsRead error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE a single notification ────────────────────────────
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Notification not found' });

    return res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('deleteNotification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE notifications by type ────────────────────────────
export const deleteNotificationsByType = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const userId = req.userId;

    await pool.query(
      `DELETE FROM notifications WHERE user_id = $1 AND type = $2`,
      [userId, type]
    );

    return res.json({ message: 'Notifications deleted' });
  } catch (err) {
    console.error('deleteNotificationsByType error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE a notification (called internally or via API) ──
export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, type, title, message, documentId } = req.body;

    if (!userId || !title || !message)
      return res.status(400).json({ error: 'userId, title, and message are required' });

    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, document_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, type, title, message, document_id, is_read, created_at`,
      [userId, type || 'approval', title, message, documentId || null]
    );

    const r = result.rows[0];
    return res.status(201).json({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      documentId: r.document_id,
      isRead: r.is_read,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('createNotification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── Helper: create notification for all approvers ─────────
// Call this from document upload / submit logic
export async function notifyApprovers(documentId: string, documentTitle: string) {
  try {
    // Find all managers + admins
    const approvers = await pool.query(
      "SELECT id FROM users WHERE role IN ('admin', 'manager') AND status = 'active'"
    );

    for (const approver of approvers.rows) {
      // Check if user has approvals notifications enabled
      const prefResult = await pool.query(
        'SELECT approvals_enabled FROM notification_preferences WHERE user_id = $1',
        [approver.id]
      );
      // Default to true if no preference row exists
      const approvalsEnabled = prefResult.rows.length === 0 || prefResult.rows[0].approvals_enabled;

      if (!approvalsEnabled) continue;

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, document_id)
         VALUES ($1, 'approval', $2, $3, $4)`,
        [
          approver.id,
          `"${documentTitle}" needs approval`,
          `A new document "${documentTitle}" has been submitted and needs your approval.`,
          documentId,
        ]
      );
    }
  } catch (err) {
    console.error('notifyApprovers error:', err);
  }
}
