import React, { useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, FileText, X } from 'lucide-react';

interface Props {
  count: number;
  onDismiss: () => void;
  onExported: () => void;
}

export function ActivityLogExportPopup({ count, onDismiss, onExported }: Props) {
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null);

  const handleDownload = async (format: 'excel' | 'pdf') => {
    setDownloading(format);
    try {
      const token = localStorage.getItem('dms_token');
      const endpoint = format === 'pdf' ? 'download-pdf' : 'download';
      const res = await fetch(`http://localhost:5000/api/activity-logs/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      a.download = `Activity_Logs_${new Date().toISOString().split('T')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      // After successful download, archive the logs
      await fetch('http://localhost:5000/api/activity-logs/download-and-archive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      onExported();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-[#005F02] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <AlertTriangle size={22} />
            <h3 className="font-bold text-lg">Activity Log Alert</h3>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <p className="text-gray-700 text-sm leading-relaxed">
            Activity logs reached <span className="font-bold text-[#005F02]">{count} records</span>.
            Please download the Excel report.
          </p>
          <p className="text-gray-500 text-xs">
            The exported logs will be moved to the archive after downloading.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Dismiss
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading !== null}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
              <FileText size={16} />
              {downloading === 'pdf' ? 'Downloading...' : 'PDF'}
            </button>
            <button
              onClick={() => handleDownload('excel')}
              disabled={downloading !== null}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-xl hover:bg-[#004a01] disabled:opacity-50 transition-colors">
              <FileSpreadsheet size={16} />
              {downloading === 'excel' ? 'Downloading...' : 'Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
