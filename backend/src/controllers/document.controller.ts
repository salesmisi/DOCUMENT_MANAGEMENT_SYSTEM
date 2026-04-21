import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { restoreDocumentWithHierarchy } from '../services/restore.service';
import { notifyApprovers } from './notification.controller';

async function resolveFolderDepartment(currentFolderId: string): Promise<string | null> {
  const folderRes = await pool.query(
    'SELECT id, name, parent_id, department, is_department FROM folders WHERE id = $1',
    [currentFolderId]
  );

  if (folderRes.rows.length === 0) {
    return null;
  }

  const folder = folderRes.rows[0];
  if (folder.is_department || !folder.parent_id) {
    return folder.department || folder.name || null;
  }

  return resolveFolderDepartment(folder.parent_id);
}

function getReferencePrefix(userRole: string | null | undefined, departmentName: string): string {
  if (String(userRole || '').toLowerCase() === 'admin') {
    return 'ADM';
  }

  return (departmentName || 'GEN').slice(0, 3).toUpperCase();
}

async function documentColumnExists(columnName: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND column_name = $1
      LIMIT 1`,
    [columnName]
  );

  return result.rows.length > 0;
}

// Create document with backend-generated reference
export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      department_id,
      department,
      description,
      folder_id,
      needs_approval,
      scanned_from,
      file_type,
      size,
      date
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const isScannerUpload = Boolean(scanned_from && String(scanned_from).trim());

    // Validate uploaded file
    const uploadedFile = (req as any).file;
    if (!uploadedFile) return res.status(400).json({ error: 'File is required' });

    // Read file content into buffer for DB storage
    let fileDataBuffer: Buffer | null = null;
    try {
      fileDataBuffer = fs.readFileSync(uploadedFile.path);
    } catch (e) {
      console.error('Could not read uploaded file:', e);
    }

    // Validate folder_id
    if (!folder_id || folder_id.trim() === '') {
      return res.status(400).json({ error: 'Folder is required to upload a document' });
    }
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    if (!isUuid(folder_id)) {
      return res.status(400).json({ error: 'Invalid folder_id format' });
    }
    const folderRes = await pool.query('SELECT id, department FROM folders WHERE id = $1', [folder_id]);
    if (folderRes.rows.length === 0) {
      return res.status(400).json({ error: 'Folder not found' });
    }
    const folderDeptName: string = await resolveFolderDepartment(folder_id) || folderRes.rows[0].department || '';

    // Validate authenticated user
    const uploadedById = req.userId || null;
    if (!uploadedById) return res.status(401).json({ error: 'Authentication required' });
    const userRes = await pool.query('SELECT name, role FROM users WHERE id = $1', [uploadedById]);
    const uploadedByName: string = userRes.rows[0]?.name || 'Unknown';
    const uploadedByRole: string = userRes.rows[0]?.role || req.userRole || 'staff';
    const needsApproval = isScannerUpload ? false : uploadedByRole === 'staff';

    // Resolve department
    let deptId: string | null = null;
    let deptName: string = 'General';
    let deptCode: string = 'GEN';

    // Folder hierarchy wins because folder access controls document visibility.
    if (folderDeptName) {
      const dr = await pool.query('SELECT id, name FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1', [folderDeptName]);
      if (dr.rows[0]) { deptId = dr.rows[0].id; deptName = dr.rows[0].name; }
      else { deptName = folderDeptName; }
    }
    // Fall back to explicit department_id only when the folder has no department mapping.
    if (!deptId && department_id && isUuid(department_id)) {
      const dr = await pool.query('SELECT id, name FROM departments WHERE id = $1', [department_id]);
      if (dr.rows[0]) { deptId = dr.rows[0].id; deptName = dr.rows[0].name; }
    }
    // Last fallback: explicit department name.
    if (!deptId && department) {
      const dr = await pool.query('SELECT id, name FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1', [department]);
      if (dr.rows[0]) { deptId = dr.rows[0].id; deptName = dr.rows[0].name; }
    }
    deptCode = getReferencePrefix(uploadedByRole, deptName);

    const year = new Date().getFullYear();
    const docDate = date || new Date().toISOString().split('T')[0];
    const filePath = uploadedFile.path;
    const fileType = file_type || uploadedFile.originalname?.split('.').pop()?.toLowerCase()?.slice(0, 10) || 'pdf';
    const fileSize = size || `${Math.round((uploadedFile.size || 0) / 1024 / 1024 * 10) / 10} MB`;

    // Generate reference number (outside transaction to avoid lock issues)
    let lastNumber = 1;
    if (deptId) {
      try {
        // Upsert counter
        const upsertRes = await pool.query(`
          INSERT INTO document_counters (id, department_id, year, last_number)
          VALUES (uuid_generate_v4(), $1, $2, 1)
          ON CONFLICT (department_id, year) DO UPDATE SET last_number = document_counters.last_number + 1
          RETURNING last_number
        `, [deptId, year]);
        lastNumber = upsertRes.rows[0].last_number;
      } catch (counterErr: any) {
        console.warn('Counter upsert failed, falling back to count:', counterErr?.message);
        try {
          const cntRes = await pool.query(
            `SELECT COUNT(*) AS cnt FROM documents WHERE department = $1 AND EXTRACT(YEAR FROM "date"::date) = $2`,
            [deptName, year]
          );
          lastNumber = Number(cntRes.rows[0]?.cnt || 0) + 1;
        } catch { lastNumber = Math.floor(Math.random() * 900) + 100; }
      }
    } else {
      try {
        const cntRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM documents WHERE department = $1 AND EXTRACT(YEAR FROM "date"::date) = $2`,
          [deptName, year]
        );
        lastNumber = Number(cntRes.rows[0]?.cnt || 0) + 1;
      } catch { lastNumber = 1; }
    }

    const reference = `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}`;

    // Insert document (simple INSERT, no wrapping transaction needed)
    const cols: string[] = [
      'id', 'title', 'reference', '"date"', 'uploaded_by',
      'uploaded_by_id', 'status', 'version', 'file_type',
      'needs_approval', 'description', 'folder_id', 'size', 'created_at'
    ];
    const vals: any[] = [
      randomUUID(),
      title,
      reference,
      docDate,
      uploadedByName,
      uploadedById,
      needsApproval ? 'pending' : 'approved',
      1,
      fileType,
      needsApproval,
      description || null,
      folder_id,
      fileSize,
      new Date(),
    ];

    // Add optional columns if available in DB
    // Always push department text (defaults to 'General' so never null)
    cols.push('department'); vals.push(deptName);
    if (deptId && await documentColumnExists('department_id')) {
      cols.push('department_id'); vals.push(deptId);
    }
    if (filePath) { cols.push('file_path'); vals.push(filePath); }
    if (fileDataBuffer) { cols.push('file_data'); vals.push(fileDataBuffer); }
    if (isScannerUpload) { cols.push('scanned_from'); vals.push(String(scanned_from).trim()); }

    const colsStr = cols.join(', ');
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    const insertRes = await pool.query(
      `INSERT INTO documents (${colsStr}) VALUES (${placeholders}) RETURNING *`,
      vals
    );

    const created = insertRes.rows[0];

    if (needsApproval) {
      void notifyApprovers(created.id, created.title || title);
    }

    return res.status(201).json({ message: 'Document uploaded successfully', reference: created.reference, document: created });

  } catch (err: any) {
    console.error('createDocument error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Server error' });
  }
};

