import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

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
      folderId = uuidv4();

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

    // Insert the department and store folder_path (same as department name)
    const result = await pool.query(
      'INSERT INTO departments (name, description, folder_path) VALUES ($1, $2, $3) RETURNING id, name, description, folder_path, created_at',
      [cleanName, description || '', cleanName]
    );

    const row = result.rows[0];
    const department = {
      id: row.id,
      name: row.name,
      folderPath: row.folder_path,
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

// Delete a department
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

    // Proceed with cascade deletion: remove documents, folders, counters, then department
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete documents tied to this department (by name or department_id)
      const delDocsRes = await client.query(
        'DELETE FROM documents WHERE department = $1 OR department_id = $2',
        [deptName, id]
      );

      // Delete folders that belong to this department (this will cascade to child folders)
      const delFoldersRes = await client.query('DELETE FROM folders WHERE department = $1', [deptName]);

      // Delete document counters for this department
      const delCountersRes = await client.query('DELETE FROM document_counters WHERE department_id = $1', [id]);

      // Finally delete the department
      const delDeptRes = await client.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);

      if (delDeptRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Department not found' });
      }

      await client.query('COMMIT');

      // Insert activity log after committing transaction to avoid interfering with deletion
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

        const docs = delDocsRes.rowCount || 0;
        const folders = delFoldersRes.rowCount || 0;
        const counters = delCountersRes.rowCount || 0;
        const details = `Department deleted: ${deptName} — removed ${docs} documents, ${folders} folders, ${counters} counters`;

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
        message: 'Department deleted successfully',
        deleted: {
          documents: delDocsRes.rowCount || 0,
          folders: delFoldersRes.rowCount || 0,
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
