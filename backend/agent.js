const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const SCANS_DIR = path.resolve(process.env.SCANS_DIR || path.join(__dirname, 'scans'));
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://documentmanagementsystem-production-9d6e.up.railway.app',
]);
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

fs.mkdirSync(SCANS_DIR, { recursive: true });

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  next();
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

function log(message, meta) {
  if (meta) {
    console.log(`[agent] ${message}`, meta);
    return;
  }

  console.log(`[agent] ${message}`);
}

function logError(message, error, meta) {
  console.error(`[agent] ${message}`, {
    ...(meta || {}),
    error: error?.message || error,
  });
}

function getCandidateNaps2Paths() {
  const envPath = process.env.NAPS2_PATH;
  const candidates = [
    envPath,
    'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
    'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NAPS2', 'NAPS2.Console.exe'),
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function findNaps2Executable() {
  for (const candidate of getCandidateNaps2Paths()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const { stdout } = await execFileAsync('where', ['NAPS2.Console.exe'], { windowsHide: true });
    const firstPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstPath || null;
  } catch {
    return null;
  }
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

function resolveBitDepth(colorMode) {
  const normalized = String(colorMode || 'color').trim().toLowerCase();

  if (normalized === 'bw' || normalized === 'black-and-white' || normalized === 'blackwhite') {
    return '1';
  }

  if (normalized === 'gray' || normalized === 'grey' || normalized === 'grayscale' || normalized === 'greyscale') {
    return '8';
  }

  return '24';
}

function resolvePageSize(paperSize) {
  const normalized = String(paperSize || 'a4').trim().toLowerCase();

  if (normalized === 'legal' || normalized === 'letter' || normalized === 'a4') {
    return normalized;
  }

  return 'a4';
}

function resolveScanSource(scanSource) {
  const normalized = String(scanSource || 'auto').trim().toLowerCase();

  if (normalized === 'feeder' || normalized === 'adf' || normalized === 'document feeder') {
    return 'feeder';
  }

  if (normalized === 'glass' || normalized === 'flatbed') {
    return 'glass';
  }

  return null;
}

function buildScanArgs({ outputPath, scanner, dpi, color, paperSize, format }) {
  const args = ['-o', outputPath, '--force'];

  if ((format || 'pdf').toLowerCase() === 'pdf') {
    args.push('--pdfcompat', 'PDF_A_2B');
  }

  if (scanner) {
    args.push('--driver', String(arguments[0].driver || 'wia'), '--device', String(scanner));
  } else {
    args.push('--interactivescan');
  }

  if (dpi) {
    args.push('--dpi', String(dpi));
  }

  const resolvedSource = resolveScanSource(arguments[0].scanSource);
  if (resolvedSource) {
    args.push('--source', resolvedSource);
  }

  args.push('--bitdepth', resolveBitDepth(color));
  args.push('--pagesize', resolvePageSize(paperSize));

  return args;
}

function buildScanFailureError(error, options) {
  const stderr = String(error?.stderr || '').trim();
  const stdout = String(error?.stdout || '').trim();
  const message = String(error?.message || '').trim();
  const combinedOutput = [stderr, stdout, message].filter(Boolean).join('\n');
  const normalizedOutput = combinedOutput.toLowerCase();
  const usingFeeder = resolveScanSource(options?.scanSource) === 'feeder';
  const timeoutDetected = error?.killed || error?.signal === 'SIGTERM' || /timed?\s*out|timeout/i.test(combinedOutput);
  const feederEmptyDetected = /feeder.*empty|adf.*empty|no paper|paper empty|document feeder|no pages? in feeder|load paper|paper jam|document is not loaded/i.test(normalizedOutput);

  let friendlyMessage = combinedOutput || 'Scan failed.';

  if (usingFeeder && feederEmptyDetected) {
    friendlyMessage = 'ADF (feeder) is empty. Please insert paper into the feeder and try again.';
  } else if (usingFeeder && timeoutDetected) {
    friendlyMessage = 'Scanner timed out while waiting for paper in the ADF (feeder). Please insert paper and try again.';
  }

  const normalizedError = new Error(friendlyMessage);
  normalizedError.code = error?.code;
  normalizedError.stderr = stderr;
  normalizedError.stdout = stdout;
  normalizedError.originalMessage = message;

  return normalizedError;
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
  const naps2Path = await findNaps2Executable();

  if (!naps2Path) {
    return [];
  }

  const activeWindowsDevices = await listActiveWindowsDevices();
  const commands = [
    { args: ['--listdevices', '--driver', 'wia'], driver: 'wia', filterActiveDevices: true },
    { args: ['--listdevices', '--driver', 'twain'], driver: 'twain', filterActiveDevices: true },
    { args: ['--listdevices', '--driver', 'escl'], driver: 'escl', filterActiveDevices: false },
  ];
  const discoveredScanners = [];
  const seenNames = new Set();

  for (const { args, driver, filterActiveDevices } of commands) {
    try {
      const listTimeoutMs = driver === 'escl'
        ? Math.max(NAPS2_LIST_TIMEOUT_MS, 45000)
        : NAPS2_LIST_TIMEOUT_MS;
      const { stdout } = await execFileWithTimeout(naps2Path, args, listTimeoutMs);
      const scanners = parseScannerList(stdout).map((scanner) => ({
        ...scanner,
        driver,
        connection: driver === 'escl' ? 'network' : 'usb',
      }));
      const visibleScanners = filterActiveDevices && Array.isArray(activeWindowsDevices) && activeWindowsDevices.length > 0
        ? scanners.filter((scanner) => matchActiveDevice(scanner.name, activeWindowsDevices))
        : scanners;

      for (const scanner of visibleScanners) {
        const scannerKey = scanner.name.toLowerCase();
        if (seenNames.has(scannerKey)) {
          continue;
        }

        seenNames.add(scannerKey);
        discoveredScanners.push(scanner);
      }
    } catch (error) {
      logError('Scanner listing command failed', error, { args, driver });
    }
  }

  return discoveredScanners;
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

async function listScanners() {
  if (!isScannerCacheFresh()) {
    triggerScannerRefresh(scannerDiscoveryState.lastUpdated ? 'stale-read' : 'cold-start');
  }

  return getCachedScanners();
}

async function runScan(options) {
  const naps2Path = await findNaps2Executable();

  if (!naps2Path) {
    const error = new Error('NAPS2 is not installed or could not be found.');
    error.code = 'NAPS2_NOT_FOUND';
    throw error;
  }

  const args = buildScanArgs(options);
  log('Running NAPS2 scan', { naps2Path, args });

  try {
    await execFileWithTimeout(naps2Path, args, 300000);
  } catch (error) {
    throw buildScanFailureError(error, options);
  }

  if (!fs.existsSync(options.outputPath)) {
    throw new Error('NAPS2 finished but no output file was created.');
  }

  return naps2Path;
}

const handleStatusRequest = async (route, res) => {
  log(`${route} called`);

  try {
    const naps2Path = await findNaps2Executable();

    res.json({
      running: true,
      naps2: Boolean(naps2Path),
      scannerCacheReady: scannerDiscoveryState.lastUpdated > 0,
      scannerRefreshInProgress: Boolean(scannerDiscoveryState.refreshPromise),
      cachedScannerCount: scannerDiscoveryState.scanners.length,
    });
  } catch (error) {
    res.status(500).json({
      running: true,
      naps2: false,
      error: error.message || 'Failed to check NAPS2 status.',
    });
  }
};

app.get('/status', async (_req, res) => {
  await handleStatusRequest('/status', res);
});

app.get('/health', async (_req, res) => {
  await handleStatusRequest('/health', res);
});

app.get('/scanners', async (_req, res) => {
  log('/scanners called');

  try {
    const scanners = await listScanners();
    res.json(scanners);
  } catch (error) {
    logError('Failed to serve /scanners', error);
    res.json([]);
  }
});

app.post('/scan', async (req, res) => {
  log('/scan called', req.body || {});

  try {
    const { scanner, scannerName, dpi, color, paperSize, format, scanSource } = req.body || {};
    const fileExtension = (String(format || 'pdf').trim().toLowerCase() === 'png') ? 'png' : 'pdf';
    const outputPath = path.join(SCANS_DIR, `scan.${fileExtension}`);

    await runScan({
      outputPath,
      scanner: scanner || scannerName,
      dpi,
      color,
      paperSize,
      format: fileExtension,
      scanSource,
    });

    res.json({
      success: true,
      filePath: outputPath,
    });
  } catch (error) {
    if (error.code === 'NAPS2_NOT_FOUND') {
      res.status(503).json({
        success: false,
        error: 'NAPS2 is not installed.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Scan failed.',
    });
  }
});

app.post('/scan-local', async (req, res) => {
  log('/scan-local called', req.body || {});

  try {
    const { scanner, scannerName, dpi, color, paperSize, format, scanSource } = req.body || {};
    const fileExtension = (String(format || 'pdf').trim().toLowerCase() === 'png') ? 'png' : 'pdf';
    const sessionId = randomUUID();
    const outputPath = path.join(SCANS_DIR, `${sessionId}.${fileExtension}`);

    await runScan({
      outputPath,
      scanner: scanner || scannerName,
      dpi,
      color,
      paperSize,
      format: fileExtension,
      scanSource,
    });

    previewSessions.set(sessionId, {
      filePath: outputPath,
      createdAt: Date.now(),
    });

    res.json({ sessionId });
  } catch (error) {
    if (error.code === 'NAPS2_NOT_FOUND') {
      res.status(503).json({
        error: 'NAPS2 is not installed.',
      });
      return;
    }

    res.status(500).json({
      error: error.message || 'Local preview scan failed.',
    });
  }
});

app.get('/scan/:sessionId/preview', (req, res) => {
  const session = previewSessions.get(req.params.sessionId);

  if (!session || !fs.existsSync(session.filePath)) {
    res.status(404).json({ error: 'Preview session not found.' });
    return;
  }

  res.sendFile(path.resolve(session.filePath));
});

app.delete('/scan/:sessionId', async (req, res) => {
  const session = previewSessions.get(req.params.sessionId);

  if (!session) {
    res.status(404).json({ error: 'Preview session not found.' });
    return;
  }

  previewSessions.delete(req.params.sessionId);
  await fs.promises.unlink(session.filePath).catch(() => undefined);
  res.status(204).send();
});

app.use((error, _req, res, _next) => {
  console.error('[agent] Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Unexpected agent error.',
  });
});

app.listen(PORT, () => {
  log(`Local scanner agent listening on http://localhost:${PORT}`);
  log(`Scans directory: ${SCANS_DIR}`);
  triggerScannerRefresh('startup');
});

setInterval(() => {
  if (!isScannerCacheFresh()) {
    triggerScannerRefresh('scheduled-refresh');
  }
}, Math.max(10000, Math.floor(SCANNER_CACHE_TTL_MS / 2)));