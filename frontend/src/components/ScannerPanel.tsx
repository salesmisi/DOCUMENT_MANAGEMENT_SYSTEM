import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Download, Eye, Info, Loader2, Monitor, RotateCw, ScanLine, Settings2, Upload, WifiOff, XCircle } from 'lucide-react';
import { useScanner } from '../hooks/useScanner';
import { apiUrl } from '../utils/api';

const DOCUMENT_TYPE_CODES = [
  { code: 'SI', label: 'Service or Sales Invoice' },
  { code: 'LIQ', label: 'Liquidation' },
  { code: 'REIM', label: 'Reimbursement' },
  { code: 'PRF', label: 'Purchase Requisition Form' },
  { code: 'RECP', label: 'Receipt' },
  { code: 'OR', label: 'Official Receipt' },
  { code: 'CV', label: 'Check Voucher' },
  { code: 'PO', label: 'Purchase Order' },
  { code: 'CR', label: 'Collection Receipt / Cash Receipt' },
  { code: 'DR', label: 'Delivery Receipt' },
];

interface FolderOption {
  id: string;
  name: string;
  parentId?: string | null;
  isDepartment?: boolean;
}

interface ScannerPanelProps {
  folders: FolderOption[];
  onUploaded?: () => Promise<void> | void;
}

