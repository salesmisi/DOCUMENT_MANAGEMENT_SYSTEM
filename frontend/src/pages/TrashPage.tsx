import React, { useState, useEffect, useRef } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Clock } from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
export function TrashPage() {
  const { documents, restoreDocument, permanentlyDelete, addLog } =
  useDocuments();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Role-based document access
  const hasAccess = (doc: (typeof documents)[0]) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'manager') return doc.department === user.department;
    // staff: only their own documents
    return doc.uploadedById === user.id;
  };

  const trashed = documents.filter((d) => d.status === 'trashed' && hasAccess(d));
  const filtered = trashed.filter(
    (d) => !search || d.title.toLowerCase().includes(search.toLowerCase())
  );
  const trashSuggestions = React.useMemo(() =>
    trashed.map((d) => d.title).filter(Boolean),
    [trashed]
  );
  //retention////////////////////////////////////////////////////////////////////////////////////
  const getDaysRemaining = (trashedAt?: string) => {
    if (!trashedAt) return 30;
    const daysElapsed = Math.floor(
      (Date.now() - new Date(trashedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, 30 - daysElapsed);
  };

  // Auto-delete trashed documents after 30 days
  const deletedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const trashedDocs = documents.filter((d) => d.status === 'trashed');
    trashedDocs.forEach((doc) => {
      if (deletedIdsRef.current.has(doc.id)) return;
      const daysRemaining = getDaysRemaining(doc.trashedAt);
      if (daysRemaining === 0) {
        deletedIdsRef.current.add(doc.id);
        permanentlyDelete(doc.id);
      }
    });
  }, [documents]);

  const handleRestore = (doc: (typeof documents)[0]) => {
    restoreDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_RESTORED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: 'Restored from trash'
    });
  };
  const handlePermanentDelete = (doc: (typeof documents)[0]) => {
    setConfirmModal({
      message: `Permanently delete "${doc.title}"? This action cannot be undone.`,
      onConfirm: () => {
        permanentlyDelete(doc.id);
        addLog({
          userId: user?.id || '',
          userName: user?.name || '',
          userRole: user?.role || '',
          action: 'DOCUMENT_PERMANENTLY_DELETED',
          target: doc.title,
          targetType: 'document',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100'
        });
        setConfirmModal(null);
      }
    });
  };
  const fileTypeColors: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700',
    docx: 'bg-blue-100 text-blue-700',
    xlsx: 'bg-green-100 text-green-700',
    jpg: 'bg-purple-100 text-purple-700',
    png: 'bg-pink-100 text-pink-700',
    tiff: 'bg-cyan-100 text-cyan-700',
    mp4: 'bg-indigo-100 text-indigo-700',
    mov: 'bg-indigo-100 text-indigo-700',
    avi: 'bg-indigo-100 text-indigo-700',
    mkv: 'bg-indigo-100 text-indigo-700'
  };
  return (
    <div className="space-y-6">
      <div className="bg-gray-700 rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Trash2 size={28} />
            Trash
          </h2>
          <p className="text-gray-300 text-sm">
            Documents are permanently deleted after 30 days
          </p>
        </div>
        {user?.role === 'admin' && trashed.length > 0 &&
        <button
          onClick={() => {
            setConfirmModal({
              message: 'Empty trash? All documents will be permanently deleted.',
              onConfirm: () => {
                trashed.forEach((d) => permanentlyDelete(d.id));
                setConfirmModal(null);
              }
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors">

            <Trash2 size={16} />
            Empty Trash
          </button>
        }
      </div>

      {trashed.length > 0 &&
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle
          size={18}
          className="text-yellow-600 flex-shrink-0 mt-0.5" />

          <div>
            <p className="text-sm font-medium text-yellow-800">
              {trashed.length} document(s) in trash
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Documents are automatically deleted after 30 days. Restore them
              before they expire.
            </p>
          </div>
        </div>
      }

      {/* Search */}
      <AutocompleteSearch
        value={search}
        onChange={setSearch}
        suggestions={trashSuggestions}
        placeholder="Search trash..."
        className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100 max-w-md"
      />

      {/* Trash List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ?
        <div className="py-16 text-center text-gray-400">
            <Trash2 size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Trash is empty</p>
            <p className="text-xs mt-1">
              Deleted documents will appear here for 30 days
            </p>
          </div> :

        <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Document
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">
                  Department
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                  Deleted By
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Expires In
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((doc) => {
              const daysRemaining = getDaysRemaining(doc.trashedAt);
              const isExpiringSoon = daysRemaining <= 7;
              return (
                <tr
                  key={doc.id}
                  className={`hover:bg-gray-50 transition-colors ${isExpiringSoon ? 'bg-red-50/30' : ''}`}>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase opacity-60 ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                          {doc.fileType}
                        </span>
                        <div>
                          <p className="font-medium text-gray-500 line-through">
                            {doc.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {doc.reference}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {doc.department}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                      {doc.uploadedBy}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock
                        size={13}
                        className={
                        isExpiringSoon ? 'text-red-500' : 'text-gray-400'
                        } />

                        <span
                        className={`text-xs font-medium ${isExpiringSoon ? 'text-red-600' : 'text-gray-600'}`}>

                          {daysRemaining === 0 ?
                        'Expires today' :
                        `${daysRemaining} days`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                        onClick={() => handleRestore(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#005F02] border border-[#427A43] rounded-lg hover:bg-[#F0FDF4] transition-colors">

                          <RotateCcw size={12} />
                          Restore
                        </button>
                        {user?.role === 'admin' &&
                      <button
                        onClick={() => handlePermanentDelete(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">

                            <Trash2 size={12} />
                            Delete
                          </button>
                      }
                      </div>
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        }
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Confirm Delete</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>);

}