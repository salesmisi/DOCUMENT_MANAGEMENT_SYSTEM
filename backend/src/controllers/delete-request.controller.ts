import { Request, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth.middleware';
// Import notification helpers
import { createNotification } from './notification.controller';

// Staff: Request deletion (folder or document)
export const requestDelete = async (req: AuthRequest, res: Response) => {
  try {
    const { type, target_id, reason, department } = req.body;
    const userId = req.userId;
    if (!['folder', 'document'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!target_id || !userId) return res.status(400).json({ error: 'Missing target or user' });

    // Check if target is a folder created by admin (protected folder)
    if (type === 'folder') {
      const folderCheck = await pool.query('SELECT * FROM folders WHERE id = $1', [target_id]);
      if (folderCheck.rows.length > 0) {
        const folder = folderCheck.rows[0];
        // Prevent deletion request for department folders
        if (folder.is_department) {
          return res.status(403).json({ error: 'Department folders cannot be deleted.' });
        }
        // Prevent deletion request for admin-created subfolders
        if (folder.created_by_role === 'admin') {
          return res.status(403).json({ error: 'Admin-created folders cannot be deleted. Please contact your administrator.' });
        }
      }
    }

    // Check for existing pending request for the same target
    const existing = await pool.query(
      `SELECT id FROM delete_requests WHERE target_id = $1 AND status = 'pending'`,
      [target_id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A pending delete request already exists for this item.' });
    }

    const result = await pool.query(
      `INSERT INTO delete_requests (type, target_id, requested_by, department, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [type, target_id, userId, department || null, reason || null]
    );
    // Notify all admins and managers
    const reviewers = await pool.query("SELECT id FROM users WHERE role IN ('admin', 'manager') AND status = 'active'");
    for (const reviewer of reviewers.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'delete-request', $2, $3)`,
        [reviewer.id, `Delete Request: ${type}`, `A staff member requested to delete a ${type}. Please review the request.`]
      );
    }
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('requestDelete error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: List all pending delete requests
export const listDeleteRequests = async (req: AuthRequest, res: Response) => {
  try {
    const allowed = new Set(['pending', 'approved', 'denied', 'all']);
    const status = String(req.query.status || 'pending').toLowerCase();
    const baseSQL = `SELECT dr.*, u.name as requested_by_name FROM delete_requests dr
       LEFT JOIN users u ON dr.requested_by = u.id`;
    let result;
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'all') {
      result = await pool.query(`${baseSQL} ORDER BY dr.created_at ASC`);
    } else {
      result = await pool.query(`${baseSQL} WHERE dr.status = $1 ORDER BY dr.created_at ASC`, [status]);
    }
    return res.json(result.rows);
  } catch (err) {
    console.error('listDeleteRequests error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Approve a delete request
export const approveDeleteRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;

    // Get the delete request first
    const reqCheck = await pool.query('SELECT * FROM delete_requests WHERE id = $1 AND status = $2', [id, 'pending']);
    if (reqCheck.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed' });
    const request = reqCheck.rows[0];

    // Check if target folder is admin-created (protected)
    if (request.type === 'folder') {
      const folderCheck = await pool.query('SELECT * FROM folders WHERE id = $1', [request.target_id]);
      if (folderCheck.rows.length > 0) {
        const folder = folderCheck.rows[0];
        if (folder.is_department) {
          return res.status(403).json({ error: 'Department folders cannot be deleted.' });
        }
        if (folder.created_by_role === 'admin') {
          return res.status(403).json({ error: 'Admin-created folders cannot be deleted through delete requests.' });
        }
      }
    }

    // Mark as approved
    const result = await pool.query(
      `UPDATE delete_requests SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [adminId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed' });

    // Notify requester of approval
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'delete-approved', $2, $3)`,
      [request.requested_by, `Delete Approved: ${request.type}`, `Your request to delete the ${request.type} has been approved and moved to trash.`]
    );

    // SOFT DELETE: Move to trash instead of hard delete
    let softDeleteResult;
    if (request.type === 'folder') {
      const folderRes = await pool.query('SELECT * FROM folders WHERE id = $1', [request.target_id]);
      if (folderRes.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });

      // Soft delete folder
      softDeleteResult = await pool.query(
        `UPDATE folders SET status = 'trashed', trashed_at = NOW() WHERE id = $1 RETURNING *`,
        [request.target_id]
      );

      // Cascade: Trash documents in folder
      await pool.query(
        `UPDATE documents SET status = 'trashed', trashed_at = NOW() WHERE folder_id = $1`,
        [request.target_id]
      );

      // Cascade: Trash subfolders
      await pool.query(
        `UPDATE folders SET status = 'trashed', trashed_at = NOW() WHERE parent_id = $1`,
        [request.target_id]
      );

    } else if (request.type === 'document') {
      const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [request.target_id]);
      if (docRes.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

      // Soft delete document
      softDeleteResult = await pool.query(
        `UPDATE documents SET status = 'trashed', trashed_at = NOW(), trashed_by = $2 WHERE id = $1 RETURNING *`,
        [request.target_id, adminId]
      );
    } else {
      return res.status(400).json({ error: 'Invalid delete request type' });
    }

    return res.json({
      request: result.rows[0],
      trashed: softDeleteResult.rows[0],
      message: `${request.type} moved to trash. It will be permanently deleted after 30 days.`
    });
  } catch (err) {
    console.error('approveDeleteRequest error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Deny a delete request
export const denyDeleteRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    // Mark as denied
    const result = await pool.query(
      `UPDATE delete_requests SET status = 'denied', denied_by = $1, denied_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [adminId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed' });
    // Notify requester of denial
    const deniedRequest = result.rows[0];
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'delete-denied', $2, $3)`,
      [deniedRequest.requested_by, `Delete Denied: ${deniedRequest.type}`, `Your request to delete the ${deniedRequest.type} was denied.`]
    );
    return res.json(deniedRequest);
  } catch (err) {
    console.error('denyDeleteRequest error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
