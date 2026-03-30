import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';

// ── GET notification preferences for the logged-in user ──
export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT user_id, email_enabled, browser_enabled, approvals_enabled, updated_at
       FROM notification_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Return defaults if no row exists yet
      return res.json({
        userId,
        emailEnabled: true,
        browserEnabled: true,
        approvalsEnabled: true,
      });
    }

    const r = result.rows[0];
    return res.json({
      userId: r.user_id,
      emailEnabled: r.email_enabled,
      browserEnabled: r.browser_enabled,
      approvalsEnabled: r.approvals_enabled,
    });
  } catch (err) {
    console.error('getNotificationPreferences error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── UPDATE notification preferences (upsert) ────────────
export const updateNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { emailEnabled, browserEnabled, approvalsEnabled } = req.body;

    const result = await pool.query(
      `INSERT INTO notification_preferences (user_id, email_enabled, browser_enabled, approvals_enabled, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         email_enabled = EXCLUDED.email_enabled,
         browser_enabled = EXCLUDED.browser_enabled,
         approvals_enabled = EXCLUDED.approvals_enabled,
         updated_at = NOW()
       RETURNING user_id, email_enabled, browser_enabled, approvals_enabled`,
      [
        userId,
        emailEnabled ?? true,
        browserEnabled ?? true,
        approvalsEnabled ?? true,
      ]
    );

    const r = result.rows[0];
    return res.json({
      userId: r.user_id,
      emailEnabled: r.email_enabled,
      browserEnabled: r.browser_enabled,
      approvalsEnabled: r.approvals_enabled,
    });
  } catch (err) {
    console.error('updateNotificationPreferences error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
