import React, { useState } from 'react';
import {
  XIcon,
  CheckCircleIcon,
  XCircleIcon,
  FileTextIcon,
  UserIcon,
  CalendarIcon,
  FolderIcon } from
'lucide-react';
import { Document } from '../data/mockData';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document | null;
}
export function ApprovalModal({
  isOpen,
  onClose,
  document
}: ApprovalModalProps) {
  const { user } = useAuth();
  const { approveDocument, rejectDocument, addActivityLog, folders } =
  useDocuments();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  if (!isOpen || !document) return null;
  const folder = folders.find((f) => f.id === document.folderId);
  const handleApprove = () => {
    if (!user) return;
    approveDocument(document.id, user.name);
    addActivityLog({
      action: 'APPROVE',
      userId: user.id,
      userName: user.name,
      documentId: document.id,
      documentTitle: document.title,
      details: 'Document approved',
      ipAddress: '192.168.1.100'
    });
    onClose();
  };
  const handleReject = () => {
    if (!user || !rejectionReason.trim()) return;
    rejectDocument(document.id, rejectionReason);
    addActivityLog({
      action: 'REJECT',
      userId: user.id,
      userName: user.name,
      documentId: document.id,
      documentTitle: document.title,
      details: `Document rejected: ${rejectionReason}`,
      ipAddress: '192.168.1.100'
    });
    setRejectionReason('');
    setShowRejectForm(false);
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-maptech-dark">
            Review Document
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Document Info */}
          <div className="bg-maptech-cream/50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <FileTextIcon className="text-maptech-primary" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-maptech-dark">
                  {document.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {document.reference}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <UserIcon size={16} />
                <span>{document.uploadedBy}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <CalendarIcon size={16} />
                <span>{document.date}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FolderIcon size={16} />
                <span>{folder?.name || 'Unknown'}</span>
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Size:</span> {document.size}
              </div>
            </div>
          </div>

          {/* Rejection Form */}
          {showRejectForm ?
          <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                  Rejection Reason *
                </label>
                <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary resize-none"
                rows={3}
                placeholder="Please provide a reason for rejection..." />

              </div>
              <div className="flex gap-3">
                <button
                onClick={() => setShowRejectForm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">

                  Cancel
                </button>
                <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">

                  <XCircleIcon size={18} />
                  Confirm Rejection
                </button>
              </div>
            </div> :

          <div className="flex gap-3">
              <button
              onClick={() => setShowRejectForm(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium">

                <XCircleIcon size={20} />
                Reject
              </button>
              <button
              onClick={handleApprove}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium">

                <CheckCircleIcon size={20} />
                Approve
              </button>
            </div>
          }
        </div>
      </div>
    </div>);

}