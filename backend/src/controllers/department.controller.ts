import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { randomUUID } from 'crypto';

// List all departments
export const listDepartments = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, description, created_at FROM departments ORDER BY name');
    // Fetch real staff and document counts per department
    const departments = await Promise.all(result.rows.map(async (row) => {
      const staffRes = await pool.query('SELECT COUNT(*) FROM users WHERE department = $1', [row.name]);
      const docRes = await pool.query('SELECT COUNT(*) FROM documents WHERE department = $1', [row.name]);
      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        description: row.description || '',
        staffCount: parseInt(staffRes.rows[0].count),
        documentCount: parseInt(docRes.rows[0].count),
      };
    }));
    return res.json({ departments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('listDepartments error:', message);
    return res.status(500).json({ error: message });
  }
};

// Create a new department
export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const cleanName = name.trim();

    // Prevent duplicate department names
    const existing = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [cleanName]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Department already exists' });
    }

    // Check for existing root folder with same name (prevent duplicate folder creation)
    const folderRes = await pool.query(
      'SELECT id, department FROM folders WHERE LOWER(name) = LOWER($1) AND parent_id IS NULL',
      [cleanName]
    );

    let folderId: string;

    if (folderRes.rows.length > 0) {
      // Use existing folder; ensure it's associated with this department
      folderId = folderRes.rows[0].id;
      const existingFolderDept = folderRes.rows[0].department;
      if (!existingFolderDept || existingFolderDept !== cleanName) {
        await pool.query('UPDATE folders SET department = $1 WHERE id = $2', [cleanName, folderId]);
      }
    } else {
      // Create a new root folder for the department
      folderId = randomUUID();

      let createdBy = 'System';
      let createdById = null;
      let createdByRole = 'admin';
      if (req.userId) {
        const userResult = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [req.userId]);
        if (userResult.rows.length > 0) {
          createdBy = userResult.rows[0].name || 'System';
          createdById = userResult.rows[0].id;
          createdByRole = userResult.rows[0].role || 'admin';
        }
      } 

      await pool.query(
        `INSERT INTO folders (id, name, parent_id, department, is_department, created_by, created_by_id, created_by_role, visibility, permissions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [folderId, cleanName, null, cleanName, true, createdBy, createdById, createdByRole, 'department', '{}', new Date()]
      );
    }

    const result = await pool.query(
      'INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [cleanName, description || '']
    );

    const row = result.rows[0];
    const department = {
      id: row.id,
      name: row.name,
      folderPath: cleanName,
      createdAt: row.created_at,
      manager: 'TBD',
      description: row.description || '',
      staffCount: 0,
      documentCount: 0
    };

    // Record activity log for department creation (non-blocking)
    (async () => {
      try {
        let logUserId = req.userId || null;
        let logUserName = 'System';
        let logUserRole = 'admin';

        if (logUserId) {
          const uq = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [logUserId]);
          if (uq.rows.length > 0) {
            logUserName = uq.rows[0].name || logUserName;
            logUserRole = uq.rows[0].role || logUserRole;
          } else {
            logUserId = null;
          }
        }

        if (!logUserId) {
          const adminQ = await pool.query("SELECT id, name FROM users WHERE role = 'admin' LIMIT 1");
          if (adminQ.rows.length > 0) {
            logUserId = adminQ.rows[0].id;
            logUserName = adminQ.rows[0].name || logUserName;
            logUserRole = 'admin';
          }
        }

        const details = `New department created: ${department.name} (root folder: ${folderId})`;
        const ip = (req.headers && (req.headers['x-forwarded-for'] || req.ip)) || req.ip || null;

        if (logUserId) {
          await pool.query(
            `INSERT INTO activity_logs (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
            [logUserId, logUserName, logUserRole, 'CREATE_DEPARTMENT', department.name, 'system', ip, details]
          );
        }
      } catch (e) {
        console.error('Failed to write activity log for createDepartment:', e);
      }
    })();

    return res.status(201).json({ department });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('createDepartment error:', message);
    return res.status(500).json({ error: message });
  }
};

