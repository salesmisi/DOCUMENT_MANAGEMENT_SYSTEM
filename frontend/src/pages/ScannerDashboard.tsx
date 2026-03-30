import React, { useState, useEffect, useCallback } from 'react';
import {
  Scan,
  Settings,
  CheckCircle,
  FileText,
  RefreshCw,
  Zap,
  Monitor,
  AlertCircle,
  Clock,
  XCircle,
  Eye,
  Download,
  Loader2,
  Printer,
  Usb,
  HelpCircle
} from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { formatDate } from '../utils/locale';
import { useAuth } from '../context/AuthContext';

interface Scanner {
  id: string;
  name: string;
  type: 'scanner' | 'multifunction';
  status: 'ready' | 'busy' | 'offline';
  connection: 'USB' | 'Local' | 'NAPS2' | 'Other';
}

interface ScanSession {
  id: string;
  title: string;
  format: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed' | 'cancelled';
  documentId?: string;
  reference?: string;
  fileType?: string;
  errorMessage?: string;
  created_at: string;
  completed_at?: string;
}

interface LastScannedDoc {
  id: string;
  title: string;
  reference: string;
  fileType: string;
  size: string;
  status: string;
  scannedFrom: string;
  createdAt: string;
}

export function ScannerDashboard() {
  const { addDocument, folders, addLog, refreshDocuments } = useDocuments();
  const { user } = useAuth();

  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [naps2Installed, setNaps2Installed] = useState<boolean | null>(null);
  const [naps2Path, setNaps2Path] = useState<string>('');

  const [fileFormat, setFileFormat] = useState('pdf');
  const [parentFolder, setParentFolder] = useState('');
  const [destFolder, setDestFolder] = useState('');
  const [docTitle, setDocTitle] = useState('');

  // Scan quality settings
  const [scanDpi, setScanDpi] = useState<number>(300);
  const [colorMode, setColorMode] = useState<string>('color');
  const [paperSize, setPaperSize] = useState<string>('letter');
  // scanSource: 'auto', 'glass', 'feeder'
  const [scanSource, setScanSource] = useState<string>('auto');

  const [recentScans, setRecentScans] = useState<ScanSession[]>([]);
  const [lastScannedDoc, setLastScannedDoc] = useState<LastScannedDoc | null>(null);

  const [scanning, setScanning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [multiPageMode, setMultiPageMode] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [scannedPages, setScannedPages] = useState(0);
  const [finalizingBatch, setFinalizingBatch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingScanners, setLoadingScanners] = useState(false);
  const [watcherStatus, setWatcherStatus] = useState<{
    running: boolean;
    directory: string;
    pendingScans: number;
  } | null>(null);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  const API_BASE = 'http://localhost:5000/api';

  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;

    // Build a set of visible folder IDs including descendants
    const visibleIds = new Set<string>();

    // First pass: find all directly visible root/parent folders
    const directlyVisible = folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (user.role === 'manager') {
        return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      }
      if (user.role === 'staff') {
        if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase()) return true;
        if (vis === 'private' && folder.createdById === user.id) return true;
        return false;
      }
      return false;
    });

    directlyVisible.forEach((f) => visibleIds.add(f.id));

    // Second pass: recursively add all descendants of visible folders
    const addDescendants = (parentId: string) => {
      folders.forEach((f) => {
        if (f.parentId === parentId && !visibleIds.has(f.id)) {
          visibleIds.add(f.id);
          addDescendants(f.id);
        }
      });
    };

    directlyVisible.forEach((f) => addDescendants(f.id));

    return folders.filter((f) => visibleIds.has(f.id));
  }, [folders, user]);

  const rootFolders = visibleFolders.filter((f) => f.parentId === null);

  // Get all descendant subfolders with hierarchy depth
  const subFoldersWithDepth = React.useMemo(() => {
    if (!parentFolder) return [];

    const result: { folder: typeof visibleFolders[0]; depth: number; path: string }[] = [];

    // Recursive function to get all descendants
    const getDescendants = (parentId: string, depth: number, pathPrefix: string) => {
      const children = visibleFolders.filter((f) => f.parentId === parentId);
      for (const child of children) {
        const currentPath = pathPrefix ? `${pathPrefix} / ${child.name}` : child.name;
        result.push({ folder: child, depth, path: currentPath });
        getDescendants(child.id, depth + 1, currentPath);
      }
    };

    getDescendants(parentFolder, 1, '');
    return result;
  }, [visibleFolders, parentFolder]);

  // Get auth token
  const getToken = () => localStorage.getItem('dms_token');

  // Check NAPS2 installation
  const checkNaps2 = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/scanner/naps2/status`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setNaps2Installed(data.installed);
      setNaps2Path(data.path || '');
    } catch (err) {
      console.error('Failed to check NAPS2:', err);
      setNaps2Installed(false);
    }
  }, []);

  // Load available scanners
  const loadScanners = useCallback(async () => {
    setLoadingScanners(true);
    try {
      const res = await fetch(`${API_BASE}/scanner/devices`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setScanners(data.scanners || []);
      if (data.scanners?.length > 0) {
        setSelectedScanner(data.scanners[0].id);
      }
    } catch (err) {
      console.error('Failed to load scanners:', err);
    } finally {
      setLoadingScanners(false);
    }
  }, []);

  // Load recent scans
  const loadRecentScans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/scanner/recent`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setRecentScans(data.scans || []);
    } catch (err) {
      console.error('Failed to load recent scans:', err);
    }
  }, []);

  // Load last scanned document
  const loadLastScanned = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/scanner/last-scanned`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setLastScannedDoc(data.document);
    } catch (err) {
      console.error('Failed to load last scanned:', err);
    }
  }, []);

  // Load watcher status
  const loadWatcherStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/scanner/watcher/status`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setWatcherStatus(data);
    } catch (err) {
      console.error('Failed to load watcher status:', err);
    }
  }, []);

  // Poll for scan completion
  const pollScanStatus = useCallback(async (sessionId: string, options?: { multiPage?: boolean; batchId?: string }) => {
    const maxAttempts = 400; // 2 minutes with 300ms intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/scanner/scan/${sessionId}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await res.json();

        if (data.status === 'completed') {
          setScanning(false);
          setScanComplete(true);
          setCurrentSessionId(null);

          if (options?.multiPage) {
            if (options.batchId) {
              setActiveBatchId(options.batchId);
            }
            setScannedPages((prev) => prev + 1);
            setTimeout(() => setScanComplete(false), 3000);
            await loadRecentScans();
            return;
          }

          // Refresh documents list
          await refreshDocuments?.();
          await loadRecentScans();
          await loadLastScanned();

          // Get folder name for logging
          const targetFolderId = destFolder || parentFolder || null;
          const targetFolder = visibleFolders.find(f => f.id === targetFolderId);
          const folderName = targetFolder?.name || 'Root';

          // Get scanner name for logging
          const selectedScannerObj = scanners.find(s => s.id === selectedScanner);
          const scannerName = selectedScannerObj?.name || 'Unknown Scanner';

          // Log the scan with detailed info
          addLog({
            userId: user?.id || '',
            userName: user?.name || '',
            userRole: user?.role || '',
            action: 'DOCUMENT_SCANNED',
            target: data.title || docTitle,
            targetType: 'document',
            timestamp: new Date().toISOString(),
            ipAddress: '',
            details: `Scanned by ${user?.name || 'Unknown'} using ${scannerName}. Format: ${fileFormat.toUpperCase()}. Saved to folder: ${folderName}. Reference: ${data.reference || 'N/A'}`
          });

          setTimeout(() => setScanComplete(false), 3000);
          return;
        }

        if (data.status === 'failed') {
          setScanning(false);
          setScanError(data.errorMessage || 'Scan failed');
          setCurrentSessionId(null);
          return;
        }

        attempts++;
        if (attempts < maxAttempts && (data.status === 'pending' || data.status === 'scanning')) {
          setTimeout(poll, 300);  // Faster polling: 300ms
        } else if (attempts >= maxAttempts) {
          setScanning(false);
          setScanError('Scan timed out. Please try again.');
          setCurrentSessionId(null);
        }
      } catch (err) {
        console.error('Poll error:', err);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 300);  // Faster polling: 300ms
        }
      }
    };

    poll();
  }, [user, docTitle, addLog, refreshDocuments, loadRecentScans, loadLastScanned, destFolder, parentFolder, visibleFolders, scanners, selectedScanner, fileFormat]);

  // Start scan
  const handleScan = async () => {
    if (!docTitle.trim()) {
      setScanError('Please enter a document title.');
      return;
    }


    // Auto-switch to ADF if Legal is selected and scanSource is not feeder
    if (paperSize === 'legal' && scanSource !== 'feeder') {
      setScanSource('feeder');
      setScanError('Legal size scanning requires the document feeder (ADF). Scan source switched to ADF.');
      return;
    }
    // Prevent scan if user tries to force Flatbed for Legal
    if (paperSize === 'legal' && scanSource === 'glass') {
      setScanError('Legal size scanning requires the document feeder (ADF). Please select ADF as the scan source.');
      return;
    }

    setScanError(null);
    setScanning(true);
    setScanComplete(false);

    try {
      // Find the selected scanner's name (NAPS2 needs the actual device name)
      const selectedScannerObj = scanners.find(s => s.id === selectedScanner);
      const scannerName = selectedScannerObj?.name || '';

      // Use subfolder if selected, otherwise use parent folder
      const targetFolderId = destFolder || parentFolder || null;

      const isMultiPageScan = multiPageMode || !!activeBatchId;

      const res = await fetch(`${API_BASE}/scanner/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          title: docTitle,
          format: isMultiPageScan ? 'pdf' : fileFormat,
          folderId: targetFolderId,
          scannerName: scannerName,
          multiPage: isMultiPageScan,
          batchId: activeBatchId,
          pageNumber: scannedPages + 1,
          dpi: scanDpi,
          colorMode: colorMode,
          paperSize: paperSize,
          scanSource: scanSource
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start scan');
      }

      setCurrentSessionId(data.sessionId);
      if (data.batchId) {
        setActiveBatchId(data.batchId);
      }

      if (data.manualMode) {
        // NAPS2 not installed - show manual mode instructions
        setScanError(`NAPS2 not found. Please scan your document manually and save it to: ${data.scansDirectory}`);
      }

      // For network scanners with multi-page, the scan is already processed
      // Handle completion immediately without polling
      if (data.networkScanner && isMultiPageScan && data.status === 'completed') {
        setScanning(false);
        setScanComplete(true);
        setCurrentSessionId(null);
        setScannedPages((prev) => prev + 1);
        setTimeout(() => setScanComplete(false), 3000);
        await loadRecentScans();
        return;
      }

      // Start polling for completion (for USB scanners or single-page network scans)
      pollScanStatus(data.sessionId, {
        multiPage: isMultiPageScan,
        batchId: data.batchId || activeBatchId || undefined
      });

      if (!isMultiPageScan) {
        // Clear title for next scan in single-page mode
        setDocTitle('');
      }

    } catch (err: any) {
      console.error('Scan error:', err);
      setScanError(err.message || 'Failed to start scan');
      setScanning(false);
    }
  };

  const handleFinalizeBatch = async () => {
    if (!activeBatchId || scannedPages === 0) return;

    setFinalizingBatch(true);
    setScanError(null);

    try {
      const res = await fetch(`${API_BASE}/scanner/scan-batch/${activeBatchId}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to finalize multi-page scan');
      }

      await refreshDocuments?.();
      await loadRecentScans();
      await loadLastScanned();

      const targetFolderId = destFolder || parentFolder || null;
      const targetFolder = visibleFolders.find((f) => f.id === targetFolderId);
      const folderName = targetFolder?.name || 'Root';
      const selectedScannerObj = scanners.find((s) => s.id === selectedScanner);
      const scannerName = selectedScannerObj?.name || 'Unknown Scanner';

      addLog({
        userId: user?.id || '',
        userName: user?.name || '',
        userRole: user?.role || '',
        action: 'DOCUMENT_SCANNED',
        target: docTitle,
        targetType: 'document',
        timestamp: new Date().toISOString(),
        ipAddress: '',
        details: `Multi-page scan (${scannedPages} pages) by ${user?.name || 'Unknown'} using ${scannerName}. Saved to folder: ${folderName}. Reference: ${data.document?.reference || 'N/A'}`
      });

      setScanComplete(true);
      setActiveBatchId(null);
      setScannedPages(0);
      setCurrentSessionId(null);
      setDocTitle('');
      setTimeout(() => setScanComplete(false), 3000);
    } catch (err: any) {
      console.error('Finalize batch error:', err);
      setScanError(err.message || 'Failed to finalize batch');
    } finally {
      setFinalizingBatch(false);
    }
  };

  const handleDiscardBatch = async () => {
    if (!activeBatchId) return;

    try {
      await fetch(`${API_BASE}/scanner/scan-batch/${activeBatchId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
    } catch (err) {
      console.error('Discard batch error:', err);
    } finally {
      setActiveBatchId(null);
      setScannedPages(0);
      setCurrentSessionId(null);
      setScanning(false);
      setScanComplete(false);
    }
  };

  // Cancel current scan
  const handleCancelScan = async () => {
    if (!currentSessionId) return;

    try {
      await fetch(`${API_BASE}/scanner/scan/${currentSessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setScanning(false);
      setCurrentSessionId(null);
    } catch (err) {
      console.error('Failed to cancel scan:', err);
    }
  };

  // Refresh all data
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      checkNaps2(),
      loadScanners(),
      loadRecentScans(),
      loadLastScanned(),
      loadWatcherStatus()
    ]);
    setRefreshing(false);
  };

  // Initial load
  useEffect(() => {
    checkNaps2();
    loadScanners();
    loadRecentScans();
    loadLastScanned();
    loadWatcherStatus();

    // Poll watcher status every 10 seconds
    const interval = setInterval(loadWatcherStatus, 10000);
    return () => clearInterval(interval);
  }, [checkNaps2, loadScanners, loadRecentScans, loadLastScanned, loadWatcherStatus]);

  // Preview document
  const handlePreview = (docId: string) => {
    const token = getToken();
    window.open(`${API_BASE}/documents/${docId}/preview?token=${token}`, '_blank');
  };

  // Download document
  const handleDownload = (docId: string) => {
    const token = getToken();
    window.open(`${API_BASE}/documents/${docId}/download?token=${token}`, '_blank');
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Scan size={28} />
            Scanner Dashboard
          </h2>
          <p className="text-[#C0B87A] text-sm">
            NAPS2 Document Scanning Integration
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-[#427A43] text-white text-sm rounded-lg hover:bg-[#C0B87A] hover:text-[#005F02] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* NAPS2 Status Banner */}
      {naps2Installed === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">NAPS2 Not Installed</p>
            <p className="text-xs text-amber-600 mt-1">
              Download NAPS2 from{' '}
              <a href="https://www.naps2.com" target="_blank" rel="noopener noreferrer" className="underline">
                naps2.com
              </a>{' '}
              for automatic scanning. Manual mode is still available.
            </p>
          </div>
        </div>
      )}

      {naps2Installed === true && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">NAPS2 Ready</p>
            <p className="text-xs text-green-600 mt-1">
              Found at: {naps2Path}
            </p>
          </div>
        </div>
      )}

      {/* Watcher Status */}
      {watcherStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Monitor size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              File Watcher: {watcherStatus.running ? 'Active' : 'Inactive'}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Monitoring: {watcherStatus.directory}
              {watcherStatus.pendingScans > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-200 rounded-full">
                  {watcherStatus.pendingScans} pending
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Scan Controls */}
        <div className="space-y-6">
          {/* Connected Devices */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Monitor size={18} className="text-[#427A43]" />
                Connected Devices
              </h3>
              <button
                onClick={loadScanners}
                disabled={loadingScanners}
                className="text-xs text-[#427A43] hover:underline flex items-center gap-1"
              >
                {loadingScanners ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Detect
              </button>
            </div>

            {loadingScanners ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                Detecting scanners...
              </div>
            ) : scanners.length > 0 ? (
              <div className="space-y-2">
                {scanners.map((scanner) => (
                  <label
                    key={scanner.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedScanner === scanner.id
                        ? 'border-[#427A43] bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scanner"
                      value={scanner.id}
                      checked={selectedScanner === scanner.id}
                      onChange={(e) => setSelectedScanner(e.target.value)}
                      className="text-[#427A43]"
                    />
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {scanner.type === 'scanner' ? (
                        <Scan size={16} className="text-blue-600" />
                      ) : (
                        <Printer size={16} className="text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{scanner.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          scanner.type === 'scanner'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {scanner.type === 'scanner' ? 'Scanner' : 'Multifunction'}
                        </span>
                        {scanner.connection === 'USB' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                            <Usb size={10} />
                            USB
                          </span>
                        )}
                        <span className={`text-xs ${scanner.status === 'ready' ? 'text-green-600' : 'text-amber-600'}`}>
                          {scanner.status === 'ready' ? 'Ready' : 'Not Ready'}
                        </span>
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${
                      scanner.status === 'ready' ? 'bg-green-500' : 'bg-amber-400'
                    }`} />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No scanners detected. Connect a scanner and click Detect.
              </p>
            )}
          </div>

          {/* Scan Controls */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Settings size={18} className="text-[#427A43]" />
              Scan Settings
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-600">
                    Document Title *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHelpTooltip(!showHelpTooltip)}
                      onMouseEnter={() => setShowHelpTooltip(true)}
                      onMouseLeave={() => setShowHelpTooltip(false)}
                      className="text-gray-400 hover:text-[#427A43] transition-colors"
                    >
                      <HelpCircle size={14} />
                    </button>
                    {showHelpTooltip && (
                      <div className="absolute right-0 top-6 z-50 w-64 bg-white rounded-xl shadow-lg border border-gray-100 p-4 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-[#427A43]/10 flex items-center justify-center">
                            <HelpCircle size={14} className="text-[#427A43]" />
                          </div>
                          <h4 className="text-sm font-semibold text-gray-800">Document Type Codes</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">SI</span>
                            <span className="text-xs text-gray-600">Service or Sales Invoice</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">LIQ</span>
                            <span className="text-xs text-gray-600">Liquidation</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">REIM</span>
                            <span className="text-xs text-gray-600">Reimbursement</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">PRF</span>
                            <span className="text-xs text-gray-600">Purchase Requisition Form</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">RECP</span>
                            <span className="text-xs text-gray-600">Receipt</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">OR</span>
                            <span className="text-xs text-gray-600">Official Receipt</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">CV</span>
                            <span className="text-xs text-gray-600">Check Voucher</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">PO</span>
                            <span className="text-xs text-gray-600">Purchase Order</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">CR</span>
                            <span className="text-xs text-gray-600">Collection Receipt / Cash Receipt</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#005F02] bg-green-50 px-2 py-0.5 rounded">DR</span>
                            <span className="text-xs text-gray-600">Delivery Receipt</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-gray-100">
                          <p className="text-[10px] text-red-500">If no Reference No. is specified, replace it with one of the following types</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => {
                    setDocTitle(e.target.value);
                    setScanError(null);
                  }}
                  placeholder="COMPANY_₱ 00.00_DATE (MAR19,2026)_REF NO.(SI_LIQ_REIM_PRF)"
                  disabled={scanning || (activeBatchId !== null && scannedPages > 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] disabled:bg-gray-50"
                />
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiPageMode || activeBatchId !== null}
                    onChange={(e) => setMultiPageMode(e.target.checked)}
                    disabled={scanning || activeBatchId !== null}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-blue-800">
                    Combine multiple scans into one PDF. After each page, you can continue scanning and finalize once all pages are captured.
                  </span>
                </label>
                {activeBatchId && (
                  <p className="text-xs text-blue-700 mt-2">
                    Multi-page session active: {scannedPages} page{scannedPages === 1 ? '' : 's'} captured.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Format
                  </label>
                  <select
                    value={fileFormat}
                    onChange={(e) => setFileFormat(e.target.value)}
                    disabled={scanning || multiPageMode || activeBatchId !== null}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="pdf">PDF</option>
                    <option value="jpg">JPEG</option>
                    <option value="png">PNG</option>
                    <option value="tiff">TIFF</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Department / Folder
                  </label>
                  <select
                    value={parentFolder}
                    onChange={(e) => {
                      setParentFolder(e.target.value);
                      setDestFolder(''); // Reset subfolder when parent changes
                    }}
                    disabled={scanning}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="">Select folder...</option>
                    {rootFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scan Quality Settings */}
              <div className="grid grid-cols-4 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    Scan Source
                                  </label>
                                  <select
                                    value={scanSource}
                                    onChange={(e) => setScanSource(e.target.value)}
                                    disabled={scanning}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                                  >
                                    <option value="auto">Auto Detect</option>
                                    <option value="glass">Flatbed (Glass)</option>
                                    <option value="feeder">ADF (Document Feeder)</option>
                                  </select>
                                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Resolution (DPI)
                  </label>
                  <select
                    value={scanDpi}
                    onChange={(e) => setScanDpi(Number(e.target.value))}
                    disabled={scanning}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value={150}>150 DPI (Fast)</option>
                    <option value={200}>200 DPI (Draft)</option>
                    <option value={300}>300 DPI (Standard)</option>
                    <option value={600}>600 DPI (High)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Color Mode
                  </label>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value)}
                    disabled={scanning}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="color">Color</option>
                    <option value="gray">Grayscale</option>
                    <option value="bw">Black & White</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Paper Size
                  </label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                    disabled={scanning}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="letter">Letter (8.5 x 11")</option>
                    <option value="a4">A4 (8.27 x 11.69")</option>
                    <option value="legal">Legal (8.5 x 14")</option>
                  </select>
                </div>
              </div>

              {/* Subfolder Selection - only show if parent has subfolders */}
              {parentFolder && subFoldersWithDepth.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Subfolder (Optional)
                  </label>
                  <select
                    value={destFolder}
                    onChange={(e) => setDestFolder(e.target.value)}
                    disabled={scanning}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="">Save in department root</option>
                    {subFoldersWithDepth.map(({ folder, depth, path }) => (
                      <option key={folder.id} value={folder.id}>
                        {'—'.repeat(depth)} {folder.name}
                      </option>
                    ))}
                  </select>
                  {destFolder && (
                    <p className="text-xs text-gray-500 mt-1">
                      Path: {rootFolders.find(f => f.id === parentFolder)?.name} / {subFoldersWithDepth.find(s => s.folder.id === destFolder)?.path}
                    </p>
                  )}
                </div>
              )}

              {/* Error Message */}
              {scanError && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-start gap-2">
                  <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-700">{scanError}</span>
                </div>
              )}

              {/* Success Message */}
              {scanComplete && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-xs font-medium text-green-700">
                    {activeBatchId
                      ? `Page ${scannedPages} captured. Continue scanning or finalize to save one PDF.`
                      : 'Scan complete! Document added to library.'}
                  </span>
                </div>
              )}

              {/* Scanning Progress */}
              {scanning && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
                  <Loader2 size={16} className="text-blue-600 animate-spin" />
                  <span className="text-xs text-blue-700">
                    {activeBatchId
                      ? `Scanning page ${scannedPages + 1}... Waiting for scanned file.`
                      : 'Scanning in progress... Waiting for scanned file.'}
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleScan}
                  disabled={scanning || finalizingBatch || !docTitle.trim()}
                  className="flex-1 py-3 bg-[#005F02] text-white font-semibold text-sm rounded-xl hover:bg-[#427A43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {scanning ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      {activeBatchId ? 'Scan Next Page' : 'Start Scan'}
                    </>
                  )}
                </button>

                {scanning && (
                  <button
                    onClick={handleCancelScan}
                    className="px-4 py-3 border border-red-300 text-red-600 font-medium text-sm rounded-xl hover:bg-red-50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {activeBatchId && scannedPages > 0 && !scanning && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleFinalizeBatch}
                    disabled={finalizingBatch}
                    className="py-2.5 bg-[#427A43] text-white font-medium text-sm rounded-lg hover:bg-[#005F02] transition-colors disabled:opacity-60"
                  >
                    {finalizingBatch ? 'Finalizing...' : 'Finalize and Save PDF'}
                  </button>
                  <button
                    onClick={handleDiscardBatch}
                    disabled={finalizingBatch}
                    className="py-2.5 border border-red-300 text-red-600 font-medium text-sm rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    Discard Batch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Preview & Recent */}
        <div className="space-y-6">
          {/* Last Scanned Preview */}
          {lastScannedDoc && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <FileText size={18} className="text-[#427A43]" />
                Last Scanned Document
              </h3>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{lastScannedDoc.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Reference: <span className="font-mono">{lastScannedDoc.reference}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="uppercase">{lastScannedDoc.fileType}</span>
                      <span>{lastScannedDoc.size}</span>
                      <span className={`px-2 py-0.5 rounded-full ${
                        lastScannedDoc.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : lastScannedDoc.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {lastScannedDoc.status === 'approved' ? 'Success' : lastScannedDoc.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePreview(lastScannedDoc.id)}
                      className="p-2 text-[#427A43] hover:bg-green-50 rounded-lg transition-colors"
                      title="Preview"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleDownload(lastScannedDoc.id)}
                      className="p-2 text-[#427A43] hover:bg-green-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Scans */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock size={18} className="text-[#427A43]" />
                Recent Scans
              </h3>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {recentScans.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {recentScans.map((scan) => (
                    <div key={scan.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{scan.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              scan.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : scan.status === 'scanning'
                                ? 'bg-blue-100 text-blue-700'
                                : scan.status === 'failed' || scan.status === 'pending'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {scan.status === 'completed' ? 'Completed'
                                : scan.status === 'scanning' ? 'Scanning...'
                                : scan.status === 'pending' ? 'Failed - Try Again'
                                : scan.status === 'failed' ? 'Failed'
                                : scan.status}
                            </span>
                            {scan.reference && (
                              <span className="text-xs text-gray-500 font-mono">
                                {scan.reference}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatDate(new Date(scan.created_at))}
                        </span>
                      </div>
                      {scan.errorMessage && (
                        <p className="text-xs text-red-500 mt-2">{scan.errorMessage}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400">
                  <Scan size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No scans yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
