import { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

// List all folders
export const listFolders = async (_req: Request, res: Response) => {
  try {
    // Return folders ordered alphabetically by name (case-insensitive), then by creation time
    // Exclude trashed folders from the list
    const result = await pool.query("SELECT * FROM folders WHERE (status IS NULL OR status != 'trashed') ORDER BY LOWER(name) ASC, created_at ASC");
    const rows = result.rows;

    // If an Authorization token is provided, attempt to verify and return a per-user filtered view
    try {
      const authHeader = String(_req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : (authHeader || null);
      if (token) {
        try {
          const secret = process.env.JWT_SECRET || 'change_me_to_a_strong_random_string';
          const payload: any = jwt.verify(token, secret);
          const userId = payload?.id;
          const userRole = payload?.role;
          if (userId) {
            const ures = await pool.query('SELECT id, role, department FROM users WHERE id = $1', [userId]);
            const user = ures.rows[0];
            let visible = rows;
            if (userRole !== 'admin') {
              // Build a set of visible folder IDs including descendants
              const visibleIds = new Set<string>();

              // First pass: find all directly visible folders
              const directlyVisible = rows.filter((folder: any) => {
                const vis = folder.visibility || 'private';
                if (vis === 'admin-only') return false;
                if (userRole === 'manager') {
                  return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
                }
                if (userRole === 'staff') {
                  if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase()) return true;
                  if (vis === 'private' && String(folder.created_by_id || folder.createdById || '') === String(userId)) return true;
                  return false;
                }
                return false;
              });

              directlyVisible.forEach((f: any) => visibleIds.add(f.id));

              // Second pass: recursively add all descendants of visible folders
              const addDescendants = (parentId: string) => {
                rows.forEach((f: any) => {
                  if (f.parent_id === parentId && !visibleIds.has(f.id)) {
                    visibleIds.add(f.id);
                    addDescendants(f.id);
                  }
                });
              };

              directlyVisible.forEach((f: any) => addDescendants(f.id));

              // Third pass: add ancestors of visible folders (so tree structure is complete)
              const addAncestors = (folderId: string) => {
                const folder = rows.find((f: any) => f.id === folderId);
                if (folder?.parent_id && !visibleIds.has(folder.parent_id)) {
                  visibleIds.add(folder.parent_id);
                  addAncestors(folder.parent_id);
                }
              };

              directlyVisible.forEach((f: any) => addAncestors(f.id));

              visible = rows.filter((f: any) => visibleIds.has(f.id));
            }
            return res.json({ folders: rows, visibleFolders: visible });
          }
        } catch (e) {
          // invalid token, fallthrough to return all folders
        }
      }
    } catch (inner) {
      // ignore
    }

    res.json({ folders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

// Create a new folder
export const createFolder = async (req: AuthRequest, res: Response) => {
  const { name, parentId, department, createdBy, createdById, createdByRole, visibility, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });
  try {
    // Prevent staff from creating root folders
    if ((!parentId || parentId === null) && req.userRole === 'staff') {
      return res.status(403).json({ error: 'Staff are only allowed to create subfolders under existing folders' });
    }
    const id = randomUUID();
    const createdAt = new Date();
    // Use authenticated user info if available
    const actorId = req.userId || createdById || null;
    const actorRole = req.userRole || createdByRole || 'staff';
    const actorNameRes = actorId ? await pool.query('SELECT name FROM users WHERE id = $1', [actorId]) : null;
    const actorName = actorNameRes && actorNameRes.rows[0] ? actorNameRes.rows[0].name : (createdBy || 'System');

    const result = await pool.query(
      `INSERT INTO folders (id, name, parent_id, department, created_by, created_by_id, created_by_role, visibility, permissions, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, name, parentId, department, actorName, actorId, actorRole, visibility, permissions, createdAt]
    );
    res.status(201).json({ folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

// Update a folder
export const updateFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    // fetch existing folder to check protection flag
    const existing = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const folder = existing.rows[0];

    // Prevent renaming/moving of system department folders by non-admins
    if (folder.is_department && req.userRole !== 'admin') {
      if ('name' in updates || 'parent_id' in updates) {
        return res.status(403).json({ error: 'This folder is a protected department folder and cannot be renamed or moved' });
      }
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    if (fields.length === 0) return res.status(400).json({ error: 'No updates provided' });
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE folders SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    res.json({ folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
};

// Delete a folder (soft delete - moves to trash)
export const deleteFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Check folder exists and protection flag
    const existing = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const folder = existing.rows[0];

    if (folder.is_department && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'This folder is a protected department folder and cannot be deleted' });
    }

    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete folders directly. Please request deletion for admin approval.' });
    }

    // SOFT DELETE: Mark as trashed instead of hard delete
    const result = await pool.query(
      `UPDATE folders SET status = 'trashed', trashed_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const deleted = result.rows[0];

    // Also trash all documents in this folder (cascade soft delete)
    await pool.query(
      `UPDATE documents SET status = 'trashed', trashed_at = NOW() WHERE folder_id = $1`,
      [id]
    );

    // Recursively trash subfolders
    const subfolders = await pool.query('SELECT id FROM folders WHERE parent_id = $1', [id]);
    for (const subfolder of subfolders.rows) {
      await pool.query(
        `UPDATE folders SET status = 'trashed', trashed_at = NOW() WHERE id = $1`,
        [subfolder.id]
      );
      // Trash documents in subfolders too
      await pool.query(
        `UPDATE documents SET status = 'trashed', trashed_at = NOW() WHERE folder_id = $1`,
        [subfolder.id]
      );
    }

    // Lookup userName for trash_history
    let userName = null;
    if (req.userId) {
      const u = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
      userName = u.rows[0]?.name || null;
    }
    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, performed_by_name, scheduled_deletion_at)
       VALUES ('folder', $1, $2, 'trashed', $3, $4, NOW() + INTERVAL '30 days')`,
      [deleted.id, deleted.name, req.userId, userName || 'Unknown']
    );

    // Write an activity log entry for admin
    try {
      const userId = req.userId || null;
      let userName = null;
      if (userId) {
        const u = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        userName = u.rows[0]?.name || null;
      }
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || null;
      const details = `Folder "${deleted.name}" was moved to trash`;
      await pool.query(
        `INSERT INTO activity_logs (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [userId, userName, 'admin', 'FOLDER_TRASHED', deleted.name, 'folder', ip, details]
      );
    } catch (logErr) {
      console.error('Failed to write activity log for folder delete:', logErr);
    }

    res.json({ message: 'Folder moved to trash', folder: deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

// Restore a folder from trash
export const restoreFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Get folder details first
    const folderCheck = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folderCheck.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });

    const folder = folderCheck.rows[0];

    // If folder has a parent, ensure parent exists and is active
    if (folder.parent_id) {
      const parentCheck = await pool.query('SELECT * FROM folders WHERE id = $1', [folder.parent_id]);
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Parent folder no longer exists. Cannot restore.' });
      }

      const parent = parentCheck.rows[0];
      // If parent is trashed, restore it first (recursive restoration)
      if (parent.status === 'trashed') {
        await pool.query(
          `UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = $1`,
          [parent.id]
        );
      }
    }

    // If folder belongs to a department, ensure department folder exists
    if (folder.department && !folder.is_department) {
      const deptFolderCheck = await pool.query(
        'SELECT * FROM folders WHERE department = $1 AND is_department = TRUE',
        [folder.department]
      );

      // If department folder is trashed, restore it first
      if (deptFolderCheck.rows.length > 0 && deptFolderCheck.rows[0].status === 'trashed') {
        await pool.query(
          `UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = $1`,
          [deptFolderCheck.rows[0].id]
        );
      }
    }

    // Now restore the folder
    const result = await pool.query(
      `UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const restored = result.rows[0];

    // Restore all documents in this folder - they keep their original department
    await pool.query(
      `UPDATE documents SET status = 'approved', trashed_at = NULL WHERE folder_id = $1 AND status = 'trashed'`,
      [id]
    );

    // Restore subfolders - they keep their original department
    await pool.query(
      `UPDATE folders SET status = 'active', trashed_at = NULL WHERE parent_id = $1 AND status = 'trashed'`,
      [id]
    );

    // Lookup userName for trash_history
    let userName = null;
    if (req.userId) {
      const u = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
      userName = u.rows[0]?.name || null;
    }
    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, performed_by_name, metadata)
       VALUES ('folder', $1, $2, 'restored', $3, $4, $5)`,
      [restored.id, restored.name, req.userId, userName || 'Unknown',
       JSON.stringify({ department: restored.department })]
    );

    res.json({ message: `Folder restored to ${restored.department || 'its'} department`, folder: restored });
  } catch (err) {
    console.error('restoreFolder error:', err);
    res.status(500).json({ error: 'Failed to restore folder' });
  }
};

// Permanently delete a folder (admin only, from trash)
export const permanentlyDeleteFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can permanently delete folders' });
    }

    const existing = await pool.query('SELECT * FROM folders WHERE id = $1 AND status = $2', [id, 'trashed']);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found in trash' });
    }

    const folder = existing.rows[0];

    // Permanently delete documents in folder
    await pool.query('DELETE FROM documents WHERE folder_id = $1', [id]);

    // Permanently delete subfolders and their documents
    const subfolders = await pool.query('SELECT id FROM folders WHERE parent_id = $1', [id]);
    for (const sub of subfolders.rows) {
      await pool.query('DELETE FROM documents WHERE folder_id = $1', [sub.id]);
      await pool.query('DELETE FROM folders WHERE id = $1', [sub.id]);
    }

    // Delete the folder itself
    await pool.query('DELETE FROM folders WHERE id = $1', [id]);

    // Lookup userName for trash_history
    let userName = null;
    if (req.userId) {
      const u = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
      userName = u.rows[0]?.name || null;
    }
    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, performed_by_name, actual_deletion_at)
       VALUES ('folder', $1, $2, 'permanently_deleted', $3, $4, NOW())`,
      [folder.id, folder.name, req.userId, userName || 'Unknown']
    );

    res.json({ message: 'Folder permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete folder' });
  }
};

export default { listFolders, createFolder, updateFolder, deleteFolder, restoreFolder, permanentlyDeleteFolder };
