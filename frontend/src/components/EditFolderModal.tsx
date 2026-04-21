import React, { useState, useEffect } from 'react';
import { XIcon, FolderIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments, Folder } from '../context/DocumentContext';

interface EditFolderModalProps {
  folder: Folder;
  onClose: () => void;
  onSave: (folderId: string, updates: Partial<Folder>) => void;
}

export function EditFolderModal({
  folder,
  onClose,
  onSave
}: EditFolderModalProps) {
  const { user } = useAuth();
  const { folders, addLog } = useDocuments();

  const [formData, setFormData] = useState({
    name: folder.name,
    parentId: folder.parentId,
    visibility: (folder as any).visibility || 'department'
  });

  // Update form when folder changes
  useEffect(() => {
    setFormData({
      name: folder.name,
      parentId: folder.parentId,
      visibility: (folder as any).visibility || 'department'
    });
  }, [folder]);

  // Get available parent folders (exclude self and descendants)
  const getDescendantIds = (folderId: string): Set<string> => {
    const ids = new Set<string>();
    const addDescendants = (parentId: string) => {
      folders.forEach(f => {
        if (f.parentId === parentId && !ids.has(f.id)) {
          ids.add(f.id);
          addDescendants(f.id);
        }
      });
    };
    addDescendants(folderId);
    return ids;
  };

  const descendantIds = getDescendantIds(folder.id);

  const availableParentFolders = React.useMemo(() => {
    if (!user) return [];

    // Filter out current folder and its descendants
    let available = folders.filter(f =>
      f.id !== folder.id && !descendantIds.has(f.id)
    );

    // Filter by user role visibility
    if (user.role === 'admin') return available;
    if (user.role === 'manager') {
      return available.filter(f => f.department === user.department);
    }
    // Staff can see folders they created or locked folders in their department
    return available.filter(f => {
      const createdByRole = (f as any).createdByRole;
      const isDepartment = (f as any).isDepartment;
      return f.createdById === user.id ||
             (f.department === user.department && (createdByRole === 'admin' || createdByRole === 'manager' || isDepartment));
    });
  }, [folders, user, folder.id, descendantIds]);

  // Get parent folder name for display
  const parentFolder = folder.parentId ? folders.find(f => f.id === folder.parentId) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name.trim()) return;

    const updates: Partial<Folder> = {
      name: formData.name.trim()
    };

    // Only admin can change visibility
    if (user.role === 'admin') {
      (updates as any).visibility = formData.visibility;
    }

    // Allow changing parent if not a department folder
    if (!(folder as any).isDepartment) {
      updates.parentId = formData.parentId;
    }

    onSave(folder.id, updates);

    addLog({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOLDER_UPDATED',
      target: formData.name,
      targetType: 'folder',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });

    onClose();
  };

  const isDepartmentFolder = (folder as any).isDepartment === true;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#404040]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3BB] dark:bg-[#005F02]/30 rounded-lg flex items-center justify-center">
              <FolderIcon className="text-[#005F02]" size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              Edit Folder
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Folder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Folder Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  name: e.target.value
                }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005F02]/50 focus:border-[#005F02] bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-200"
              placeholder="Enter folder name"
              required
              autoFocus
            />
          </div>

          {/* Parent Folder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Parent Folder
            </label>
            {isDepartmentFolder ? (
              <div className="w-full px-4 py-2.5 border border-gray-200 dark:border-[#404040] rounded-lg text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#1e1e1e]">
                Root (Department folders cannot be moved)
              </div>
            ) : (
              <select
                value={formData.parentId || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    parentId: e.target.value || null
                  }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005F02]/50 focus:border-[#005F02] bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-200"
              >
                <option value="">Root (No parent)</option>
                {availableParentFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Department (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Department
            </label>
            <div className="w-full px-4 py-2.5 border border-gray-200 dark:border-[#404040] rounded-lg text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1e1e1e]">
              {folder.department || 'Unassigned'}
            </div>
          </div>

          {/* Visibility: only editable by admin */}
          {user?.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Visibility
              </label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData((prev) => ({ ...prev, visibility: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005F02]/50 focus:border-[#005F02] bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-200"
              >
                <option value="admin-only">Admin Only</option>
                <option value="department">Department</option>
                <option value="private">Private</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-[#404040] text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#3d3d3d] transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim()}
              className="flex-1 px-4 py-2.5 bg-[#005F02] text-white rounded-lg hover:bg-[#427A43] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
