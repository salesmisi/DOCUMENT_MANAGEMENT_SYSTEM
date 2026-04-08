import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  detectAgent,
  discardScan,
  getPreview,
  getPreviewBlob,
  getScanners,
  scanWithPreview,
  uploadScannedFile,
  type PreviewResult,
  type ScanPreviewPayload,
  type ScannerAgentDevice,
} from '../services/scannerService';

export interface ScannerFlowValues {
  title: string;
  folderId: string;
  scanner?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
  scanSource?: string;
  format?: string;
}

interface MultiPageScanItem {
  id: string;
  previewUrl: string;
  blob: Blob;
}

interface InitializeScannerOptions {
  silent?: boolean;
  forceRefresh?: boolean;
}

interface ScannerUiCache {
  agentOnline: boolean;
  scannerAvailable: boolean;
  scannerStatusMessage: string;
  scanners: ScannerAgentDevice[];
  selectedScanner: string;
  recentScans: RecentScanEntry[];
  lastSyncedAt: number;
}

export interface RecentScanEntry {
  id: string;
  title: string;
  status: 'success' | 'failed';
  message: string;
  createdAt: string;
  documentId?: string;
  fileType?: string;
}

const buildRecentScanEntry = (
  status: 'success' | 'failed',
  title: string,
  message: string,
  document?: Record<string, unknown> | null,
  fallbackFileType?: string,
): RecentScanEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title,
  status,
  message,
  createdAt: new Date().toISOString(),
  documentId: typeof document?.id === 'string' ? document.id : undefined,
  fileType: typeof document?.file_type === 'string'
    ? document.file_type
    : typeof document?.fileType === 'string'
      ? document.fileType
      : fallbackFileType,
});

const extractDocumentRecord = (result: unknown) => {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const typedResult = result as Record<string, unknown>;
  const nestedDocument = typedResult.document;

  if (nestedDocument && typeof nestedDocument === 'object') {
    return nestedDocument as Record<string, unknown>;
  }

  return typedResult;
};

const normalizeFolderId = (folderId: string) => {
  const trimmedFolderId = folderId.trim();

  if (!trimmedFolderId) {
    throw new Error('A valid folder must be selected before scanning.');
  }

  return trimmedFolderId;
};

const SCANNER_UI_CACHE_KEY = 'dms_scanner_ui_cache';
const SCANNER_UI_CACHE_TTL_MS = 2 * 60 * 1000;

const defaultScannerUiCache = (): ScannerUiCache => ({
  agentOnline: false,
  scannerAvailable: false,
  scannerStatusMessage: 'Agent Not Detected',
  scanners: [],
  selectedScanner: '',
  recentScans: [],
  lastSyncedAt: 0,
});

const readScannerUiCache = (): ScannerUiCache => {
  if (typeof window === 'undefined') {
    return defaultScannerUiCache();
  }

  try {
    const rawCache = window.sessionStorage.getItem(SCANNER_UI_CACHE_KEY);

    if (!rawCache) {
      return defaultScannerUiCache();
    }

    const parsedCache = JSON.parse(rawCache) as Partial<ScannerUiCache>;

    return {
      ...defaultScannerUiCache(),
      ...parsedCache,
      scanners: Array.isArray(parsedCache.scanners) ? parsedCache.scanners : [],
      recentScans: Array.isArray(parsedCache.recentScans) ? parsedCache.recentScans : [],
      lastSyncedAt: typeof parsedCache.lastSyncedAt === 'number' ? parsedCache.lastSyncedAt : 0,
    };
  } catch {
    return defaultScannerUiCache();
  }
};

const scannerUiCacheState: ScannerUiCache = readScannerUiCache();

const writeScannerUiCache = (cache: ScannerUiCache) => {
  scannerUiCacheState.agentOnline = cache.agentOnline;
  scannerUiCacheState.scannerAvailable = cache.scannerAvailable;
  scannerUiCacheState.scannerStatusMessage = cache.scannerStatusMessage;
  scannerUiCacheState.scanners = cache.scanners;
  scannerUiCacheState.selectedScanner = cache.selectedScanner;
  scannerUiCacheState.recentScans = cache.recentScans;
  scannerUiCacheState.lastSyncedAt = cache.lastSyncedAt;

  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(SCANNER_UI_CACHE_KEY, JSON.stringify(cache));
};

const isScannerUiCacheFresh = () => (
  scannerUiCacheState.lastSyncedAt > 0
  && (Date.now() - scannerUiCacheState.lastSyncedAt) < SCANNER_UI_CACHE_TTL_MS
);

