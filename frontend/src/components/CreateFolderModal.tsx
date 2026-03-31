import React, { useState, useEffect } from 'react';
import { XIcon, FolderPlusIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';

interface CreateFolderModalProps {
  onClose: () => void;
  parentFolderId?: string | null;
}

export function CreateFolderModal({
  onClose,
  parentFolderId = null
}: CreateFolderModalProps) {
  const { user } = useAuth();
  const { folders, addFolder, addLog } = useDocuments();

  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;
    if (user.role === 'manager') {
      return folders.filter((folder) => folder.department === user.department);
    }
    // Staff can see folders they created or locked folders assigned to them
    return folders.filter((folder) => {
      const createdByRole = (folder as any).createdByRole;
      const isDepartment = (folder as any).isDepartment;
      // Staff can see: their own folders, or admin/manager created folders in their department
      return folder.createdById === user.id ||
             (folder.department === user.department && (createdByRole === 'admin' || createdByRole === 'manager' || isDepartment));
    });
  }, [folders, user]);

  const defaultVisibility = user?.role === 'admin' ? 'admin-only' : user?.role === 'staff' ? 'private' : 'department';

  const [formData, setFormData] = useState({
    name: '',
    parentId: parentFolderId,
    visibility: defaultVisibility
  });

  // Update parentId when prop changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, parentId: parentFolderId }));
  }, [parentFolderId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    addFolder({
      name: formData.name,
      parentId: formData.parentId,
      department: user.department,
      createdBy: user.name,
      createdById: user.id,
      createdByRole: user.role as 'admin' | 'manager' | 'staff',
      visibility: formData.visibility,
      permissions: ['admin', 'manager', 'staff']
    });
    addLog({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOLDER_CREATED',
      target: formData.name,
      targetType: 'folder',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    onClose();
    setFormData({ name: '', parentId: null, visibility: defaultVisibility });
  };

  // Get parent folder name for display
  const parentFolder = parentFolderId ? folders.find(f => f.id === parentFolderId) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#404040]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3BB] dark:bg-[#005F02]/30 rounded-lg flex items-center justify-center">
              <FolderPlusIcon className="text-[#005F02]" size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              Create Folder
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
            />
          </div>

          {/* Parent Folder - Show as read-only if parentFolderId is provided */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Parent Folder
            </label>
            {parentFolderId ? (
              <div className="w-full px-4 py-2.5 border border-gray-200 dark:border-[#404040] rounded-lg text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1e1e1e]">
                {parentFolder?.name || 'Selected Folder'}
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
                {visibleFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Department (fixed to user's department) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Department
            </label>
            <div className="w-full px-4 py-2.5 border border-gray-200 dark:border-[#404040] rounded-lg text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1e1e1e]">
              {user?.department || 'Unassigned'}
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
              disabled={!formData.name}
              className="flex-1 px-4 py-2.5 bg-[#005F02] text-white rounded-lg hover:bg-[#427A43] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}