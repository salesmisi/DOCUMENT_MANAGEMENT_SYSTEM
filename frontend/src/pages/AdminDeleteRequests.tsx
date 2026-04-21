import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';
import { Trash2, CheckCircle, XCircle, Eye, Clock, FileText, Folder, AlertTriangle, X } from 'lucide-react';
import FilePreview from '../components/FilePreview';
import { apiUrl } from '../utils/api';

const API_URL = apiUrl('');

interface DeleteRequest {
  id: string;
  type: 'folder' | 'document';
  target_id: string;
  requested_by: string;
  department: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  requested_by_name?: string;
  resolvedTarget?: any;
}

export default function AdminDeleteRequests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, denied: 0, all: 0 });
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  const fetchRequests = async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_URL}/delete-requests${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = await res.json();
      try {
        const [docsRes, foldersRes] = await Promise.all([
          fetch(`${API_URL}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/folders`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const docsData = docsRes.ok ? await docsRes.json().catch(() => ({})) : {};
        const foldersData = foldersRes.ok ? await foldersRes.json().catch(() => ({})) : {};

        const docsList: any[] = docsData.documents || [];
        const foldersList: any[] = foldersData.folders || [];

        const docById = new Map(docsList.map((d: any) => [String(d.id), d]));
        const folderById = new Map(foldersList.map((f: any) => [String(f.id), f]));

        const enriched = data.map((r: any) => {
          try {
            if (r.type === 'document') {
              const doc = docById.get(String(r.target_id));
              if (doc) return { ...r, department: r.department || doc.department || null, resolvedTarget: doc };
            }
            if (r.type === 'folder') {
              const f = folderById.get(String(r.target_id));
              if (f) return { ...r, department: r.department || f.department || null, resolvedTarget: f };
            }
          } catch (e) {}
          return { ...r, department: r.department || null };
        });

        setRequests(enriched);
      } catch (e) {
        setRequests(data);
      }
      try { await loadCounts(); } catch (_) {}
    } catch (err: any) {
      setError(err.message || 'Error fetching requests');
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const res = await fetch(`${API_URL}/delete-requests?status=all`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const pending = data.filter((r: any) => r.status === 'pending').length;
      const approved = data.filter((r: any) => r.status === 'approved').length;
      const denied = data.filter((r: any) => r.status === 'denied').length;
      setCounts({ pending, approved, denied, all: data.length });
    } catch (e) {}
  };

  useEffect(() => { fetchRequests(statusFilter); }, [token, statusFilter]);

  const { navigate, selectFolder } = useNavigation();

  const handleAction = async (id: string, action: 'approve' | 'deny') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/delete-requests/${id}/${action}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      await fetchRequests(statusFilter);
    } catch (err: any) {
      setError(err.message || `Error on ${action}`);
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      denied: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {status === 'denied' ? 'rejected' : status}
      </span>
    );
  };

  const fileTypeBadge = (type: string, target?: any) => {
    const ext = (target?.file_type || target?.fileType || type || '').toUpperCase();
    const colors: Record<string, string> = {
      PDF: 'bg-red-500',
      PNG: 'bg-red-400',
      JPG: 'bg-blue-500',
      JPEG: 'bg-blue-500',
      MP4: 'bg-blue-600',
      DOC: 'bg-blue-700',
      DOCX: 'bg-blue-700',
      PPT: 'bg-orange-500',
      PPTX: 'bg-orange-500',
      FOLDER: 'bg-[#427A43]',
    };
    const label = type === 'folder' ? 'FOLDER' : ext;
    const bg = colors[label] || 'bg-gray-500';
    return (
      <span className={`${bg} text-white text-[10px] font-bold px-2 py-1 rounded-md`}>
        {label || type.toUpperCase()}
      </span>
    );
  };

  const tabs = [
    { key: 'pending' as const, label: 'Pending', count: counts.pending },
    { key: 'approved' as const, label: 'Approved', count: counts.approved },
    { key: 'denied' as const, label: 'Rejected', count: counts.denied },
    { key: 'all' as const, label: 'All', count: counts.all },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Trash2 size={24} />
            Delete Requests
          </h2>
          <p className="text-green-100 text-sm">Review and manage deletion requests from staff</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{counts.pending}</div>
          <div className="text-green-200 text-xs">Pending review</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex-1 py-3.5 text-sm font-semibold text-center transition-colors relative ${
                statusFilter === tab.key
                  ? 'text-[#005F02] bg-[#f0fdf4]'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                  statusFilter === tab.key ? 'bg-[#005F02] text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
              {statusFilter === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#005F02]" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {loading && requests.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-[#427A43] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading requests...</p>
              </div>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Trash2 size={48} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium">No {statusFilter === 'all' ? '' : statusFilter === 'denied' ? 'rejected' : statusFilter} requests</p>
              <p className="text-xs text-gray-400 mt-1">Requests will appear here when staff submit them</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const title = req.resolvedTarget?.title || req.resolvedTarget?.name || req.target_id;
                const reference = req.resolvedTarget?.reference || null;
                const uploadedBy = req.resolvedTarget?.uploaded_by || req.resolvedTarget?.uploadedBy || req.resolvedTarget?.created_by || null;
                const date = req.resolvedTarget?.date || req.resolvedTarget?.created_at || null;

                return (
                  <div key={req.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4">
                    <div className="flex items-start gap-4">
                      {/* File Type Badge */}
                      <div className="flex-shrink-0 mt-1">
                        {fileTypeBadge(req.type, req.resolvedTarget)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 text-sm">{title}</h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {reference && <span>{reference} · </span>}
                              {req.department && <span>{req.department} · </span>}
                              {uploadedBy && <span>Requested by {req.requested_by_name || uploadedBy} · </span>}
                              {!uploadedBy && req.requested_by_name && <span>Requested by {req.requested_by_name} · </span>}
                              {date ? new Date(date).toLocaleDateString('en-CA') : new Date(req.created_at).toLocaleDateString('en-CA')}
                            </p>
                            {req.reason && (
                              <p className="text-xs text-gray-400 mt-1 italic">Reason: {req.reason}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {statusBadge(req.status)}
                          </div>
                        </div>

                        {/* Actions */}
                        {req.status === 'pending' && (
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() => handleAction(req.id, 'approve')}
                              disabled={loading}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#005F02] text-white text-xs font-semibold rounded-lg hover:bg-[#427A43] transition-colors disabled:opacity-50"
                            >
                              <CheckCircle size={13} />
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.id, 'deny')}
                              disabled={loading}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              <XCircle size={13} />
                              Reject
                            </button>
                            <button
                              onClick={() => {
                                if (req.type === 'document' && req.resolvedTarget) {
                                  // Show preview modal for documents
                                  setPreviewDoc(req.resolvedTarget);
                                } else if (req.type === 'folder') {
                                  // For folders, navigate to the folder
                                  const fid = req.resolvedTarget?.id || req.target_id;
                                  if (fid && selectFolder) selectFolder(fid);
                                  navigate('documents');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Eye size={13} />
                              View Details
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#404040]">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">
                {previewDoc.title || previewDoc.name || 'Document Preview'}
              </h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#3d3d3d] rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <FilePreview doc={{
                id: previewDoc.id,
                title: previewDoc.title || previewDoc.name,
                fileType: previewDoc.file_type || previewDoc.fileType || 'pdf',
                reference: previewDoc.reference,
                department: previewDoc.department,
                date: previewDoc.date || previewDoc.created_at,
                uploadedBy: previewDoc.uploaded_by || previewDoc.uploadedBy,
                uploadedById: previewDoc.uploaded_by_id || previewDoc.uploadedById,
                status: previewDoc.status,
                version: previewDoc.version || 1,
                size: previewDoc.size || '0',
                folderId: previewDoc.folder_id || previewDoc.folderId,
                needsApproval: previewDoc.needs_approval || previewDoc.needsApproval || false
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