// List documents (returns all, frontend filters by role/department)
export const listDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    console.log('listDocuments called for user:', userId, 'role:', userRole);

    // For admin, return all documents
    if (userRole === 'admin') {
      const docsResult = await pool.query(
        `SELECT d.*,
          EXISTS (SELECT 1 FROM document_shared_users s WHERE s.document_id = d.id) as is_shared
         FROM documents d
         ORDER BY created_at DESC`
      );
      return res.json({ documents: docsResult.rows });
    }

    // For staff/manager: get own docs, department docs, and shared docs
    const docsResult = await pool.query(
      `SELECT d.*,
        EXISTS (SELECT 1 FROM document_shared_users s WHERE s.document_id = d.id AND s.user_id = $1) as is_shared
       FROM documents d
       WHERE d.uploaded_by_id = $1
          OR d.department = (SELECT department FROM users WHERE id = $1)
          OR EXISTS (
            SELECT 1
            FROM folders f
            JOIN users u ON u.id = $1
            WHERE f.id = d.folder_id
              AND (
                u.role = 'manager' AND f.visibility <> 'admin-only' AND LOWER(COALESCE(f.department, '')) = LOWER(COALESCE(u.department, ''))
                OR u.role = 'staff' AND (
                  (f.visibility = 'department' AND LOWER(COALESCE(f.department, '')) = LOWER(COALESCE(u.department, '')))
                  OR (f.visibility = 'private' AND f.created_by_id = u.id)
                )
              )
          )
          OR EXISTS (SELECT 1 FROM document_shared_users s WHERE s.document_id = d.id AND s.user_id = $1)
       ORDER BY d.created_at DESC`,
      [userId]
    );

    console.log('Documents found:', docsResult.rows.length);
    console.log('Shared docs:', docsResult.rows.filter((d: any) => d.is_shared).length);

    return res.json({ documents: docsResult.rows });
  } catch (err: any) {
    console.error('listDocuments error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Approve a document
export const approveDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
    const approvedBy = userRes.rows[0]?.name || 'Unknown';

    const result = await pool.query(
      `UPDATE documents SET status = 'approved', approved_by = $1 WHERE id = $2 RETURNING *`,
      [approvedBy, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    return res.json({ message: 'Document approved', document: result.rows[0] });
  } catch (err: any) {
    console.error('approveDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Reject a document
export const rejectDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.userId;
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
    const rejectedBy = userRes.rows[0]?.name || 'Unknown';

    const result = await pool.query(
      `UPDATE documents SET status = 'rejected', rejection_reason = $1, approved_by = $2 WHERE id = $3 RETURNING *`,
      [reason || '', rejectedBy, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    return res.json({ message: 'Document rejected', document: result.rows[0] });
  } catch (err: any) {
    console.error('rejectDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Trash a document
export const trashDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      `UPDATE documents SET status = 'trashed', trashed_at = NOW(), trashed_by = $2 WHERE id = $1 RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    // Log to trash_history
    const doc = result.rows[0];
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, scheduled_deletion_at)
       VALUES ('document', $1, $2, 'trashed', $3, NOW() + INTERVAL '30 days')`,
      [doc.id, doc.title, userId]
    );

    return res.json({ message: 'Document trashed', document: doc });
  } catch (err: any) {
    console.error('trashDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Restore a document from trash
export const restoreDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = Array.isArray(id) ? id[0] : id;

    const docCheck = await pool.query(
      'SELECT id, title, folder_id, department, status, trashed_at FROM documents WHERE id = $1',
      [documentId]
    );
    if (docCheck.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = docCheck.rows[0];

    if (doc.status !== 'trashed') {
      return res.json({
        message: 'Document is already active',
        document: doc
      });
    }

    if (doc.folder_id) {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRes = await pool.query('SELECT name, role FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const userName = userRes.rows[0].name;
      const userRole = userRes.rows[0].role;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || null;

      const hierarchyResult = await restoreDocumentWithHierarchy(
        documentId,
        userId,
        userName,
        userRole,
        ipAddress
      );

      if (!hierarchyResult.success) {
        return res.status(400).json({
          error: hierarchyResult.message,
          details: hierarchyResult.errors
        });
      }

      const restoredDocument = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);

      return res.json({
        message: hierarchyResult.message,
        document: restoredDocument.rows[0],
        restored: hierarchyResult.restored,
        auditLogs: hierarchyResult.auditLogs.map(log => ({
          action: log.type,
          target: log.targetName
        }))
      });
    }

    const result = await pool.query(
      `UPDATE documents SET status = 'approved', trashed_at = NULL, archived_at = NULL WHERE id = $1 RETURNING *`,
      [documentId]
    );

    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, metadata)
       VALUES ('document', $1, $2, 'restored', $3, $4)`,
      [
        result.rows[0].id,
        result.rows[0].title,
        req.userId,
        JSON.stringify({ department: doc.department, hierarchyRestore: false, folderMissing: true })
      ]
    );

    return res.json({
      message: `Document restored, but no original folder was linked.`,
      document: result.rows[0]
    });
  } catch (err: any) {
    console.error('restoreDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Permanently delete a document
export const permanentlyDeleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Only admin can delete directly; must be in trash for at least 30 days OR admin override
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete documents directly.' });
    }

    // Check if document is in trash
    const docCheck = await pool.query(
      'SELECT id, title, status, trashed_at FROM documents WHERE id = $1',
      [id]
    );

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docCheck.rows[0];

    // Enforce 30-day retention unless admin override with force flag
    const force = req.query.force === 'true';
    if (doc.status === 'trashed' && doc.trashed_at && !force) {
      const daysSinceTrashed = Math.floor(
        (Date.now() - new Date(doc.trashed_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceTrashed < 30) {
        return res.status(400).json({
          error: `Document must remain in trash for 30 days. ${30 - daysSinceTrashed} days remaining.`,
          daysRemaining: 30 - daysSinceTrashed,
        });
      }
    }

    // Perform permanent deletion
    const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id, title', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    // Log to trash_history
    await pool.query(
      `INSERT INTO trash_history (target_type, target_id, target_name, action, performed_by, actual_deletion_at)
       VALUES ('document', $1, $2, 'permanently_deleted', $3, NOW())`,
      [doc.id, doc.title, req.userId]
    );

    return res.json({ message: 'Document permanently deleted' });
  } catch (err: any) {
    console.error('permanentlyDeleteDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Archive a document
export const archiveDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE documents SET status = 'archived', archived_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    return res.json({ message: 'Document archived', document: result.rows[0] });
  } catch (err: any) {
    console.error('archiveDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Download a document file
export const downloadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const docId = Array.isArray(id) ? id[0] : id;
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    if (!isUuid(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const result = await pool.query(
      'SELECT title, file_type, file_path, file_data FROM documents WHERE id = $1',
      [docId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const ext = doc.file_type || 'bin';
    const safeTitle = (doc.title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${safeTitle}.${ext}`;

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      mkv: 'video/x-matroska',
    };
    const contentType = mimeTypes[ext.toLowerCase()] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Try serving from disk first, then fall back to file_data in DB
    if (doc.file_path) {
      const filePath = path.isAbsolute(doc.file_path)
        ? doc.file_path
        : path.join(process.cwd(), doc.file_path);

      if (fs.existsSync(filePath)) {
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        return;
      }
    }

    // Fall back to binary data stored in DB
    if (doc.file_data) {
      return res.send(doc.file_data);
    }

    return res.status(404).json({ error: 'File content not found' });
  } catch (err: any) {
    console.error('downloadDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Preview document (inline, for in-browser rendering)
export const previewDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const docId = Array.isArray(id) ? id[0] : id;
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    if (!isUuid(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const result = await pool.query(
      'SELECT title, file_type, file_path, file_data FROM documents WHERE id = $1',
      [docId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const ext = (doc.file_type || 'bin').toLowerCase();

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      mp4: 'video/mp4',
      zip: 'application/zip',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');

    if (doc.file_path) {
      const filePath = path.isAbsolute(doc.file_path)
        ? doc.file_path
        : path.join(process.cwd(), doc.file_path);
      if (fs.existsSync(filePath)) {
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        return;
      }
    }

    if (doc.file_data) {
      return res.send(doc.file_data);
    }

    return res.status(404).json({ error: 'File content not found' });
  } catch (err: any) {
    console.error('previewDocument error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// --- Share Document with Users ---


export const shareDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // document id
    const { users } = req.body; // [{ userId, role }]

    console.log('shareDocument called for document:', id);
    console.log('Users to share with:', JSON.stringify(users));

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'No users provided' });
    }

    // Get the sharer's info and document title
    const sharerResult = await pool.query('SELECT name, role FROM users WHERE id = $1', [req.userId]);
    const sharerName = sharerResult.rows[0]?.name || 'Someone';
    const sharerRole = sharerResult.rows[0]?.role || 'user';

    const docResult = await pool.query('SELECT title FROM documents WHERE id = $1', [id]);
    const docTitle = docResult.rows[0]?.title || 'a document';

    // Remove existing shares for this document (optional, or merge logic)
    await pool.query('DELETE FROM document_shared_users WHERE document_id = $1', [id]);

    // Collect shared user names for activity log
    const sharedWithNames: string[] = [];

    // Add new shares
    for (const u of users) {
      console.log('Inserting share for user:', u.userId, 'document:', id, 'role:', u.role);
      const insertResult = await pool.query(
        `INSERT INTO document_shared_users (document_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role
         RETURNING *`,
        [id, u.userId, u.role || 'Editor']
      );
      console.log('Share inserted:', insertResult.rows[0]);

      // Get the shared user's name for activity log
      const sharedUserResult = await pool.query('SELECT name FROM users WHERE id = $1', [u.userId]);
      const sharedUserName = sharedUserResult.rows[0]?.name || 'Unknown';
      sharedWithNames.push(`${sharedUserName} (${u.role || 'Editor'})`);

      // Create notification for each user
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, document_id)
           VALUES ($1, 'share', $2, $3, $4)`,
          [
            u.userId,
            `${sharerName} shared "${docTitle}" with you`,
            `You have been granted ${u.role || 'Editor'} access to "${docTitle}" by ${sharerName}.`,
            id
          ]
        );
        console.log('Notification inserted for user', u.userId, 'for document', id);
      } catch (notifErr) {
        console.error('Failed to insert notification for user', u.userId, notifErr);
      }
    }

    // Add activity log entry
    try {
      const details = `Shared "${docTitle}" with: ${sharedWithNames.join(', ')}`;
      await pool.query(
        `INSERT INTO activity_logs (user_id, user_name, user_role, action, target, target_type, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [req.userId, sharerName, sharerRole, 'DOCUMENT_SHARED', docTitle, 'document', details]
      );
      console.log('Activity log created for document share');
    } catch (logErr) {
      console.error('Failed to create activity log for share:', logErr);
    }

    // Verify shares were saved
    const verifyResult = await pool.query(
      'SELECT * FROM document_shared_users WHERE document_id = $1',
      [id]
    );
    console.log('Verified shares in DB:', verifyResult.rows);

    return res.json({ message: 'Document shared successfully' });
  } catch (err) {
    console.error('shareDocument error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Get document shares
export const getDocumentShares = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    console.log('getDocumentShares called for document:', id);

    const result = await pool.query(
      `SELECT s.user_id, s.role, u.name as user_name, u.email as user_email
       FROM document_shared_users s
       INNER JOIN users u ON s.user_id = u.id
       WHERE s.document_id = $1`,
      [id]
    );

    console.log('Shares found:', result.rows);
    return res.json({ shares: result.rows });
  } catch (err) {
    console.error('getDocumentShares error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Debug endpoint to check all shares for a user
export const getMySharedDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    console.log('getMySharedDocuments called for user:', userId);

    // Check all shares for this user
    const sharesResult = await pool.query(
      `SELECT s.*, d.title as document_title
       FROM document_shared_users s
       INNER JOIN documents d ON s.document_id = d.id
       WHERE s.user_id = $1`,
      [userId]
    );

    console.log('Shared documents for user:', sharesResult.rows);

    return res.json({
      userId,
      shares: sharesResult.rows
    });
  } catch (err) {
    console.error('getMySharedDocuments error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Returns true if user has access to the document (owner or shared)
export async function userHasDocumentAccess(userId: number, documentId: number): Promise<boolean> {
  // Check if user is owner
  const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
  if (docRes.rows.length === 0) return false;
  if (docRes.rows[0].uploaded_by === userId) return true;
  // Check if user is in shared table
  const sharedRes = await pool.query(
    'SELECT 1 FROM document_shared_users WHERE document_id = $1 AND user_id = $2',
    [documentId, userId]
  );
  return sharedRes.rows.length > 0;
}

// Restore document with full hierarchy (department → folders → document)
// POST /documents/:id/restore-hierarchy
export const restoreDocumentHierarchy = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const documentId = Array.isArray(id) ? id[0] : id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user info for audit logging
    const userRes = await pool.query('SELECT name, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const userName = userRes.rows[0].name;
    const userRole = userRes.rows[0].role;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || null;

    // Call the service function to restore with full hierarchy
    const result = await restoreDocumentWithHierarchy(
      documentId,
      userId,
      userName,
      userRole,
      ipAddress
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.message,
        details: result.errors
      });
    }

    return res.json({
      message: result.message,
      restored: result.restored,
      auditLogs: result.auditLogs.map(log => ({
        action: log.type,
        target: log.targetName
      }))
    });

  } catch (err: any) {
    console.error('restoreDocumentHierarchy error:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export default {
  createDocument,
  listDocuments,
  approveDocument,
  rejectDocument,
  trashDocument,
  restoreDocument,
  restoreDocumentHierarchy,
  permanentlyDeleteDocument,
  archiveDocument,
  downloadDocument,
  previewDocument,
  shareDocument,
  getDocumentShares,
  getMySharedDocuments
};
