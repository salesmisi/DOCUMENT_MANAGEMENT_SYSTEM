const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.LOCAL_AGENT_PORT || 3001);
const backendApiRoot = String(process.env.BACKEND_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const scansDirectory = process.env.LOCAL_AGENT_SCANS_DIR || path.join(__dirname, '..', 'scans', 'local-agent');
const naps2Path = process.env.NAPS2_PATH || 'C:\\Program Files\\NAPS2\\NAPS2.Console.exe';

const previewSessions = new Map();
const SCANNER_CACHE_TTL_MS = Number(process.env.SCANNER_CACHE_TTL_MS || 2 * 60 * 1000);
const ACTIVE_DEVICE_TIMEOUT_MS = Number(process.env.SCANNER_ACTIVE_DEVICE_TIMEOUT_MS || 3500);
const NAPS2_LIST_TIMEOUT_MS = Number(process.env.NAPS2_LIST_TIMEOUT_MS || 5000);
const scannerDiscoveryState = {
  scanners: [],
  lastUpdated: 0,
  refreshPromise: null,
  lastError: null,
};

fs.mkdirSync(scansDirectory, { recursive: true });

app.use(cors());
app.use(express.json());

function log(message, meta) {
  if (meta) {
    console.log('[local-agent] ' + message, meta);
    return;
  }

  console.log('[local-agent] ' + message);
}

function logError(message, error, meta) {
  console.error('[local-agent] ' + message, {
    ...(meta || {}),
    error: error?.message || error,
  });
}

function requireAuthHeader(req, res) {
  const authHeader = req.headers.authorization;

  // The agent never stores tokens. It only forwards the caller's header for this request.
  if (!authHeader) {
    res.status(401).json({ error: 'Missing token' });
    return null;
  }

  return authHeader;
}

function parseScannerList(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      id: line,
      name: line,
    }));
}

function normalizeDeviceName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVirtualPrinter(name) {
  return /microsoft (xps|print to pdf)|onenote|fax|adobe pdf|cutepdf/i.test(String(name || ''));
}

