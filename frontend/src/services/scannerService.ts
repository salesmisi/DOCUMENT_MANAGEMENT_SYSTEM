import { apiUrl } from '../utils/api';

const SCANNER_AGENT_BASE_URL = 'http://localhost:3001';
const SCANNER_AGENT_HEALTH_URL = (() => {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const apiBaseUrl = String(viteEnv?.VITE_API_URL || '').replace(/\/+$/, '');

  return apiBaseUrl ? `${apiBaseUrl}/scan-health` : '/api/scan-health';
})();
const TOKEN_STORAGE_KEYS = ['token', 'dms_token'];

export interface ScannerAgentDevice {
  id: string;
  name: string;
  driver?: string;
  connection?: string;
  [key: string]: unknown;
}

export interface ScanDocumentPayload {
  title: string;
  folder_id: string | number;
  scanner?: string;
  driver?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
  format?: string;
  scanSource?: string;
  token?: string;
}

export interface ScanPreviewPayload {
  scanner?: string;
  driver?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
  format?: string;
  scanSource?: string;
  token?: string;
}

export interface PreviewResult {
  previewUrl: string;
  isObjectUrl: boolean;
  contentType?: string;
}

const formatToExtension = (format?: string) => {
  const normalizedFormat = String(format || 'pdf').trim().toLowerCase();

  if (normalizedFormat === 'jpg' || normalizedFormat === 'jpeg') {
    return 'jpg';
  }

  if (normalizedFormat === 'png') {
    return 'png';
  }

  return 'pdf';
};

export interface ScannerAgentHealth {
  status?: string;
  ok?: boolean;
  packaged?: boolean;
  naps2Installed?: boolean;
  backendUrl?: string;
}

// Support both the generic token key and the app's existing dms_token key.
const getToken = () => TOKEN_STORAGE_KEYS
  .map((key) => window.localStorage.getItem(key))
  .find((value): value is string => Boolean(value));

const getRequiredToken = () => {
  const token = getToken();

  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }

  return token;
};

const buildHeaders = (includeAuth = false, includeJson = false) => {
  const token = getToken();

  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(includeAuth && token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const buildRequiredAuthHeaders = (includeJson = false) => {
  const token = getRequiredToken();

  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
};

const hasConfiguredBackendUrl = (backendUrl?: string) => {
  return Boolean(backendUrl && !backendUrl.includes('YOUR-RAILWAY-URL'));
};

const normalizeColorMode = (color?: string) => {
  const normalizedColor = String(color || 'color').trim().toLowerCase();

  if (normalizedColor === 'grayscale' || normalizedColor === 'greyscale') {
    return 'gray';
  }

  if (normalizedColor === 'black & white' || normalizedColor === 'black-and-white') {
    return 'bw';
  }

  return normalizedColor || 'color';
};

const normalizePaperSize = (paperSize?: string) => {
  const normalizedPaperSize = String(paperSize || 'letter').trim().toLowerCase();

  if (normalizedPaperSize === 'a4' || normalizedPaperSize === 'letter' || normalizedPaperSize === 'legal') {
    return normalizedPaperSize;
  }

  return 'letter';
};

const normalizeScannerDevice = (device: ScannerAgentDevice) => {
  const normalizedName = String(device.name || device.id || '').trim();
  const normalizedDriver = typeof device.driver === 'string' ? device.driver : undefined;

  return {
    ...device,
    id: String(device.id || normalizedName),
    name: normalizedName,
    driver: normalizedDriver,
  };
};

export async function getAgentHealth() {
  const response = await fetch(SCANNER_AGENT_HEALTH_URL, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const data = await response.json() as { agent?: ScannerAgentHealth } | ScannerAgentHealth;
  return ('agent' in data ? data.agent : data) as ScannerAgentHealth;
};

const ensureAgentConfigured = async () => {
  const health = await getAgentHealth();

  if ((health.status !== 'ok' && health.ok !== true) || health.naps2Installed === false) {
    throw new Error('Scanner agent is unavailable. Start the local scanner agent and try again.');
  }

  if (!hasConfiguredBackendUrl(health.backendUrl)) {
    throw new Error('Scanner agent backend URL is not configured. Update the local agent Railway backend URL and try again.');
  }

  return health;
};

const readErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    const detail = typeof data.details === 'string'
      ? data.details
      : typeof data.details?.error === 'string'
        ? data.details.error
        : typeof data.details?.message === 'string'
          ? data.details.message
          : '';

    if (data.message && detail && !String(data.message).includes(detail)) {
      return `${data.message}: ${detail}`;
    }

    if (data.error && detail && !String(data.error).includes(detail)) {
      return `${data.error}: ${detail}`;
    }

    return data.message || data.error || detail || 'Scanner agent request failed.';
  }

  const text = await response.text();
  return text || 'Scanner agent request failed.';
};

const requestJson = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${SCANNER_AGENT_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export async function checkAgent() {
  try {
    const health = await getAgentHealth();
    return (health.status === 'ok' || health.ok === true) && health.naps2Installed !== false;
  } catch {
    return false;
  }
}

export async function getScanners() {
  const data = await requestJson<ScannerAgentDevice[] | { scanners?: ScannerAgentDevice[] }>('/scanners', {
    headers: buildHeaders(),
  });

  if (Array.isArray(data)) {
    return data.map(normalizeScannerDevice).filter((device) => Boolean(device.id && device.name));
  }

  return (data.scanners || []).map(normalizeScannerDevice).filter((device) => Boolean(device.id && device.name));
}

export async function scanDocument(payload: ScanDocumentPayload) {
  // The token is forwarded to the local agent so it can upload to the cloud backend per request.
  const token = getRequiredToken();
  await ensureAgentConfigured();
  const resolvedPaperSize = normalizePaperSize(payload.paperSize);
  const resolvedScanSource = payload.scanSource || 'auto';
  const resolvedColor = normalizeColorMode(payload.color);

  return requestJson<Record<string, unknown>>('/scan', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify({
      title: payload.title,
      format: payload.format || 'pdf',
      folderId: String(payload.folder_id),
      folder_id: String(payload.folder_id),
      scannerName: payload.scanner || '',
      scanner: payload.scanner || '',
      driver: payload.driver,
      dpi: payload.dpi,
      colorMode: resolvedColor,
      color: resolvedColor,
      paperSize: resolvedPaperSize,
      scanSource: resolvedScanSource,
      multiPage: false,
      pageNumber: 1,
      token,
    }),
  });
}

export async function scanWithPreview(payload: ScanPreviewPayload = {}) {
  const token = getRequiredToken();
  await ensureAgentConfigured();
  const resolvedPaperSize = normalizePaperSize(payload.paperSize);
  const resolvedScanSource = payload.scanSource || 'auto';
  const resolvedColor = normalizeColorMode(payload.color);

  const data = await requestJson<{ sessionId?: string; session_id?: string }>('/scan-local', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify({
      format: payload.format || 'pdf',
      scannerName: payload.scanner || '',
      scanner: payload.scanner || '',
      driver: payload.driver,
      dpi: payload.dpi,
      colorMode: resolvedColor,
      color: resolvedColor,
      paperSize: resolvedPaperSize,
      scanSource: resolvedScanSource,
      token,
    }),
  });

  const sessionId = data.sessionId || data.session_id;

  if (!sessionId) {
    throw new Error('Scanner agent did not return a preview session ID.');
  }

  return sessionId;
}

