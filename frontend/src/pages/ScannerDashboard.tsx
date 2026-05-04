import React, { useMemo } from 'react';
import { RefreshCw, ScanLine } from 'lucide-react';
import { ScannerPanel } from '../components/ScannerPanel';
import { useDocuments } from '../context/DocumentContext';

export function ScannerDashboard() {
  const { folders, refreshDocuments } = useDocuments();

  const folderOptions = useMemo(
    () => folders
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        isDepartment: folder.isDepartment,
      })),
    [folders]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#006400] px-6 py-7 shadow-[0_18px_40px_rgba(0,100,0,0.18)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 rounded-xl border border-white/20 bg-white/5 p-2.5 text-white">
              <ScanLine className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Scanner Dashboard</h1>
              <p className="mt-1 text-sm text-[#d7e7b1]">NAPS2 Document Scanning Integration</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void refreshDocuments();
            }}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/28 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <ScannerPanel folders={folderOptions} onUploaded={refreshDocuments} />
    </div>
  );
}