// Delete a department (soft-delete folders and documents to trash)
export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Department ID is required' });
    }

    // Ensure department exists
    const deptRes = await pool.query('SELECT name FROM departments WHERE id = $1', [id]);
    if (deptRes.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const deptName = deptRes.rows[0].name;

    // Get user info for trash records
    let trashedById = req.userId || null;
    let trashedByName = 'System';
    if (trashedById) {
      const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [trashedById]);
      if (userRes.rows.length > 0) {
        trashedByName = userRes.rows[0].name;
      }
    }

    // Proceed with soft-delete: move documents and folders to trash, then delete department
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Soft-delete documents tied to this department (move to trash)
      const trashDocsRes = await client.query(
        `UPDATE documents
         SET status = 'trashed', trashed_at = NOW(), trashed_by = $3, department_id = NULL
         WHERE (department = $1 OR department_id = $2) AND (status != 'trashed' OR trashed_at IS NULL)`,
        [deptName, id, trashedById]
      );

      // Clear department_id foreign key for ALL documents in this department (even already trashed ones)
      await client.query(
        `UPDATE documents SET department_id = NULL WHERE department_id = $1`,
        [id]
      );

      // Record documents in trash_history
      const docsToTrash = await client.query(
        `SELECT id, title FROM documents WHERE department = $1 OR department_id = $2`,
        [deptName, id]
      );
      for (const doc of docsToTrash.rows) {
        try {
          await client.query(
            `INSERT INTO trash_history (target_id, target_type, target_name, action, metadata)
             VALUES ($1, 'document', $2, 'trashed', $3)`,
            [doc.id, doc.title, JSON.stringify({ trashed_by: trashedByName, original_location: deptName })]
          );
        } catch (insertErr) {
          // Ignore duplicate insert errors
          console.log('Skipping duplicate trash_history entry for document:', doc.id);
        }
      }

      // Soft-delete folders that belong to this department (move to trash)
      const trashFoldersRes = await client.query(
        `UPDATE folders
         SET status = 'trashed', trashed_at = NOW()
         WHERE department = $1 AND (status != 'trashed' OR trashed_at IS NULL)`,
        [deptName]
      );

      // Record folders in trash_history
      const foldersToTrash = await client.query(
        `SELECT id, name FROM folders WHERE department = $1`,
        [deptName]
      );
      for (const folder of foldersToTrash.rows) {
        try {
          await client.query(
            `INSERT INTO trash_history (target_id, target_type, target_name, action, metadata)
             VALUES ($1, 'folder', $2, 'trashed', $3)`,
            [folder.id, folder.name, JSON.stringify({ trashed_by: trashedByName, original_location: deptName })]
          );
        } catch (insertErr) {
          // Ignore duplicate insert errors
          console.log('Skipping duplicate trash_history entry for folder:', folder.id);
        }
      }

      // Delete document counters for this department (these can be permanently deleted)
      const delCountersRes = await client.query('DELETE FROM document_counters WHERE department_id = $1', [id]);

      // Finally delete the department record
      const delDeptRes = await client.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);

      if (delDeptRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Department not found' });
      }

      await client.query('COMMIT');

      // Insert activity log after committing transaction
      try {
        let logUserId = req.userId || null;
        let logUserName = 'System';
        let logUserRole = 'admin';

        if (logUserId) {
          const uq = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [logUserId]);
          if (uq.rows.length > 0) {
            logUserName = uq.rows[0].name || logUserName;
            logUserRole = uq.rows[0].role || logUserRole;
          } else {
            logUserId = null;
          }
        }

        if (!logUserId) {
          const adminQ = await pool.query("SELECT id, name FROM users WHERE role = 'admin' LIMIT 1");
          if (adminQ.rows.length > 0) {
            logUserId = adminQ.rows[0].id;
            logUserName = adminQ.rows[0].name || logUserName;
            logUserRole = 'admin';
          }
        }

        const docs = trashDocsRes.rowCount || 0;
        const folders = trashFoldersRes.rowCount || 0;
        const counters = delCountersRes.rowCount || 0;
        const details = `Department deleted: ${deptName} — moved ${docs} documents and ${folders} folders to trash, removed ${counters} counters`;

        const ip = (req.headers && (req.headers['x-forwarded-for'] || req.ip)) || req.ip || null;

        if (logUserId) {
          const insertRes = await pool.query(
            `INSERT INTO activity_logs (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
            [logUserId, logUserName, logUserRole, 'DEPARTMENT_DELETED', deptName, 'system', ip, details]
          );
          console.log('Inserted activity_log id=', insertRes.rows[0]?.id, 'for department', deptName);
        } else {
          console.warn('deleteDepartment: no suitable user found for activity log; skipping log');
        }
      } catch (e) {
        console.error('Failed to write activity log after delete:', e);
      }

      return res.json({
        message: 'Department deleted successfully. Folders and documents moved to trash.',
        trashed: {
          documents: trashDocsRes.rowCount || 0,
          folders: trashFoldersRes.rowCount || 0,
          document_counters: delCountersRes.rowCount || 0
        }
      });
    } catch (txErr: unknown) {
      await client.query('ROLLBACK');
      const msg = txErr instanceof Error ? txErr.message : 'Transaction error';
      console.error('deleteDepartment transaction error:', msg);
      return res.status(500).json({ error: msg });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('deleteDepartment error:', message);
    return res.status(500).json({ error: message });
  }
};

export default { listDepartments, createDepartment, deleteDepartment };