export function ScannerPanel({ folders, onUploaded }: ScannerPanelProps) {
  const {
    agentOnline,
    scannerAvailable,
    scannerStatusMessage,
    scanners,
    printers,
    selectedScanner,
    setSelectedScanner,
    loading,
    isDetectingDevices,
    error,
    successMessage,
    previewUrl,
    previewContentType,
    multiPageScans,
    recentScans,
    initializeScanner,
    scanNow,
    scanWithPreviewFlow,
    uploadPreview,
    addMultiPageScan,
    finalizeMultiPageUpload,
    removeMultiPageScan,
    clearMultiPageScans,
    cancelPreview,
    clearMessages,
  } = useScanner();

  const [title, setTitle] = useState('');
  const [departmentFolderId, setDepartmentFolderId] = useState('');
  const [subfolderId, setSubfolderId] = useState('');
  const [dpi, setDpi] = useState(150);
  const [color, setColor] = useState('color');
  const [paperSize, setPaperSize] = useState('A4');
  const [scanSource, setScanSource] = useState('glass');
  const [format, setFormat] = useState('pdf');
  const [multiPageEnabled, setMultiPageEnabled] = useState(false);
  const [showDocumentTypeCodes, setShowDocumentTypeCodes] = useState(false);

  const errorLooksLikeReminder = Boolean(error && /reminder:\s*no paper.*feeder|load paper into the adf/i.test(error));

  const formatRecentScanDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  };

  const departmentFolders = useMemo(() => {
    const flaggedDepartments = folders.filter((folder) => folder.isDepartment);

    if (flaggedDepartments.length > 0) {
      return flaggedDepartments;
    }

    return folders.filter((folder) => !folder.parentId);
  }, [folders]);

  const availableSubfolders = useMemo(() => {
    if (!departmentFolderId) {
      return [] as Array<FolderOption & { depth: number; label: string }>;
    }

    const byParent = new Map<string, FolderOption[]>();

    for (const folder of folders) {
      if (!folder.parentId) {
        continue;
      }

      const siblings = byParent.get(folder.parentId) || [];
      siblings.push(folder);
      byParent.set(folder.parentId, siblings);
    }

    const flatten = (parentId: string, depth: number): Array<FolderOption & { depth: number; label: string }> => {
      const children = (byParent.get(parentId) || []).slice().sort((left, right) => left.name.localeCompare(right.name));

      return children.flatMap((child) => {
        const labelPrefix = depth === 0 ? '— ' : `${'— '.repeat(depth + 1)}`;
        const current = {
          ...child,
          depth,
          label: `${labelPrefix}${child.name}`,
        };

        return [current, ...flatten(child.id, depth + 1)];
      });
    };

    return flatten(departmentFolderId, 0);
  }, [departmentFolderId, folders]);

  const targetFolderId = subfolderId;
  const hasRequiredScanFields = Boolean(title.trim() && departmentFolderId && subfolderId);

  useEffect(() => {
    if (!departmentFolderId && departmentFolders.length > 0) {
      setDepartmentFolderId(departmentFolders[0].id);
    }
  }, [departmentFolderId, departmentFolders]);

  useEffect(() => {
    if (!departmentFolderId) {
      setSubfolderId('');
      return;
    }

    const subfolderStillExists = availableSubfolders.some((folder) => folder.id === subfolderId);

    if (!subfolderStillExists) {
      setSubfolderId('');
    }
  }, [availableSubfolders, departmentFolderId, subfolderId]);

  useEffect(() => {
    if (multiPageEnabled) {
      setFormat('pdf');
      cancelPreview();
      return;
    }

    if (multiPageScans.length > 0) {
      clearMultiPageScans();
    }
  }, [cancelPreview, clearMultiPageScans, multiPageEnabled, multiPageScans.length]);

  const previewIsPdf = useMemo(() => {
    if (!previewUrl) {
      return false;
    }

    return (previewContentType || '').includes('pdf') || previewUrl.toLowerCase().includes('.pdf');
  }, [previewContentType, previewUrl]);

  const validateBeforeScan = () => {
    clearMessages();

    if (!title.trim()) {
      return false;
    }

    if (!departmentFolderId) {
      return false;
    }

    if (!subfolderId) {
      return false;
    }

    return true;
  };

  const handleScanNow = async () => {
    if (!validateBeforeScan()) {
      return;
    }

    await scanNow({
      title,
      folderId: targetFolderId,
      scanner: selectedScanner,
      dpi,
      color,
      paperSize,
      scanSource,
      format,
    });

    await onUploaded?.();
  };

  const handlePreviewScan = async () => {
    clearMessages();

    await scanWithPreviewFlow({
      scanner: selectedScanner,
      dpi,
      color,
      paperSize,
      scanSource,
      format,
    });
  };

  const handleUploadPreview = async () => {
    if (!validateBeforeScan()) {
      return;
    }

    await uploadPreview(title, targetFolderId);
    await onUploaded?.();
  };

  const handleAddMultiPageScan = async () => {
    clearMessages();

    await addMultiPageScan({
      scanner: selectedScanner,
      dpi,
      color,
      paperSize,
      scanSource,
      format: 'pdf',
    });
  };

  const handleFinalizeMultiPage = async () => {
    if (!validateBeforeScan()) {
      return;
    }

    await finalizeMultiPageUpload(title, targetFolderId);
    await onUploaded?.();
  };

  const handleRemoveMultiPageScan = (scanId: string) => {
    clearMessages();
    removeMultiPageScan(scanId);
  };

  const handleDetectScanners = async () => {
    clearMessages();
    await initializeScanner({ forceRefresh: true });
  };

  const handlePreviewRecentScan = async (documentId: string) => {
    try {
      const authToken = localStorage.getItem('dms_token') || localStorage.getItem('token');
      if (!authToken) {
        throw new Error('Authentication required. Please sign in again.');
      }

      const response = await fetch(apiUrl(`/documents/${documentId}/preview`), {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to preview scan.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (previewError) {
      console.error('Preview recent scan error:', previewError);
    }
  };

  const handleDownloadRecentScan = async (documentId: string, title: string, fileType?: string) => {
    try {
      const authToken = localStorage.getItem('dms_token') || localStorage.getItem('token');
      if (!authToken) {
        throw new Error('Authentication required. Please sign in again.');
      }

      const response = await fetch(apiUrl(`/documents/${documentId}/download`), {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${title}.${fileType || 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      console.error('Download recent scan error:', downloadError);
    }
  };

  return (
    <section className="rounded-3xl border border-[#d9d2b0] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#ece6ca] pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#1f3d1c]">Local Scanner Agent</h2>
          <p className="mt-1 text-sm text-[#5f6f52]">
            Set up scanning by installing the Local Agent and NAPS2 on your computer first.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            scannerAvailable
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {scannerAvailable ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
          <span>{scannerStatusMessage}</span>
        </div>
      </div>

      {!scannerAvailable && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scannerStatusMessage}
        </div>
      )}

      {error && (
        <div className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
          errorLooksLikeReminder
            ? 'border border-amber-200 bg-amber-50 text-amber-800'
            : 'border border-red-200 bg-red-50 text-red-700'
        }`}>
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_1fr] xl:items-start">
        <div className="rounded-3xl border border-[#e6e0c6] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#efead1] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef6ea] text-[#2f6b3f]">
                <Monitor size={18} />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-[#20371f]">Connected Devices</h3>
                <p className="text-sm text-[#7b8677]">Choose the scanner you want to use for this scan and review the locally detected printer.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleDetectScanners()}
              disabled={isDetectingDevices}
              className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[#2f6b3f] transition hover:bg-[#f3f7ef] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDetectingDevices ? <Loader2 className="animate-spin" size={16} /> : <RotateCw size={16} />}
              Detect
            </button>
          </div>

          {scanners.length === 0 ? (
            <div className="mt-5 flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#fff2df] px-3 py-1.5 text-sm font-medium text-[#c87400]">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                Not Ready
              </div>
              <p className="text-base text-[#96a0bd]">
                No scanners detected. Connect a scanner and click Detect.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {scanners.map((scanner) => {
                const isSelected = selectedScanner === scanner.id || (!selectedScanner && scanners[0]?.id === scanner.id);
                const isReady = scannerAvailable && agentOnline;

                return (
                  <button
                    key={scanner.id}
                    type="button"
                    onClick={() => setSelectedScanner(scanner.id)}
                    disabled={loading}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-[#73a067] bg-[#f1f8ec] text-[#22421f]'
                        : 'border-[#e3dcc2] bg-[#fcfbf5] text-[#4f5c49] hover:border-[#b9c998] hover:bg-[#f5f8ee]'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{scanner.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs uppercase tracking-[0.08em] text-[#7f8a74]">
                            {scanner.connection || scanner.driver || 'scanner'}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isReady
                              ? 'bg-green-100 text-green-700'
                              : 'bg-[#fff2df] text-[#c87400]'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isReady ? 'bg-green-500' : 'bg-[#f59e0b]'}`} />
                            {isReady ? 'Ready' : 'Not Ready'}
                          </span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={16} className="mt-0.5 text-[#2f6b3f]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 border-t border-[#efead1] pt-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[#eef6ea] text-[#2f6b3f]">
                <Upload size={14} />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-[#20371f]">Detected Printer</h4>
                <p className="text-xs text-[#7b8677]">Local printer information from the scanner agent.</p>
              </div>
            </div>

            {printers.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-[#e3dcc2] bg-[#fcfbf5] px-4 py-3 text-sm text-[#7b8677]">
                No printer detected.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {printers.map((printer) => (
                  <div key={printer.id} className="rounded-2xl border border-[#e3dcc2] bg-[#fcfbf5] px-4 py-3 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#20371f]">{printer.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#7f8a74]">
                          <span className="uppercase tracking-[0.08em]">{printer.connection || 'local'}</span>
                          <span>{printer.driverName || 'printer'}</span>
                          {printer.portName && <span>{printer.portName}</span>}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {printer.status || 'ready'}
                      </span>
                    </div>
                    {printer.isDefault && (
                      <div className="mt-2 text-xs font-medium text-[#2f6b3f]">Default printer</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[#e6e0c6] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#efead1] pb-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef6ea] text-[#4d8754]">
              <Clock3 size={18} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-[#20371f]">Recent Scans</h3>
              <p className="text-sm text-[#7b8677]">See whether the latest scans succeeded or failed, then preview or download successful files.</p>
            </div>
          </div>

          {recentScans.length === 0 ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center gap-3 text-center text-[#9da6bf]">
              <ScanLine size={30} className="opacity-35" />
              <p>No scans yet</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentScans.map((scan) => {
                const documentId = scan.documentId;

                return (
                  <div key={scan.id} className="rounded-2xl border border-[#e7dfc2] bg-[#fcfbf5] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            scan.status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-[#fff2df] text-[#c87400]'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${scan.status === 'success' ? 'bg-green-500' : 'bg-[#f59e0b]'}`} />
                            {scan.status === 'success' ? 'Success' : 'Failed'}
                          </span>
                          <span className="text-xs text-[#8a927f]">{formatRecentScanDate(scan.createdAt)}</span>
                        </div>
                        <div className="mt-2 text-base font-semibold text-[#20371f]">{scan.title}</div>
                        <p className="mt-1 text-sm text-[#6b7680]">{scan.message}</p>
                      </div>

                      {scan.status === 'success' && documentId && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePreviewRecentScan(documentId)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#c7be98] bg-white px-4 py-2 text-sm font-semibold text-[#3c4d2d] transition hover:bg-[#f4f0df]"
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadRecentScan(documentId, scan.title, scan.fileType)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f6f43] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#175736]"
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-[#e6e0c6] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-[#efead1] pb-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef6ea] text-[#2f6b3f]">
            <Settings2 size={18} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-[#20371f]">Scan Settings</h3>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="relative block text-sm font-medium text-[#244120]">
          <div className="flex items-center gap-2">
            <span>Document Title</span>
            <button
              type="button"
              onClick={() => setShowDocumentTypeCodes((current) => !current)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#6b8d62] transition hover:bg-[#eef6ea] hover:text-[#2f6b3f]"
              aria-label="Show document type codes"
            >
              <Info size={14} />
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            placeholder="COMPANY_₱00.00_DATE(JAN10,2026)_REF NO."
            disabled={loading}
          />

          {showDocumentTypeCodes && (
            <div className="absolute left-0 top-full z-20 mt-3 w-full max-w-[270px] rounded-3xl border border-[#d9dfe8] bg-white p-5 shadow-[0_18px_40px_rgba(39,64,52,0.18)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[#223426]">Document Type Codes</h3>
                <button
                  type="button"
                  onClick={() => setShowDocumentTypeCodes(false)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#809080] transition hover:bg-[#f2f6ef] hover:text-[#325137]"
                  aria-label="Close document type codes"
                >
                  <XCircle size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {DOCUMENT_TYPE_CODES.map((item) => (
                  <div key={item.code} className="flex items-start gap-3">
                    <span className="inline-flex min-w-[42px] items-center justify-center rounded-lg bg-[#e7f4e7] px-2 py-1 text-xs font-bold text-[#2f7d32]">
                      {item.code}
                    </span>
                    <span className="text-sm leading-5 text-[#5f6d7a]">{item.label}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-5 text-[#ff4a4a]">
                If no Reference No. is specified, replace it with one of the following types.
              </p>
            </div>
          )}
        </div>

        <label className="block text-sm font-medium text-[#244120]">
          Department / Folder
          <select
            value={departmentFolderId}
            onChange={(event) => {
              setDepartmentFolderId(event.target.value);
              setSubfolderId('');
            }}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading || departmentFolders.length === 0}
          >
            <option value="">Select folder...</option>
            {departmentFolders.map((folder, index) => (
              <option key={`${folder.id}-${index}`} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Subfolder
          <select
            value={subfolderId}
            onChange={(event) => setSubfolderId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading || !departmentFolderId}
          >
            <option value="">Select subfolder...</option>
            {availableSubfolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          DPI
          <select
            value={dpi}
            onChange={(event) => setDpi(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value={150}>150 DPI</option>
            <option value={200}>200 DPI</option>
            <option value={300}>300 DPI</option>
            <option value={600}>600 DPI</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Color
          <select
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value="color">Color</option>
            <option value="grayscale">Grayscale</option>
            <option value="bw">Black & White</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Paper Size
          <select
            value={paperSize}
            onChange={(event) => setPaperSize(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value="Letter">Letter (8.5 x 11&quot;)</option>
            <option value="A4">A4 (8.27 x 11.69&quot;)</option>
            <option value="Legal">Legal (8.5 x 14&quot;)</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Scan Source
          <select
            value={scanSource}
            onChange={(event) => setScanSource(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value="glass">Flatbed (Glass)</option>
            <option value="feeder">ADF (Feeder)</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading || multiPageEnabled}
          >
            <option value="pdf">PDF</option>
            <option value="jpg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </label>
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-3 text-sm text-[#2f4ca8]">
        <input
          type="checkbox"
          checked={multiPageEnabled}
          onChange={(event) => setMultiPageEnabled(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#9fb4e8] text-[#2f64d6] focus:ring-[#2f64d6]"
          disabled={loading}
        />
        <span>
          Combine multiple scans into one PDF. After each page, you can continue scanning and finalize once all pages are captured.
        </span>
      </label>

      {!hasRequiredScanFields && agentOnline && (
        <p className="mt-3 text-sm text-[#7b6f3d]">
          Document title, department folder, and subfolder are required before scanning or uploading.
        </p>
      )}

      {departmentFolderId && availableSubfolders.length === 0 && (
        <p className="mt-3 text-sm text-[#7b6f3d]">
          No subfolders are available under the selected department folder. Create or choose a department with subfolders to continue.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {multiPageEnabled ? (
          <>
            <button
              type="button"
              onClick={() => void handleAddMultiPageScan()}
              disabled={loading || !agentOnline || !scannerAvailable || !hasRequiredScanFields}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f6f43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#175736] disabled:cursor-not-allowed disabled:bg-[#9fb9a9]"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ScanLine size={18} />}
              {multiPageScans.length > 0 ? 'Scan Next Page' : 'Scan First Page'}
            </button>

            <button
              type="button"
              onClick={() => void handleFinalizeMultiPage()}
              disabled={loading || !agentOnline || !scannerAvailable || !hasRequiredScanFields || multiPageScans.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#73a067] bg-[#f1f8ec] px-5 py-3 text-sm font-semibold text-[#28552d] transition hover:bg-[#e5f2de] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={18} />
              Finalize PDF Upload
            </button>

            <button
              type="button"
              onClick={clearMultiPageScans}
              disabled={loading || multiPageScans.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d7d1b4] px-5 py-3 text-sm font-semibold text-[#435233] transition hover:bg-[#f7f4e7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={18} />
              Clear Pages
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleScanNow()}
              disabled={loading || !agentOnline || !scannerAvailable || !hasRequiredScanFields}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f6f43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#175736] disabled:cursor-not-allowed disabled:bg-[#9fb9a9]"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ScanLine size={18} />}
              Scan Now
            </button>

            <button
              type="button"
              onClick={() => void handlePreviewScan()}
              disabled={loading || !agentOnline || !scannerAvailable || !hasRequiredScanFields}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#c7be98] bg-[#f8f5e8] px-5 py-3 text-sm font-semibold text-[#3c4d2d] transition hover:bg-[#efe9d2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ScanLine size={18} />}
              Scan with Preview
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            void initializeScanner({ forceRefresh: true });
          }}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d7d1b4] px-5 py-3 text-sm font-semibold text-[#435233] transition hover:bg-[#f7f4e7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Loader2 size={18} />}
          Refresh Agent
        </button>
      </div>
      </div>

      {loading && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f3f0e1] px-4 py-2 text-sm text-[#465438]">
          <Loader2 className="animate-spin" size={16} />
          {multiPageEnabled ? 'Processing multi-page scan...' : 'Processing scan request...'}
        </div>
      )}

      {multiPageEnabled && multiPageScans.length > 0 && (
        <div className="mt-8 rounded-3xl border border-[#ddd4af] bg-[#fcfbf4] p-5">
          <div className="flex flex-col gap-3 border-b border-[#ece6ca] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#1f3d1c]">Multi-Page PDF</h3>
              <p className="text-sm text-[#627255]">
                {multiPageScans.length} page{multiPageScans.length === 1 ? '' : 's'} captured. Scan more pages or finalize the combined PDF upload.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {multiPageScans.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-[#e3dbc1] bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#355130]">Page {index + 1}</div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMultiPageScan(item.id)}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-[#d9cfae] px-2.5 py-1 text-xs font-semibold text-[#7a5d2f] transition hover:bg-[#fbf3df] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle size={14} />
                    Remove
                  </button>
                </div>
                <iframe
                  src={item.previewUrl}
                  title={`Multi-page scan preview ${index + 1}`}
                  className="h-52 w-full rounded-xl border border-[#efe7ca]"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!multiPageEnabled && previewUrl && (
        <div className="mt-8 rounded-3xl border border-[#ddd4af] bg-[#fcfbf4] p-5">
          <div className="flex flex-col gap-3 border-b border-[#ece6ca] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#1f3d1c]">Preview</h3>
              <p className="text-sm text-[#627255]">Review the scan before uploading it to the selected folder.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleUploadPreview()}
                disabled={loading || !hasRequiredScanFields}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#205f34] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18492a] disabled:cursor-not-allowed disabled:bg-[#9fb9a9]"
              >
                <Upload size={16} />
                Upload
              </button>

              <button
                type="button"
                onClick={cancelPreview}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8cfad] px-4 py-2.5 text-sm font-semibold text-[#5e5a43] transition hover:bg-[#f5f0da] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle size={16} />
                Cancel
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-[#e3dbc1] bg-white">
            {previewIsPdf ? (
              <iframe
                src={previewUrl}
                title="Scanned document preview"
                className="h-[520px] w-full"
              />
            ) : (
              <img
                src={previewUrl}
                alt="Scanned document preview"
                className="max-h-[520px] w-full object-contain"
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}