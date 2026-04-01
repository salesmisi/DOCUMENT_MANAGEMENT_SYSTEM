import React, { useState } from 'react';
import {
  FileTextIcon,
  FileSpreadsheetIcon,
  ImageIcon,
  MoreVerticalIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArchiveIcon,
  Trash2Icon,
  EyeIcon,
  EditIcon,
  DownloadIcon,
  Share as ShareIcon
} from 'lucide-react';
import { Document } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import RequestDeleteModal from './RequestDeleteModal';
interface DocumentCardProps {
  document: Document;
  onView?: (doc: Document) => void;
  onEdit?: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
  onArchive?: (doc: Document) => void;
  onApprove?: (doc: Document) => void;
  showActions?: boolean;
}
const fileTypeIcons: Record<string, React.ReactNode> = {
  pdf: <FileTextIcon className="text-red-500" size={24} />,
  docx: <FileTextIcon className="text-blue-500" size={24} />,
  xlsx: <FileSpreadsheetIcon className="text-green-600" size={24} />,
  jpg: <ImageIcon className="text-purple-500" size={24} />,
  png: <ImageIcon className="text-purple-500" size={24} />
};
const statusConfig: Record<
  string,
  {
    icon: React.ReactNode;
    color: string;
    bg: string;
  }> =
{
  pending: {
    icon: <ClockIcon size={14} />,
    color: 'text-amber-600',
    bg: 'bg-amber-100'
  },
  approved: {
    icon: <CheckCircleIcon size={14} />,
    color: 'text-green-600',
    bg: 'bg-green-100'
  },
  rejected: {
    icon: <XCircleIcon size={14} />,
    color: 'text-red-600',
    bg: 'bg-red-100'
  },
  archived: {
    icon: <ArchiveIcon size={14} />,
    color: 'text-gray-600',
    bg: 'bg-gray-100'
  },
  trashed: {
    icon: <Trash2Icon size={14} />,
    color: 'text-gray-500',
    bg: 'bg-gray-100'
  }
};
export function DocumentCard({
  document,
  onView,
  onEdit,
  onDelete,
  onArchive,
  onApprove,
  showActions = true
}: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const status = statusConfig[document.status];
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start gap-4">
        {/* File Icon & Share Button */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
            {fileTypeIcons[document.fileType] || <FileTextIcon className="text-gray-400" size={24} />}
          </div>
          {/* Share Icon Button */}
          <button
            className="mt-1 p-1 rounded-full hover:bg-gray-200 text-gray-500 hover:text-blue-600 transition-colors"
            title="Share"
            onClick={() => alert('Share functionality coming soon!')}
          >
            <ShareIcon size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium text-maptech-dark truncate">
                {document.title}
              </h4>
              <p className="text-sm text-gray-500 mt-0.5">
                {document.reference}
              </p>
            </div>

            {/* Actions Menu */}
            {showActions &&
            <div className="relative">
                <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

                  <MoreVerticalIcon size={18} />
                </button>

                {showMenu &&
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {onView &&
                <button
                  onClick={() => {
                    onView(document);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">

                        <EyeIcon size={16} />
                        View
                      </button>
                }
                    {onEdit &&
                <button
                  onClick={() => {
                    onEdit(document);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">

                        <EditIcon size={16} />
                        Edit
                      </button>
                }
                    {onApprove && document.status === 'pending' &&
                <button
                  onClick={() => {
                    onApprove(document);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-maptech-primary hover:bg-gray-50">

                        <CheckCircleIcon size={16} />
                        Review
                      </button>
                }
                    {onArchive &&
                <button
                  onClick={() => {
                    onArchive(document);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">

                        <ArchiveIcon size={16} />
                        Archive
                      </button>
                }
                    {onDelete && user?.role === 'admin' && (
                      <button
                        onClick={() => {
                          onDelete(document);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                        <Trash2Icon size={16} />
                        Delete
                      </button>
                    )}
                    {onDelete && user?.role !== 'admin' && (
                      <button
                        onClick={() => {
                          setShowRequestDeleteModal(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50">
                        <Trash2Icon size={16} />
                        Request Delete
                      </button>
                    )}
                    {/* Request Delete Modal for staff */}
                    {showRequestDeleteModal && (
                      <RequestDeleteModal
                        document={document}
                        onClose={() => setShowRequestDeleteModal(false)}
                        onRequested={() => setShowRequestDeleteModal(false)}
                      />
                    )}
                }
                  </div>
              }
              </div>
            }
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span>{document.department}</span>
            <span>•</span>
            <span>{document.date}</span>
            <span>•</span>
            <span>{document.size}</span>
            <span>•</span>
            <span>v{document.version}</span>
          </div>

          {/* Status & Uploader */}
          <div className="flex items-center justify-between mt-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>

              {status.icon}
              <span className="capitalize">{document.status}</span>
            </span>
            <span className="text-xs text-gray-500">
              by {document.uploadedBy}
            </span>
          </div>

          {/* Rejection Reason */}
          {document.status === 'rejected' && document.rejectionReason &&
          <div className="mt-3 p-2 bg-red-50 rounded-lg">
              <p className="text-xs text-red-600">
                <strong>Reason:</strong> {document.rejectionReason}
              </p>
            </div>
          }
        </div>
      </div>
    </div>);

}