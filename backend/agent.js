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
    args.push('--driver', 'wia', '--device', String(scanner));
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

async function listScanners() {
  const naps2Path = await findNaps2Executable();

  if (!naps2Path) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(naps2Path, ['--listdevices'], {
      timeout: 30000,
      windowsHide: true,
    });

    return parseScannerList(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync(naps2Path, ['--listdevices', '--driver', 'wia'], {
        timeout: 30000,
        windowsHide: true,
      });

      return parseScannerList(stdout);
    } catch (error) {
      log('Scanner listing failed, returning empty list', error?.message || error);
      return [];
    }
  }
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

  await execFileAsync(naps2Path, args, {
    timeout: 300000,
    windowsHide: true,
  });

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
  } catch {
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
});