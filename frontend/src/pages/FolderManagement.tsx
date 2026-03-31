import React, { useState, useMemo } from 'react';
import {
  FolderOpen,
  FolderPlus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Shield,
  Move,
  Plus,
  Folder } from
'lucide-react';
import { Lock } from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';
import { DeleteFolderModal } from '../components/DeleteFolderModal';
export function FolderManagement() {   
  const { folders, addFolder, updateFolder, deleteFolder, addLog } =
  useDocuments();
  const { user } = useAuth();
  const [expandedFolders, setExpandedFolders] = useState<string[]>([
  'folder-1',
  'folder-2',
  'folder-3',
  'folder-4',
  'folder-5']
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; childCount: number } | null>(null);
  const [newFolder, setNewFolder] = useState({
    name: '',
    parentId: null as string | null,
    department: 'Accounting'
  });
  const visibleFolders = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;

    return folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (vis === 'department') return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      if (vis === 'private') return folder.createdById === user.id;
      return false;
    });
  }, [folders, user]);

  const rootFolders = visibleFolders.filter((f) => f.parentId === null);
  const getChildren = (parentId: string) => visibleFolders.filter((f) => f.parentId === parentId);
  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) =>
    prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };
  const handleCreate = () => {
    if (!newFolder.name.trim()) {
      alert('Folder name is required.');
      return;
    }
    const dept = user?.role === 'staff' ? user.department : newFolder.department;
    const defaultPerms = user?.role === 'staff' ? ['admin', 'manager'] : ['admin', 'manager', 'staff'];
    // If admin creates a folder and assigned a department, make it department-visible.
    let visibility = 'admin-only';
    if (user?.role === 'staff') visibility = 'private';
    else if (newFolder.department && String(newFolder.department).trim() !== '') visibility = 'department';
    addFolder({
      name: newFolder.name,
      parentId: newFolder.parentId,
      department: dept,
      createdBy: user?.name || '',
      createdById: user?.id || '',
      createdByRole: (user?.role as 'admin' | 'manager' | 'staff') || 'staff',
      visibility,
      permissions: defaultPerms
    });
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'FOLDER_CREATED',
      target: newFolder.name,
      targetType: 'folder',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    setNewFolder({
      name: '',
      parentId: null,
      department: 'Accounting'
    });
    setShowCreateModal(false);
  };
  const handleRename = (id: string) => {
    if (!renameValue.trim()) return;
    updateFolder(id, {
      name: renameValue
    });
    setRenamingId(null);
    setRenameValue('');
  };
  const handleDelete = (id: string, name: string) => {
    const children = getChildren(id);
    setDeleteTarget({ id, name, childCount: children.length });
  };
  const confirmDelete = () => {
    (async () => {
      if (!deleteTarget) return;
      const res = await deleteFolder(deleteTarget.id);
      if (res && res.ok) {
        addLog({
          userId: user?.id || '',
          userName: user?.name || '',
          userRole: user?.role || '',
          action: 'FOLDER_DELETED',
          target: deleteTarget.name,
          targetType: 'folder',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100'
        });
      } else if (res && res.status === 202) {
        addLog({
          userId: user?.id || '',
          userName: user?.name || '',
          userRole: user?.role || '',
          action: 'DELETE_REQUESTED',
          target: deleteTarget.name,
          targetType: 'folder',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100'
        });
        alert(res.message || 'Delete approval requested');
      } else {
        alert(res?.error || 'Failed to delete folder');
      }
      setDeleteTarget(null);
    })();
  };
  const deptList = [
  'Accounting',
  'Marketing',
  'Technical Support',
  'Administration',
  'HR'];

  const FolderRow = ({
    folder,
    depth = 0



  }: {folder: (typeof folders)[0];depth?: number;}) => {
    const children = getChildren(folder.id);
    const isExpanded = expandedFolders.includes(folder.id);
    const isRenaming = renamingId === folder.id;
    const { navigate, selectFolder } = useNavigation();
    const isDepartment = (folder as any).is_department || (folder as any).isDepartment || false;
    const canRename = !(isDepartment && user?.role !== 'admin');
    const canDelete = !(isDepartment && user?.role !== 'admin') && (user?.role === 'admin' || folder.createdById === user?.id);

    return (
      <div>
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group transition-colors`}
          style={{
            paddingLeft: `${12 + depth * 20}px`
          }}>

          {children.length > 0 ?
          <button
            onClick={() => toggleExpand(folder.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0">

              {isExpanded ?
            <ChevronDown size={16} /> :

            <ChevronRight size={16} />
            }
            </button> :

          <span className="w-4 flex-shrink-0" />
          }

          <FolderOpen
            size={18}
            className={depth === 0 ? 'text-[#C0B87A]' : 'text-[#427A43]'} />


          {isRenaming ?
          <div className="flex items-center gap-2 flex-1">
              <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(folder.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="flex-1 px-2 py-0.5 border border-[#427A43] rounded text-sm focus:outline-none"
              autoFocus />

              <button
              onClick={() => handleRename(folder.id)}
              className="text-xs text-green-600 font-medium">

                Save
              </button>
              <button
              onClick={() => setRenamingId(null)}
              className="text-xs text-gray-400">

                Cancel
              </button>
            </div> :

          <>
              <button
                onClick={() => {
                  selectFolder && selectFolder(folder.id);
                  navigate('documents');
                }}
                className="flex-1 text-left text-sm text-gray-800 font-medium">
                {folder.name}
              </button>
                {isDepartment && (
                  <span className="ml-2 text-xs text-gray-400 flex items-center" title="Department Folder — protected">
                    <Lock size={12} />
                  </span>
                )}
              <span className="text-xs text-gray-400 hidden group-hover:inline">
                {folder.department}
              </span>
              <span className="text-xs text-gray-300 hidden group-hover:inline ml-2">
                {folder.createdAt}
              </span>
            </>
          }

          {!isRenaming &&
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
              onClick={() => {
                setNewFolder({
                  name: '',
                  parentId: folder.id,
                  department: folder.department
                });
                setShowCreateModal(true);
              }}
              className="p-1 text-gray-400 hover:text-[#005F02] hover:bg-green-50 rounded transition-colors"
              title="Add Subfolder">

                <FolderPlus size={14} />
              </button>
              {canRename && (
                <button
                onClick={() => {
                  setRenamingId(folder.id);
                  setRenameValue(folder.name);
                }}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Rename">

                  <Edit2 size={14} />
                </button>
              )}
              <button
              onClick={() => setShowPermModal(folder.id)}
              className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
              title="Permissions">

                <Shield size={14} />
              </button>
              {canDelete && (
                <button
                onClick={() => handleDelete(folder.id, folder.name)}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete">

                  <Trash2 size={14} />
                </button>
              )}
            </div>
          }
        </div>
        {isExpanded &&
        children.map((child) =>
        <FolderRow key={child.id} folder={child} depth={depth + 1} />
        )}
      </div>);

  };
  return (
    <div className="space-y-6">
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <FolderOpen size={28} />
            Folder Management
          </h2>
          <p className="text-[#C0B87A] text-sm">
            Organize and control document folders
          </p>
        </div>
        <button
          onClick={() => {
            setNewFolder({
              name: '',
              parentId: null,
              department: 'Accounting'
            });
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C0B87A] text-[#005F02] font-semibold text-sm rounded-xl hover:bg-[#F2E3BB] transition-colors">

          <FolderPlus size={18} />
          New Folder
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Folder Structure</h3>
          <p className="text-xs text-gray-400">
            Hover over a folder to see actions
          </p>
        </div>
        <div className="space-y-0.5">
          {rootFolders.map((folder) =>
          <FolderRow key={folder.id} folder={folder} />
          )}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateModal &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                {newFolder.parentId ? 'Create Subfolder' : 'Create Root Folder'}
              </h3>
              {newFolder.parentId &&
            <p className="text-sm text-gray-500 mt-0.5">
                  Under:{' '}
                  {folders.find((f) => f.id === newFolder.parentId)?.name}
                </p>
            }
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Folder Name *
                </label>
                <input
                type="text"
                value={newFolder.name}
                onChange={(e) =>
                setNewFolder((prev) => ({
                  ...prev,
                  name: e.target.value
                }))
                }
                placeholder="e.g. Q1 Reports"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                autoFocus />

              </div>
              {!newFolder.parentId &&
            <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Department
                  </label>
                  {user?.role === 'staff' ? (
                    <input
                      readOnly
                      value={user.department}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                    />
                  ) : (
                    <select
                      value={newFolder.department}
                      onChange={(e) =>
                        setNewFolder((prev) => ({
                          ...prev,
                          department: e.target.value
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">

                      {deptList.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
            }
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={handleCreate}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                Create Folder
              </button>
              <button
              onClick={() => setShowCreateModal(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      {/* Permissions Modal */}
      {showPermModal &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                Folder Permissions
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {folders.find((f) => f.id === showPermModal)?.name}
              </p>
            </div>
            <div className="p-6 space-y-3">
              {['admin', 'manager', 'staff'].map((role) => {
              const folder = folders.find((f) => f.id === showPermModal);
              const hasAccess = folder?.permissions.includes(role) ?? false;
              return (
                <div
                  key={role}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">

                    <div>
                      <p className="text-sm font-medium text-gray-800 capitalize">
                        {role}
                      </p>
                      <p className="text-xs text-gray-500">
                        {role === 'admin' ?
                      'Full access' :
                      role === 'manager' ?
                      'Read/Write' :
                      'Read only'}
                      </p>
                    </div>
                    <button
                    onClick={() => {
                      const folder = folders.find(
                        (f) => f.id === showPermModal
                      );
                      if (!folder) return;
                      const newPerms = hasAccess ?
                      folder.permissions.filter((p) => p !== role) :
                      [...folder.permissions, role];
                      updateFolder(showPermModal, {
                        permissions: newPerms
                      });
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${hasAccess ? 'bg-[#005F02]' : 'bg-gray-300'}`}>

                      <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${hasAccess ? 'translate-x-5' : 'translate-x-0'}`} />

                    </button>
                  </div>);

            })}
            </div>
            <div className="p-6 pt-0">
              <button
              onClick={() => setShowPermModal(null)}
              className="w-full py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                Save Permissions
              </button>
            </div>
          </div>
        </div>
      }
      {deleteTarget && (
        <DeleteFolderModal
          folderName={deleteTarget.name}
          hasChildren={deleteTarget.childCount > 0}
          childCount={deleteTarget.childCount}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>);

}