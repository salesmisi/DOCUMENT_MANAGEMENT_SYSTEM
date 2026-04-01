import React, { useState, useMemo } from 'react';
import RequestDeleteModal from '../components/RequestDeleteModal';
import {
  Home,
  Star,
  Clock,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FileText,
  File,
  Image,
  Film,
  FileSpreadsheet,
  Plus,
  Upload,
  Download,
  Eye,
  Trash2,
  Archive,
  MoreVertical,
  Search,
  Grid,
  List,
  Lock,
  X
} from 'lucide-react';
import { Share as ShareIcon } from 'lucide-react';
import { useDocuments, Document } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { UploadModal } from '../components/UploadModal';
import { DeleteFolderModal } from '../components/DeleteFolderModal';
import FilePreview from '../components/FilePreview';
import { useNavigation } from '../App';
import { useLanguage } from '../context/LanguageContext';
import { CreateFolderModal } from '../components/CreateFolderModal';
import { UnifiedSearch } from '../components/UnifiedSearch';
import { ShareDialog } from '../components/ShareDialog';

// Quick Access folder card component
interface QuickAccessCardProps {
  name: string;
  icon: React.ReactNode;
  onClick: () => void;
  isSelected?: boolean;
}

function QuickAccessCard({ name, icon, onClick, isSelected }: QuickAccessCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all min-w-[100px] ${
        isSelected
          ? 'bg-[#005F02]/20 dark:bg-[#005F02]/30 border-2 border-[#005F02]'
          : 'bg-white dark:bg-[#2d2d2d] hover:bg-gray-100 dark:hover:bg-[#3d3d3d] border border-gray-200 dark:border-[#404040]'
      }`}
    >
      <div className={`mb-2 ${isSelected ? 'text-[#005F02]' : 'text-[#dcb67a] dark:text-[#dcb67a]'}`}>
        {icon}
      </div>
      <span className={`text-xs font-medium truncate max-w-[80px] ${
        isSelected ? 'text-[#005F02] dark:text-[#427A43]' : 'text-gray-700 dark:text-gray-200'
      }`}>
        {name}
      </span>
    </button>
  );
}

// Sidebar folder item
interface SidebarFolderItemProps {
  folder: {
    id: string;
    name: string;
    parentId: string | null;
    visibility?: string;
    createdByRole?: 'admin' | 'manager' | 'staff';
    isDepartment?: boolean;
  };
  selectedFolder: string | null;
  selectFolder: (id: string | null) => void;
  getChildren: (parentId: string) => {
    id: string;
    name: string;
    parentId: string | null;
    visibility?: string;
    createdByRole?: 'admin' | 'manager' | 'staff';
    isDepartment?: boolean;
  }[];
  level: number;
  onCreateSubfolder: (parentId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  userRole?: string;
}

function SidebarFolderItem({ folder, selectedFolder, selectFolder, getChildren, level, onCreateSubfolder, onDeleteFolder, userRole }: SidebarFolderItemProps) {
  const [expanded, setExpanded] = useState(level < 1);
  const [isHovered, setIsHovered] = useState(false);
  const children = getChildren(folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolder === folder.id;

  // Lock logic:
  // - Show lock if created by admin or manager
  // - Show lock if it's an auto-generated department folder (isDepartment)
  // - No lock if created by staff AND not a department folder
  const showLock =
    folder.createdByRole === 'admin' ||
    folder.createdByRole === 'manager' ||
    folder.isDepartment === true;

  const canDelete = userRole === 'admin' || userRole === 'manager';

  // Staff can add subfolders to locked folders (assigned to them)
  // Admin/Manager can add subfolders to any folder
  const canAddSubfolder = userRole === 'admin' || userRole === 'manager' || (userRole === 'staff' && showLock);

  return (
    <div className="select-none">
      <div
        className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[#005F02]/20 dark:bg-[#005F02]/30 text-[#005F02] dark:text-[#427A43]'
            : 'hover:bg-gray-100 dark:hover:bg-[#3d3d3d] text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => selectFolder(folder.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#4d4d4d] rounded"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Folder size={16} className={isSelected ? 'text-[#005F02]' : 'text-[#dcb67a]'} />
        <span className="text-sm truncate flex-1">{folder.name}</span>

        {/* Lock icon for admin/manager created or auto-generated folders */}
        {showLock && (
          <Lock size={12} className="text-yellow-500 flex-shrink-0" />
        )}

        {/* Action icons on hover */}
        {isHovered && (canAddSubfolder || canDelete) && (
          <div className="flex items-center gap-0.5 ml-auto">
            {canAddSubfolder && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubfolder(folder.id);
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-[#4d4d4d] rounded text-gray-500 hover:text-[#005F02]"
                title="Create subfolder"
              >
                <Plus size={14} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-[#4d4d4d] rounded text-gray-500 hover:text-red-500"
                title="Delete folder"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {children.map((child) => (
            <SidebarFolderItem
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              selectFolder={selectFolder}
              getChildren={getChildren}
              level={level + 1}
              onCreateSubfolder={onCreateSubfolder}
              onDeleteFolder={onDeleteFolder}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// File type icon helper
function getFileIcon(fileType: string, size: number = 20) {
  const type = fileType.toLowerCase();
  switch (type) {
    case 'pdf':
      return <FileText size={size} className="text-red-500" />;
    case 'docx':
    case 'doc':
      return <FileText size={size} className="text-blue-500" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet size={size} className="text-green-600" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'tiff':
      return <Image size={size} className="text-purple-500" />;
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv':
      return <Film size={size} className="text-indigo-500" />;
    default:
      return <File size={size} className="text-gray-500" />;
  }
}

// Format date helper
function formatDateAccessed(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Activity description helper
function getActivityDescription(doc: Document) {
  if (doc.scannedFrom) return 'Scanned document';
  if (doc.status === 'pending') return 'Pending approval';
  if (doc.status === 'approved') return 'Approved';
  if (doc.status === 'rejected') return 'Rejected';
  return 'Modified';
}

export function DocumentsPage() {
  const { user } = useAuth();
  const {
    documents,
    folders,
    addLog,
    trashDocument,
    archiveDocument,
    deleteFolder,
    addFolder,
    updateDocument
  } = useDocuments();
  const { selectedFolderId, selectFolder } = useNavigation();
  const { t } = useLanguage();

  // State
  const [activeTab, setActiveTab] = useState<'recent' | 'favorites' | 'shared'>('recent');
  const [search, setSearch] = useState('');
  const [searchSelectedDocId, setSearchSelectedDocId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [trashTarget, setTrashTarget] = useState<Document | null>(null);
  const [actionDoc, setActionDoc] = useState<Document | null>(null);
  const [requestDeleteModal, setRequestDeleteModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  // Share dialog state
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = React.useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(ev.clientX, 150), 400);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Filter documents based on user role
  const activeDocuments = useMemo(() => {
    return documents.filter(d => d.status !== 'archived' && d.status !== 'trashed');
  }, [documents]);

  // Role-based folder visibility
  const visibleFolders = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;
    if (user.role === 'manager') {
      return folders.filter(f => f.department === user.department || !f.department);
    }
    return folders.filter(f => f.department === user.department || !f.department);
  }, [folders, user]);

  const rootFolders = visibleFolders.filter(f => f.parentId === null);
  const getChildren = (parentId: string) => visibleFolders.filter(f => f.parentId === parentId);

  // Document access check
  const hasDocumentAccess = (doc: Document) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    // Check if user uploaded the document (using uploadedById not uploadedBy)
    if (doc.uploadedById === user.id) return true;
    // Check if document is shared with the user
    if (doc.isShared) return true;
    if (user.role === 'manager' && doc.department === user.department) return true;

    // Staff access logic
    if (user.role === 'staff' && doc.department === user.department) {
      // Staff can see scanned documents OR approved documents from their own department only
      if (doc.scannedFrom || doc.status === 'approved') return true;
    }
    return false;
  };

  // Filter documents
  const filtered = useMemo(() => {
    let result = activeDocuments.filter(d => hasDocumentAccess(d));

    // For "Shared" tab, show ALL shared documents regardless of folder
    if (activeTab === 'shared') {
      result = result.filter(d => d.isShared);
      // Still apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        result = result.filter(d =>
          d.title.toLowerCase().includes(searchLower) ||
          d.reference?.toLowerCase().includes(searchLower) ||
          d.department?.toLowerCase().includes(searchLower)
        );
      }
      return result;
    }

    // Filter by selected folder (only for non-shared tabs)
    if (selectedFolderId) {
      result = result.filter(d => d.folderId === selectedFolderId);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(d =>
        d.title.toLowerCase().includes(searchLower) ||
        d.reference?.toLowerCase().includes(searchLower) ||
        d.department?.toLowerCase().includes(searchLower)
      );
    }

    // If a specific document was selected from search, prioritize it
    if (searchSelectedDocId) {
      const selectedDoc = result.find(d => d.id === searchSelectedDocId);
      if (selectedDoc) {
        result = [selectedDoc, ...result.filter(d => d.id !== searchSelectedDocId)];
      }
    }


    // Filter by tab
    if (activeTab === 'recent') {
      result = result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (activeTab === 'favorites') {
      result = result.filter(d => d.isFavorite);
    }

    return result;
  }, [activeDocuments, selectedFolderId, search, searchSelectedDocId, activeTab, user]);

  // Quick access folders (top 8 root folders)
  const quickAccessFolders = useMemo(() => {
    return rootFolders.slice(0, 8);
  }, [rootFolders]);

  // Handlers
  const handleFolderSelect = (folderId: string | null) => {
    if (selectFolder) {
      selectFolder(folderId);
      if (folderId) {
        const folder = visibleFolders.find(f => f.id === folderId);
        addLog({
          userId: user?.id || '',
          userName: user?.name || '',
          userRole: user?.role || '',
          action: 'FOLDER_ACCESSED',
          target: folder?.name || folderId,
          targetType: 'folder',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100',
          details: `Accessed folder: ${folder?.name || folderId}`
        });
      }
    }
  };

  const handleView = (doc: Document) => {
    setViewingDoc(doc);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_VIEWED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `Viewed document: ${doc.reference} in folder ${doc.folderId || 'root'}`
    });
  };

  const handleDownload = async (doc: Document) => {
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}.${doc.fileType}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addLog({
        userId: user?.id || '',
        userName: user?.name || '',
        userRole: user?.role || '',
        action: 'DOCUMENT_DOWNLOAD',
        target: doc.title,
        targetType: 'document',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100'
      });
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file.');
    }
  };

  const handleTrash = (doc: Document) => {
    setTrashTarget(doc);
    setActionDoc(null);
  };

  const confirmTrash = (doc: Document) => {
    trashDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_TRASHED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    setTrashTarget(null);
  };

  const handleArchive = (doc: Document) => {
    archiveDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_ARCHIVED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    setActionDoc(null);
  };

  const handleToggleFavorite = (doc: Document) => {
    updateDocument(doc.id, { isFavorite: !doc.isFavorite });
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: doc.isFavorite ? 'DOCUMENT_UNFAVORITED' : 'DOCUMENT_FAVORITED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
  };

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return 'All Documents';
    const folder = visibleFolders.find(f => f.id === folderId);
    return folder?.name || 'Unknown Folder';
  };

  return (
    <div className="flex h-full bg-[#f3f3f3] dark:bg-[#191919]">
      {/* Left Sidebar - Windows Explorer Style */}
      <div
        className="flex-shrink-0 bg-[#f9f9f9] dark:bg-[#202020] border-r border-gray-200 dark:border-[#333] overflow-y-auto relative"
        style={{ width: sidebarWidth }}
      >
        <div className="p-2">
          {/* Home */}
          <div
            className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
              !selectedFolderId
                ? 'bg-[#005F02]/20 dark:bg-[#005F02]/30 text-[#005F02] dark:text-[#427A43]'
                : 'hover:bg-gray-100 dark:hover:bg-[#3d3d3d] text-gray-700 dark:text-gray-300'
            }`}
            onClick={() => handleFolderSelect(null)}
          >
            <Home size={18} className={!selectedFolderId ? 'text-[#005F02]' : 'text-gray-500 dark:text-gray-400'} />
            <span className="text-sm font-medium">Home</span>
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-gray-200 dark:border-[#333]" />

          {/* Folders List */}
          <div className="space-y-0.5">
            {rootFolders.map((folder) => (
              <SidebarFolderItem
                key={folder.id}
                folder={folder}
                selectedFolder={selectedFolderId}
                selectFolder={handleFolderSelect}
                getChildren={getChildren}
                level={0}
                onCreateSubfolder={(parentId) => {
                  setNewFolderParentId(parentId);
                  setShowCreateFolder(true);
                }}
                onDeleteFolder={(folderId) => {
                  setDeleteFolderId(folderId);
                }}
                userRole={user?.role}
              />
            ))}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#005F02]/50 active:bg-[#005F02] transition-colors"
          title="Drag to resize"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Quick Access Section */}
        <div className="p-4 bg-[#f3f3f3] dark:bg-[#191919]">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Quick access</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {quickAccessFolders.map((folder) => (
              <QuickAccessCard
                key={folder.id}
                name={folder.name}
                icon={<Folder size={32} />}
                onClick={() => handleFolderSelect(folder.id)}
                isSelected={selectedFolderId === folder.id}
              />
            ))}
            {quickAccessFolders.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
                No folders available
              </div>
            )}
          </div>
        </div>

        {/* Tabs and Search Bar */}
        <div className="px-4 pb-2 bg-[#f3f3f3] dark:bg-[#191919]">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#333]">
            {/* Tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('recent')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'recent'
                    ? 'text-[#005F02] dark:text-[#427A43] border-[#005F02]'
                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  Recent
                </div>
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'favorites'
                    ? 'text-[#005F02] dark:text-[#427A43] border-[#005F02]'
                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star size={16} />
                  Favorites
                </div>
              </button>
              <button
                onClick={() => setActiveTab('shared')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'shared'
                    ? 'text-[#005F02] dark:text-[#427A43] border-[#005F02]'
                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock size={16} />
                  Shared
                </div>
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Unified Search - searches folders and documents */}
              <UnifiedSearch
                documents={activeDocuments.map(d => ({
                  id: d.id,
                  title: d.title,
                  reference: d.reference,
                  department: d.department,
                }))}
                folders={folders
                  .filter(f => !f.status || f.status !== 'trashed')
                  .map(f => ({
                    id: f.id,
                    name: f.name,
                    department: f.department,
                  }))}
                onSelectFolder={(folderId) => {
                  selectFolder(folderId);
                  setSearch('');
                  setSearchSelectedDocId(null);
                }}
                onSelectDocument={(docId) => {
                  setSearchSelectedDocId(docId);
                  const doc = activeDocuments.find(d => d.id === docId);
                  if (doc) {
                    setSearch(doc.title);
                    setViewingDoc(doc);
                  }
                }}
                onSearch={(query) => {
                  setSearch(query);
                  if (!query) setSearchSelectedDocId(null);
                }}
                placeholder="Search files and folders..."
                className="w-64"
              />

              {/* View Toggle */}
              <div className="flex items-center border border-gray-200 dark:border-[#404040] rounded-md overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 ${viewMode === 'list' ? 'bg-[#005F02] text-white' : 'bg-white dark:bg-[#2d2d2d] text-gray-500 dark:text-gray-400'}`}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 ${viewMode === 'grid' ? 'bg-[#005F02] text-white' : 'bg-white dark:bg-[#2d2d2d] text-gray-500 dark:text-gray-400'}`}
                >
                  <Grid size={16} />
                </button>
              </div>

              {/* Upload Button */}
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#005F02] text-white text-sm font-medium rounded-md hover:bg-[#427A43] transition-colors"
              >
                <Upload size={16} />
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* Current Location */}
        <div className="px-4 py-2 bg-[#f3f3f3] dark:bg-[#191919]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <FolderOpen size={16} className="text-[#dcb67a]" />
            <span>{getFolderName(selectedFolderId)}</span>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <span className="text-gray-500 dark:text-gray-500">{filtered.length} items</span>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-auto bg-white dark:bg-[#1e1e1e] mx-4 mb-4 rounded-lg border border-gray-200 dark:border-[#333]">
          {viewMode === 'list' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#f5f5f5] dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-[#404040]">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide w-44">
                    Date accessed
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide w-40">
                    Activity
                  </th>
                  <th className="px-4 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#333]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <FileText size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                      <p className="text-gray-500 dark:text-gray-400">No documents found</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Upload documents or select a different folder
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                      onClick={() => handleView(doc)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(doc.fileType)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                                {doc.title}
                              </p>
                              {doc.isEncrypted && (
                                <Lock size={12} className="text-yellow-500 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{doc.reference}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {formatDateAccessed(doc.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${
                          doc.status === 'approved' ? 'text-green-600 dark:text-green-400' :
                          doc.status === 'pending' ? 'text-yellow-600 dark:text-yellow-400' :
                          doc.status === 'rejected' ? 'text-red-600 dark:text-red-400' :
                          'text-gray-500 dark:text-gray-400'
                        }`}>
                          {getActivityDescription(doc)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleFavorite(doc)}
                            className={`p-1.5 rounded transition-colors ${
                              doc.isFavorite
                                ? 'text-yellow-500 hover:text-yellow-600'
                                : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/30'
                            }`}
                            title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star size={16} fill={doc.isFavorite ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => handleView(doc)}
                            className="p-1.5 text-gray-400 hover:text-[#005F02] hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                            title="View"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setShareDoc(doc);
                              setShowShareDialog(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title="Share"
                          >
                            <ShareIcon size={16} />
                          </button>
                                {/* Share Dialog Modal */}
                                {user && (
                                  <ShareDialog
                                    isOpen={showShareDialog}
                                    onClose={() => setShowShareDialog(false)}
                                    document={shareDoc}
                                    currentUser={user}
                                  />
                                )}
                          {user?.role === 'admin' && (
                            <>
                              <button
                                onClick={() => handleArchive(doc)}
                                className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors"
                                title="Archive"
                              >
                                <Archive size={16} />
                              </button>
                              <button
                                onClick={() => handleTrash(doc)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                title="Move to Trash"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Grid View */
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-full py-16 text-center">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400">No documents found</p>
                </div>
              ) : (
                filtered.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handleView(doc)}
                    className="group flex flex-col items-center p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a2a2a] cursor-pointer transition-colors relative"
                  >
                    {/* Favorite star in top right */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(doc); }}
                      className={`absolute top-2 right-2 p-1 rounded transition-all ${
                        doc.isFavorite
                          ? 'text-yellow-500 opacity-100'
                          : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-yellow-500'
                      }`}
                      title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star size={14} fill={doc.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <div className="relative mb-2">
                      {getFileIcon(doc.fileType, 48)}
                      {doc.isEncrypted && (
                        <Lock size={12} className="absolute -top-1 -right-1 text-yellow-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 text-center truncate max-w-full">
                      {doc.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center truncate max-w-full">
                      {doc.reference}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formatDateAccessed(doc.date)}
                    </p>
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Download size={14} />
                      </button>
                      {user?.role === 'admin' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTrash(doc); }}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          selectedFolderId={selectedFolderId}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => {
            setShowCreateFolder(false);
            setNewFolderParentId(null);
          }}
          parentFolderId={newFolderParentId}
        />
      )}

      {viewingDoc && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#404040]">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">
                {viewingDoc.title}
              </h3>
              <button
                onClick={() => setViewingDoc(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <FilePreview doc={viewingDoc} />
            </div>
          </div>
        </div>
      )}

      {trashTarget && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Move to Trash?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              "{trashTarget.title}" will be moved to trash. You can restore it later.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setTrashTarget(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmTrash(trashTarget)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFolderId && (() => {
        const folderToDelete = visibleFolders.find(f => f.id === deleteFolderId);
        const children = visibleFolders.filter(f => f.parentId === deleteFolderId);
        return (
          <DeleteFolderModal
            folderName={folderToDelete?.name || ''}
            hasChildren={children.length > 0}
            childCount={children.length}
            onCancel={() => setDeleteFolderId(null)}
            onConfirm={() => {
              deleteFolder(deleteFolderId);
              addLog({
                userId: user?.id || '',
                userName: user?.name || '',
                userRole: user?.role || '',
                action: 'FOLDER_DELETED',
                target: getFolderName(deleteFolderId),
                targetType: 'folder',
                timestamp: new Date().toISOString(),
                ipAddress: '192.168.1.100'
              });
              setDeleteFolderId(null);
            }}
          />
        );
      })()}
    </div>
  );
}