const normalizeScanErrorMessage = (error: unknown, scanSource?: string) => {
  const rawMessage = error instanceof Error ? error.message : 'Scan failed.';
  const normalizedMessage = rawMessage.toLowerCase();
  const usingFeeder = String(scanSource || '').trim().toLowerCase() === 'feeder';
  const feederRelatedFailure = /--source feeder|adf|feeder.*empty|no paper|paper empty|document feeder|load paper|paper jam|document is not loaded|command failed/i.test(rawMessage);

  if (usingFeeder && feederRelatedFailure) {
    return 'Reminder: no paper is inserted in the feeder. Load paper into the ADF, then try scanning again.';
  }

  if (usingFeeder && /timed?\s*out|timeout/i.test(normalizedMessage)) {
    return 'Reminder: no paper may be inserted in the feeder. Load paper into the ADF, then try scanning again.';
  }

  return rawMessage;
};

export function useScanner() {
  const [agentOnline, setAgentOnline] = useState(scannerUiCacheState.agentOnline);
  const [scannerAvailable, setScannerAvailable] = useState(scannerUiCacheState.scannerAvailable);
  const [scannerStatusMessage, setScannerStatusMessage] = useState(scannerUiCacheState.scannerStatusMessage);
  const [scanners, setScanners] = useState<ScannerAgentDevice[]>(scannerUiCacheState.scanners);
  const [selectedScanner, setSelectedScannerState] = useState(scannerUiCacheState.selectedScanner);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const [multiPageScans, setMultiPageScans] = useState<MultiPageScanItem[]>([]);
  const multiPageScansRef = useRef<MultiPageScanItem[]>([]);
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>(scannerUiCacheState.recentScans);
  const scannersRef = useRef<ScannerAgentDevice[]>([]);
  const loadingRef = useRef(false);

  const setSelectedScanner = useCallback((value: string | ((current: string) => string)) => {
    setSelectedScannerState((current) => (
      typeof value === 'function'
        ? (value as (current: string) => string)(current)
        : value
    ));
  }, []);

  const prependRecentScan = useCallback((entry: RecentScanEntry) => {
    setRecentScans((current) => [entry, ...current].slice(0, 8));
  }, []);

  const getResolvedScanner = useCallback((requestedScannerId?: string) => {
    const resolvedScannerId = requestedScannerId || selectedScanner;

    if (!resolvedScannerId) {
      return null;
    }

    return scanners.find((scanner) => scanner.id === resolvedScannerId) || null;
  }, [scanners, selectedScanner]);

  const clearPreview = useCallback(() => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    setPreviewSessionId(null);
    setPreviewUrl(null);
    setPreviewContentType(null);
  }, []);

  const clearMultiPageScans = useCallback(() => {
    setMultiPageScans((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  const removeMultiPageScan = useCallback((scanId: string) => {
    setMultiPageScans((current) => {
      const targetScan = current.find((item) => item.id === scanId);

      if (targetScan) {
        URL.revokeObjectURL(targetScan.previewUrl);
      }

      return current.filter((item) => item.id !== scanId);
    });
  }, []);

  const initializeScanner = useCallback(async (options: InitializeScannerOptions = {}) => {
    const { silent = false, forceRefresh = false } = options;

    if (!forceRefresh && isScannerUiCacheFresh() && scannerUiCacheState.scanners.length > 0) {
      setAgentOnline(scannerUiCacheState.agentOnline);
      setScannerAvailable(scannerUiCacheState.scannerAvailable);
      setScannerStatusMessage(scannerUiCacheState.scannerStatusMessage);
      setScanners(scannerUiCacheState.scanners);
      setSelectedScannerState((current) => current || scannerUiCacheState.selectedScanner || scannerUiCacheState.scanners[0]?.id || '');
      setRecentScans((current) => current.length > 0 ? current : scannerUiCacheState.recentScans);
      return scannerUiCacheState.scannerAvailable;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
    }

    try {
      const agent = await detectAgent();
      const connected = Boolean(agent?.running);
      const readyForScanning = Boolean(agent?.running && agent?.naps2);

      setScannerAvailable(readyForScanning);
      setScannerStatusMessage(
        readyForScanning
          ? 'Agent Connected'
          : connected
            ? 'Agent detected, but NAPS2 is not ready.'
            : 'Agent Not Detected'
      );
      setAgentOnline(readyForScanning);

      if (!readyForScanning) {
        setScanners([]);
        setSelectedScannerState('');
        writeScannerUiCache({
          ...scannerUiCacheState,
          agentOnline: false,
          scannerAvailable: false,
          scannerStatusMessage: connected ? 'Agent detected, but NAPS2 is not ready.' : 'Agent Not Detected',
          scanners: [],
          selectedScanner: '',
          lastSyncedAt: Date.now(),
        });
        return false;
      }

      if (!forceRefresh && scannersRef.current.length > 0) {
        return true;
      }

      const availableScanners = await getScanners();
      setScanners(availableScanners);
      setSelectedScannerState((current) => {
        if (current && availableScanners.some((scanner) => scanner.id === current)) {
          return current;
        }

        return availableScanners[0]?.id || '';
      });

      const nextSelectedScanner = (
        (selectedScanner && availableScanners.some((scanner) => scanner.id === selectedScanner))
          ? selectedScanner
          : availableScanners[0]?.id || ''
      );

      writeScannerUiCache({
        ...scannerUiCacheState,
        agentOnline: readyForScanning,
        scannerAvailable: readyForScanning,
        scannerStatusMessage: 'Agent Connected',
        scanners: availableScanners,
        selectedScanner: nextSelectedScanner,
        recentScans: scannerUiCacheState.recentScans,
        lastSyncedAt: Date.now(),
      });

      return true;
    } catch (err) {
      setAgentOnline(false);
      setScannerAvailable(false);
      setScannerStatusMessage('Agent Not Detected');
      setScanners([]);
      setSelectedScannerState('');
      writeScannerUiCache({
        ...scannerUiCacheState,
        agentOnline: false,
        scannerAvailable: false,
        scannerStatusMessage: 'Agent Not Detected',
        scanners: [],
        selectedScanner: '',
        lastSyncedAt: Date.now(),
      });
      return false;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    scannersRef.current = scanners;
  }, [scanners]);

  useEffect(() => {
    writeScannerUiCache({
      agentOnline,
      scannerAvailable,
      scannerStatusMessage,
      scanners,
      selectedScanner,
      recentScans,
      lastSyncedAt: scannerUiCacheState.lastSyncedAt,
    });
  }, [agentOnline, recentScans, scannerAvailable, scannerStatusMessage, scanners, selectedScanner]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    multiPageScansRef.current = multiPageScans;
  }, [multiPageScans]);

  useEffect(() => {
    const syncAgentState = () => {
      if (loadingRef.current) {
        return;
      }

      if (isScannerUiCacheFresh() && scannersRef.current.length > 0) {
        return;
      }

      void initializeScanner({
        silent: true,
        forceRefresh: scannersRef.current.length === 0,
      });
    };

    syncAgentState();

    const intervalId = window.setInterval(syncAgentState, 5000);
    const handleFocus = () => syncAgentState();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAgentState();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initializeScanner]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }

      multiPageScansRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const scanNow = useCallback(async (values: ScannerFlowValues) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const resolvedScanner = getResolvedScanner(values.scanner);
      const normalizedFolderId = normalizeFolderId(values.folderId);
      const payload: ScanPreviewPayload = {
        scanner: resolvedScanner?.name || values.scanner || selectedScanner || undefined,
        driver: resolvedScanner?.driver,
        dpi: values.dpi,
        color: values.color,
        paperSize: values.paperSize,
        scanSource: values.scanSource,
        format: values.format,
      };

      const sessionId = await scanWithPreview(payload);
      const scannedBlob = await getPreviewBlob(sessionId);

      try {
        await discardScan(sessionId);
      } catch {
        // Best-effort cleanup only.
      }

      const result = await uploadScannedFile(
        scannedBlob,
        values.title.trim(),
        normalizedFolderId,
        values.format || 'pdf'
      );
      setSuccessMessage('Document scanned and uploaded successfully.');
      prependRecentScan(
        buildRecentScanEntry(
          'success',
          values.title.trim(),
          'Scan completed successfully.',
          extractDocumentRecord(result),
          values.format || 'pdf',
        )
      );
      clearPreview();
      return result;
    } catch (err) {
      const message = normalizeScanErrorMessage(err, values.scanSource);
      setError(message);
      prependRecentScan(buildRecentScanEntry('failed', values.title.trim() || 'Untitled scan', message));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, getResolvedScanner, prependRecentScan, selectedScanner]);

  const scanWithPreviewFlow = useCallback(async (values?: Omit<ScannerFlowValues, 'title' | 'folderId'>) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const resolvedScanner = getResolvedScanner(values?.scanner);
      const payload: ScanPreviewPayload = {
        scanner: resolvedScanner?.name || values?.scanner || selectedScanner || undefined,
        driver: resolvedScanner?.driver,
        dpi: values?.dpi,
        color: values?.color,
        paperSize: values?.paperSize,
        scanSource: values?.scanSource,
        format: values?.format,
      };

      clearPreview();

      const sessionId = await scanWithPreview(payload);
      const preview: PreviewResult = await getPreview(sessionId);

      if (preview.isObjectUrl) {
        previewObjectUrlRef.current = preview.previewUrl;
      }

      setPreviewSessionId(sessionId);
      setPreviewUrl(preview.previewUrl);
      setPreviewContentType(preview.contentType || null);

      return sessionId;
    } catch (err) {
      const message = normalizeScanErrorMessage(err, values?.scanSource);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, getResolvedScanner, selectedScanner]);

  const uploadPreview = useCallback(async (title: string, folderId: string) => {
    if (!previewSessionId) {
      const message = 'No preview session is available to upload.';
      setError(message);
      throw new Error(message);
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const normalizedFolderId = normalizeFolderId(folderId);
      const previewBlob = await getPreviewBlob(previewSessionId);

      try {
        await discardScan(previewSessionId);
      } catch {
        // Best-effort cleanup only.
      }

      const effectiveFormat = previewBlob.type.includes('png')
        ? 'png'
        : previewBlob.type.includes('jpeg')
          ? 'jpg'
          : 'pdf';

      const result = await uploadScannedFile(previewBlob, title.trim(), normalizedFolderId, effectiveFormat);
      setSuccessMessage('Scanned document uploaded successfully.');
      prependRecentScan(
        buildRecentScanEntry('success', title.trim(), 'Preview scan uploaded successfully.', extractDocumentRecord(result), 'pdf')
      );
      clearPreview();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setError(message);
      prependRecentScan(buildRecentScanEntry('failed', title.trim() || 'Untitled scan', message));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, prependRecentScan, previewSessionId]);

  const addMultiPageScan = useCallback(async (values?: Omit<ScannerFlowValues, 'title' | 'folderId'>) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const resolvedScanner = getResolvedScanner(values?.scanner);
      const payload: ScanPreviewPayload = {
        scanner: resolvedScanner?.name || values?.scanner || selectedScanner || undefined,
        driver: resolvedScanner?.driver,
        dpi: values?.dpi,
        color: values?.color,
        paperSize: values?.paperSize,
        scanSource: values?.scanSource,
        format: 'pdf',
      };

      clearPreview();

      const sessionId = await scanWithPreview(payload);
      const pageBlob = await getPreviewBlob(sessionId);
      const pagePreviewUrl = URL.createObjectURL(pageBlob);

      try {
        await discardScan(sessionId);
      } catch {
        // Best-effort cleanup only; the page blob is already loaded in-browser.
      }

      setMultiPageScans((current) => [
        ...current,
        {
          id: sessionId,
          previewUrl: pagePreviewUrl,
          blob: pageBlob,
        },
      ]);
      setSuccessMessage(`Page ${multiPageScans.length + 1} captured. Continue scanning or finalize the PDF.`);

      return sessionId;
    } catch (err) {
      const message = normalizeScanErrorMessage(err, values?.scanSource);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, getResolvedScanner, multiPageScans.length, selectedScanner]);

  const finalizeMultiPageUpload = useCallback(async (title: string, folderId: string) => {
    if (multiPageScans.length === 0) {
      const message = 'No scanned pages are available to combine.';
      setError(message);
      throw new Error(message);
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const mergedDocument = await PDFDocument.create();

      for (const item of multiPageScans) {
        const pageBytes = await item.blob.arrayBuffer();
        const sourceDocument = await PDFDocument.load(pageBytes);
        const copiedPages = await mergedDocument.copyPages(sourceDocument, sourceDocument.getPageIndices());
        copiedPages.forEach((page) => mergedDocument.addPage(page));
      }

      const mergedBytes = await mergedDocument.save();
      const mergedBlob = new Blob([mergedBytes], { type: 'application/pdf' });
      const result = await uploadScannedFile(mergedBlob, title.trim(), normalizeFolderId(folderId), 'pdf');

      clearMultiPageScans();
      setSuccessMessage('Multi-page PDF scanned and uploaded successfully.');
      prependRecentScan(
        buildRecentScanEntry('success', title.trim(), 'Multi-page PDF uploaded successfully.', extractDocumentRecord(result), 'pdf')
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Multi-page PDF upload failed.';
      setError(message);
      prependRecentScan(buildRecentScanEntry('failed', title.trim() || 'Untitled scan', message));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearMultiPageScans, multiPageScans]);

  return {
    agentOnline,
    scannerAvailable,
    scannerStatusMessage,
    scanners,
    selectedScanner,
    setSelectedScanner,
    loading,
    error,
    successMessage,
    previewSessionId,
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
    cancelPreview: clearPreview,
    clearMessages: () => {
      setError(null);
      setSuccessMessage(null);
    },
  };
}