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

fs.mkdirSync(scansDirectory, { recursive: true });

app.use(cors());
app.use(express.json());

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
  if (!fs.existsSync(naps2Path)) {
    return [];
  }

  const { stdout } = await execFileAsync(naps2Path, ['--listdevices']);
  return parseScannerList(stdout);
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

  await execFileAsync(naps2Path, args, { timeout: 300000 });
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
  res.json({ ok: true, naps2Installed: fs.existsSync(naps2Path) });
});

app.get('/scanners', async (_req, res) => {
  try {
    const scanners = await listScanners();
    res.json(scanners);
  } catch (error) {
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

app.listen(port, () => {
  console.log(`Local scanner agent listening on http://localhost:${port}`);
});