export async function getPreview(sessionId: string): Promise<PreviewResult> {
  const response = await fetch(`${SCANNER_AGENT_BASE_URL}/scan/${sessionId}/preview`, {
    headers: buildRequiredAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json() as { previewUrl?: string; url?: string };
    const previewUrl = data.previewUrl || data.url;

    if (!previewUrl) {
      throw new Error('Scanner agent did not return a preview URL.');
    }

    return {
      previewUrl,
      isObjectUrl: false,
      contentType,
    };
  }

  const blob = await response.blob();
  return {
    previewUrl: URL.createObjectURL(blob),
    isObjectUrl: true,
    contentType: blob.type || contentType,
  };
}

export async function getPreviewBlob(sessionId: string) {
  const response = await fetch(`${SCANNER_AGENT_BASE_URL}/scan/${sessionId}/preview`, {
    headers: buildRequiredAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.blob();
}

export async function discardScan(sessionId: string) {
  const response = await fetch(`${SCANNER_AGENT_BASE_URL}/scan/${sessionId}`, {
    method: 'DELETE',
    headers: buildRequiredAuthHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function uploadScan(sessionId: string, title: string, folder_id: string | number) {
  // The local agent must receive the same bearer token the backend expects.
  const token = getRequiredToken();
  await ensureAgentConfigured();

  return requestJson<Record<string, unknown>>('/upload', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify({ sessionId, title, folder_id, folderId: folder_id, token }),
  });
}

export async function uploadScannedFile(file: Blob, title: string, folder_id: string | number, format = 'pdf') {
  const token = getRequiredToken();
  const extension = formatToExtension(format);
  const formData = new FormData();

  formData.append('file', file, `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'scan'}.${extension}`);
  formData.append('title', title);
  formData.append('folder_id', String(folder_id));
  formData.append('needs_approval', 'false');
  formData.append('scanned_from', 'local_scanner_agent');
  formData.append('file_type', extension);
  formData.append('size', `${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB`);

  const response = await fetch(apiUrl('/documents'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export const scannerService = {
  checkAgent,
  getAgentHealth,
  getScanners,
  scanDocument,
  scanWithPreview,
  getPreview,
  getPreviewBlob,
  discardScan,
  uploadScan,
  uploadScannedFile,
};