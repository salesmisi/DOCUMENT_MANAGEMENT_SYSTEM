import { PoolClient } from 'pg';
import pool from '../db';

// Types for restore operation results
export interface RestoreResult {
  success: boolean;
  message: string;
  restored: {
    department?: { id: string; name: string };
    folders: Array<{ id: string; name: string; depth: number }>;
    document: { id: string; title: string };
  };
  auditLogs: Array<{ type: string; targetId: string; targetName: string }>;
  errors?: string[];
}

interface FolderHierarchy {
  id: string;
  name: string;
  parent_id: string | null;
  department: string;
  is_department: boolean;
  status: string | null;
  trashed_at: Date | null;
}

/**
 * Restore a document along with its complete folder hierarchy and department.
 *
 * Restore order (critical):
 * 1. Restore department folder first (if trashed)
 * 2. Restore parent folders from top to bottom
 * 3. Restore the document's immediate folder
 * 4. Restore the document itself
 *
 * All operations are wrapped in a transaction for atomicity.
 */
export async function restoreDocumentWithHierarchy(
  documentId: string,
  userId: string,
  userName: string,
  userRole: string,
  ipAddress?: string | null
): Promise<RestoreResult> {
  const client = await pool.connect();
  const auditLogs: RestoreResult['auditLogs'] = [];
  const restoredFolders: RestoreResult['restored']['folders'] = [];
  let restoredDepartment: RestoreResult['restored']['department'] | undefined;

  try {
    await client.query('BEGIN');

    // Step 1: Get document details
    const docResult = await client.query(
      'SELECT id, title, folder_id, department, status, trashed_at FROM documents WHERE id = $1',
      [documentId]
    );

    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: 'Document not found',
        restored: { folders: [], document: { id: documentId, title: '' } },
        auditLogs: [],
        errors: ['Document with the specified ID does not exist']
      };
    }

    const document = docResult.rows[0];

    // Check if document is already restored
    if (document.status !== 'trashed') {
      await client.query('ROLLBACK');
      return {
        success: true,
        message: 'Document is already active (not in trash)',
        restored: { folders: [], document: { id: document.id, title: document.title } },
        auditLogs: []
      };
    }

    // Step 2: Validate and get folder hierarchy
    if (!document.folder_id) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: 'Document has no associated folder',
        restored: { folders: [], document: { id: document.id, title: document.title } },
        auditLogs: [],
        errors: ['Document folder_id is null - cannot determine hierarchy']
      };
    }

    // Step 3: Build complete folder hierarchy (from document folder up to root)
    const folderHierarchy = await buildFolderHierarchy(client, document.folder_id);

    if (folderHierarchy.error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: folderHierarchy.error,
        restored: { folders: [], document: { id: document.id, title: document.title } },
        auditLogs: [],
        errors: [folderHierarchy.error]
      };
    }

    // Step 4: Find and restore the department folder first (root folder with is_department = true)
    const departmentFolder = folderHierarchy.folders.find(f => f.is_department === true);

    if (departmentFolder && departmentFolder.status === 'trashed') {
      await restoreFolderRecord(client, departmentFolder.id);
      restoredDepartment = { id: departmentFolder.id, name: departmentFolder.name };
      auditLogs.push({
        type: 'department_restored',
        targetId: departmentFolder.id,
        targetName: departmentFolder.name
      });

      await logActivity(client, {
        userId,
        userName,
        userRole,
        action: 'DEPARTMENT_RESTORED',
        target: departmentFolder.name,
        targetType: 'folder',
        ipAddress,
        details: `Department folder "${departmentFolder.name}" restored as part of document hierarchy restore`
      });

      await logTrashHistory(client, {
        targetType: 'folder',
        targetId: departmentFolder.id,
        targetName: departmentFolder.name,
        action: 'restored',
        performedBy: userId,
        performedByName: userName,
        metadata: { restoredWith: 'document', documentId, documentTitle: document.title }
      });
    }

    // Step 5: Restore parent folders from root (top) to document folder (bottom)
    // Folders are ordered from document folder to root, so we reverse for top-down restoration
    const foldersTopDown = [...folderHierarchy.folders].reverse();

    for (let i = 0; i < foldersTopDown.length; i++) {
      const folder = foldersTopDown[i];

      // Skip department folder (already restored above)
      if (folder.is_department) continue;

      // Skip already active folders
      if (folder.status !== 'trashed') continue;

      // Restore this folder
      await restoreFolderRecord(client, folder.id);

      const depth = foldersTopDown.length - i; // Depth from root
      restoredFolders.push({ id: folder.id, name: folder.name, depth });

      auditLogs.push({
        type: 'folder_restored',
        targetId: folder.id,
        targetName: folder.name
      });

      await logActivity(client, {
        userId,
        userName,
        userRole,
        action: 'FOLDER_RESTORED',
        target: folder.name,
        targetType: 'folder',
        ipAddress,
        details: `Folder "${folder.name}" restored as part of document hierarchy restore (depth: ${depth})`
      });

      await logTrashHistory(client, {
        targetType: 'folder',
        targetId: folder.id,
        targetName: folder.name,
        action: 'restored',
        performedBy: userId,
        performedByName: userName,
        metadata: { restoredWith: 'document', documentId, documentTitle: document.title, depth }
      });
    }

    // Step 6: Restore the document itself
    await client.query(
      `UPDATE documents
       SET status = 'approved', trashed_at = NULL, archived_at = NULL
       WHERE id = $1`,
      [documentId]
    );

    auditLogs.push({
      type: 'document_restored',
      targetId: document.id,
      targetName: document.title
    });

    await logActivity(client, {
      userId,
      userName,
      userRole,
      action: 'DOCUMENT_RESTORED',
      target: document.title,
      targetType: 'document',
      ipAddress,
      details: `Document "${document.title}" restored with full hierarchy (${restoredFolders.length} folders restored)`
    });

    await logTrashHistory(client, {
      targetType: 'document',
      targetId: document.id,
      targetName: document.title,
      action: 'restored',
      performedBy: userId,
      performedByName: userName,
      metadata: {
        department: document.department,
        foldersRestored: restoredFolders.length,
        hierarchyRestore: true
      }
    });

    // Step 7: Commit transaction
    await client.query('COMMIT');

    return {
      success: true,
      message: `Document restored successfully with ${restoredFolders.length + (restoredDepartment ? 1 : 0)} parent entities`,
      restored: {
        department: restoredDepartment,
        folders: restoredFolders,
        document: { id: document.id, title: document.title }
      },
      auditLogs
    };

  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during restore';
    console.error('restoreDocumentWithHierarchy error:', errorMessage);

    return {
      success: false,
      message: 'Failed to restore document hierarchy',
      restored: { folders: [], document: { id: documentId, title: '' } },
      auditLogs,
      errors: [errorMessage]
    };
  } finally {
    client.release();
  }
}

