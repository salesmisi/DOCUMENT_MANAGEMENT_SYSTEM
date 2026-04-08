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

export function useScanner() {
  const [agentOnline, setAgentOnline] = useState(false);
  const [scannerAvailable, setScannerAvailable] = useState(false);
  const [scannerStatusMessage, setScannerStatusMessage] = useState('Agent Not Detected');
  const [scanners, setScanners] = useState<ScannerAgentDevice[]>([]);
  const [selectedScanner, setSelectedScanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const [multiPageScans, setMultiPageScans] = useState<MultiPageScanItem[]>([]);
  const multiPageScansRef = useRef<MultiPageScanItem[]>([]);
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>([]);
  const scannersRef = useRef<ScannerAgentDevice[]>([]);
  const loadingRef = useRef(false);

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

  const initializeScanner = useCallback(async (options: InitializeScannerOptions = {}) => {
    const { silent = false, forceRefresh = false } = options;

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
        setSelectedScanner('');
        return false;
      }

      if (!forceRefresh && scannersRef.current.length > 0) {
        return true;
      }

      const availableScanners = await getScanners();
      setScanners(availableScanners);
      setSelectedScanner((current) => {
        if (current && availableScanners.some((scanner) => scanner.id === current)) {
          return current;
        }

        return availableScanners[0]?.id || '';
      });

      return true;
    } catch (err) {
      setAgentOnline(false);
      setScannerAvailable(false);
      setScannerStatusMessage('Agent Not Detected');
      setScanners([]);
      setSelectedScanner('');
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
      const message = err instanceof Error ? err.message : 'Scan failed.';
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
      const message = err instanceof Error ? err.message : 'Preview scan failed.';
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
      const message = err instanceof Error ? err.message : 'Multi-page scan failed.';
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
    clearMultiPageScans,
    cancelPreview: clearPreview,
    clearMessages: () => {
      setError(null);
      setSuccessMessage(null);
    },
  };
}