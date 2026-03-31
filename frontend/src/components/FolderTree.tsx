import React, { useState } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2,
  Lock,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { DeleteFolderModal } from './DeleteFolderModal';
import RequestDeleteModal from './RequestDeleteModal';
import { Folder } from '../context/DocumentContext';
import { AutocompleteSearch } from './AutocompleteSearch';

const INDENT = 10;
const MAX_LVL = 6;

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  showCreateButton?: boolean;
  onCreateFolder?: (parentId: string | null) => void;
}

interface FolderNodeProps {
  folder: Folder;
  level: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  folders: Folder[];
  forceExpandIds?: Set<string> | null;
}

function FolderNode({
  folder,
  level,
  selectedFolderId,
  onSelectFolder,
  folders,
  forceExpandIds = null,
}: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2 || (forceExpandIds ? forceExpandIds.has(folder.id) : false));
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const { deleteFolder } = useDocuments();
  const { user } = useAuth();
  const children = folders.filter((f) => f.parentId === folder.id);
  const sortByName = (x: Folder, y: Folder) =>
    String(x.name || '').localeCompare(String(y.name || ''), undefined, { sensitivity: 'base' });
  children.sort(sortByName);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const isDepartment = (folder as any).is_department || (folder as any).isDepartment || false;
  const isAdminCreated = folder.createdByRole === 'admin';

  // Determine delete permissions:
  // - Admin can always delete
  // - Department folders: only admin can delete
  // - Admin-created subfolders: only admin can delete (hide button for non-admins)
  // - Staff-created folders: show delete request button (not direct delete)
  let canDelete = false;
  let canRequestDelete = false;

  if (user?.role === 'admin') {
    // Admin can delete any folder
    canDelete = true;
  } else if (isDepartment) {
    // Department folders: no delete for non-admins
    canDelete = false;
    canRequestDelete = false;
  } else if (isAdminCreated) {
    // Admin-created subfolders: no delete button for non-admins
    canDelete = false;
    canRequestDelete = false;
  } else if (folder.createdById === user?.id) {
    // User's own folder: can request deletion
    canDelete = false;
    canRequestDelete = true;
  }
  const depth = Math.min(level, MAX_LVL);

  return (
    <div className="ft-node">
      <div
        className={`ft-row group ${
          isSelected ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'
        }`}
        style={{ paddingLeft: `${4 + depth * INDENT}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        {/* Guide lines */}
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="ft-guide" style={{ left: `${4 + (i + 1) * INDENT - 5}px` }} />
        ))}

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="ft-chevron"
          >
            {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        ) : (
          <span className="ft-spacer" />
        )}

        {isExpanded && hasChildren ? (
          <FolderOpenIcon size={15} className={`ft-icon ${isSelected ? 'text-white' : 'text-maptech-accent'}`} />
        ) : (
          <FolderIcon size={15} className={`ft-icon ${isSelected ? 'text-white' : 'text-maptech-accent'}`} />
        )}

        <span className="ft-label" title={folder.name}>{folder.name}</span>
        {isDepartment && (
          <span className="ml-2 text-xs text-gray-400 flex items-center" title="Department Folder — protected">
            <Lock size={12} />
          </span>
        )}

        {canDelete && user?.role === 'admin' && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
            className={`ft-action ${
              isSelected ? 'text-white/70 hover:text-white hover:bg-white/20' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Delete folder"
          >
            <Trash2 size={12} />
          </button>
        )}
        {canRequestDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowRequestDeleteModal(true); }}
            className={`ft-action ${
              isSelected ? 'text-white/70 hover:text-white hover:bg-white/20' : 'text-gray-400 hover:text-orange-600 hover:bg-orange-50'
            }`}
            title="Request folder delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {showDeleteModal && (
        <DeleteFolderModal
          folderName={folder.name}
          hasChildren={hasChildren}
          childCount={children.length}
          onConfirm={() => {
            (async () => {
              if (isSelected) onSelectFolder(null);
              const res = await deleteFolder(folder.id);
              if (res && res.status === 202) {
                alert(res.message || 'Delete approval requested');
              } else if (res && !res.ok) {
                alert(res.error || 'Failed to delete folder');
              }
              setShowDeleteModal(false);
            })();
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
      {showRequestDeleteModal && (
        <RequestDeleteModal
          document={{ id: folder.id, name: folder.name, type: 'folder' }}
          onClose={() => setShowRequestDeleteModal(false)}
          onRequested={() => setShowRequestDeleteModal(false)}
        />
      )}

      {isExpanded && hasChildren && (
        <div className="ft-children">
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              folders={folders}
              forceExpandIds={forceExpandIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  selectedFolderId,
  onSelectFolder,
  showCreateButton,
  onCreateFolder,
}: FolderTreeProps) {
  const { folders } = useDocuments();
  const { user } = useAuth();

  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;

    // Build a set of visible folder IDs including descendants
    const visibleIds = new Set<string>();

    // First pass: find all directly visible root/parent folders
    const directlyVisible = folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (user.role === 'manager') {
        return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      }
      if (user.role === 'staff') {
        if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase()) return true;
        if (vis === 'private' && folder.createdById === user.id) return true;
        return false;
      }
      return false;
    });

    directlyVisible.forEach((f) => visibleIds.add(f.id));

    // Second pass: recursively add all descendants of visible folders
    const addDescendants = (parentId: string) => {
      folders.forEach((f) => {
        if (f.parentId === parentId && !visibleIds.has(f.id)) {
          visibleIds.add(f.id);
          addDescendants(f.id);
        }
      });
    };

    directlyVisible.forEach((f) => addDescendants(f.id));

    // Third pass: add ancestors of visible folders (so tree structure is complete)
    const addAncestors = (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (folder?.parentId && !visibleIds.has(folder.parentId)) {
        visibleIds.add(folder.parentId);
        addAncestors(folder.parentId);
      }
    };

    directlyVisible.forEach((f) => addAncestors(f.id));

    return folders.filter((f) => visibleIds.has(f.id));
  }, [folders, user]);

  const sortByName = (x: Folder, y: Folder) =>
    String(x.name || '').localeCompare(String(y.name || ''), undefined, { sensitivity: 'base' });

  // Search state for filtering folders
  const [searchTerm, setSearchTerm] = React.useState('');
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

  const folderSuggestions = React.useMemo(() =>
    visibleFolders.map((f) => f.name).filter(Boolean),
    [visibleFolders]
  );

  // Build children map for quick traversal
  const childrenMap = React.useMemo(() => {
    const m: Record<string, Folder[]> = {};
    visibleFolders.forEach((f) => {
      const p = f.parentId || 'root';
      if (!m[p]) m[p] = [];
      m[p].push(f);
    });
    return m;
  }, [visibleFolders]);

  // Determine which folder ids should be shown/expanded when searching
  const forceShowIds = React.useMemo(() => {
    if (!normalizedSearch) return null;
    const matched = new Set<string>();

    const addDescendants = (id: string) => {
      const children = childrenMap[id] || [];
      children.forEach((c) => {
        if (!matched.has(c.id)) {
          matched.add(c.id);
          addDescendants(c.id);
        }
      });
    };

    // Map by id for ancestor traversal
    const byId: Record<string, Folder> = {};
    visibleFolders.forEach((f) => (byId[f.id] = f));

    visibleFolders.forEach((f) => {
      if (String(f.name || '').toLowerCase().includes(normalizedSearch)) {
        matched.add(f.id);
        // include descendants
        addDescendants(f.id);
        // include ancestors
        let p = f.parentId;
        while (p) {
          matched.add(p);
          p = byId[p]?.parentId || null;
        }
      }
    });

    return matched;
  }, [normalizedSearch, visibleFolders, childrenMap]);
          {showDeleteModal && user?.role === 'admin' && (
            <DeleteFolderModal
              folderName={folder.name}
              hasChildren={hasChildren}
              childCount={children.length}
              onConfirm={() => {
                (async () => {
                  if (isSelected) onSelectFolder && onSelectFolder(null);
                  await deleteFolder(folder.id);
                  setShowDeleteModal(false);
                })();
              }}
              onCancel={() => setShowDeleteModal(false)}
            />
          )}
          >
            <PlusIcon size={16} />
          </button>
        )}
      </div>

      <div className="mb-3">
        <AutocompleteSearch
          value={searchTerm}
          onChange={setSearchTerm}
          suggestions={folderSuggestions}
          placeholder="Search folders..."
          className="w-full px-2 py-1 border rounded-md"
        />
      </div>

      {/* All Documents */}
      <div
        className={`ft-row cursor-pointer mb-1 ${
          selectedFolderId === null ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'
        }`}
        style={{ paddingLeft: '4px' }}
        onClick={() => onSelectFolder(null)}
      >
        <FolderIcon size={15} className={`ft-icon ${selectedFolderId === null ? 'text-white' : 'text-maptech-accent'}`} />
        <span className="ft-label">All Documents</span>
      </div>

      {/* Scrollable tree */}
      <div className="ft-scroll">
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            level={0}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            folders={visibleFolders}
            forceExpandIds={forceShowIds}
          />
        ))}
      </div>
    </div>);

}