/**
 * Build the complete folder hierarchy from a given folder up to the root.
 * Uses recursive traversal via parent_id.
 * Returns folders ordered from the starting folder to the root.
 */
async function buildFolderHierarchy(
  client: PoolClient,
  startFolderId: string
): Promise<{ folders: FolderHierarchy[]; error?: string }> {
  const folders: FolderHierarchy[] = [];
  const visited = new Set<string>(); // Prevent infinite loops
  let currentFolderId: string | null = startFolderId;
  const maxDepth = 100; // Safety limit
  let depth = 0;

  while (currentFolderId && depth < maxDepth) {
    // Check for circular reference
    if (visited.has(currentFolderId)) {
      return {
        folders,
        error: `Circular reference detected in folder hierarchy at folder ID: ${currentFolderId}`
      };
    }
    visited.add(currentFolderId);
    depth++;

    const folderResult = await client.query(
      `SELECT id, name, parent_id, department, is_department, status, trashed_at
       FROM folders WHERE id = $1`,
      [currentFolderId]
    );

    if (folderResult.rows.length === 0) {
      return {
        folders,
        error: `Folder not found: ${currentFolderId}. The folder hierarchy is broken.`
      };
    }

    const folder = folderResult.rows[0] as FolderHierarchy;
    folders.push(folder);

    // Move to parent
    currentFolderId = folder.parent_id;
  }

  if (depth >= maxDepth) {
    return {
      folders,
      error: 'Maximum folder depth exceeded - possible circular reference'
    };
  }

  return { folders };
}

/**
 * Restore a single folder record (set status to active, clear trashed_at)
 */
async function restoreFolderRecord(client: PoolClient, folderId: string): Promise<void> {
  await client.query(
    `UPDATE folders SET status = 'active', trashed_at = NULL WHERE id = $1`,
    [folderId]
  );
}

/**
 * Log an activity entry
 */
async function logActivity(
  client: PoolClient,
  params: {
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    target: string;
    targetType: 'document' | 'folder' | 'user' | 'system';
    ipAddress?: string | null;
    details?: string;
  }
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO activity_logs
       (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        params.userId,
        params.userName,
        params.userRole,
        params.action,
        params.target,
        params.targetType,
        params.ipAddress || null,
        params.details || null
      ]
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Don't throw - activity logging should not break the restore operation
  }
}

/**
 * Log an entry to trash_history table
 */
async function logTrashHistory(
  client: PoolClient,
  params: {
    targetType: string;
    targetId: string;
    targetName: string;
    action: string;
    performedBy: string;
    performedByName: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO trash_history
       (target_type, target_id, target_name, action, performed_by, performed_by_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.targetType,
        params.targetId,
        params.targetName,
        params.action,
        params.performedBy,
        params.performedByName,
        params.metadata ? JSON.stringify(params.metadata) : null
      ]
    );
  } catch (err) {
    console.error('Failed to log trash history:', err);
    // Don't throw - history logging should not break the restore operation
  }
}

/**
 * WITH RECURSIVE SQL alternative for getting folder hierarchy.
 * This can be used for bulk operations or when you need the full tree in one query.
 */
export async function getFolderHierarchyRecursive(
  client: PoolClient,
  folderId: string
): Promise<FolderHierarchy[]> {
  const result = await client.query(`
    WITH RECURSIVE folder_chain AS (
      -- Base case: start with the given folder
      SELECT
        id, name, parent_id, department, is_department, status, trashed_at,
        1 as depth
      FROM folders
      WHERE id = $1

      UNION ALL

      -- Recursive case: get parent folders
      SELECT
        f.id, f.name, f.parent_id, f.department, f.is_department, f.status, f.trashed_at,
        fc.depth + 1
      FROM folders f
      INNER JOIN folder_chain fc ON f.id = fc.parent_id
      WHERE fc.depth < 100  -- Safety limit to prevent infinite recursion
    )
    SELECT id, name, parent_id, department, is_department, status, trashed_at
    FROM folder_chain
    ORDER BY depth ASC
  `, [folderId]);

  return result.rows;
}

export default {
  restoreDocumentWithHierarchy,
  getFolderHierarchyRecursive
};
