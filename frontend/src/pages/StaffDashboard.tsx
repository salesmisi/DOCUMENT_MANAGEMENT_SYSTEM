import React, { useState } from 'react';
import {
  FileText,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Plus } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';
import { useLanguage } from '../context/LanguageContext';
import { UploadModal } from '../components/UploadModal';
export function StaffDashboard() {
  const { documents, folders } = useDocuments();
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const { t } = useLanguage();
  const [showUpload, setShowUpload] = useState(false);
  const visibleFolderIds = new Set(folders.map((folder) => folder.id));
  const myDocs = documents.filter((d) => {
    if (d.status === 'trashed') return false;
    if (d.uploadedById === user?.id || d.isShared) return true;

    if (user?.role === 'staff') {
      const hasVisibleFolderAccess = Boolean(d.folderId && visibleFolderIds.has(d.folderId));
      if ((hasVisibleFolderAccess || d.department === user.department) && (Boolean(d.scannedFrom) || d.status === 'approved')) {
        return true;
      }
    }

    return false;
  });
  const sharedWithMe = documents.filter(
    (d) => d.isShared && d.status !== 'trashed'
  );
  const myPending = myDocs.filter((d) => d.status === 'pending');
  const myApproved = myDocs.filter((d) => d.status === 'approved');
  const myRejected = myDocs.filter((d) => d.status === 'rejected');
  const recentDocs = myDocs.slice(0, 5);
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      archived: 'bg-blue-100 text-blue-700'
    };
    return map[status] || 'bg-gray-100 text-gray-600';
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
      {/* Welcome Banner */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">
            {t('welcome')}{user?.name?.split(' ')[0]}!
          </h2>
          <p className="text-[#C0B87A] text-sm">
            {user?.department} {t('departmentSuffix')}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C0B87A] text-[#005F02] font-semibold rounded-xl hover:bg-[#F2E3BB] transition-colors text-sm">

          <Plus size={18} />
          {t('uploadDocument')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {myDocs.length}
              </p>
              <p className="text-xs text-gray-500">Visible Documents</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {myPending.length}
              </p>
              <p className="text-xs text-gray-500">{t('pending')}</p>
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
              <p className="text-xs text-gray-500">{t('approved')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rejected Docs Alert */}
      {myRejected.length > 0 &&
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">
              {myRejected.length} {t('documentsRejected')}
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              Please review the rejection reasons and resubmit.
            </p>
          </div>
        </div>
      }

      {/* Recent Documents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Recent Visible Documents</h3>
          <button
            onClick={() => navigate('documents')}
            className="text-xs text-[#005F02] hover:underline">

            View all
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentDocs.length === 0 ?
          <div className="py-12 text-center text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No documents yet</p>
              <button
              onClick={() => setShowUpload(true)}
              className="mt-3 px-4 py-2 bg-[#005F02] text-white text-xs rounded-lg hover:bg-[#427A43] transition-colors">

                Upload your first document
              </button>
            </div> :

          recentDocs.map((doc) =>
          <div
            key={doc.id}
            className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">

                <div
              className={`px-2 py-1 rounded text-xs font-bold uppercase flex-shrink-0 ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                  {doc.fileType}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {doc.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {doc.reference} · {doc.date} · v{doc.version}
                  </p>
                  {doc.rejectionReason &&
              <p className="text-xs text-red-500 mt-0.5 truncate">
                      Rejected: {doc.rejectionReason}
                    </p>
              }
                </div>
                <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusBadge(doc.status)}`}>

                  {doc.status}
                </span>
              </div>
          )
          }
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setShowUpload(true)}
          className="bg-[#005F02] text-white rounded-xl p-5 flex items-center gap-3 hover:bg-[#427A43] transition-colors">

          <Upload size={24} />
          <div className="text-left">
            <p className="font-semibold">Upload Document</p>
            <p className="text-xs text-[#C0B87A]">Add a new document</p>
          </div>
        </button>
        <button
          onClick={() => navigate('documents')}
          className="bg-white border border-[#427A43] text-[#005F02] rounded-xl p-5 flex items-center gap-3 hover:bg-[#F2E3BB] transition-colors">

          <Eye size={24} />
          <div className="text-left">
            <p className="font-semibold">Browse Documents</p>
            <p className="text-xs text-gray-500">Search and view files</p>
          </div>
        </button>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} defaultFolderId={undefined} />}
    </div>);

}