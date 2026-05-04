import React, { useEffect, useState } from 'react';
import { FileText, Film, Maximize2, Minimize2, X, Hash, Building2, User, Calendar, FileType, Clock } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface Props {
  doc?: any;
}

const PREVIEW_TYPES = ['pdf', 'png', 'jpg', 'jpeg', 'mp4'];
const OFFICE_TYPES = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
const ARCHIVE_TYPES = ['zip'];

// Document Info Panel Component
const DocumentInfoPanel: React.FC<{ doc: any }> = ({ doc }) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';

    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return 'N/A';

    return parsed.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const fileType = (doc?.fileType || doc?.file_type || '').toUpperCase();

  return (
    <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <FileText size={16} className="text-[#427A43]" />
        Document Information
      </h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Reference Number */}
        <div className="flex items-start gap-2">
          <Hash size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Reference</p>
            <p className="font-medium text-gray-800">{doc.reference || 'N/A'}</p>
          </div>
        </div>

        {/* Department */}
        <div className="flex items-start gap-2">
          <Building2 size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Department</p>
            <p className="font-medium text-gray-800">{doc.department || 'N/A'}</p>
          </div>
        </div>

        {/* Uploaded By */}
        <div className="flex items-start gap-2">
          <User size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Uploaded By</p>
            <p className="font-medium text-gray-800">{doc.uploadedBy || doc.uploaded_by || 'N/A'}</p>
          </div>
        </div>

        {/* File Type */}
        <div className="flex items-start gap-2">
          <FileType size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">File Type</p>
            <p className="font-medium text-gray-800">{fileType || 'N/A'}</p>
          </div>
        </div>

        {/* Upload Date */}
        <div className="flex items-start gap-2">
          <Calendar size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Upload Date</p>
            <p className="font-medium text-gray-800">{formatDate(doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at)}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-start gap-2">
          <Clock size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              doc.status === 'approved' ? 'bg-green-100 text-green-700' :
              doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
              doc.status === 'rejected' ? 'bg-red-100 text-red-700' :
              doc.status === 'trashed' ? 'bg-gray-100 text-gray-700' :
              doc.status === 'archived' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {doc.status ? doc.status.charAt(0).toUpperCase() + doc.status.slice(1) : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const FilePreview: React.FC<Props> = ({ doc }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fileType = (doc?.fileType || doc?.file_type || '').toLowerCase();
  const isPreviewable = PREVIEW_TYPES.includes(fileType);
  const isOffice = OFFICE_TYPES.includes(fileType);
  const isArchive = ARCHIVE_TYPES.includes(fileType);
  const isImage = ['png', 'jpg', 'jpeg'].includes(fileType);
  const isVideo = ['mp4'].includes(fileType);
  const isPdf = fileType === 'pdf';

  useEffect(() => {
    if (!doc?.id || (!isPreviewable && !isOffice && !isArchive)) return;

    let aborted = false;
    setLoading(true);
    setError(null);

    const fetchPreview = async () => {
      try {
        const token = localStorage.getItem('dms_token');
        const res = await fetch(apiUrl(`/documents/${doc.id}/preview`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (aborted) return;
        if (!res.ok) throw new Error(`Failed to load preview (${res.status})`);
        const blob = await res.blob();
        if (aborted) return;

        if (isOffice) {
          // For Office files, create a download URL for Office Online viewer
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
        } else {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      } catch (e: any) {
        if (!aborted) setError(e.message || 'Failed to load preview');
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.id]);

  // Close fullscreen on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    if (isFullscreen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  if (!doc) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No document selected.</p>
      </div>
    );
  }

  if (!isPreviewable && !isOffice && !isArchive) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-2">
        <FileText size={40} className="text-gray-300" />
        <p className="text-sm text-gray-500">Preview not available for .{fileType} files.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-[#427A43] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-2">
        <FileText size={40} className="text-gray-300" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (isImage && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden relative group">
          <img src={objectUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        <DocumentInfoPanel doc={doc} />
        {isFullscreen && (
          <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="Close (Esc)"
            >
              <X size={24} />
            </button>
            <img src={objectUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </>
    );
  }

  if (isPdf && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] bg-gray-50 rounded-lg overflow-hidden relative group">
          <iframe src={objectUrl} className="w-full h-full border-0 rounded-lg" title={doc.title} />
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        <DocumentInfoPanel doc={doc} />
        {isFullscreen && (
          <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col">
            <div className="flex items-center justify-between p-4 bg-gray-900">
              <h3 className="text-white font-medium truncate flex-1 mr-4">{doc.title}</h3>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2"
                title="Close (Esc)"
              >
                <Minimize2 size={18} />
                <span className="text-sm">Exit Fullscreen</span>
              </button>
            </div>
            <div className="flex-1 p-4">
              <iframe
                src={objectUrl}
                className="w-full h-full border-0 rounded-lg bg-white"
                title={doc.title}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  if (isVideo && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] flex items-center justify-center bg-black rounded-lg overflow-hidden relative group">
          <video src={objectUrl} controls className="max-w-full max-h-full">
            Your browser does not support video playback.
          </video>
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        <DocumentInfoPanel doc={doc} />
        {isFullscreen && (
          <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
              title="Close (Esc)"
            >
              <X size={24} />
            </button>
            <video src={objectUrl} controls autoPlay className="max-w-full max-h-full">
              Your browser does not support video playback.
            </video>
          </div>
        )}
      </>
    );
  }

  if (isOffice && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-3">
          <FileText size={40} className="text-[#427A43]" />
          <p className="text-sm text-gray-600 font-medium">{doc.title}.{fileType}</p>
          <a
            href={objectUrl}
            download={`${doc.title}.${fileType}`}
            className="px-4 py-2 bg-[#005F02] text-white text-sm rounded-lg hover:bg-[#427A43] transition-colors"
          >
            Download to Preview
          </a>
        </div>
        <DocumentInfoPanel doc={doc} />
      </>
    );
  }

  if (isArchive && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-3">
          <FileText size={40} className="text-[#427A43]" />
          <p className="text-sm text-gray-600 font-medium">{doc.title}.{fileType}</p>
          <a
            href={objectUrl}
            download={`${doc.title}.${fileType}`}
            className="px-4 py-2 bg-[#005F02] text-white text-sm rounded-lg hover:bg-[#427A43] transition-colors"
          >
            Download File
          </a>
        </div>
        <DocumentInfoPanel doc={doc} />
      </>
    );
  }

  return (
    <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-500">Preview not available.</p>
    </div>
  );
};

export default FilePreview;
