import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Eye,
  AlertCircle,
  TrendingUp,
  Filter } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';
import { hasApprovalAccess } from '../utils/roles';
import FilePreview from '../components/FilePreview';
export function ManagerDashboard() {
  const { documents, approveDocument, rejectDocument, addLog, refreshDocuments } = useDocuments();
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'>(
    'pending');
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  // redirect unauthorized users to main dashboard
  useEffect(() => {
    if (!hasApprovalAccess(user)) {
      navigate('dashboard');
    }
  }, [user, navigate]);

  // Refresh documents from backend on mount
  useEffect(() => {
    refreshDocuments();
  }, []);

  const pending = documents.filter((d) => d.status === 'pending');
  const myApproved = documents.filter((d) => d.status === 'approved' && d.approvedBy === user?.name);
  const myRejected = documents.filter((d) => d.status === 'rejected' && d.approvedBy === user?.name);
  const filteredDocs = documents.filter((d) => {
    if (filter === 'all') return ['pending', 'approved', 'rejected'].includes(d.status);
    return d.status === filter;
  });
  const handleApprove = (id: string) => {
    approveDocument(id, user?.name || 'Manager');
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_APPROVED',
      target: documents.find((d) => d.id === id)?.title || id,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.102',
      details: 'Document approved by manager'
    });
  };
  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return;
    rejectDocument(id, rejectReason, user?.name || 'Manager');
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_REJECTED',
      target: documents.find((d) => d.id === id)?.title || id,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.102',
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
  const viewingDocument = viewingDoc ?
  documents.find((d) => d.id === viewingDoc) :
  null;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#427A43] rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-1">Manager Dashboard</h2>
        <p className="text-[#F2E3BB] text-sm">
          Review and approve department documents
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {pending.length}
              </p>
              <p className="text-xs text-gray-500">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {myApproved.length}
              </p>
              <p className="text-xs text-gray-500">Approved by Me</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <XCircle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {myRejected.length}
              </p>
              <p className="text-xs text-gray-500">Rejected by Me</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) =>
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>

              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pending.length > 0 &&
            <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pending.length}
                </span>
            }
            </button>
          )}
        </div>

        {/* Document List */}
        <div className="divide-y divide-gray-50">
          {filteredDocs.length === 0 ?
          <div className="py-12 text-center text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No documents in this category</p>
            </div> :

          filteredDocs.map((doc) =>
          <div
            key={doc.id}
            className="p-4 hover:bg-gray-50 transition-colors">

                <div className="flex items-start gap-4">
                  <div
                className={`px-2 py-1 rounded text-xs font-bold uppercase flex-shrink-0 ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                    {doc.fileType}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-gray-800 text-sm">
                          {doc.title}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {doc.reference} · {doc.department} · Uploaded by{' '}
                          {doc.uploadedBy} · {doc.date}
                        </p>
                        {doc.description &&
                    <p className="text-xs text-gray-400 mt-1 truncate">
                            {doc.description}
                          </p>
                    }
                        {doc.rejectionReason &&
                    <p className="text-xs text-red-500 mt-1">
                            Reason: {doc.rejectionReason}
                          </p>
                    }
                      </div>
                      <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : doc.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>

                        {doc.status}
                      </span>
                    </div>

                    {doc.status === 'pending' &&
                <div className="flex items-center gap-2 mt-3">
                        <button
                    onClick={() => handleApprove(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#005F02] text-white text-xs font-medium rounded-lg hover:bg-[#427A43] transition-colors">

                          <CheckCircle size={14} />
                          Approve
                        </button>
                        <button
                    onClick={() => {
                      setRejectingId(doc.id);
                      setRejectReason('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors">

                          <XCircle size={14} />
                          Reject
                        </button>
                        <button
                    onClick={() => setViewingDoc(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">

                          <Eye size={14} />
                          View Details
                        </button>
                      </div>
                }

                    {/* Rejection Form */}
                    {rejectingId === doc.id &&
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-xs font-medium text-red-700 mb-2">
                          Reason for rejection:
                        </p>
                        <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explain why this document is being rejected..."
                    className="w-full text-xs border border-red-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                    rows={3} />

                        <div className="flex gap-2 mt-2">
                          <button
                      onClick={() => handleReject(doc.id)}
                      disabled={!rejectReason.trim()}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">

                            Confirm Rejection
                          </button>
                          <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">

                            Cancel
                          </button>
                        </div>
                      </div>
                }
                  </div>
                </div>
              </div>
          )
          }
        </div>
      </div>

      {/* Document Detail Modal */}
      {viewingDocument &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                {viewingDocument.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {viewingDocument.reference}
              </p>
            </div>
            <div className="p-6 space-y-3">
              {viewingDocument && (
                <div className="mb-3">
                  <FilePreview doc={viewingDocument} />
                </div>
              )}
              {[
            ['Department', viewingDocument.department],
            ['Uploaded By', viewingDocument.uploadedBy],
            ['Date', viewingDocument.date],
            ['File Type', viewingDocument.fileType.toUpperCase()],
            ['Size', viewingDocument.size],
            ['Version', `v${viewingDocument.version}`],
            ['Description', viewingDocument.description || 'N/A']].
            map(([label, value]) =>
            <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-800 font-medium">{value}</span>
                </div>
            )}
              {viewingDocument.tags && viewingDocument.tags.length > 0 &&
            <div className="flex flex-wrap gap-1 pt-2">
                  {viewingDocument.tags.map((tag) =>
              <span
                key={tag}
                className="px-2 py-0.5 bg-[#F2E3BB] text-[#005F02] text-xs rounded-full">

                      {tag}
                    </span>
              )}
                </div>
            }
            </div>
            <div className="p-6 pt-0 flex gap-3">
              {viewingDocument.status === 'pending' &&
            <>
                  <button
                onClick={() => {
                  handleApprove(viewingDocument.id);
                  setViewingDoc(null);
                }}
                className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">

                    Approve
                  </button>
                  <button
                onClick={() => {
                  setRejectingId(viewingDocument.id);
                  setViewingDoc(null);
                }}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">

                    Reject
                  </button>
                </>
            }
              <button
              onClick={() => setViewingDoc(null)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                Close
              </button>
            </div>
          </div>
        </div>
      }
    </div>);

}