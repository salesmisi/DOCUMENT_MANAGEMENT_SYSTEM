import React, {
  useState,
  createContext,
  useContext,
  ReactNode,
  useEffect
} from 'react';

export interface Document {
  id: string;
  title: string;
  department: string;
  reference: string;
  date: string;
  uploadedBy: string;
  uploadedById: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived' | 'trashed';
  version: number;
  fileType: 'pdf' | 'doc' | 'docx' | 'xlsx' | 'jpg' | 'png' | 'tiff' | 'mp4' | 'mov' | 'avi' | 'mkv';
  size: string;
  folderId: string;
  needsApproval: boolean;
  approvedBy?: string;
  rejectionReason?: string;
  metadata?: Record<string, string>;
  isEncrypted?: boolean;
  retentionDays?: number;
  trashedAt?: string;
  archivedAt?: string;
  tags?: string[];
  description?: string;
  scannedFrom?: string;
  isFavorite?: boolean;
  isShared?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  department: string;
  createdBy: string;
  createdById: string;
  createdByRole: 'admin' | 'manager' | 'staff';
  visibility: 'private' | 'department' | 'admin-only';
  permissions: string[];
  createdAt: string;
  isDepartment?: boolean;
  status?: 'active' | 'trashed';
  trashedAt?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  target: string;
  targetType: 'document' | 'folder' | 'user' | 'system';
  timestamp: string;
  ipAddress: string;
  details?: string;
}

interface DocumentContextType {
  documents: Document[];
  folders: Folder[];
  activityLogs: ActivityLog[];
  addDocument: (doc: Omit<Document, 'id'> & { id?: string }) => Document;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  approveDocument: (id: string, approvedBy: string) => void;
  rejectDocument: (id: string, reason: string, rejectedBy: string) => void;
  trashDocument: (id: string) => void;
  restoreDocument: (id: string) => void;
  archiveDocument: (id: string) => void;
  permanentlyDelete: (id: string) => void;
  addFolder: (folder: Omit<Folder, 'id' | 'createdAt'>) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<any>;
  addLog: (log: Omit<ActivityLog, 'id'>) => void;
  uploadNewVersion: (id: string, uploadedBy: string) => void;
  refreshDocuments: () => Promise<void>;
  refreshLogs: () => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType>(
  {} as DocumentContextType
);

export function useDocuments() {
  return useContext(DocumentContext);
}

const DOCS_KEY = 'dms_documents';

import { useAuth } from './AuthContext';

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const { token, user, refreshCurrentUser } = useAuth();

  const filterVisibleFolders = (allFolders: any[], effectiveUser: any) => {
    if (!effectiveUser || effectiveUser.role === 'admin') {
      return allFolders;
    }

    const visibleIds = new Set<string>();

    const directlyVisible = allFolders.filter((folder: any) => {
      const vis = folder.visibility || 'private';
      if (vis === 'admin-only') return false;

      if (effectiveUser.role === 'manager') {
        return String(folder.department || '').trim().toLowerCase() === String(effectiveUser.department || '').trim().toLowerCase();
      }

      if (effectiveUser.role === 'staff') {
        if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(effectiveUser.department || '').trim().toLowerCase()) return true;
        if (vis === 'private' && String(folder.created_by_id || folder.createdById || '') === String(effectiveUser.id || '')) return true;
      }

      return false;
    });

    directlyVisible.forEach((folder: any) => visibleIds.add(folder.id));

    const addDescendants = (parentId: string) => {
      allFolders.forEach((folder: any) => {
        const folderParentId = folder.parent_id ?? folder.parentId ?? null;
        if (folderParentId === parentId && !visibleIds.has(folder.id)) {
          visibleIds.add(folder.id);
          addDescendants(folder.id);
        }
      });
    };

    const addAncestors = (folderId: string) => {
      const folder = allFolders.find((entry: any) => entry.id === folderId);
      const parentId = folder?.parent_id ?? folder?.parentId ?? null;
      if (parentId && !visibleIds.has(parentId)) {
        visibleIds.add(parentId);
        addAncestors(parentId);
      }
    };