async function execFileWithTimeout(file, args, timeout) {
  return execFileAsync(file, args, {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

function matchActiveDevice(scannerName, activeNames) {
  const normalizedScannerName = normalizeDeviceName(scannerName);

  return activeNames.some((activeName) => (
    normalizedScannerName === activeName
    || normalizedScannerName.includes(activeName)
    || activeName.includes(normalizedScannerName)
  ));
}

function getCachedScanners() {
  return scannerDiscoveryState.scanners.map((scanner) => ({ ...scanner }));
}

function isScannerCacheFresh() {
  if (!scannerDiscoveryState.lastUpdated) {
    return false;
  }

  return (Date.now() - scannerDiscoveryState.lastUpdated) < SCANNER_CACHE_TTL_MS;
}

async function listActiveWindowsDevices() {
  const command = [
    '$devices = @();',
    '$devices += Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |',
    'Where-Object {',
    "  $_.Name -and $_.Status -eq 'OK' -and (",
    "    $_.PNPClass -in @('Image','Camera') -or $_.Service -eq 'stisvc' -or $_.Name -match 'scanner|scan|imaging|wia|adf|flatbed'",
    '  )',
    "} | Select-Object @{Name='Name';Expression={$_.Name}};",
    '$devices += Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue |',
    'Where-Object {',
    "  $_.Name -and $_.WorkOffline -ne $true -and $_.PrinterStatus -notin 5,6,7 -and (",
    "    $_.PortName -match 'USB|WSD|IP_|TCP|DOT4' -or $_.Local -eq $true -or $_.Network -eq $true",
    '  )',
    "} | Select-Object @{Name='Name';Expression={$_.Name}};",
    '$devices | ConvertTo-Json -Compress',
  ].join(' ');

  try {
    const { stdout } = await execFileWithTimeout(
      'powershell',
      ['-NoProfile', '-Command', command],
      ACTIVE_DEVICE_TIMEOUT_MS,
    );

    if (!stdout.trim()) {
      return [];
    }

    const parsed = JSON.parse(stdout);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items
      .map((item) => item?.Name)
      .filter((name) => name && !isVirtualPrinter(name))
      .map((name) => normalizeDeviceName(name));
  } catch (error) {
    logError('Active Windows device detection failed', error);
    return null;
  }
}

async function listScannersFresh() {
  if (!fs.existsSync(naps2Path)) {
    return [];
  }

  const activeWindowsDevices = await listActiveWindowsDevices();
  const commands = [
    ['--listdevices', '--driver', 'wia'],
    ['--listdevices'],
  ];

  for (const args of commands) {
    try {
      const { stdout } = await execFileWithTimeout(naps2Path, args, NAPS2_LIST_TIMEOUT_MS);
      const scanners = parseScannerList(stdout);

      if (!Array.isArray(activeWindowsDevices) || activeWindowsDevices.length === 0) {
        return scanners;
      }

      return scanners.filter((scanner) => matchActiveDevice(scanner.name, activeWindowsDevices));
    } catch (error) {
      logError('Scanner listing command failed', error, { args });
    }
  }

  return [];
}

function refreshScannerCache(reason) {
  if (scannerDiscoveryState.refreshPromise) {
    return scannerDiscoveryState.refreshPromise;
  }

  scannerDiscoveryState.refreshPromise = (async () => {
    try {
      const scanners = await listScannersFresh();
      scannerDiscoveryState.scanners = scanners;
      scannerDiscoveryState.lastUpdated = Date.now();
      scannerDiscoveryState.lastError = null;
      log('Scanner cache refreshed', { reason, count: scanners.length });
      return scanners;
    } catch (error) {
      scannerDiscoveryState.lastError = error?.message || String(error);
      logError('Scanner cache refresh failed', error, { reason });
      return scannerDiscoveryState.scanners;
    } finally {
      scannerDiscoveryState.refreshPromise = null;
    }
  })();

  return scannerDiscoveryState.refreshPromise;
}

function triggerScannerRefresh(reason) {
  void refreshScannerCache(reason);
}

function resolveBitDepth(color) {
  switch ((color || 'color').toLowerCase()) {
    case 'bw':
    case 'blackwhite':
    case 'black-and-white':
      return '1';
    case 'grayscale':
    case 'grey':
    case 'gray':
      return '8';
    default:
      return '24';
  }
}

async function listScanners() {
  if (!isScannerCacheFresh()) {
    triggerScannerRefresh(scannerDiscoveryState.lastUpdated ? 'stale-read' : 'cold-start');
  }

  return getCachedScanners();
}

async function runNaps2Scan({ scanner, dpi, color, paperSize, outputPath }) {
  if (!fs.existsSync(naps2Path)) {
    throw new Error(`NAPS2 executable not found at ${naps2Path}`);
  }

  const args = ['-o', outputPath, '--verbose'];

  if (scanner) {
    args.push('--device', scanner, '--driver', 'wia');
  } else {
    args.push('--interactivescan');
  }

  if (dpi) {
    args.push('--dpi', String(dpi));
  }

  if (color) {
    args.push('--bitdepth', resolveBitDepth(color));
  }

  if (paperSize) {
    args.push('--pagesize', String(paperSize));
  }

  args.push('--force', '--pdfcompat', 'PDF_A_2B');

  await execFileWithTimeout(naps2Path, args, 300000);
}

async function uploadPdfToBackend({ filePath, title, folderId, authHeader }) {
  const formData = new FormData();

  // The backend expects multipart form-data with the scanned PDF and its metadata.
  formData.append('file', fs.createReadStream(filePath));
  formData.append('title', title);
  formData.append('folder_id', String(folderId));
  formData.append('needs_approval', 'false');
  formData.append('scanned_from', 'local_scanner_agent');

  const response = await axios.post(`${backendApiRoot}/documents`, formData, {
    headers: {
      ...formData.getHeaders(),
      Authorization: authHeader,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const message = response.data?.error || response.data?.message || 'Backend upload failed';
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = response.data;
    throw error;
  }

  return response.data;
}

function sendForwardedError(error, res) {
  const statusCode = error.statusCode || error.response?.status || 500;
  const payload = error.payload || error.response?.data;
  const message = payload?.error || payload?.message || error.message || 'Scanner agent request failed';

  return res.status(statusCode).json({
    error: message,
    details: payload,
  });
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    naps2Installed: fs.existsSync(naps2Path),
    scannerCacheReady: scannerDiscoveryState.lastUpdated > 0,
    scannerRefreshInProgress: Boolean(scannerDiscoveryState.refreshPromise),
    cachedScannerCount: scannerDiscoveryState.scanners.length,
  });
});

app.get('/scanners', async (_req, res) => {
  try {
    const scanners = await listScanners();
    res.json(scanners);
  } catch (error) {
    logError('Failed to serve /scanners', error);
    sendForwardedError(error, res);
  }
});

app.post('/scan', async (req, res) => {
  const authHeader = requireAuthHeader(req, res);

  if (!authHeader) {
    return;
  }

  const { title, folder_id, scanner, dpi, color, paperSize } = req.body || {};

  if (!title || !folder_id) {
    return res.status(400).json({ error: 'title and folder_id are required' });
  }

  const sessionId = randomUUID();
  const outputPath = path.join(scansDirectory, `${sessionId}.pdf`);

  try {
    await runNaps2Scan({ scanner, dpi, color, paperSize, outputPath });
    const uploadResult = await uploadPdfToBackend({
      filePath: outputPath,
      title,
      folderId: folder_id,
      authHeader,
    });

    res.json({
      sessionId,
      message: 'Scan and upload completed successfully',
      upload: uploadResult,
    });
  } catch (error) {
    sendForwardedError(error, res);
  } finally {
    fs.promises.unlink(outputPath).catch(() => undefined);
  }
});

app.post('/scan-local', async (req, res) => {
  const authHeader = requireAuthHeader(req, res);

  if (!authHeader) {
    return;
  }

  const { scanner, dpi, color, paperSize } = req.body || {};
  const sessionId = randomUUID();
  const outputPath = path.join(scansDirectory, `${sessionId}.pdf`);

  try {
    await runNaps2Scan({ scanner, dpi, color, paperSize, outputPath });

    previewSessions.set(sessionId, {
      filePath: outputPath,
      createdAt: Date.now(),
    });

    res.json({ sessionId });
  } catch (error) {
    sendForwardedError(error, res);
  }
});

app.get('/scan/:sessionId/preview', (req, res) => {
  const authHeader = requireAuthHeader(req, res);

  if (!authHeader) {
    return;
  }

  const session = previewSessions.get(req.params.sessionId);

  if (!session || !fs.existsSync(session.filePath)) {
    return res.status(404).json({ error: 'Preview session not found' });
  }

  res.sendFile(path.resolve(session.filePath));
});

app.post('/upload', async (req, res) => {
  const authHeader = requireAuthHeader(req, res);

  if (!authHeader) {
    return;
  }

  const { sessionId, title, folder_id } = req.body || {};

  if (!sessionId || !title || !folder_id) {
    return res.status(400).json({ error: 'sessionId, title, and folder_id are required' });
  }

  const session = previewSessions.get(sessionId);

  if (!session || !fs.existsSync(session.filePath)) {
    return res.status(404).json({ error: 'Preview session not found' });
  }

  try {
    const uploadResult = await uploadPdfToBackend({
      filePath: session.filePath,
      title,
      folderId: folder_id,
      authHeader,
    });

    previewSessions.delete(sessionId);
    fs.promises.unlink(session.filePath).catch(() => undefined);

    res.json({
      message: 'Upload completed successfully',
      upload: uploadResult,
    });
  } catch (error) {
    sendForwardedError(error, res);
  }
});

setInterval(() => {
  const expirationMs = 30 * 60 * 1000;

  for (const [sessionId, session] of previewSessions.entries()) {
    if (Date.now() - session.createdAt > expirationMs) {
      previewSessions.delete(sessionId);
      fs.promises.unlink(session.filePath).catch(() => undefined);
    }
  }
}, 5 * 60 * 1000);

setInterval(() => {
  if (!isScannerCacheFresh()) {
    triggerScannerRefresh('scheduled-refresh');
  }
}, Math.max(10000, Math.floor(SCANNER_CACHE_TTL_MS / 2)));

app.listen(port, () => {
  log(`Local scanner agent listening on http://localhost:${port}`);
  triggerScannerRefresh('startup');
});