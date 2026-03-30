import React, { useMemo, useState } from 'react';
import { FolderOpen, FolderPlus, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { DeleteFolderModal } from '../components/DeleteFolderModal';

export function StaffFolderDashboard() {
  const { folders, addFolder, deleteFolder, addLog } = useDocuments();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; childCount: number } | null>(null);
  const [newFolder, setNewFolder] = useState({ name: '', parentId: null as string | null, department: user?.department || '' });

  const visibleFolders = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;
    return folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (user.role === 'manager') return folder.department === user.department;
      if (user.role === 'staff') {
        // Staff see department-visible folders for their department
        // or private folders they themselves created.
        if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase()) return true;
        if (vis === 'private' && String(folder.createdById || '') === String(user.id || '')) return true;
        return false;
      }
      return false;
    });
  }, [folders, user]);

  const rootFolders = visibleFolders.filter((f) => f.parentId === null);
  const getChildren = (id: string) => visibleFolders.filter((f) => f.parentId === id);

  const toggle = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const handleCreate = () => {
    if (!newFolder.name.trim()) return alert('Folder name required');
    const dept = user?.role === 'staff' ? user.department : newFolder.department;
    const perms = user?.role === 'staff' ? ['admin', 'manager'] : ['admin', 'manager', 'staff'];
    const visibility = user?.role === 'admin' ? 'admin-only' : user?.role === 'staff' ? 'private' : 'department';
    addFolder({ name: newFolder.name, parentId: newFolder.parentId, department: dept, createdBy: user?.name || '', createdById: user?.id || '', createdByRole: (user?.role as 'admin'|'manager'|'staff') || 'staff', visibility, permissions: perms });
    addLog({ userId: user?.id || '', userName: user?.name || '', userRole: user?.role || '', action: 'FOLDER_CREATED', target: newFolder.name, targetType: 'folder', timestamp: new Date().toISOString(), ipAddress: '127.0.0.1' });
    setNewFolder({ name: '', parentId: null, department: user?.department || '' });
    setShowCreate(false);
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
        addLog({ userId: user?.id || '', userName: user?.name || '', userRole: user?.role || '', action: 'FOLDER_DELETED', target: deleteTarget.name, targetType: 'folder', timestamp: new Date().toISOString(), ipAddress: '127.0.0.1' });
      } else if (res && res.status === 202) {
        addLog({ userId: user?.id || '', userName: user?.name || '', userRole: user?.role || '', action: 'DELETE_REQUESTED', target: deleteTarget.name, targetType: 'folder', timestamp: new Date().toISOString(), ipAddress: '127.0.0.1' });
        alert(res.message || 'Delete approval requested');
      } else {
        alert(res?.error || 'Failed to delete folder');
      }
      setDeleteTarget(null);
    })();
  };

  const FolderRow = ({ folder, depth = 0 }: { folder: (typeof folders)[0]; depth?: number }) => {
    const children = getChildren(folder.id);
    const isExpanded = expanded.includes(folder.id);
    return (
      <div>
        <div className="group flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          {children.length > 0 ? (
            <button onClick={() => toggle(folder.id)} className="text-gray-400">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <FolderOpen size={18} className={depth === 0 ? 'text-[#C0B87A]' : 'text-[#427A43]'} />
          <span className="flex-1 text-sm text-gray-800 font-medium">{folder.name}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { setNewFolder({ name: '', parentId: folder.id, department: folder.department }); setShowCreate(true); }} className="p-1 text-gray-400 hover:text-[#005F02] hover:bg-green-50 rounded transition-colors" title="Add Subfolder"><FolderPlus size={14} /></button>
            <button onClick={() => handleDelete(folder.id, folder.name)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={14} /></button>
          </div>
        </div>
        {isExpanded && children.map((c) => <FolderRow key={c.id} folder={c} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3"><FolderOpen size={28} />My Folders</h2>
          <p className="text-[#C0B87A] text-sm">Create and manage your private folders</p>
        </div>
        {/* Staff should not create root folders */}
        {user?.role !== 'staff' && (
          <button onClick={() => { setNewFolder({ name: '', parentId: null, department: user?.department || '' }); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-[#C0B87A] text-[#005F02] font-semibold text-sm rounded-xl"> <FolderPlus size={18} /> New Folder</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Folder Structure</h3>
          <p className="text-xs text-gray-400">Only folders you can access are shown</p>
        </div>
        <div className="space-y-0.5">
          {rootFolders.map((f) => <FolderRow key={f.id} folder={f} />)}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">{newFolder.parentId ? 'Create Subfolder' : 'Create Folder'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Folder Name *</label>
                <input type="text" value={newFolder.name} onChange={(e) => setNewFolder((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Q1 Reports" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={handleCreate} className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg">Create Folder</button>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <DeleteFolderModal
          folderName={deleteTarget.name}
          hasChildren={deleteTarget.childCount > 0}
          childCount={deleteTarget.childCount}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default StaffFolderDashboard;
