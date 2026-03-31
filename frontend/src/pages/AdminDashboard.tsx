import React, { useState } from 'react';
import {
  FileText,
  Users,
  Archive,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  FolderOpen,
  Activity,
  Scan,
  Eye
} from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';
import FilePreview from '../components/FilePreview';

export function AdminDashboard() {
  const {
    documents,
    approveDocument,
    rejectDocument,
    addLog,
    activityLogs,
    folders
  } = useDocuments();
  const { user } = useAuth();
  const { navigate } = useNavigation();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);

  const stats = {
    total: documents.filter((d) => d.status !== 'trashed').length,
    pending: documents.filter((d) => d.status === 'pending').length,
    approved: documents.filter((d) => d.status === 'approved').length,
    rejected: documents.filter((d) => d.status === 'rejected').length,
    archived: documents.filter((d) => d.status === 'archived').length,
    trashed: documents.filter((d) => d.status === 'trashed').length,
    users: 0,
    folders: folders.length
  };

  const recentLogs = activityLogs.slice(0, 6);

  const pending = documents.filter((d) => d.status === 'pending');
  const filteredDocs = documents.filter((d) => {
    if (filter === 'all') return ['pending', 'approved', 'rejected'].includes(d.status);
    return d.status === filter;
  });

  const handleApprove = (id: string) => {
    const adminName = user?.name || 'Admin';
    approveDocument(id, adminName);
    addLog({
      userId: user?.id || '',
      userName: adminName,
      userRole: user?.role || '',
      action: 'DOCUMENT_APPROVED_BY_ADMIN',
      target: documents.find((d) => d.id === id)?.title || id,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: 'Approved by admin'
    });
  };

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return;
    const adminName = user?.name || 'Admin';
    rejectDocument(id, rejectReason, adminName);
    addLog({
      userId: user?.id || '',
      userName: adminName,
      userRole: user?.role || '',
      action: 'DOCUMENT_REJECTED_BY_ADMIN',
      target: documents.find((d) => d.id === id)?.title || id,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `Rejected: ${rejectReason}`
    });
    setRejectingId(null);
    setRejectReason('');
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

  const viewingDocument = viewingDoc ? documents.find((d) => d.id === viewingDoc) : null;

  return (
    <div className="space-y-6">
      <div className="bg-[#1e641f] rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-1">Admin Dashboard</h2>
        <p className="text-[#b1b0a7] text-sm">Full system control — Maptech Information Solution Inc.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: stats.total, icon: <FileText size={20} />, color: '#005F02', bg: '#F0FDF4', onClick: () => navigate('documents') },
          { label: 'Pending Approval', value: stats.pending, icon: <Clock size={20} />, color: '#D97706', bg: '#FFFBEB', onClick: () => navigate('documents') },
          { label: 'Total Folders', value: stats.folders, icon: <FolderOpen size={20} />, color: '#0891B2', bg: '#ECFEFF', onClick: undefined },
          { label: 'In Trash', value: stats.trashed, icon: <Trash2 size={20} />, color: '#6B7280', bg: '#F9FAFB', onClick: () => navigate('trash') }
        ].map((stat) => {
          const Tag = stat.onClick ? 'button' : 'div';
          return (
            <Tag key={stat.label} onClick={stat.onClick} className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left ${stat.onClick ? 'hover:shadow-md cursor-pointer' : ''} transition-shadow`}>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: stat.bg, color: stat.color }}>{stat.icon}</div>
                <span className="text-2xl font-bold text-gray-800">{stat.value}</span>
              </div>
              <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
            </Tag>
          );
        })}
      </div>

      {/* Document review section for Admins */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pending.length > 0 && <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{pending.length}</span>}
            </button>
          ))}
        </div>

        <div className="divide-y divide-gray-50">
          {filteredDocs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No documents in this category</p>
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div key={doc.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`px-2 py-1 rounded text-xs font-bold uppercase flex-shrink-0 ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>{doc.fileType}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-gray-800 text-sm">{doc.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{doc.reference} · {doc.department} · Uploaded by {doc.uploadedBy} · {doc.date}</p>
                        {doc.description && <p className="text-xs text-gray-400 mt-1 truncate">{doc.description}</p>}
                        {doc.rejectionReason && <p className="text-xs text-red-500 mt-1">Reason: {doc.rejectionReason}</p>}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : doc.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{doc.status}</span>
                    </div>

                    {doc.status === 'pending' && (
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => handleApprove(doc.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#005F02] text-white text-xs font-medium rounded-lg hover:bg-[#427A43] transition-colors"><CheckCircle size={14} />Approve</button>
                        <button onClick={() => { setRejectingId(doc.id); setRejectReason(''); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"><XCircle size={14} />Reject</button>
                        <button onClick={() => setViewingDoc(doc.id)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"><Eye size={14} />View Details</button>
                      </div>
                    )}

                    {/* Rejection Form */}
                    {rejectingId === doc.id && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-xs font-medium text-red-700 mb-2">Reason for rejection:</p>
                        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this document is being rejected..." className="w-full text-xs border border-red-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-400" rows={3} />

                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleReject(doc.id)} disabled={!rejectReason.trim()} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Confirm Rejection</button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Document Detail Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">{viewingDocument.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{viewingDocument.reference}</p>
            </div>
            <div className="p-6 space-y-3">
              {viewingDocument && (
                <div className="mb-3"><FilePreview doc={viewingDocument} /></div>
              )}
              {viewingDocument.tags && viewingDocument.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">{viewingDocument.tags.map((tag) => <span key={tag} className="px-2 py-0.5 bg-[#F2E3BB] text-[#005F02] text-xs rounded-full">{tag}</span>)}</div>
              )}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              {viewingDocument.status === 'pending' && (
                <>
                  <button onClick={() => { handleApprove(viewingDocument.id); setViewingDoc(null); }} className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">Approve</button>
                  <button onClick={() => { setRejectingId(viewingDocument.id); setViewingDoc(null); }} className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">Reject</button>
                </>
              )}
              <button onClick={() => setViewingDoc(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