    directlyVisible.forEach((folder: any) => {
      addDescendants(folder.id);
      addAncestors(folder.id);
    });

    return allFolders.filter((folder: any) => visibleIds.has(folder.id));
  };

  // 🔹 NORMALIZE folder row from DB (snake_case -> camelCase)
  const normalizeFolder = (f: any): Folder => ({
    id: f.id,
    name: f.name,
    parentId: f.parent_id ?? f.parentId ?? null,
    department: f.department,
    createdBy: f.created_by ?? f.createdBy ?? '',
    createdById: f.created_by_id ?? f.createdById ?? '',
    createdByRole: f.created_by_role ?? f.createdByRole ?? 'staff',
    visibility: f.visibility ?? 'private',
    permissions: f.permissions ?? [],
    createdAt: f.created_at ?? f.createdAt ?? '',
    isDepartment: f.is_department ?? f.isDepartment ?? false,
  });

  // 🔹 LOAD FOLDERS FROM BACKEND
  const fetchFolders = async () => {
    try {
      const authToken = token || localStorage.getItem("dms_token");

      const res = await fetch("http://localhost:5000/api/folders", {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });

      const data = await res.json();

      if (data.visibleFolders) {
        setFolders(data.visibleFolders.map(normalizeFolder));
      } else if (data.folders) {
        // If server didn't provide pre-filtered visibleFolders, preserve the same
        // visibility behavior client-side, including descendants and ancestors.
        const stored = localStorage.getItem('dms_current_user');
        const storedUser = stored ? (() => { try { return JSON.parse(stored); } catch { return null; } })() : null;
        const localUser: any = (typeof (window as any).__auth_user__ !== 'undefined') ? (window as any).__auth_user__ : null;
        const effectiveUser = localUser || (typeof user !== 'undefined' ? user : null) || storedUser;

        if (effectiveUser && effectiveUser.role !== 'admin') {
          const visible = filterVisibleFolders(data.folders, effectiveUser);

          // If nothing matched (possible stale/missing user), fall back to showing department folders
          if (visible.length === 0) {
            const deptFolders = data.folders.filter((f: any) => (f.visibility || 'private') === 'department');
            setFolders(deptFolders.map(normalizeFolder));
          } else {
            setFolders(visible.map(normalizeFolder));
          }
        } else {
          setFolders(data.folders.map(normalizeFolder));
        }
      }

    } catch (err) {
      console.error("Failed to fetch folders:", err);
    }
  };

  // 🔹 NORMALIZE document row from DB (snake_case -> camelCase)
  const normalizeDocument = (d: any): Document => ({
    id: d.id,
    title: d.title,
    department: d.department || '',
    reference: d.reference || '',
    date: d.date ? (typeof d.date === 'string' ? d.date.split('T')[0] : d.date) : '',
    uploadedBy: d.uploaded_by ?? d.uploadedBy ?? '',
    uploadedById: d.uploaded_by_id ?? d.uploadedById ?? '',
    status: d.status || 'pending',
    version: d.version || 1,
    fileType: d.file_type ?? d.fileType ?? 'pdf',
    size: d.size || '',
    folderId: d.folder_id ?? d.folderId ?? '',
    needsApproval: d.needs_approval ?? d.needsApproval ?? true,
    approvedBy: d.approved_by ?? d.approvedBy ?? undefined,
    rejectionReason: d.rejection_reason ?? d.rejectionReason ?? undefined,
    metadata: d.metadata ?? undefined,
    isEncrypted: d.is_encrypted ?? d.isEncrypted ?? false,
    retentionDays: d.retention_days ?? d.retentionDays ?? undefined,
    trashedAt: d.trashed_at ?? d.trashedAt ?? undefined,
    archivedAt: d.archived_at ?? d.archivedAt ?? undefined,
    tags: d.tags ?? [],
    description: d.description ?? undefined,
    scannedFrom: d.scanned_from ?? d.scannedFrom ?? undefined,
    isShared: d.is_shared ?? d.isShared ?? false,
  });

  // 🔹 LOAD DOCUMENTS FROM BACKEND
  const fetchDocuments = async () => {
    try {
      const authToken = token || localStorage.getItem("dms_token");
      if (!authToken) {
        // Fallback to localStorage if not authenticated yet
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
        return;
      }
      const res = await fetch("http://localhost:5000/api/documents", {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
      if (!res.ok) {
        // Fallback to localStorage
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
        return;
      }
      const data = await res.json();
      if (data.documents && data.documents.length > 0) {
        setDocuments(data.documents.map(normalizeDocument));
      } else {
        // Fallback to localStorage if DB empty
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      const storedDocs = localStorage.getItem(DOCS_KEY);
      if (storedDocs) setDocuments(JSON.parse(storedDocs));
    }
  };

  useEffect(() => {
    (async () => {
      // If we have a token and the user's department is missing, refresh the user
      try {
        if (token && user && user.role === 'staff' && (!user.department || !String(user.department).trim())) {
          await refreshCurrentUser?.();
        }
      } catch (e) {
        // ignore
      }
      await fetchDocuments();
      await fetchFolders();
      await fetchActivityLogs();
    })();
  }, [token, user, refreshCurrentUser]);

  // Listen for external refresh events (e.g., after creating departments)
  useEffect(() => {
    const onRefresh = () => {
      fetchFolders();
    };
    window.addEventListener('dms-folders-refresh', onRefresh);
    return () => window.removeEventListener('dms-folders-refresh', onRefresh);
  }, []);

  // 🔹 Re-fetch documents when token changes (e.g. after login)
  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem("dms_token");
      if (token) {
        fetchDocuments();
        fetchFolders();
      }
    };

    // Listen for storage events (cross-tab) and custom event (same-tab)
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dms-auth-change', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dms-auth-change', handleStorageChange);
    };
  }, []);

  // 🔹 AUTO SAVE (keep localStorage as cache)
  useEffect(() => {
    if (documents.length > 0) {
      localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
    }
  }, [documents]);

  // Fetch activity logs from backend
  const fetchActivityLogs = async () => {
    try {
      const authToken = token || localStorage.getItem('dms_token');
      if (!authToken) return;
      const res = await fetch('http://localhost:5000/api/activity-logs', {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.logs) setActivityLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    }
  };

  const addLog = async (log: Omit<ActivityLog, 'id'>) => {
    // Optimistically add to local state
    const tempId = `log-${Date.now()}`;
    const newLog: ActivityLog = { ...log, id: tempId };
    setActivityLogs((prev) => [newLog, ...prev]);

    // Send to backend
    try {
      const authToken = token || localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/activity-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          action: log.action,
          target: log.target,
          targetType: log.targetType,
          ipAddress: log.ipAddress,
          details: log.details,
          userName: log.userName,
          userRole: log.userRole
        })
      });
      if (res.ok) {
        const data = await res.json();
        // Replace temp entry with real one from server
        if (data.log) {
          setActivityLogs((prev) =>
            prev.map((l) => (l.id === tempId ? data.log : l))
          );
        }
      }
    } catch (err) {
      console.error('Failed to save activity log:', err);
    }
  };

  const addDocument = (doc: Omit<Document, 'id'> & { id?: string }): Document => {
    const newDoc: Document = {
      ...doc,
      id: doc.id || `doc-${Date.now()}`
    };
    setDocuments((prev) => [newDoc, ...prev]);
    return newDoc;
  };

  const updateDocument = (id: string, updates: Partial<Document>) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const approveDocument = async (id: string, approvedBy: string) => {
    updateDocument(id, { status: 'approved', approvedBy });
    try {
      const authToken = token || localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/documents/${id}/approve`, {
        method: 'PATCH',
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
      if (!res.ok) {
        console.error('Approve failed on server, status:', res.status);
        // Re-sync from DB to get correct state
        await fetchDocuments();
      }
    } catch (err) { console.error('Failed to approve document on server:', err); }
  };

  const rejectDocument = async (id: string, reason: string, rejectedBy: string) => {
    updateDocument(id, { status: 'rejected', rejectionReason: reason, approvedBy: rejectedBy });
    try {
      const authToken = token || localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ reason })
      });
    } catch (err) { console.error('Failed to reject document on server:', err); }
  };

  const trashDocument = async (id: string) => {
    updateDocument(id, { status: 'trashed', trashedAt: new Date().toISOString() });
    try {
      const authToken = token || localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/trash`, {
        method: 'PATCH',
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
    } catch (err) { console.error('Failed to trash document on server:', err); }
  };

  const restoreDocument = async (id: string) => {
    updateDocument(id, { status: 'approved', trashedAt: undefined, archivedAt: undefined });
    try {
      const authToken = token || localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/documents/${id}/restore`, {
        method: 'PATCH',
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
      if (!res.ok) {
        await fetchDocuments();
        await fetchFolders();
        console.error('Failed to restore document on server, status:', res.status);
        return;
      }

      await fetchDocuments();
      await fetchFolders();
    } catch (err) { console.error('Failed to restore document on server:', err); }
  };

  const archiveDocument = async (id: string) => {
    updateDocument(id, { status: 'archived', archivedAt: new Date().toISOString(), retentionDays: 30 });
    try {
      const authToken = token || localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/archive`, {
        method: 'PATCH',
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
    } catch (err) { console.error('Failed to archive document on server:', err); }
  };

  const permanentlyDelete = async (id: string) => {
    deleteDocument(id);
    try {
      const authToken = token || localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}`, {
        method: 'DELETE',
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
      });
    } catch (err) { console.error('Failed to permanently delete document on server:', err); }
  };

  const uploadNewVersion = (id: string, uploadedBy: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              version: d.version + 1,
              uploadedBy,
              date: new Date().toISOString().split('T')[0]
            }
          : d
      )
    );
  };

  // 🔹 CREATE FOLDER (API)
  const addFolder = async (folder: Omit<Folder, 'id' | 'createdAt'>) => {
    try {
      const authToken = token || localStorage.getItem("dms_token");

      const res = await fetch("http://localhost:5000/api/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          name: folder.name,
          parentId: folder.parentId,
          department: folder.department,
          createdBy: folder.createdBy,
          createdById: folder.createdById,
          createdByRole: folder.createdByRole,
          visibility: folder.visibility,
          permissions: folder.permissions
        })
      });

      // Always refetch folders after creation to ensure UI is up to date
      await fetchFolders();

    } catch (err) {
      console.error("Error creating folder:", err);
    }
  };

  const updateFolder = async (id: string, updates: Partial<Folder>) => {
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/folders/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Failed to update folder:', body.error || res.statusText);
        return;
      }

      const body = await res.json();
      const updatedFolder = body.folder;

      // Update local state with the response from server
      setFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updatedFolder } : f))
      );
    } catch (err) {
      console.error('Error updating folder:', err);
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/folders/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) {
        // Delete approval requested
        return { ok: false, status: res.status, message: body.message || 'Delete approval requested', request: body.request };
      }
      if (!res.ok) {
        return { ok: false, status: res.status, error: body.error || `Failed to delete folder (status ${res.status})` };
      }
      // Success — remove from local state
      setFolders((prev) => prev.filter((f) => f.id !== id && f.parentId !== id));
      return { ok: true, status: res.status, message: body.message || 'Folder deleted', folder: body.folder };
    } catch (err) {
      console.error('Failed to delete folder on server:', err);
      return { ok: false, status: 500, error: 'Failed to delete folder. Please try again.' };
    }
  };

  return (
    <DocumentContext.Provider
      value={{
        documents,
        folders,
        activityLogs,
        addDocument,
        updateDocument,
        deleteDocument,
        approveDocument,
        rejectDocument,
        trashDocument,
        restoreDocument,
        archiveDocument,
        permanentlyDelete,
        addFolder,
        updateFolder,
        deleteFolder,
        addLog,
        uploadNewVersion,
        refreshDocuments: fetchDocuments,
        refreshLogs: fetchActivityLogs
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}